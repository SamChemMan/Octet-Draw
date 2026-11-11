// AI apps (decision 0021): an MCP server on this computer only, off until the user turns it on in Settings > AI apps.
// This side is the transport: Streamable HTTP on 127.0.0.1, one JSON-RPC message per POST, answered with one JSON
// reply, or with an event stream when the call asks for progress; GET opens a session's stream for notifications (a
// subscribed drawing changed). Each request goes to the drawing window in front ("mcp" event), whose page runs the tool
// (src/mcp.ts) and answers with mcp_reply. Every request must come from this computer, name this server's own host,
// carry no other site's Origin (DNS rebinding) and carry the key (a bearer token) the user copied into the AI app.
// Initialize gives each AI app a session id, so the page can name the app that drew. `Octet Draw --mcp` relays
// standard input and output to the same server, for AI apps that start their servers themselves (Claude Desktop).
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, Read, Write};
use std::net::{Ipv4Addr, Shutdown, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, Window};

// A dev build keeps a file and a port of its own (test plan R11), so it and the installed Octet run at once and
// neither takes the other's port or writes over its key: an AI app given one Octet's relay or address reaches that
// Octet.
const fn own(dev: bool) -> (&'static str, u16) {
    if dev { ("mcp-dev.json", 47682) } else { ("mcp.json", 47681) }
}
const INFO: &str = own(cfg!(debug_assertions)).0;
pub const PORT: u16 = own(cfg!(debug_assertions)).1;
const MAX_HEAD: usize = 16 * 1024;
const MAX_BODY: usize = 4 * 1024 * 1024; // a request from the AI app
const MAX_REPLY: usize = 24 * 1024 * 1024; // a reply from the page (a picture of the drawing)
const WAIT: Duration = Duration::from_secs(120); // a batch of 200 structures
const MOST_SESSIONS: usize = 64;

#[derive(Clone, Serialize, Deserialize, PartialEq)]
pub struct Info {
    port: u16,
    token: String,
    #[serde(default)]
    program: String, // this Octet's own program, which AI apps start with --mcp (the relay)
}

#[derive(Default)]
pub struct Mcp {
    running: Mutex<Option<(Info, Arc<AtomicU64>)>>,
    shared: Arc<Shared>,
}

// What the server's threads share: replies waited for, the sessions, and the windows whose pages listen (a new
// window's page starts a moment after the window).
#[derive(Default)]
struct Shared {
    pending: Mutex<HashMap<u64, Pending>>,
    sessions: Mutex<HashMap<String, Session>>,
    ready: Mutex<HashMap<String, String>>, // each window's page that listens, by the page's own id
    open: Mutex<Option<(f64, Instant)>>,   // the rate limit for initialize and for requests with no session, all apps together
}

// A drawing resource's URI as Octet gives it (octet://drawing/{window}, /cdxml or /png), and the window it names.
fn drawing_uri<'a>(app: &AppHandle, uri: &'a str) -> Option<&'a str> {
    let rest = uri.strip_prefix("octet://drawing/")?;
    let (label, part) = rest.split_once('/').unwrap_or((rest, ""));
    (matches!(part, "" | "cdxml" | "png") && crate::windows::ours(label) && app.get_webview_window(label).is_some()).then_some(label)
}

// Takes one call from a bucket that fills again at RATE a second; false when it is empty.
fn take(bucket: &mut (f64, Instant)) -> bool {
    let tokens = (bucket.0 + bucket.1.elapsed().as_secs_f64() * RATE).min(RATE);
    *bucket = (if tokens >= 1.0 { tokens - 1.0 } else { tokens }, Instant::now());
    tokens >= 1.0
}

// A window closed: the calls it was answering end now, and nobody is subscribed to it any more.
pub fn closed(app: &AppHandle, label: &str) {
    let Some(mcp) = app.try_state::<Mcp>() else { return };
    mcp.shared.ready.lock().unwrap().remove(label);
    mcp.shared.pending.lock().unwrap().retain(|_, p| {
        if p.window == label {
            let _ = p.tx.send(Msg::Done(error_reply(Some(&p.rid), -32603, "The drawing closed before the call finished.")));
        }
        p.window != label
    });
    for s in mcp.shared.sessions.lock().unwrap().values_mut() {
        s.subs.retain(|u| drawing_uri_label(u) != Some(label));
    }
}
fn drawing_uri_label(uri: &str) -> Option<&str> {
    uri.strip_prefix("octet://drawing/").map(|r| r.split('/').next().unwrap_or(""))
}
// A request the page is answering: its window, its JSON-RPC id, its session, and where its progress and reply go.
struct Pending {
    window: String,
    rid: serde_json::Value,
    cancelled: bool, // notifications/cancelled named it: the page asks (mcp_cancelled) between the call's parts
    session: Option<String>,
    tx: mpsc::Sender<Msg>,
}
enum Msg {
    Progress(String), // a notifications/progress message, as JSON
    Done(String),     // the reply
}

// An AI app's session (decision 0021, D1): its name, the drawing (window label) its calls go to, and when it last
// called. A session with no drawing takes the window in front at its first call; a window coming to the front later
// does not move it.
// stream: its event stream for notifications (GET); subs: the drawing URIs it subscribed to; bucket: its calls left this
// second (D16), and when it was last filled; waiting: its calls under way.
struct Session {
    client: String,
    drawing: Option<String>,
    last: Instant,
    stream: Option<(u64, mpsc::Sender<String>)>, // the stream's own number, and where its notifications go
    subs: HashSet<String>,
    bucket: (f64, Instant),
    waiting: usize,
}
const IDLE: Duration = Duration::from_secs(12 * 3600); // a session unused this long ends
const RATE: f64 = 20.0; // calls a second a session may make
const MOST_WAITING: usize = 4; // calls a session may have under way at once
pub const VERSIONS: [&str; 3] = ["2025-11-25", "2025-06-18", "2025-03-26"];

static NEXT: AtomicU64 = AtomicU64::new(1);
static GENERATION: AtomicU64 = AtomicU64::new(0);

// Where the port and key are kept (only this user can read it), for Settings and the relay.
fn info_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(INFO))
}

fn random_hex(n: usize) -> Result<String, String> {
    let mut bytes = vec![0u8; n];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn saved(app: &AppHandle) -> Option<Info> {
    serde_json::from_slice(&std::fs::read(info_path(app)?).ok()?).ok()
}

fn save(app: &AppHandle, info: &Info) -> Result<(), String> {
    let path = info_path(app).ok_or("Octet cannot find its data folder.")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    options.open(&path).and_then(|mut f| f.write_all(&serde_json::to_vec(info).unwrap())).map_err(|e| e.to_string())
}

// Turns the server on (with the saved key, or a new one) or off. new_key: a new key, so AI apps given the old one
// cannot connect. Returns the address and key, for Settings to show and copy.
#[tauri::command]
pub fn mcp_set(app: AppHandle, mcp: State<'_, Mcp>, on: bool, new_key: Option<bool>) -> Result<Option<Info>, String> {
    let mut running = mcp.running.lock().unwrap();
    if let Some((was, stop)) = running.take() {
        stop.store(u64::MAX, Ordering::SeqCst);
        let _ = TcpStream::connect((Ipv4Addr::LOCALHOST, was.port)); // wakes the accept loop
        mcp.shared.sessions.lock().unwrap().clear();
    }
    if !on {
        return Ok(None);
    }
    let mut info = match saved(&app) {
        Some(i) if new_key != Some(true) => i,
        _ => Info { port: PORT, token: random_hex(32)?, program: String::new() },
    };
    // An AppImage (Linux) runs from a new folder each time: the AI app starts the AppImage itself.
    let appimage = std::env::var("APPIMAGE").ok().filter(|p| cfg!(target_os = "linux") && !p.is_empty());
    info.program = appimage.unwrap_or_else(|| std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default());
    // The port Octet keeps, else any free one (the address in the AI app must then change).
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, info.port))
        .or_else(|_| TcpListener::bind((Ipv4Addr::LOCALHOST, 0)))
        .map_err(|e| format!("Octet cannot listen for AI apps. {e}"))?;
    info.port = listener.local_addr().map_err(|e| e.to_string())?.port();
    save(&app, &info)?;
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let stop = Arc::new(AtomicU64::new(generation));
    *running = Some((info.clone(), stop.clone()));
    let (shared, served) = (mcp.shared.clone(), info.clone());
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            if stop.load(Ordering::SeqCst) != generation {
                break;
            }
            let Ok(stream) = stream else { continue };
            let (app, shared, served) = (app.clone(), shared.clone(), served.clone());
            std::thread::spawn(move || serve(stream, &app, &shared, &served));
        }
    });
    Ok(Some(info))
}

// Whether AI apps are on now: a drawing window opened while they are runs at full speed when it is behind others.
pub fn on(app: &AppHandle) -> bool {
    app.try_state::<Mcp>().is_some_and(|m| m.running.lock().unwrap().is_some())
}

#[tauri::command]
pub fn mcp_status(mcp: State<'_, Mcp>) -> Option<Info> {
    mcp.running.lock().unwrap().as_ref().map(|(i, _)| i.clone())
}

// The session's drawing from now on (drawings use and new). The window must be one of Octet's drawings.
#[tauri::command]
pub fn mcp_target(app: AppHandle, mcp: State<'_, Mcp>, session: String, drawing: String) -> Result<(), String> {
    if !crate::windows::ours(&drawing) || app.get_webview_window(&drawing).is_none() {
        return Err("There is no such drawing.".into());
    }
    match mcp.shared.sessions.lock().unwrap().get_mut(&session) {
        Some(s) => s.drawing = Some(drawing),
        None => return Err("There is no such session.".into()),
    }
    Ok(())
}

// A page listens for requests now. A new page in a window (reloaded) has lost the requests the old one had: they end
// now. The same page saying so again changes nothing.
#[tauri::command]
pub fn mcp_ready(window: Window, mcp: State<'_, Mcp>, page: String) -> bool {
    let label = window.label().to_string();
    let was = mcp.shared.ready.lock().unwrap().insert(label.clone(), page.chars().take(64).collect());
    if was.is_some_and(|w| w != page) {
        mcp.shared.pending.lock().unwrap().retain(|_, p| {
            if p.window == label {
                let _ = p.tx.send(Msg::Done(error_reply(Some(&p.rid), -32603, "The Octet window started again. Try again.")));
            }
            p.window != label
        });
    }
    // Whether an AI app subscribes to this drawing: a page that started again says each change from then on.
    mcp.shared.sessions.lock().unwrap().values().any(|s| s.subs.iter().any(|u| drawing_uri_label(u) == Some(label.as_str())))
}

// The page's answer to request `id`.
#[tauri::command]
pub fn mcp_reply(mcp: State<'_, Mcp>, id: u64, body: String) -> Result<(), String> {
    if let Some(p) = mcp.shared.pending.lock().unwrap().remove(&id) {
        let _ = p.tx.send(Msg::Done(if body.len() > MAX_REPLY { error_reply(Some(&p.rid), -32603, "The reply is too large.") } else { body }));
    }
    Ok(())
}

// A progress notification for request `id` (D2), as JSON, sent on its event stream when it asked for progress.
#[tauri::command]
pub fn mcp_progress(mcp: State<'_, Mcp>, id: u64, body: String) {
    if body.len() > 4096 {
        return;
    }
    if let Some(p) = mcp.shared.pending.lock().unwrap().get(&id) {
        let _ = p.tx.send(Msg::Progress(body));
    }
}

// Whether the AI app cancelled a call, or no longer waits for it (it timed out). The page asks between the call's parts: an event sent to a busy window in the
// background comes too late.
#[tauri::command]
pub fn mcp_cancelled(mcp: State<'_, Mcp>, id: u64) -> bool {
    mcp.shared.pending.lock().unwrap().get(&id).is_none_or(|p| p.cancelled)
}

// A drawing changed (the page says so at most every half second): each session subscribed to it hears so (D12).
#[tauri::command]
pub fn mcp_changed(window: Window, mcp: State<'_, Mcp>) {
    let label = window.label();
    for s in mcp.shared.sessions.lock().unwrap().values() {
        let Some((_, tx)) = &s.stream else { continue };
        for uri in s.subs.iter().filter(|u| drawing_uri_label(u) == Some(label)) {
            let _ = tx.send(serde_json::json!({ "jsonrpc": "2.0", "method": "notifications/resources/updated", "params": { "uri": uri } }).to_string());
        }
    }
}

// Settings > AI apps > Claude Desktop > Install (D17): writes the Claude Desktop bundle (an .mcpb, a zip) and opens it,
// so Claude Desktop installs it. The bundle's server (mcpb.cjs, CommonJS, which every Node runs) starts this Octet's relay. tools: each tool's name and
// description, for Claude Desktop to show.
#[derive(Deserialize, Serialize)]
pub struct BundleTool {
    name: String,
    description: String,
}
#[tauri::command]
pub fn mcp_bundle(tools: Vec<BundleTool>) -> Result<(), String> {
    let path = std::env::temp_dir().join("Octet Draw.mcpb");
    std::fs::write(&path, bundle(tools)?).map_err(|e| e.to_string())?;
    crate::open_external(&path).map_err(|e| e.to_string())
}
fn bundle(tools: Vec<BundleTool>) -> Result<Vec<u8>, String> {
    if tools.len() > 64 || tools.iter().any(|t| t.name.len() > 64 || t.description.len() > 2000) {
        return Err("Octet cannot make the bundle.".into());
    }
    let manifest = serde_json::json!({
        "manifest_version": "0.3",
        "name": "octet-draw",
        "display_name": "Octet Draw",
        "version": app_version(),
        "description": "Draws and reads chemical structures, reactions, schemes and catalytic cycles in Octet Draw on this computer.",
        "author": { "name": "Sam Ellis", "url": "https://octet.software" },
        "homepage": "https://octet.software",
        "support": "https://github.com/SamChemMan/Octet-Draw/issues",
        "license": "Apache-2.0",
        "icon": "icon.png",
        "server": { "type": "node", "entry_point": "server/index.cjs", "mcp_config": { "command": "node", "args": ["${__dirname}/server/index.cjs"] } },
        "tools": tools,
        "prompts_generated": true,
        "keywords": ["chemistry", "chemical structures", "reactions", "drawing"],
        "compatibility": { "platforms": ["darwin", "win32"], "runtimes": { "node": ">=16.0.0" } },
    });
    // The bundle's server reads the file of the Octet that made it: a dev build's bundle starts the dev build's relay.
    let server = include_str!("mcpb.cjs").replace("mcp.json", INFO);
    let files: [(&str, &[u8]); 3] = [
        ("manifest.json", &serde_json::to_vec_pretty(&manifest).unwrap()),
        ("server/index.cjs", server.as_bytes()),
        ("icon.png", include_bytes!("../icons/icon.png")),
    ];
    Ok(stored_zip(&files))
}

// A zip of files stored as they are (no compression): all a bundle needs.
fn stored_zip(files: &[(&str, &[u8])]) -> Vec<u8> {
    let (mut out, mut central) = (Vec::new(), Vec::new());
    for (name, data) in files {
        let (crc, size, at) = (crc32fast::hash(data), data.len() as u32, out.len() as u32);
        // version 20, no flags, stored, no time (1980-01-01)
        let common = [&20u16.to_le_bytes()[..], &0u16.to_le_bytes(), &0u16.to_le_bytes(), &0u16.to_le_bytes(), &0x21u16.to_le_bytes(), &crc.to_le_bytes(), &size.to_le_bytes(), &size.to_le_bytes(), &(name.len() as u16).to_le_bytes(), &0u16.to_le_bytes()].concat();
        out.extend_from_slice(&0x04034b50u32.to_le_bytes());
        out.extend_from_slice(&common);
        out.extend_from_slice(name.as_bytes());
        out.extend_from_slice(data);
        central.extend_from_slice(&0x02014b50u32.to_le_bytes());
        central.extend_from_slice(&20u16.to_le_bytes()); // made by
        central.extend_from_slice(&common);
        central.extend_from_slice(&[0u8; 6]); // comment length, disk, internal attributes
        central.extend_from_slice(&0u32.to_le_bytes()); // external attributes
        central.extend_from_slice(&at.to_le_bytes());
        central.extend_from_slice(name.as_bytes());
    }
    let (start, length, count) = (out.len() as u32, central.len() as u32, files.len() as u16);
    out.extend_from_slice(&central);
    out.extend_from_slice(&0x06054b50u32.to_le_bytes());
    out.extend_from_slice(&[0u8; 4]);
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&length.to_le_bytes());
    out.extend_from_slice(&start.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out
}

// A PNG of the drawing (an SVG at true size), as base64, for the AI app to see what Octet drew.
#[tauri::command]
pub async fn mcp_png(svg: String, dpi: f32) -> Result<String, String> {
    use base64::Engine;
    if svg.len() > MAX_REPLY {
        return Err("The drawing is too large to show.".into());
    }
    let png = crate::export::make_png(&svg, dpi.clamp(36.0, 300.0), false, None)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(png))
}

fn error_reply(id: Option<&serde_json::Value>, code: i64, message: &str) -> String {
    serde_json::json!({ "jsonrpc": "2.0", "id": id.cloned().unwrap_or(serde_json::Value::Null), "error": { "code": code, "message": message } }).to_string()
}

fn respond(stream: &mut TcpStream, status: &str, body: &str, session: Option<&str>) {
    let kind = if body.is_empty() { "" } else { "Content-Type: application/json\r\n" };
    let session = session.map(|s| format!("Mcp-Session-Id: {s}\r\n")).unwrap_or_default();
    let head = format!("HTTP/1.1 {status}\r\n{kind}{session}Content-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n", body.len());
    let _ = stream.write_all(head.as_bytes()).and_then(|_| stream.write_all(body.as_bytes()));
    let _ = stream.shutdown(Shutdown::Both);
}

// Both sides of a comparison are read in full, so the time taken does not tell how much of the key was right.
fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |d, (x, y)| d | (x ^ y)) == 0
}

fn header<'a>(head: &'a [String], name: &str) -> Option<&'a str> {
    head.iter().skip(1).find_map(|h| h.split_once(':').filter(|(k, _)| k.trim().eq_ignore_ascii_case(name)).map(|(_, v)| v.trim()))
}

#[derive(Debug, PartialEq)]
enum Asked {
    Post(usize), // a message of this length
    End,         // DELETE: end the session
    Stream,      // GET: the session's event stream for notifications
}

// What a request's line and headers allow, or the status that refuses it.
fn allowed(head: &[String], port: u16, token: &str) -> Result<Asked, &'static str> {
    let mut parts = head.first().map(|l| l.split(' ')).into_iter().flatten();
    let (method, path) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
    let ours = |host: &str| host == format!("127.0.0.1:{port}") || host == format!("localhost:{port}");
    if path.split('?').next() != Some("/mcp") {
        return Err("404 Not Found");
    }
    if !header(head, "host").is_some_and(ours) || header(head, "origin").is_some_and(|o| !o.strip_prefix("http://").is_some_and(ours)) {
        return Err("403 Forbidden");
    }
    let key = header(head, "authorization").and_then(|a| a.strip_prefix("Bearer ")).unwrap_or("").trim();
    if !same(key.as_bytes(), token.as_bytes()) {
        return Err("401 Unauthorized");
    }
    // An unsupported protocol version is refused; a missing one is taken as 2025-03-26 (the spec's transports).
    if header(head, "mcp-protocol-version").is_some_and(|v| !VERSIONS.contains(&v)) {
        return Err("400 Bad Request");
    }
    // DELETE ends a session; GET opens its event stream, when the client takes one.
    if method == "DELETE" {
        return Ok(Asked::End);
    }
    if method == "GET" && header(head, "accept").is_some_and(|a| a.contains("text/event-stream")) {
        return Ok(Asked::Stream);
    }
    if method != "POST" {
        return Err("405 Method Not Allowed");
    }
    if !header(head, "content-type").is_some_and(|t| t.to_ascii_lowercase().starts_with("application/json")) {
        return Err("415 Unsupported Media Type");
    }
    let length = header(head, "content-length").and_then(|n| n.parse::<usize>().ok()).ok_or("411 Length Required")?;
    if length > MAX_BODY {
        return Err("413 Content Too Large");
    }
    Ok(Asked::Post(length))
}

// The AI app's own name from its initialize request (60 characters at most, no control characters).
fn client_name(message: &serde_json::Value) -> String {
    let name: String = message.pointer("/params/clientInfo/name").and_then(|n| n.as_str()).unwrap_or("").chars().filter(|c| !c.is_control()).take(60).collect();
    match name.trim() {
        "" => "An AI app".into(),
        "claude-code" => "Claude Code".into(),
        "claude-ai" => "Claude".into(),
        n => n.to_string(),
    }
}

fn serve(mut stream: TcpStream, app: &AppHandle, shared: &Shared, info: &Info) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(30)));
    if !stream.peer_addr().map(|a| a.ip().is_loopback()).unwrap_or(false) {
        return respond(&mut stream, "403 Forbidden", "", None);
    }
    // The request line and headers, 16 KB at most.
    let mut reader = std::io::BufReader::new(stream.try_clone().unwrap());
    let (mut head, mut line) = (Vec::<String>::new(), String::new());
    let mut size = 0;
    loop {
        line.clear();
        match (&mut reader).take((MAX_HEAD - size) as u64 + 1).read_line(&mut line) {
            Ok(0) | Err(_) => return,
            Ok(n) => size += n,
        }
        if size > MAX_HEAD {
            return respond(&mut stream, "431 Request Header Fields Too Large", "", None);
        }
        let l = line.trim_end_matches(['\r', '\n']);
        if l.is_empty() {
            break;
        }
        head.push(l.to_string());
    }
    let sid = header(&head, "mcp-session-id").map(String::from);
    let length = match allowed(&head, info.port, &info.token) {
        Ok(Asked::Post(n)) => n,
        Ok(Asked::End) => {
            let gone = sid.and_then(|s| shared.sessions.lock().unwrap().remove(&s));
            return respond(&mut stream, if gone.is_some() { "200 OK" } else { "404 Not Found" }, "", None);
        }
        Ok(Asked::Stream) => return notifications(stream, shared, sid),
        Err(status) => return respond(&mut stream, status, "", None),
    };
    let mut body = vec![0u8; length];
    if reader.read_exact(&mut body).is_err() {
        return;
    }
    let Ok(message) = serde_json::from_slice::<serde_json::Value>(&body) else {
        return respond(&mut stream, "400 Bad Request", &error_reply(None, -32700, "The request is not JSON."), None);
    };
    let method = message.get("method").and_then(|m| m.as_str()).unwrap_or("");
    // A notification or a response from the AI app needs no answer. notifications/cancelled stops the call it names,
    // between its parts (the page puts the drawing back).
    let Some(id) = message.get("id").filter(|_| message.get("method").is_some()) else {
        if method == "notifications/cancelled" {
            let want = message.pointer("/params/requestId");
            if let Some(p) = shared.pending.lock().unwrap().values_mut().find(|p| p.session == sid && Some(&p.rid) == want) {
                p.cancelled = true;
            }
        }
        return respond(&mut stream, "202 Accepted", "", None);
    };
    // Initialize starts a session; a later request names its session, and one Octet does not know (ended, idle, or
    // from before Octet started again) gets 404, so the AI app starts a new one. A request with no session (an older
    // client) acts on the window in front.
    let mut new_session = None;
    let front = crate::windows::front(app);
    let (client, session, window, lost) = {
        let mut sessions = shared.sessions.lock().unwrap();
        sessions.retain(|_, s| s.last.elapsed() < IDLE);
        if method == "initialize" || sid.is_none() {
            let mut open = shared.open.lock().unwrap();
            if !take(open.get_or_insert((RATE, Instant::now()))) {
                drop((open, sessions));
                return respond(&mut stream, "200 OK", &error_reply(Some(id), -32000, "Too many calls at once. Wait a moment, then call again."), None);
            }
        }
        if method == "initialize" {
            // At most MOST_SESSIONS: a new one takes the place of the one unused longest, but never of one with a call
            // under way or its event stream open.
            if sessions.len() >= MOST_SESSIONS {
                let oldest = sessions.iter().filter(|(_, s)| s.waiting == 0 && s.stream.is_none()).min_by_key(|(_, s)| s.last).map(|(k, _)| k.clone());
                let Some(oldest) = oldest else {
                    drop(sessions);
                    return respond(&mut stream, "200 OK", &error_reply(Some(id), -32000, "Too many AI apps are connected to Octet. Close one, then try again."), None);
                };
                sessions.remove(&oldest);
            }
            let (name, new) = (client_name(&message), random_hex(16).unwrap_or_default());
            sessions.insert(new.clone(), Session { client: name.clone(), drawing: None, last: Instant::now(), stream: None, subs: HashSet::new(), bucket: (RATE, Instant::now()), waiting: 0 });
            new_session = Some(new.clone());
            (name, Some(new), front, None)
        } else if let Some(s) = sid.as_ref() {
            let Some(session) = sessions.get_mut(s) else {
                drop(sessions);
                return respond(&mut stream, "404 Not Found", "", None);
            };
            session.last = Instant::now();
            // The rate limit (D16): RATE calls a second, MOST_WAITING under way at once.
            if session.waiting >= MOST_WAITING || !take(&mut session.bucket) {
                drop(sessions);
                return respond(&mut stream, "200 OK", &error_reply(Some(id), -32000, "Too many calls at once from this app. Wait for the calls under way to finish, then call again."), None);
            }
            // Subscriptions are kept here, where the notifications go out.
            let uri = message.pointer("/params/uri").and_then(|u| u.as_str()).unwrap_or("");
            if method == "resources/subscribe" || method == "resources/unsubscribe" {
                let Some(label) = drawing_uri(app, uri) else {
                    drop(sessions);
                    return respond(&mut stream, "200 OK", &error_reply(Some(id), -32002, "There is no such drawing. resources/list gives the drawings."), None);
                };
                if method == "resources/subscribe" { session.subs.insert(uri.to_string()); } else { session.subs.remove(uri); }
                drop(sessions);
                // The window says when it changes from now on (mcp_changed).
                if method == "resources/subscribe" {
                    let _ = app.emit_to(label, "mcp-watch", ());
                }
                return respond(&mut stream, "200 OK", &serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": {} }).to_string(), None);
            }
            // The session's drawing; else the window in front, which it keeps. A drawing that has closed is lost: the
            // page says so, and drawings list and use still work. Reading a drawing's resource goes to it.
            let open = session.drawing.as_ref().filter(|d| app.get_webview_window(d).is_some()).cloned();
            let lost = session.drawing.clone().filter(|_| open.is_none());
            if session.drawing.is_none() {
                session.drawing = front.clone();
            }
            let named = drawing_uri(app, uri).filter(|_| method == "resources/read").map(String::from);
            session.waiting += 1;
            (session.client.clone(), Some(s.clone()), named.or(open).or(front), lost)
        } else {
            ("An AI app".into(), None, front, None)
        }
    };
    let done = |shared: &Shared| { if let Some(s) = session.as_ref().and_then(|s| shared.sessions.lock().unwrap().get_mut(s).map(|x| { x.waiting = x.waiting.saturating_sub(1); })) { s } };
    let Some(window) = window else {
        done(shared);
        return respond(&mut stream, "200 OK", &error_reply(Some(id), -32603, "Octet has no window open."), None);
    };
    // A window that has just opened (File > New) listens once its page has started: up to 15 s.
    let start = Instant::now();
    while !shared.ready.lock().unwrap().contains_key(&window) && start.elapsed() < Duration::from_secs(15) {
        std::thread::sleep(Duration::from_millis(50));
    }
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel();
    shared.pending.lock().unwrap().insert(n, Pending { window: window.clone(), rid: id.clone(), session: session.clone(), tx, cancelled: false });
    let sent = app.emit_to(window.as_str(), "mcp", serde_json::json!({ "id": n, "body": String::from_utf8_lossy(&body), "client": client, "session": session, "lost": lost }));
    let timeout = || error_reply(Some(id), -32603, "Octet did not answer in time.");
    // A call that asks for progress is answered as an event stream: its progress as it goes, then its reply.
    if message.pointer("/params/_meta/progressToken").is_some() && sent.is_ok() {
        let new = new_session.as_deref().map(|s| format!("Mcp-Session-Id: {s}\r\n")).unwrap_or_default();
        let ok = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\n{new}Connection: close\r\n\r\n").is_ok();
        let end = Instant::now() + WAIT;
        loop {
            let msg = rx.recv_timeout(end.saturating_duration_since(Instant::now()));
            let (data, last) = match msg { Ok(Msg::Progress(p)) => (p, false), Ok(Msg::Done(r)) => (r, true), Err(_) => (timeout(), true) };
            if ok && write!(stream, "event: message\ndata: {}\n\n", data.replace('\n', " ")).and_then(|_| stream.flush()).is_err() { break; }
            if last { break; }
        }
        shared.pending.lock().unwrap().remove(&n);
        done(shared);
        let _ = stream.shutdown(Shutdown::Both);
        return;
    }
    let end = Instant::now() + WAIT;
    let reply = loop {
        match sent.as_ref().ok().map(|_| rx.recv_timeout(end.saturating_duration_since(Instant::now()))) {
            Some(Ok(Msg::Progress(_))) => continue,
            Some(Ok(Msg::Done(r))) => break Some(r),
            _ => break None,
        }
    };
    shared.pending.lock().unwrap().remove(&n);
    done(shared);
    respond(&mut stream, "200 OK", &reply.unwrap_or_else(timeout), new_session.as_deref());
}

// GET: the session's event stream for notifications (D2), held open, with a comment every 25 s so it stays up. A new
// stream for the session replaces the old one.
fn notifications(mut stream: TcpStream, shared: &Shared, sid: Option<String>) {
    let (tx, rx) = mpsc::channel::<String>();
    let me = NEXT.fetch_add(1, Ordering::Relaxed);
    match sid.as_ref().and_then(|s| shared.sessions.lock().unwrap().get_mut(s).map(|x| x.stream = Some((me, tx)))) {
        Some(()) => {}
        None => return respond(&mut stream, if sid.is_some() { "404 Not Found" } else { "400 Bad Request" }, "", None),
    }
    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));
    if write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: keep-alive\r\n\r\n").is_err() {
        return;
    }
    loop {
        let out = match rx.recv_timeout(Duration::from_secs(25)) {
            Ok(note) => format!("event: message\ndata: {note}\n\n"),
            Err(mpsc::RecvTimeoutError::Timeout) => ": still here\n\n".to_string(),
            Err(_) => break,
        };
        if stream.write_all(out.as_bytes()).and_then(|_| stream.flush()).is_err() {
            break;
        }
        // The session ended, or another stream took its place.
        let mine = sid.as_ref().and_then(|s| shared.sessions.lock().unwrap().get(s).map(|x| x.stream.as_ref().is_some_and(|(n, _)| *n == me)));
        if mine != Some(true) {
            break;
        }
    }
    let _ = stream.shutdown(Shutdown::Both);
}

// `Octet Draw --mcp`: one JSON-RPC message a line on standard input, each answer a line on standard output, through
// the server of the Octet that runs. Nothing else goes to standard output (P4). It reads the port and key from
// INFO for each request, so a new key or port changes nothing in the AI app. Each request has a thread of its own,
// so a cancel goes through while a call runs; a call's progress and the drawings' updates come through as lines too.
// When Octet is not open (or AI apps are off), the relay answers initialize itself with empty lists, tries Octet again
// every 2 s, and when it answers says the lists changed, so the tools appear with no restart of the AI app (D17).
pub fn relay(data_dir: Option<PathBuf>) {
    let relay = Relay::new(data_dir, Box::new(std::io::stdout()));
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        relay.take(line);
    }
}

type Out = Box<dyn Write + Send>;
struct Relay {
    dir: Option<PathBuf>,
    out: Mutex<Out>,
    // session: Octet's session for this AI app; hello: the AI app's initialize, sent again when Octet needs it; version:
    // the protocol version agreed; watching: a thread tries Octet until it answers; listening: the GET stream's thread.
    state: Mutex<RelayState>,
}
#[derive(Default)]
struct RelayState {
    session: Option<String>,
    hello: Option<String>,
    version: Option<String>,
    watching: bool,
    listening: bool,
}
const CLOSED: &str = "Octet Draw is not open, or its AI apps are off. Open Octet Draw and turn on Settings > General > AI apps > Let AI apps use Octet, then try again.";

impl Relay {
    fn new(dir: Option<PathBuf>, out: Out) -> Arc<Relay> {
        Arc::new(Relay { dir, out: Mutex::new(out), state: Mutex::default() })
    }
    fn info(&self) -> Option<Info> {
        self.dir.as_ref().and_then(|d| std::fs::read(d.join(INFO)).ok()).and_then(|b| serde_json::from_slice(&b).ok())
    }
    // One message on standard output, on one line.
    fn say(&self, line: &str) {
        let mut out = self.out.lock().unwrap();
        let _ = writeln!(out, "{}", line.trim().replace(['\r', '\n'], " "));
        let _ = out.flush();
    }
    fn take(self: &Arc<Self>, line: String) {
        let Ok(message) = serde_json::from_str::<serde_json::Value>(&line) else { return };
        if message.get("method").and_then(|m| m.as_str()) == Some("initialize") {
            self.state.lock().unwrap().hello = Some(line.clone());
        }
        let me = self.clone();
        std::thread::spawn(move || me.handle(&line, &message));
    }
    fn handle(self: &Arc<Self>, line: &str, message: &serde_json::Value) {
        let method = message.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let id = message.get("id").filter(|_| !method.is_empty());
        let info = self.info();
        let Some(id) = id else {
            // A notification (initialized, cancelled): on to Octet, if it is there.
            if let Some(i) = info {
                let session = self.state.lock().unwrap().session.clone();
                let _ = self.post(&i, line, session.as_deref(), |_| {});
            }
            return;
        };
        let sent = info.as_ref().and_then(|i| {
            let session = if method == "initialize" { None } else { self.state.lock().unwrap().session.clone() };
            let mut got = self.post(i, line, session.as_deref(), |m| self.say(m)).ok()?;
            // Octet started again and no longer knows the session: a new one from the same initialize, then again.
            if got.status == 404 && method != "initialize" && self.start(i) {
                let session = self.state.lock().unwrap().session.clone();
                got = self.post(i, line, session.as_deref(), |m| self.say(m)).ok()?;
            }
            (got.status == 200).then_some(got)
        });
        match sent {
            Some(got) => {
                if method == "initialize" {
                    let mut st = self.state.lock().unwrap();
                    st.session = got.session.clone();
                    st.version = got.reply.as_ref().and_then(|r| serde_json::from_str::<serde_json::Value>(r).ok()).and_then(|v| v.pointer("/result/protocolVersion").and_then(|p| p.as_str()).map(String::from));
                    drop(st);
                    self.listen();
                }
                if let Some(r) = got.reply.filter(|r| !r.trim().is_empty()) {
                    self.say(&r);
                }
            }
            None => {
                self.say(&closed_answer(method, id, message));
                if self.state.lock().unwrap().hello.is_some() {
                    self.watch();
                }
            }
        }
    }
    // A new session with the AI app's own initialize. Octet's answer to it is not passed on: the AI app has one.
    fn start(&self, info: &Info) -> bool {
        let Some(hello) = self.state.lock().unwrap().hello.clone() else { return false };
        match self.post(info, &hello, None, |_| {}) {
            Ok(got) if got.status == 200 && got.session.is_some() => {
                self.state.lock().unwrap().session = got.session;
                true
            }
            _ => false,
        }
    }
    // Tries Octet every 2 s until it answers, then tells the AI app the lists changed.
    fn watch(self: &Arc<Self>) {
        if std::mem::replace(&mut self.state.lock().unwrap().watching, true) {
            return;
        }
        let me = self.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_secs(2));
            if me.info().is_some_and(|i| me.start(&i)) {
                me.state.lock().unwrap().watching = false;
                for list in ["tools", "prompts", "resources"] {
                    me.say(&format!(r#"{{"jsonrpc":"2.0","method":"notifications/{list}/list_changed"}}"#));
                }
                me.listen();
                return;
            }
        });
    }
    // The session's event stream (GET): each notification on to the AI app. It opens again after a drop.
    fn listen(self: &Arc<Self>) {
        if std::mem::replace(&mut self.state.lock().unwrap().listening, true) {
            return;
        }
        let me = self.clone();
        std::thread::spawn(move || loop {
            let session = me.state.lock().unwrap().session.clone();
            if let (Some(i), Some(s)) = (me.info(), session) {
                // Octet started again and no longer knows the session: a new one.
                match me.request(&i, "GET", "", Some(&s), "text/event-stream", Duration::from_secs(60)) {
                    Ok((200, _, mut body)) => events(&mut body, |m| me.say(m)),
                    Ok((404, _, _)) => drop(me.start(&i)),
                    _ => {}
                }
            }
            std::thread::sleep(Duration::from_secs(2));
        });
    }
    // A POST to Octet: its status, session and reply; progress and other messages on an event stream go to `each`.
    fn post(&self, info: &Info, body: &str, session: Option<&str>, each: impl Fn(&str)) -> std::io::Result<Got> {
        let (status, head, mut reader) = self.request(info, "POST", body, session, "application/json, text/event-stream", WAIT + Duration::from_secs(20))?;
        let session = header(&head, "mcp-session-id").map(String::from);
        let mut reply = None;
        if header(&head, "content-type").is_some_and(|t| t.starts_with("text/event-stream")) {
            let rid = serde_json::from_str::<serde_json::Value>(body).ok().and_then(|m| m.get("id").cloned());
            events(&mut reader, |m| {
                let v = serde_json::from_str::<serde_json::Value>(m).ok();
                if v.as_ref().and_then(|v| v.get("method")).is_none() && v.as_ref().and_then(|v| v.get("id")) == rid.as_ref() { reply = Some(m.to_string()) } else { each(m) }
            });
        } else {
            let mut text = String::new();
            reader.take(MAX_REPLY as u64).read_to_string(&mut text)?;
            reply = Some(text);
        }
        Ok(Got { status, session, reply })
    }
    fn request(&self, info: &Info, method: &str, body: &str, session: Option<&str>, accept: &str, wait: Duration) -> std::io::Result<(u16, Vec<String>, std::io::BufReader<TcpStream>)> {
        let mut s = TcpStream::connect_timeout(&(Ipv4Addr::LOCALHOST, info.port).into(), Duration::from_secs(2))?;
        s.set_read_timeout(Some(wait))?;
        let version = self.state.lock().unwrap().version.clone().map(|v| format!("MCP-Protocol-Version: {v}\r\n")).unwrap_or_default();
        let session = session.map(|v| format!("Mcp-Session-Id: {v}\r\n")).unwrap_or_default();
        let length = if method == "POST" { format!("Content-Type: application/json\r\nContent-Length: {}\r\n", body.len()) } else { String::new() };
        write!(s, "{method} /mcp HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nAuthorization: Bearer {}\r\nAccept: {accept}\r\n{version}{session}{length}Connection: close\r\n\r\n{body}", info.port, info.token)?;
        let mut reader = std::io::BufReader::new(s);
        let mut head = Vec::new();
        loop {
            let mut l = String::new();
            if reader.by_ref().take(MAX_HEAD as u64).read_line(&mut l)? == 0 || l.trim().is_empty() {
                break;
            }
            head.push(l.trim_end().to_string());
            if head.len() > 100 {
                break;
            }
        }
        let status = head.first().and_then(|l| l.split(' ').nth(1)).and_then(|c| c.parse().ok()).unwrap_or(0);
        Ok((status, head, reader))
    }
}
struct Got {
    status: u16,
    session: Option<String>,
    reply: Option<String>,
}

// Each message on a server-sent event stream (its data lines joined), until the stream ends.
fn events(reader: &mut impl BufRead, mut each: impl FnMut(&str)) {
    let mut data = String::new();
    loop {
        let mut l = String::new();
        match reader.by_ref().take(MAX_REPLY as u64).read_line(&mut l) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let l = l.trim_end_matches(['\r', '\n']);
        if l.is_empty() {
            if !data.is_empty() {
                each(&data);
                data.clear();
            }
        } else if let Some(d) = l.strip_prefix("data:") {
            data.push_str(d.strip_prefix(' ').unwrap_or(d));
        }
    }
    if !data.is_empty() {
        each(&data);
    }
}

// The relay's own answer while Octet is not there: initialize with empty lists that will change, and the fix for the
// rest.
fn closed_answer(method: &str, id: &serde_json::Value, message: &serde_json::Value) -> String {
    let result = match method {
        "initialize" => {
            let want = message.pointer("/params/protocolVersion").and_then(|v| v.as_str()).filter(|v| VERSIONS.contains(v)).unwrap_or(VERSIONS[0]);
            serde_json::json!({
                "protocolVersion": want,
                "capabilities": { "tools": { "listChanged": true }, "prompts": { "listChanged": true }, "resources": { "subscribe": true, "listChanged": true } },
                "serverInfo": { "name": "octet-draw", "title": "Octet Draw", "version": app_version() },
                "instructions": format!("{CLOSED} Octet's tools appear here once it is open."),
            })
        }
        "ping" => serde_json::json!({}),
        "tools/list" => serde_json::json!({ "tools": [] }),
        "prompts/list" => serde_json::json!({ "prompts": [] }),
        "resources/list" => serde_json::json!({ "resources": [] }),
        "resources/templates/list" => serde_json::json!({ "resourceTemplates": [] }),
        _ => return error_reply(Some(id), -32603, CLOSED),
    };
    serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string()
}

// Octet's one version, from package.json (REL-9).
fn app_version() -> String {
    serde_json::from_str::<serde_json::Value>(include_str!("../../package.json")).ok().and_then(|p| p.get("version")?.as_str().map(String::from)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    // What the relay wrote, one message a line.
    #[derive(Clone, Default)]
    struct Lines(Arc<Mutex<Vec<u8>>>);
    impl Write for Lines {
        fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(b);
            Ok(b.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    impl Lines {
        fn all(&self) -> Vec<serde_json::Value> {
            String::from_utf8(self.0.lock().unwrap().clone()).unwrap().lines().map(|l| serde_json::from_str(l).unwrap()).collect()
        }
    }
    fn run(relay: &Arc<Relay>, line: &str) {
        relay.handle(line, &serde_json::from_str(line).unwrap());
    }

    #[test]
    fn the_bundle_has_its_manifest() {
        let zip = bundle(vec![BundleTool { name: "advanced".into(), description: "Other tools".into() }]).unwrap();
        let text = String::from_utf8_lossy(&zip);
        assert!(text.contains(r#""entry_point": "server/index.cjs""#) && text.contains("advanced") && text.contains("server/index.cjs") && text.contains("icon.png"));
        assert!(bundle((0..65).map(|k| BundleTool { name: format!("t{k}"), description: String::new() }).collect()).is_err());
        if let Some(out) = std::env::var_os("OCTET_BUNDLE_OUT") {
            std::fs::write(out, zip).unwrap();
        }
    }

    #[test]
    fn the_bundle_is_a_zip() {
        let zip = stored_zip(&[("manifest.json", b"{}"), ("server/index.js", b"//")]);
        let path = std::env::temp_dir().join("octet-test.mcpb");
        std::fs::write(&path, &zip).unwrap();
        let listed = std::process::Command::new("python3").args(["-c", "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(' '.join(z.namelist()), z.read('manifest.json').decode())"]).arg(&path).output();
        if let Ok(o) = listed {
            assert_eq!(String::from_utf8_lossy(&o.stdout).trim(), "manifest.json server/index.js {}", "{}", String::from_utf8_lossy(&o.stderr));
        }
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn events_are_read_whole() {
        let mut got = vec![];
        events(&mut "event: message\ndata: {\"a\":1}\n\n: still here\n\ndata: {\"b\":\ndata: 2}\n\n".as_bytes(), |m| got.push(m.to_string()));
        assert_eq!(got, ["{\"a\":1}", "{\"b\":2}"]);
    }

    #[test]
    fn the_relay_answers_while_octet_is_closed() {
        let out = Lines::default();
        let relay = Relay::new(Some(std::env::temp_dir().join("octet-no-such-folder")), Box::new(out.clone()));
        relay.state.lock().unwrap().watching = true; // no thread trying Octet in a test
        run(&relay, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}"#);
        run(&relay, r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#);
        run(&relay, r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#);
        run(&relay, r#"{"jsonrpc":"2.0","id":"x","method":"tools/call","params":{"name":"read"}}"#);
        let all = out.all();
        assert_eq!(all.len(), 3, "nothing for the notification");
        assert_eq!(all[0]["result"]["protocolVersion"], "2025-06-18");
        assert_eq!(all[0]["result"]["capabilities"]["tools"]["listChanged"], true);
        assert_eq!(all[1]["result"]["tools"], serde_json::json!([]));
        assert_eq!(all[2]["id"], "x");
        assert!(all[2]["error"]["message"].as_str().unwrap().contains("Open Octet Draw"));
    }

    #[test]
    fn the_relay_passes_on_progress_then_the_result() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let dir = std::env::temp_dir().join(format!("octet-relay-test-{port}"));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(INFO), format!(r#"{{"port":{port},"token":"k3y","program":""}}"#)).unwrap();
        let server = std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut head = String::new();
            let mut r = std::io::BufReader::new(s.try_clone().unwrap());
            while r.read_line(&mut head).unwrap() > 2 && !head.ends_with("\r\n\r\n") {}
            write!(s, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\r\nevent: message\ndata: {{\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\",\"params\":{{\"progress\":1}}}}\n\nevent: message\ndata: {{\"jsonrpc\":\"2.0\",\"id\":7,\"result\":{{}}}}\n\n").unwrap();
            head
        });
        let out = Lines::default();
        let relay = Relay::new(Some(dir.clone()), Box::new(out.clone()));
        run(&relay, r#"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"draw","_meta":{"progressToken":1}}}"#);
        let head = server.join().unwrap();
        assert!(head.contains("Authorization: Bearer k3y") && head.contains("text/event-stream"), "{head}");
        let all = out.all();
        assert_eq!(all[0]["method"], "notifications/progress");
        assert_eq!(all[1]["id"], 7);
        let _ = std::fs::remove_dir_all(dir);
    }

    // Test plan R11: a dev build and the installed Octet share the data folder. Each reads only its own file, has its
    // own port, and makes a bundle whose server reads that file. Both builds' names and ports are checked in every
    // build. What the relay reads and what the bundle holds are checked for the build under test: for the installed
    // Octet that is cargo test --release.
    #[test]
    fn a_dev_build_and_the_installed_octet_keep_apart() {
        let dev = cfg!(debug_assertions);
        let dir = std::env::temp_dir().join(format!("octet-relay-own-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let relay = Relay::new(Some(dir.clone()), Box::new(Lines::default()));
        let token = || relay.info().map(|i| i.token);
        std::fs::write(dir.join("mcp.json"), r#"{"port":47681,"token":"installed","program":""}"#).unwrap();
        assert_eq!(token().as_deref(), if dev { None } else { Some("installed") }, "the installed Octet's file is not a dev build's");
        std::fs::write(dir.join("mcp-dev.json"), r#"{"port":47682,"token":"dev","program":""}"#).unwrap();
        assert_eq!(token().as_deref(), Some(if dev { "dev" } else { "installed" }));
        assert_eq!((own(false), own(true)), (("mcp.json", 47681), ("mcp-dev.json", 47682)));
        assert_eq!((INFO, PORT), own(dev));
        let server = String::from_utf8_lossy(&bundle(vec![]).unwrap()).into_owned();
        assert_eq!(server.contains(r#"join(dir, "mcp-dev.json")"#), dev);
        assert_eq!(server.contains(r#"join(dir, "mcp.json")"#), !dev);
        let _ = std::fs::remove_dir_all(dir);
    }
    const KEY: &str = "k3y";
    fn head(lines: &[&str]) -> Vec<String> {
        lines.iter().map(|s| s.to_string()).collect()
    }
    fn good(extra: &[&str]) -> Vec<String> {
        let mut h = head(&["POST /mcp HTTP/1.1", "Host: 127.0.0.1:47681", "Authorization: Bearer k3y", "Content-Type: application/json", "Content-Length: 12"]);
        h.extend(extra.iter().map(|s| s.to_string()));
        h
    }

    #[test]
    fn keys_compare_whole() {
        assert!(same(b"abc", b"abc"));
        assert!(!same(b"abc", b"abd"));
        assert!(!same(b"abc", b"ab"));
    }

    #[test]
    fn requests_from_this_computer_with_the_key() {
        assert_eq!(allowed(&good(&[]), 47681, KEY), Ok(Asked::Post(12)));
        assert_eq!(allowed(&good(&["Origin: http://localhost:47681"]), 47681, KEY), Ok(Asked::Post(12)));
        let mut h = good(&[]);
        h[1] = "Host: localhost:47681".into();
        assert_eq!(allowed(&h, 47681, KEY), Ok(Asked::Post(12)));
        assert_eq!(allowed(&good(&["MCP-Protocol-Version: 2025-11-25"]), 47681, KEY), Ok(Asked::Post(12)));
        assert_eq!(allowed(&swap_first("DELETE /mcp HTTP/1.1"), 47681, KEY), Ok(Asked::End));
        let mut get = swap_first("GET /mcp HTTP/1.1");
        get.push("Accept: text/event-stream".into());
        assert_eq!(allowed(&get, 47681, KEY), Ok(Asked::Stream));
    }
    fn swap_first(line: &str) -> Vec<String> {
        let mut h = good(&[]);
        h[0] = line.into();
        h
    }

    #[test]
    fn everything_else_is_refused() {
        let swap = |k: usize, line: &str| { let mut h = good(&[]); h[k] = line.into(); h };
        assert_eq!(allowed(&swap(0, "POST /other HTTP/1.1"), 47681, KEY), Err("404 Not Found"));
        assert_eq!(allowed(&swap(1, "Host: evil.example:47681"), 47681, KEY), Err("403 Forbidden"));
        assert_eq!(allowed(&swap(1, "Host: 127.0.0.1:80"), 47681, KEY), Err("403 Forbidden"));
        assert_eq!(allowed(&good(&["Origin: http://evil.example"]), 47681, KEY), Err("403 Forbidden"));
        assert_eq!(allowed(&good(&["Origin: null"]), 47681, KEY), Err("403 Forbidden"));
        assert_eq!(allowed(&swap(2, "Authorization: Bearer k3"), 47681, KEY), Err("401 Unauthorized"));
        assert_eq!(allowed(&swap(2, "Authorization: k3y"), 47681, KEY), Err("401 Unauthorized"));
        assert_eq!(allowed(&swap(0, "GET /mcp HTTP/1.1"), 47681, KEY), Err("405 Method Not Allowed"));
        assert_eq!(allowed(&good(&["MCP-Protocol-Version: 1999-01-01"]), 47681, KEY), Err("400 Bad Request"));
        assert_eq!(allowed(&swap(3, "Content-Type: text/plain"), 47681, KEY), Err("415 Unsupported Media Type"));
        assert_eq!(allowed(&swap(4, "Content-Length: lots"), 47681, KEY), Err("411 Length Required"));
        assert_eq!(allowed(&swap(4, "Content-Length: 99999999"), 47681, KEY), Err("413 Content Too Large"));
    }

    #[test]
    fn client_names() {
        let named = |n: &str| client_name(&serde_json::json!({ "params": { "clientInfo": { "name": n } } }));
        assert_eq!(named("claude-code"), "Claude Code");
        assert_eq!(named("Cursor"), "Cursor");
        assert_eq!(named("\u{7}"), "An AI app");
        assert_eq!(named(&"x".repeat(100)).len(), 60);
    }
}
