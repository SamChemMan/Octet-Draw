// AI apps (decision 0021): an MCP server on this computer only, off until the user turns it on in Settings > AI apps.
// This side is the transport: Streamable HTTP on 127.0.0.1, one JSON-RPC message per POST, answered with one JSON
// reply, or with an event stream when the call asks for progress; GET opens a session's stream for notifications (a
// subscribed drawing changed). Each request goes to the drawing window in front ("mcp" event), whose page runs the tool
// (src/mcp.ts) and answers with mcp_reply. Every request must come from this computer, name this server's own host,
// carry no other site's Origin (DNS rebinding) and carry the key (a bearer token) the user copied into the AI app.
// Initialize gives each AI app a session id, so the page can name the app that drew. `Octet Draw --mcp` relays
// standard input and output to the same server, for AI apps that start their servers themselves (Claude Desktop).
// An AI app that takes elicitation/create lets the page ask the user something in the middle of a call (mcp_elicit,
// plan 7.3): the request goes out on the call's event stream, and the AI app's answer comes back as a POST.
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, Read, Write};
use std::net::{Ipv4Addr, Shutdown, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

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
const ASK: Duration = Duration::from_secs(300); // the longest the page waits for the user to fill in the AI app's form (mcp_elicit)
const MOST_ANSWER: usize = 16 * 1024; // the AI app's answer to an elicitation/create
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
    heard: Mutex<HashMap<String, u32>>,    // each window's newest listener, by the number its page gave it
    open: Mutex<Option<(f64, Instant)>>,   // the rate limit for initialize and for requests with no session, all apps together
    loose: Mutex<Option<String>>,          // the brief of the requests with no session (an older client), all of them together
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

// A window closed: the calls it was answering end now, nobody is subscribed to it any more, and no session owns it.
pub fn closed(app: &AppHandle, label: &str) {
    let Some(mcp) = app.try_state::<Mcp>() else { return };
    mcp.shared.ready.lock().unwrap().remove(label);
    mcp.shared.heard.lock().unwrap().remove(label);
    mcp.shared.pending.lock().unwrap().retain(|_, p| {
        if p.window == label {
            p.unask();
            let _ = p.tx.send(Msg::Done(error_reply(Some(&p.rid), -32603, "The drawing closed before the call finished.")));
        }
        p.window != label
    });
    for s in mcp.shared.sessions.lock().unwrap().values_mut() {
        s.subs.retain(|u| drawing_uri_label(u) != Some(label));
        s.opened.remove(label);
    }
}
fn drawing_uri_label(uri: &str) -> Option<&str> {
    uri.strip_prefix("octet://drawing/").map(|r| r.split('/').next().unwrap_or(""))
}
// A request the page is answering: its window, its JSON-RPC id, its session, and where its progress and reply go.
// elicit: its session's AI app takes elicitation/create; asked: the one the page waits on now (mcp_elicit).
struct Pending {
    window: String,
    rid: serde_json::Value,
    cancelled: bool, // notifications/cancelled named it: the page asks (mcp_cancelled) between the call's parts
    session: Option<String>,
    tx: mpsc::Sender<Msg>,
    request: serde_json::Value, // what was sent to the page, to send again when the page has not said it got it
    elicit: bool,
    asked: Option<Asking>,
}
// An elicitation/create the page waits on: its JSON-RPC id, the fields its form asks for, and where the answer goes
// (None: an answer that is not one). Dropped (the call ended, or was cancelled), it ends the wait at once.
struct Asking(serde_json::Value, Vec<String>, mpsc::Sender<Option<String>>);
impl Pending {
    // Octet stops waiting for the user's answer with none (its time is up, Stop, a cancel, the call ends): it cancels
    // its elicitation/create on the call's stream, so the AI app closes the form (MCP, Cancellation).
    fn unask(&mut self) {
        if let Some(Asking(rid, ..)) = self.asked.take() {
            let _ = self.tx.send(Msg::Progress(serde_json::json!({ "jsonrpc": "2.0", "method": "notifications/cancelled", "params": { "requestId": rid, "reason": "Octet stopped waiting for the answer." } }).to_string()));
        }
    }
}
enum Msg {
    Progress(String), // a notifications/progress message, as JSON
    Ask(String),      // an elicitation/create request, as JSON
    Done(String),     // the reply
    Got,              // the page has the request
}

// An AI app's session (decision 0021, D1): its name, the drawing (window label) its calls go to, and when it last
// called. A session with no drawing takes the window in front at its first tool call (route), unless another session
// works there; a window coming to the front later does not move it.
// stream: its event stream for notifications (GET); subs: the drawing URIs it subscribed to; bucket: its calls left this
// second (D16), and when it was last filled; waiting: its calls under way. brief: the user's answers to set_brief's
// three questions (plan 3.1), as the page wrote them (JSON), sent with each request; none until set_brief. elicit: the
// AI app said at initialize that it takes elicitation/create in form mode (elicits). opened: the drawings it opened with
// drawings new, which it may close (mcp_close).
struct Session {
    client: String,
    drawing: Option<String>,
    opened: HashSet<String>,
    brief: Option<String>,
    elicit: bool,
    last: Instant,
    stream: Option<(u64, mpsc::Sender<String>)>, // the stream's own number, and where its notifications go
    subs: HashSet<String>,
    bucket: (f64, Instant),
    waiting: usize,
}
const IDLE: Duration = Duration::from_secs(12 * 3600); // a session unused this long ends
const RATE: f64 = 20.0; // calls a second a session may make
const MOST_WAITING: usize = 4; // calls a session may have under way at once
const USING: Duration = Duration::from_secs(600); // a session that has not called for this long no longer holds its drawing (uses)
const READY: Duration = Duration::from_secs(15); // the longest a request waits for a new window's page to start
const GOT: Duration = Duration::from_secs(3); // a request the page has not said it got by then is sent again
const STARTING: &str = "The drawing is still starting. Call again.";
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
        *mcp.shared.loose.lock().unwrap() = None;
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

// The session's drawing from now on: drawings use, and drawings new (open_window gives the session the window it made
// before it builds that window, so no other session's first call takes it; made: the session opened it, so it may
// close it). The session's drawing before; None: no such session.
pub fn give(app: &AppHandle, session: &str, drawing: Option<String>, made: bool) -> Option<Option<String>> {
    app.try_state::<Mcp>().and_then(|m| {
        m.shared.sessions.lock().unwrap().get_mut(session).map(|s| {
            if made {
                s.opened.extend(drawing.clone());
            }
            std::mem::replace(&mut s.drawing, drawing)
        })
    })
}

// The commands below only take a lock, so they run off the main thread (async): there they waited behind the window
// making of eight AI apps' new drawings at once (plan 17.5).
// drawings use: the window must be one of Octet's drawings.
#[tauri::command(async)]
pub fn mcp_target(app: AppHandle, session: String, drawing: String) -> Result<(), String> {
    if !crate::windows::ours(&drawing) || app.get_webview_window(&drawing).is_none() {
        return Err("There is no such drawing.".into());
    }
    give(&app, &session, Some(drawing), false).map(|_| ()).ok_or_else(|| "There is no such session.".into())
}

// drawings close: a drawing the session opened with drawings new (in this run of Octet) closes, and a session that
// used it has no drawing from now on. With windows it is File > Close, the page's own close (unsaved changes, recovery
// copy), and one with unsaved changes stays open (unsaved), for the user to close: never a question the call waits on.
// edited: the calling page's own unsaved changes, when it closes its own window (the window list hears of them only
// after the page draws). With no window it goes at once, its page with it, and is off the list and never in front
// again before this call's reply goes. Either way the window goes after the calls in it now (this one too) have their
// replies. theirs: the session did not open it; none: there is no such drawing.
#[tauri::command(async)]
pub fn mcp_close(app: AppHandle, mcp: State<'_, Mcp>, session: String, drawing: String, edited: bool) -> &'static str {
    let Some(window) = app.get_webview_window(&drawing).filter(|_| crate::windows::ours(&drawing)) else { return "none" };
    let headless = crate::windows::HEADLESS.load(Ordering::Relaxed);
    let unsaved = !headless && (edited || crate::windows::edited(&app, &drawing));
    let done = mcp.shared.sessions.lock().unwrap().get_mut(&session).map_or("theirs", |s| closes(s, &drawing, unsaved, headless));
    if done != "closed" {
        return done;
    }
    crate::windows::leaving(&app, &drawing, headless);
    if headless {
        mcp.shared.ready.lock().unwrap().remove(&drawing);
    }
    let shared = mcp.shared.clone();
    let calls: Vec<u64> = shared.pending.lock().unwrap().iter().filter(|(_, p)| p.window == drawing).map(|(n, _)| *n).collect();
    std::thread::spawn(move || {
        while shared.pending.lock().unwrap().keys().any(|n| calls.contains(n)) {
            std::thread::sleep(Duration::from_millis(5));
        }
        let _ = if headless { window.destroy() } else { window.close() };
    });
    "closed"
}
// Whether the session closes the drawing (mcp_close): one it opened, with nothing unsaved. It no longer uses it. It
// keeps it as its own until the window goes (closed), as the page's close can still stop (the user cancels its
// question); gone: there is no window, so it goes for certain.
fn closes(s: &mut Session, drawing: &str, unsaved: bool, gone: bool) -> &'static str {
    if !s.opened.contains(drawing) {
        return "theirs";
    }
    if unsaved {
        return "unsaved";
    }
    if gone {
        s.opened.remove(drawing);
    }
    if s.drawing.as_deref() == Some(drawing) {
        s.drawing = None;
    }
    "closed"
}

// The session's brief from now on (set_brief), for its calls in every drawing; with no session, the brief of every
// request that has none. Kept in memory only: a new session starts with none.
#[tauri::command(async)]
pub fn mcp_brief(mcp: State<'_, Mcp>, session: Option<String>, brief: String) -> Result<(), String> {
    if brief.len() > 16 * 1024 {
        return Err("The brief is too long.".into());
    }
    match session {
        Some(s) => mcp.shared.sessions.lock().unwrap().get_mut(&s).map(|x| x.brief = Some(brief)).ok_or_else(|| "There is no such session.".to_string()),
        None => {
            *mcp.shared.loose.lock().unwrap() = Some(brief);
            Ok(())
        }
    }
}

// A page's listener goes (the page takes it down before it puts up another, as a dev build's page does on its first
// render): requests wait until one listens again, and none is sent into the gap and lost. A newer listener is already
// up when this comes late: nothing changes.
#[tauri::command(async)]
pub fn mcp_unready(window: Window, mcp: State<'_, Mcp>, listener: u32) {
    let label = window.label();
    if mcp.shared.heard.lock().unwrap().get(label) == Some(&listener) {
        mcp.shared.ready.lock().unwrap().remove(label);
    }
}

// The page has request `id` (it says so before it starts the work), so the request is not sent again.
#[tauri::command(async)]
pub fn mcp_got(mcp: State<'_, Mcp>, id: u64) {
    if let Some(p) = mcp.shared.pending.lock().unwrap().get(&id) {
        let _ = p.tx.send(Msg::Got);
    }
}

// A page listens for requests now. A new page in a window (reloaded) has lost the requests the old one had: they end
// now. The same page saying so again changes nothing.
#[tauri::command(async)]
pub fn mcp_ready(window: Window, mcp: State<'_, Mcp>, page: String, listener: u32) -> bool {
    let label = window.label().to_string();
    mcp.shared.heard.lock().unwrap().entry(label.clone()).and_modify(|n| *n = (*n).max(listener)).or_insert(listener);
    let was = mcp.shared.ready.lock().unwrap().insert(label.clone(), page.chars().take(64).collect());
    if was.is_some_and(|w| w != page) {
        mcp.shared.pending.lock().unwrap().retain(|_, p| {
            if p.window == label {
                p.unask();
                let _ = p.tx.send(Msg::Done(error_reply(Some(&p.rid), -32603, "The Octet window started again. Try again.")));
            }
            p.window != label
        });
    }
    // Whether an AI app subscribes to this drawing: a page that started again says each change from then on.
    mcp.shared.sessions.lock().unwrap().values().any(|s| s.subs.iter().any(|u| drawing_uri_label(u) == Some(label.as_str())))
}

// The page's answer to request `id`.
#[tauri::command(async)]
pub fn mcp_reply(mcp: State<'_, Mcp>, id: u64, body: String) -> Result<(), String> {
    // With no window, the reply goes to the program that started Octet, or to a file (--convert): a drawing as large as
    // Save writes, twice (the text, and the same in structuredContent), in base64.
    let most = if crate::windows::HEADLESS.load(Ordering::Relaxed) { 4 * crate::MAX_BYTES as usize } else { MAX_REPLY };
    if let Some(mut p) = mcp.shared.pending.lock().unwrap().remove(&id) {
        p.unask();
        let _ = p.tx.send(Msg::Done(if body.len() > most { error_reply(Some(&p.rid), -32603, "The reply is too large.") } else { body }));
    }
    Ok(())
}

// A progress notification for request `id` (D2), as JSON, sent on its event stream when it asked for progress.
#[tauri::command(async)]
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
#[tauri::command(async)]
pub fn mcp_cancelled(mcp: State<'_, Mcp>, id: u64) -> bool {
    mcp.shared.pending.lock().unwrap().get(&id).is_none_or(|p| p.cancelled)
}

// The page asks the user something through the AI app's own form, in the middle of request `id` (plan 7.3): body is the
// elicitation/create params. The AI app's answer, checked (answered), or Err when there is none: its AI app does not
// take elicitation, the call already asks, was stopped or cancelled, ASK went by, or the answer was not one.
#[tauri::command]
pub async fn mcp_elicit(mcp: State<'_, Mcp>, id: u64, body: String) -> Result<String, String> {
    let shared = mcp.shared.clone();
    tauri::async_runtime::spawn_blocking(move || ask(&shared, id, &body, ASK)).await.map_err(|e| e.to_string())?
}
fn ask(shared: &Shared, id: u64, body: &str, wait: Duration) -> Result<String, String> {
    const NONE: &str = "The user did not answer.";
    let params: serde_json::Value = serde_json::from_str(body).map_err(|_| NONE)?;
    let fields = params.pointer("/requestedSchema/properties").and_then(|p| p.as_object()).map(|o| o.keys().cloned().collect()).unwrap_or_default();
    let (tx, rx) = mpsc::channel();
    let rid = serde_json::json!(format!("octet-ask-{}", NEXT.fetch_add(1, Ordering::Relaxed)));
    {
        let mut pending = shared.pending.lock().unwrap();
        let p = pending.get_mut(&id).filter(|p| p.elicit && !p.cancelled && p.asked.is_none()).ok_or(NONE)?;
        p.asked = Some(Asking(rid.clone(), fields, tx));
        let _ = p.tx.send(Msg::Ask(serde_json::json!({ "jsonrpc": "2.0", "id": rid, "method": "elicitation/create", "params": params }).to_string()));
    }
    let got = rx.recv_timeout(wait);
    if let Some(p) = shared.pending.lock().unwrap().get_mut(&id) {
        p.unask();
    }
    got.ok().flatten().ok_or_else(|| NONE.into())
}

// A JSON-RPC response from the AI app: the answer to the elicitation/create of a call of the same session that waits
// for it, as the page reads it (checked). A response nothing waits for is ignored.
fn answered(shared: &Shared, message: &serde_json::Value, sid: Option<&str>) {
    let Some(rid) = message.get("id") else { return };
    if let Some(p) = shared.pending.lock().unwrap().values_mut().find(|p| p.session.as_deref() == sid && p.asked.as_ref().is_some_and(|a| &a.0 == rid)) {
        let Asking(_, fields, tx) = p.asked.take().unwrap();
        let _ = tx.send(checked(message, &fields));
    }
}
// The answer is untrusted, as everything from outside is: at most MOST_ANSWER, an action of the three, and only the
// form's fields that are text or a number. None: it is not an answer.
fn checked(message: &serde_json::Value, fields: &[String]) -> Option<String> {
    let r = message.get("result").filter(|_| message.to_string().len() <= MOST_ANSWER)?;
    let action = r.get("action")?.as_str().filter(|a| matches!(*a, "accept" | "decline" | "cancel"))?;
    let content: serde_json::Map<String, serde_json::Value> = r.get("content").and_then(|c| c.as_object()).map(|c| c.iter().filter(|(k, v)| fields.contains(k) && (v.is_string() || v.is_number())).map(|(k, v)| (k.clone(), v.clone())).collect()).unwrap_or_default();
    Some(serde_json::json!({ "action": action, "content": content }).to_string())
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
// A tool call's result that is an error: the AI model reads it and can act on it (a JSON-RPC error stops at the AI app).
fn tool_error(id: &serde_json::Value, text: &str) -> String {
    serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": { "content": [{ "type": "text", "text": text }], "isError": true } }).to_string()
}
// The answer to a request whose window's page has not started after READY: at once, never a wait of WAIT for a page
// with no listener.
fn starting(id: &serde_json::Value, method: &str) -> String {
    if method == "tools/call" { tool_error(id, STARTING) } else { error_reply(Some(id), -32603, STARTING) }
}

// Whether a request gives a session with no drawing its drawing (plan 17.5): a tool call, except drawings (which lists,
// uses or makes a drawing). The protocol's own requests (initialize, ping, the lists, prompts) take none.
fn claims(method: &str, message: &serde_json::Value) -> bool {
    method == "tools/call" && message.pointer("/params/name").and_then(|n| n.as_str()) != Some("drawings")
}
// Whether a session works in a drawing now: it is the session's drawing, and the session has a call under way or
// called in the last USING. (A session that an AI app left without ending it stops holding the drawing then.)
fn uses(s: &Session, label: &str) -> bool {
    s.drawing.as_deref() == Some(label) && (s.waiting > 0 || s.last.elapsed() < USING)
}
// Where a session's request goes, and whether the session takes that window as its drawing (decision 0021: an AI app
// works in the user's open drawing). Its drawing while that is open. A session with no drawing takes the window in
// front at its first tool call that claims one (claims), unless another session works there (front_used): then the
// call is refused (Err, that window), so it never runs in another session's drawing. Two sessions with no drawing that
// both call at once: the first through the sessions lock takes the window in front, and the second is refused, with
// how to get a drawing of its own or share that one. Every other request (the protocol's own, drawings, and any call
// of a session whose drawing closed, which the page says is lost) takes nothing and goes to near (listening).
fn route(own: Option<&str>, open: bool, front: Option<String>, near: Option<String>, front_used: bool, claims: bool) -> Result<(Option<String>, bool), String> {
    match (own, front) {
        (Some(d), _) if open => Ok((Some(d.to_string()), false)),
        (None, Some(f)) if claims && front_used => Err(f),
        (None, f) if claims => {
            let take = f.is_some();
            Ok((f, take))
        }
        _ => Ok((near, false)),
    }
}
// Where a request that takes no drawing goes: the window in front if its page listens, else the newest window whose
// page does. After another session's drawings new, the window in front is often that session's new window, whose page
// may take seconds to start: such a request never waits for it (plan 17.5). None listens: the window in front.
fn listening(front: Option<String>, ready: &HashMap<String, String>) -> Option<String> {
    if front.as_ref().is_some_and(|f| ready.contains_key(f)) {
        return front;
    }
    ready.keys().max_by_key(|l| (l.as_str() != "main", l.trim_start_matches("draw-").parse::<u64>().unwrap_or(0))).cloned().or(front)
}
fn taken(id: &serde_json::Value, label: &str) -> String {
    tool_error(id, &format!("Octet changed nothing. Another AI app works in the drawing in front ({label}). For a drawing of your own, call drawings with action new, then call again. To work in {label} with the other AI app, call drawings with action use and drawing {label}."))
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
    // A notification or a response from the AI app needs no answer.
    let Some(id) = message.get("id").filter(|_| message.get("method").is_some()) else {
        cancel(shared, &message, sid.as_deref());
        answered(shared, &message, sid.as_deref());
        return respond(&mut stream, "202 Accepted", "", None);
    };
    let (client, session, window, lost, brief, unset, elicit) = match direct(app, shared, id, method, &message, sid.as_deref(), true) {
        Routed::Answer(r) => return respond(&mut stream, "200 OK", &r, None),
        Routed::Unknown => return respond(&mut stream, "404 Not Found", "", None),
        Routed::Call { client, session, window, lost, brief, unset, elicit } => (client, session, window, lost, brief, unset, elicit),
    };
    let new_session = session.as_deref().filter(|_| method == "initialize");
    let Some(window) = window else {
        finished(shared, session.as_deref());
        return respond(&mut stream, "200 OK", &error_reply(Some(id), -32603, "Octet has no window open."), None);
    };
    let sent = match send(app, shared, &window, id, method, &body, &client, session.as_deref(), lost, brief, unset, elicit, READY) {
        Ok(sent) => sent,
        Err(r) => {
            finished(shared, session.as_deref());
            return respond(&mut stream, "200 OK", &r, new_session);
        }
    };
    // A call that asks for progress is answered as an event stream: its progress as it goes, then its reply. Any other
    // call becomes one only when the page asks the user something on the way (plan 7.3): its headers wait until then.
    let (new, mut open) = (new_session.map(|s| format!("Mcp-Session-Id: {s}\r\n")).unwrap_or_default(), None);
    if message.pointer("/params/_meta/progressToken").is_some() {
        opened(&mut stream, &mut open, &new);
    }
    let reply = answer(app, shared, sent, id, |p| event(&mut stream, &mut open, &new, p));
    finished(shared, session.as_deref());
    if open.is_none() {
        return respond(&mut stream, "200 OK", &reply, new_session);
    }
    event(&mut stream, &mut open, &new, &reply);
    let _ = stream.shutdown(Shutdown::Both);
}

// A call's event stream: its headers, written once (open: whether they went), then each message as an event. false:
// the AI app has gone.
fn opened(s: &mut impl Write, open: &mut Option<bool>, new: &str) -> bool {
    *open.get_or_insert_with(|| write!(s, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\n{new}Connection: close\r\n\r\n").is_ok())
}
fn event(s: &mut impl Write, open: &mut Option<bool>, new: &str, data: &str) -> bool {
    opened(s, open, new) && write!(s, "event: message\ndata: {}\n\n", data.replace('\n', " ")).and_then(|_| s.flush()).is_ok()
}

// notifications/cancelled stops the call it names, between its parts (the page puts the drawing back).
fn cancel(shared: &Shared, message: &serde_json::Value, sid: Option<&str>) {
    if message.get("method").and_then(|m| m.as_str()) == Some("notifications/cancelled") {
        let want = message.pointer("/params/requestId");
        if let Some(p) = shared.pending.lock().unwrap().values_mut().find(|p| p.session.as_deref() == sid && Some(&p.rid) == want) {
            p.cancelled = true;
            p.unask(); // a question the page waits on ends now
        }
    }
}

// Where a request goes (direct), for the server and for `--headless --mcp`: an answer here, a session Octet does not
// know, or a call to a drawing window, with the AI app's name, its session, the window, the drawing it lost, its brief
// (set_brief), whether the session has no drawing yet, and whether its AI app takes elicitation/create.
enum Routed {
    Answer(String),
    Unknown,
    Call { client: String, session: Option<String>, window: Option<String>, lost: Option<String>, brief: Option<String>, unset: bool, elicit: bool },
}

// Whether an initialize says the AI app takes elicitation/create in form mode (MCP 2025-11-25, Elicitation,
// Capabilities): an empty elicitation is form mode; one with only url mode is not.
fn elicits(message: &serde_json::Value) -> bool {
    message.pointer("/params/capabilities/elicitation").and_then(|e| e.as_object()).is_some_and(|e| e.is_empty() || e.contains_key("form"))
}

// Initialize starts a session; a later request names its session, and one Octet does not know (ended, idle, or from
// before Octet started again) is Unknown, so the AI app starts a new one. A request with no session (an older client)
// acts on the window in front. server: an AI app over HTTP, with the rate limits (D16) and sessions that end when idle;
// else the one program on standard input and output that started Octet, whose one session lasts as long as it does
// (initialize again keeps it).
fn direct(app: &AppHandle, shared: &Shared, id: &serde_json::Value, method: &str, message: &serde_json::Value, sid: Option<&str>, server: bool) -> Routed {
    let front = crate::windows::front(app);
    let near = listening(front.clone(), &shared.ready.lock().unwrap());
    let mut sessions = shared.sessions.lock().unwrap();
    if server {
        sessions.retain(|_, s| s.last.elapsed() < IDLE);
    }
    if server && (method == "initialize" || sid.is_none()) {
        let mut open = shared.open.lock().unwrap();
        if !take(open.get_or_insert((RATE, Instant::now()))) {
            return Routed::Answer(error_reply(Some(id), -32000, "Too many calls at once. Wait a moment, then call again."));
        }
    }
    if method == "initialize" && (server || sid.is_none()) {
        // At most MOST_SESSIONS: a new one takes the place of the one unused longest, but never of one with a call
        // under way or its event stream open.
        if sessions.len() >= MOST_SESSIONS {
            let oldest = sessions.iter().filter(|(_, s)| s.waiting == 0 && s.stream.is_none()).min_by_key(|(_, s)| s.last).map(|(k, _)| k.clone());
            let Some(oldest) = oldest else {
                return Routed::Answer(error_reply(Some(id), -32000, "Too many AI apps are connected to Octet. Close one, then try again."));
            };
            sessions.remove(&oldest);
        }
        let (name, new) = (client_name(message), random_hex(16).unwrap_or_default());
        let elicit = elicits(message);
        sessions.insert(new.clone(), Session { client: name.clone(), drawing: None, opened: HashSet::new(), brief: None, elicit, last: Instant::now(), stream: None, subs: HashSet::new(), bucket: (RATE, Instant::now()), waiting: 0 });
        return Routed::Call { client: name, session: Some(new), window: near, lost: None, brief: None, unset: true, elicit };
    }
    let Some(s) = sid else { return Routed::Call { client: "An AI app".into(), session: None, window: front, lost: None, brief: shared.loose.lock().unwrap().clone(), unset: false, elicit: false } };
    let front_used = front.as_deref().is_some_and(|f| sessions.iter().any(|(k, x)| k != s && uses(x, f)));
    let Some(session) = sessions.get_mut(s) else { return Routed::Unknown };
    session.last = Instant::now();
    // The rate limit (D16): RATE calls a second, MOST_WAITING under way at once.
    if server && (session.waiting >= MOST_WAITING || !take(&mut session.bucket)) {
        return Routed::Answer(error_reply(Some(id), -32000, "Too many calls at once from this app. Wait for the calls under way to finish, then call again."));
    }
    // Subscriptions are kept here, where the notifications go out.
    let uri = message.pointer("/params/uri").and_then(|u| u.as_str()).unwrap_or("");
    if method == "resources/subscribe" || method == "resources/unsubscribe" {
        let Some(label) = drawing_uri(app, uri) else {
            return Routed::Answer(error_reply(Some(id), -32002, "There is no such drawing. resources/list gives the drawings."));
        };
        if method == "resources/subscribe" { session.subs.insert(uri.to_string()); } else { session.subs.remove(uri); }
        drop(sessions);
        // The window says when it changes from now on (mcp_changed).
        if method == "resources/subscribe" {
            let _ = app.emit_to(label, "mcp-watch", ());
        }
        return Routed::Answer(serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": {} }).to_string());
    }
    // The session's drawing (route). A drawing that has closed is lost: the page says so, and drawings list and use
    // still work. Reading a drawing's resource goes to it.
    let open = session.drawing.as_ref().is_some_and(|d| app.get_webview_window(d).is_some());
    let lost = session.drawing.clone().filter(|_| !open);
    let (window, take) = match route(session.drawing.as_deref(), open, front, near, front_used, claims(method, message)) {
        Ok(r) => r,
        Err(label) => return Routed::Answer(taken(id, &label)),
    };
    if take {
        session.drawing = window.clone();
    }
    let named = drawing_uri(app, uri).filter(|_| method == "resources/read").map(String::from);
    session.waiting += 1;
    Routed::Call { client: session.client.clone(), session: Some(s.to_string()), window: named.or(window), lost, brief: session.brief.clone(), unset: session.drawing.is_none(), elicit: session.elicit }
}

// A call routed to a session has ended: it no longer counts against the session's calls under way.
fn finished(shared: &Shared, session: Option<&str>) {
    if let Some(x) = session.and_then(|s| shared.sessions.lock().unwrap().get_mut(s).map(|x| { x.waiting = x.waiting.saturating_sub(1); })) { x }
}

const WAITED: &str = "Octet did not answer in time.";

// Sends a request to a window's page. A window that has just opened (File > New, drawings new) listens once its page
// has started: up to `ready`; then the AI app is told to call again. Err: the reply when the window cannot be sent to.
fn send(app: &AppHandle, shared: &Shared, window: &str, id: &serde_json::Value, method: &str, body: &[u8], client: &str, session: Option<&str>, lost: Option<String>, brief: Option<String>, unset: bool, elicit: bool, ready: Duration) -> Result<(u64, mpsc::Receiver<Msg>), String> {
    let (start, listens) = (Instant::now(), || shared.ready.lock().unwrap().contains_key(window));
    while !listens() && start.elapsed() < ready {
        std::thread::sleep(Duration::from_millis(50));
    }
    if !listens() {
        return Err(starting(id, method));
    }
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel();
    // unset: the session has no drawing yet (drawings list says none). sent: when this side sent the request (ms since
    // 1970), only in a dev build run with OCTET_MCP_TIMES set: the page then gives each call's times in the reply's
    // _meta, to show whether WebKit slows the page of a covered window (plan 17.5). elicit: the page may ask the user
    // (mcp_elicit).
    let at = (cfg!(debug_assertions) && std::env::var_os("OCTET_MCP_TIMES").is_some()).then(|| SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64));
    let request = serde_json::json!({ "id": n, "body": String::from_utf8_lossy(body), "client": client, "session": session, "lost": lost, "brief": brief, "unset": unset, "elicit": elicit, "sent": at });
    shared.pending.lock().unwrap().insert(n, Pending { window: window.to_string(), rid: id.clone(), session: session.map(String::from), tx, cancelled: false, request: request.clone(), elicit, asked: None });
    if app.emit_to(window, "mcp", request).is_err() {
        shared.pending.lock().unwrap().remove(&n);
        return Err(error_reply(Some(id), -32603, WAITED));
    }
    Ok((n, rx))
}

// The page's reply to a request sent, or WAITED after WAIT. Each progress message, and each question the page asks the
// user (mcp_elicit), goes to `each` first, which stops the wait by answering false (the AI app has gone). A question
// gives the call ASK more, the time the user has to answer it.
// A request the page has not said it got within GOT is sent again, up to three times in all: a page between two
// listeners, or one still starting, loses what is sent to it, and the call would wait the whole of WAIT. The page
// answers one copy only.
fn answer(app: &AppHandle, shared: &Shared, (n, rx): (u64, mpsc::Receiver<Msg>), id: &serde_json::Value, mut each: impl FnMut(&str) -> bool) -> String {
    let mut end = Instant::now() + WAIT;
    let (mut got, mut sends) = (false, 1);
    let reply = loop {
        let left = end.saturating_duration_since(Instant::now());
        match rx.recv_timeout(if got || sends >= 3 { left } else { left.min(GOT) }) {
            Ok(Msg::Got) => got = true,
            Ok(Msg::Progress(p)) if each(&p) => continue,
            Ok(Msg::Ask(q)) if each(&q) => end += ASK,
            Ok(Msg::Done(r)) => break Some(r),
            Err(mpsc::RecvTimeoutError::Timeout) if !got && sends < 3 && Instant::now() < end => {
                sends += 1;
                if let Some((window, request)) = shared.pending.lock().unwrap().get(&n).map(|p| (p.window.clone(), p.request.clone())) {
                    let _ = app.emit_to(window.as_str(), "mcp", request);
                }
            }
            _ => break None,
        }
    };
    shared.pending.lock().unwrap().remove(&n);
    reply.unwrap_or_else(|| error_reply(Some(id), -32603, WAITED))
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

// A tool call in a window, as an AI app makes it, for --convert (convert.rs): its structured result, or why it failed.
// The window is one --convert has just opened, for this file alone: its page may take long to start on a busy computer,
// and nothing else waits for it, so the call waits for it as long as for an answer (WAIT), not READY.
pub fn call(app: &AppHandle, window: &str, tool: &str, args: serde_json::Value) -> Result<serde_json::Value, String> {
    let shared = &app.state::<Mcp>().shared;
    let id = serde_json::json!(1);
    let body = serde_json::json!({ "jsonrpc": "2.0", "id": id, "method": "tools/call", "params": { "name": tool, "arguments": args } }).to_string();
    let reply = send(app, shared, window, &id, "tools/call", body.as_bytes(), "Octet Draw", None, None, None, false, false, WAIT).map_or_else(|r| r, |sent| answer(app, shared, sent, &id, |_| true));
    let reply: serde_json::Value = serde_json::from_str(&reply).map_err(|e| e.to_string())?;
    let said = || reply.pointer("/result/content/0/text").or(reply.pointer("/error/message")).and_then(|t| t.as_str()).unwrap_or(WAITED).to_string();
    match reply.get("result") {
        Some(r) if r.get("isError") != Some(&serde_json::Value::Bool(true)) => Ok(r.get("structuredContent").cloned().unwrap_or_default()),
        _ => Err(said()),
    }
}

// `Octet Draw --headless --mcp` (plan 18.2): MCP on standard input and output, one JSON-RPC message a line, answered
// in Octet's own drawing windows, hidden. Each request takes the server's route to a window and its call there, with
// no port, no key and no mcp.json. The program that started Octet is its one AI app, so there is no rate limit.
// Requests go to the page in the order they come; each waits for its answer on a thread of its own, so a cancel goes
// through while a call runs, and a call's progress, the page's questions to the user (elicitation/create, whose answer
// comes back as a line) and a subscribed drawing's updates come as lines too. When standard
// input ends (the program closed it, or ended), the calls under way finish, and then Octet ends.
pub fn stdio(app: &AppHandle) {
    let shared = app.state::<Mcp>().shared.clone();
    let out: Arc<Mutex<Out>> = Arc::new(Mutex::new(Box::new(std::io::stdout())));
    let mut sid = None::<String>;
    lines_then_end(std::io::stdin().lock(), |line| {
        let Ok(message) = serde_json::from_str::<serde_json::Value>(&line) else {
            say(&out, &error_reply(None, -32700, "The request is not JSON."));
            return None;
        };
        let method = message.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let Some(id) = message.get("id").filter(|_| !method.is_empty()) else {
            cancel(&shared, &message, sid.as_deref());
            answered(&shared, &message, sid.as_deref());
            return None;
        };
        let (client, session, window, lost, brief, unset, elicit) = match direct(app, &shared, id, method, &message, sid.as_deref(), false) {
            Routed::Answer(r) => {
                say(&out, &r);
                return None;
            }
            Routed::Unknown => {
                say(&out, &error_reply(Some(id), -32001, "This session has ended. Send initialize again."));
                return None;
            }
            Routed::Call { client, session, window, lost, brief, unset, elicit } => (client, session, window, lost, brief, unset, elicit),
        };
        // One program on standard input and output is one session: initialize again answers, and keeps the session
        // (its brief and its drawing) as it was.
        if method == "initialize" && sid.is_none() {
            let (tx, rx) = mpsc::channel::<String>();
            if let Some(s) = session.as_ref().and_then(|s| shared.sessions.lock().unwrap().get_mut(s).map(|x| x.stream = Some((NEXT.fetch_add(1, Ordering::Relaxed), tx)))) { s }
            let out = out.clone();
            std::thread::spawn(move || rx.iter().for_each(|note| say(&out, &note)));
            sid = session.clone();
        }
        let sent = window.as_deref().map(|w| send(app, &shared, w, id, method, line.as_bytes(), &client, session.as_deref(), lost, brief, unset, elicit, READY));
        let (app, shared, out, id) = (app.clone(), shared.clone(), out.clone(), id.clone());
        Some(std::thread::spawn(move || {
            let reply = match sent {
                Some(Ok(sent)) => answer(&app, &shared, sent, &id, |p| { say(&out, p); true }),
                Some(Err(r)) => r,
                None => error_reply(Some(&id), -32603, "Octet has no window open."),
            };
            finished(&shared, session.as_deref());
            say(&out, &reply);
        }))
    });
}

// Each line of `input` to `take`, which answers it at once (None) or on a thread of its own. At the end of input,
// every answer under way is written before this returns and Octet ends: a script that sends its requests and closes
// its end gets every reply.
fn lines_then_end(input: impl BufRead, mut take: impl FnMut(String) -> Option<std::thread::JoinHandle<()>>) {
    let mut waiting = Vec::new();
    for line in input.lines() {
        let Ok(line) = line else { break };
        waiting.extend(take(line));
        waiting.retain(|t| !t.is_finished());
    }
    waiting.into_iter().for_each(|t| drop(t.join()));
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
// One message on standard output, on one line. A write that fails means the program reading has gone (it closed its
// end of the pipe): nothing would read what comes next, so Octet ends, with exit code 1.
fn say(out: &Mutex<Out>, line: &str) {
    let mut out = out.lock().unwrap();
    if writeln!(out, "{}", line.trim().replace(['\r', '\n'], " ")).and_then(|_| out.flush()).is_err() {
        std::process::exit(1);
    }
}
struct Relay {
    dir: Option<PathBuf>,
    out: Mutex<Out>,
    // session: Octet's session for this AI app; hello: the AI app's initialize, sent again when Octet needs it; version:
    // the protocol version agreed; watching: a thread tries Octet until it answers; listening: the GET stream's thread;
    // asks: the AI app takes elicitation/create, so a call may wait ASK more for the user's answer (plan 7.3).
    state: Mutex<RelayState>,
}
#[derive(Default)]
struct RelayState {
    session: Option<String>,
    hello: Option<String>,
    version: Option<String>,
    watching: bool,
    listening: bool,
    asks: bool,
}
const CLOSED: &str = "Octet Draw is not open, or its AI apps are off. Open Octet Draw and turn on Settings > General > AI apps > Let AI apps use Octet, then try again.";

impl Relay {
    fn new(dir: Option<PathBuf>, out: Out) -> Arc<Relay> {
        Arc::new(Relay { dir, out: Mutex::new(out), state: Mutex::default() })
    }
    fn info(&self) -> Option<Info> {
        self.dir.as_ref().and_then(|d| std::fs::read(d.join(INFO)).ok()).and_then(|b| serde_json::from_slice(&b).ok())
    }
    fn say(&self, line: &str) {
        say(&self.out, line)
    }
    fn take(self: &Arc<Self>, line: String) {
        let Ok(message) = serde_json::from_str::<serde_json::Value>(&line) else { return };
        if message.get("method").and_then(|m| m.as_str()) == Some("initialize") {
            let mut st = self.state.lock().unwrap();
            (st.hello, st.asks) = (Some(line.clone()), elicits(&message));
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
        let wait = WAIT + Duration::from_secs(20) + if self.state.lock().unwrap().asks { ASK } else { Duration::ZERO };
        let (status, head, mut reader) = self.request(info, "POST", body, session, "application/json, text/event-stream", wait)?;
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

    // A script that sends its requests in one write and closes its end (`printf ... | octet --headless --mcp`): each
    // request read is answered, the slowest last, before Octet ends. One that is answered at once takes no thread.
    #[test]
    fn every_request_read_is_answered_before_the_end() {
        let said = Arc::new(Mutex::new(Vec::new()));
        lines_then_end(&b"slow\nnow\nquick"[..], |line| {
            let said = said.clone();
            if line == "now" {
                said.lock().unwrap().push(line);
                return None;
            }
            Some(std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(if line == "slow" { 300 } else { 10 }));
                said.lock().unwrap().push(line);
            }))
        });
        assert_eq!(*said.lock().unwrap(), ["now", "quick", "slow"]);
    }

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

    // Plan 17.5: which window a session's request goes to, and whether the session takes it.
    #[test]
    fn a_session_never_lands_in_another_sessions_drawing() {
        // f: the window in front; n: where a request that takes no drawing goes (listening), here another window.
        let (f, n) = (|| Some("draw-2".to_string()), || Some("draw-1".to_string()));
        // Its own drawing while it is open, whatever is in front.
        assert_eq!(route(Some("draw-3"), true, f(), n(), true, true), Ok((Some("draw-3".into()), false)));
        // Its drawing closed: taken by nothing (the page says the drawing is lost).
        assert_eq!(route(Some("draw-3"), false, f(), n(), false, true), Ok((n(), false)));
        // No drawing yet: the protocol's requests and drawings take nothing, also when another session works in front.
        assert_eq!(route(None, false, f(), n(), false, false), Ok((n(), false)));
        assert_eq!(route(None, false, f(), n(), true, false), Ok((n(), false)));
        // Its first other tool call takes the window in front, when no other session works there.
        assert_eq!(route(None, false, f(), n(), false, true), Ok((f(), true)));
        // When another session works there, the call is refused.
        assert_eq!(route(None, false, f(), n(), true, true), Err("draw-2".into()));
        // No window: nothing to take.
        assert_eq!(route(None, false, None, None, false, true), Ok((None, false)));
        let call = |name: &str| serde_json::json!({ "method": "tools/call", "params": { "name": name } });
        assert!(claims("tools/call", &call("set_brief")) && claims("tools/call", &call("draw")) && claims("tools/call", &call("read")));
        assert!(!claims("tools/call", &call("drawings")));
        for m in ["initialize", "ping", "tools/list", "prompts/list", "prompts/get", "resources/list", "resources/read"] {
            assert!(!claims(m, &serde_json::json!({ "method": m })), "{m}");
        }
        let refused: serde_json::Value = serde_json::from_str(&taken(&serde_json::json!(4), "draw-2")).unwrap();
        assert_eq!((&refused["id"], &refused["result"]["isError"]), (&serde_json::json!(4), &serde_json::json!(true)));
        let text = refused["result"]["content"][0]["text"].as_str().unwrap();
        assert!(text.contains("drawings with action new") && text.contains("drawings with action use and drawing draw-2"), "{text}");
    }

    // A request that takes no drawing goes to the window in front when its page listens; else (another session's new
    // window, still starting) to the newest window that listens, so it never waits for that page; with none, to the
    // window in front, to wait for it.
    #[test]
    fn a_request_that_takes_no_drawing_never_waits_for_a_page_starting() {
        let ready = |l: &[&str]| l.iter().map(|x| (x.to_string(), "p".to_string())).collect::<HashMap<_, _>>();
        let f = || Some("draw-9".to_string());
        assert_eq!(listening(f(), &ready(&["main", "draw-2", "draw-9"])), f());
        assert_eq!(listening(f(), &ready(&["main", "draw-2", "draw-10"])), Some("draw-10".into()));
        assert_eq!(listening(f(), &ready(&["main"])), Some("main".into()));
        assert_eq!(listening(f(), &ready(&[])), f());
        assert_eq!(listening(None, &ready(&[])), None);
    }

    // A session works in its drawing while it has a call under way or called in the last USING.
    #[test]
    fn a_session_works_in_its_drawing_while_it_calls() {
        let at = |ago: u64, waiting| Session { client: "x".into(), drawing: Some("draw-1".into()), opened: HashSet::new(), brief: None, elicit: false, last: Instant::now().checked_sub(Duration::from_secs(ago)).unwrap(), stream: None, subs: HashSet::new(), bucket: (RATE, Instant::now()), waiting };
        assert!(uses(&at(5, 0), "draw-1"));
        assert!(!uses(&at(5, 0), "draw-2"));
        assert!(!uses(&at(USING.as_secs() + 1, 0), "draw-1"));
        assert!(uses(&at(USING.as_secs() + 1, 1), "draw-1"));
    }

    // drawings close: a session closes only a drawing it opened, and one with unsaved changes (in a window) stays open
    // and stays its own. After it closes the drawing it used, it has none, so its next call is a new session's.
    #[test]
    fn a_session_closes_only_its_own_drawings() {
        let mut s = Session { client: "x".into(), drawing: Some("draw-3".into()), opened: ["draw-2".into(), "draw-3".into()].into(), brief: None, elicit: false, last: Instant::now(), stream: None, subs: HashSet::new(), bucket: (RATE, Instant::now()), waiting: 0 };
        assert_eq!(closes(&mut s, "draw-1", false, true), "theirs", "the user's drawing");
        assert_eq!(closes(&mut s, "draw-3", true, false), "unsaved");
        assert_eq!(s.drawing.as_deref(), Some("draw-3"));
        assert_eq!(closes(&mut s, "draw-2", false, true), "closed");
        assert_eq!(s.drawing.as_deref(), Some("draw-3"), "another of its drawings closed");
        assert_eq!(closes(&mut s, "draw-2", false, true), "theirs", "closed already");
        // In a window it stays its own until the window goes: the user can stop the page's close.
        assert_eq!(closes(&mut s, "draw-3", false, false), "closed");
        assert_eq!(s.drawing, None);
        assert!(s.opened.contains("draw-3"));
        assert_eq!(route(s.drawing.as_deref(), false, Some("draw-1".into()), Some("draw-1".into()), false, true), Ok((Some("draw-1".into()), true)), "it takes the window in front");
    }

    // A window whose page has not started is answered at once: a tool call with a result the model reads, any other
    // request with an error.
    #[test]
    fn a_drawing_still_starting_says_call_again() {
        let call: serde_json::Value = serde_json::from_str(&starting(&serde_json::json!("c1"), "tools/call")).unwrap();
        assert_eq!(call, serde_json::json!({ "jsonrpc": "2.0", "id": "c1", "result": { "content": [{ "type": "text", "text": "The drawing is still starting. Call again." }], "isError": true } }));
        let other: serde_json::Value = serde_json::from_str(&starting(&serde_json::json!(2), "resources/read")).unwrap();
        assert_eq!((&other["error"]["message"], &other["id"]), (&serde_json::json!(STARTING), &serde_json::json!(2)));
    }

    // Plan 7.3: the page asks the user through the AI app's form. A call waiting on request 5 of session s.
    fn waiting(shared: &Shared, elicit: bool) -> mpsc::Receiver<Msg> {
        let (tx, rx) = mpsc::channel();
        shared.pending.lock().unwrap().insert(5, Pending { window: "draw-1".into(), rid: serde_json::json!(9), cancelled: false, session: Some("s".into()), tx, request: serde_json::json!({}), elicit, asked: None });
        rx
    }
    const FORM: &str = r#"{"message":"Where is this going?","requestedSchema":{"type":"object","properties":{"destination":{"type":"string"},"emphasis":{"type":"string"}},"required":["destination"]}}"#;
    // The question the page asks, as it goes out, and its id.
    fn question(rx: &mpsc::Receiver<Msg>) -> (serde_json::Value, serde_json::Value) {
        match rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Msg::Ask(q)) => {
                let v: serde_json::Value = serde_json::from_str(&q).unwrap();
                (v["id"].clone(), v)
            }
            _ => panic!("no question went out"),
        }
    }
    fn reply_to(rid: &serde_json::Value, result: serde_json::Value) -> serde_json::Value {
        serde_json::json!({ "jsonrpc": "2.0", "id": rid, "result": result })
    }

    #[test]
    fn a_session_keeps_whether_its_ai_app_takes_elicitation() {
        let hello = |caps: serde_json::Value| serde_json::json!({ "method": "initialize", "params": { "capabilities": caps } });
        assert!(elicits(&hello(serde_json::json!({ "elicitation": {} }))), "empty is form mode");
        assert!(elicits(&hello(serde_json::json!({ "elicitation": { "form": {}, "url": {} } }))));
        assert!(!elicits(&hello(serde_json::json!({ "elicitation": { "url": {} } }))), "url mode only");
        assert!(!elicits(&hello(serde_json::json!({}))));
        assert!(!elicits(&hello(serde_json::json!({ "elicitation": true }))));
        // The relay keeps it from the AI app's initialize: its calls may wait ASK more.
        let relay = Relay::new(Some(std::env::temp_dir().join("octet-no-such-folder")), Box::new(Lines::default()));
        relay.state.lock().unwrap().watching = true;
        relay.take(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{"elicitation":{}}}}"#.into());
        assert!(relay.state.lock().unwrap().asks);
    }

    #[test]
    fn a_question_goes_out_on_the_calls_stream_and_the_answer_comes_back() {
        let shared = Arc::new(Shared::default());
        let rx = waiting(&shared, true);
        let s2 = shared.clone();
        let asking = std::thread::spawn(move || ask(&s2, 5, FORM, Duration::from_secs(10)));
        let (rid, q) = question(&rx);
        assert_eq!((q["method"].as_str(), &q["params"]), (Some("elicitation/create"), &serde_json::from_str::<serde_json::Value>(FORM).unwrap()));
        assert!(rid.as_str().is_some_and(|r| r.starts_with("octet-ask-")));
        // A call with no progress token becomes an event stream when it asks: the headers, then the question.
        let (mut out, mut open) = (Vec::new(), None);
        assert!(event(&mut out, &mut open, "", &q.to_string()) && event(&mut out, &mut open, "", "{}"));
        let out = String::from_utf8(out).unwrap();
        assert!(out.starts_with("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n") && out.matches("HTTP/1.1").count() == 1 && out.contains(&format!("data: {q}\n\n")), "{out}");
        // A second question while one waits is refused.
        assert!(ask(&shared, 5, FORM, Duration::from_millis(10)).is_err());
        // Answers nothing waits for are ignored: another id, and the right id from another session.
        answered(&shared, &reply_to(&serde_json::json!("octet-ask-0"), serde_json::json!({ "action": "accept" })), Some("s"));
        answered(&shared, &reply_to(&rid, serde_json::json!({ "action": "decline" })), Some("other"));
        // The answer: only the form's fields that are text or a number.
        answered(&shared, &reply_to(&rid, serde_json::json!({ "action": "accept", "content": { "destination": "paper", "emphasis": 2, "layout": "x", "other": "y" }, "extra": true })), Some("s"));
        let got: serde_json::Value = serde_json::from_str(&asking.join().unwrap().unwrap()).unwrap();
        assert_eq!(got, serde_json::json!({ "action": "accept", "content": { "destination": "paper", "emphasis": 2 } }));
        assert!(shared.pending.lock().unwrap()[&5].asked.is_none());
        // A call whose AI app does not take elicitation asks nothing.
        let rx = waiting(&shared, false);
        assert!(ask(&shared, 5, FORM, Duration::from_secs(10)).is_err() && rx.try_recv().is_err());
    }

    #[test]
    fn an_answer_that_is_not_one_is_refused() {
        let f = ["destination".to_string()];
        let ok = |r: serde_json::Value| checked(&reply_to(&serde_json::json!(1), r), &f);
        assert_eq!(ok(serde_json::json!({ "action": "decline" })).as_deref(), Some(r#"{"action":"decline","content":{}}"#));
        assert_eq!(ok(serde_json::json!({ "action": "cancel", "content": { "destination": { "a": 1 } } })).as_deref(), Some(r#"{"action":"cancel","content":{}}"#));
        assert_eq!(ok(serde_json::json!({ "action": "maybe" })), None);
        assert_eq!(ok(serde_json::json!({ "content": { "destination": "paper" } })), None);
        assert_eq!(ok(serde_json::json!({ "action": "accept", "content": { "destination": "x".repeat(MOST_ANSWER) } })), None);
        assert_eq!(checked(&serde_json::json!({ "jsonrpc": "2.0", "id": 1, "error": { "code": -1, "message": "no" } }), &f), None);
        // Through the wait: such an answer ends it at once, with no answer.
        let shared = Arc::new(Shared::default());
        let rx = waiting(&shared, true);
        let s2 = shared.clone();
        let asking = std::thread::spawn(move || ask(&s2, 5, FORM, Duration::from_secs(30)));
        let (rid, _) = question(&rx);
        answered(&shared, &reply_to(&rid, serde_json::json!({ "action": "submit" })), Some("s"));
        assert!(asking.join().unwrap().is_err());
    }

    #[test]
    fn a_question_ends_when_its_time_is_up_or_its_call_is_cancelled() {
        // Each time, Octet cancels its question on the call's stream, so the AI app closes the form.
        let closed = |rx: &mpsc::Receiver<Msg>, rid: &serde_json::Value| match rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Msg::Progress(n)) => {
                let n: serde_json::Value = serde_json::from_str(&n).unwrap();
                assert_eq!((n["method"].as_str(), &n["params"]["requestId"]), (Some("notifications/cancelled"), rid));
            }
            _ => panic!("the question was not cancelled"),
        };
        let shared = Arc::new(Shared::default());
        let rx = waiting(&shared, true);
        let t = Instant::now();
        assert!(ask(&shared, 5, FORM, Duration::from_millis(50)).is_err() && t.elapsed() < Duration::from_secs(5));
        assert!(shared.pending.lock().unwrap()[&5].asked.is_none(), "it can ask again");
        let (rid, _) = question(&rx);
        closed(&rx, &rid);
        // notifications/cancelled ends the wait at once, long before its time is up.
        let rx = waiting(&shared, true);
        let s2 = shared.clone();
        let asking = std::thread::spawn(move || { let t = Instant::now(); (ask(&s2, 5, FORM, Duration::from_secs(60)), t.elapsed()) });
        let (rid, _) = question(&rx);
        cancel(&shared, &serde_json::json!({ "jsonrpc": "2.0", "method": "notifications/cancelled", "params": { "requestId": 9 } }), Some("s"));
        let (got, took) = asking.join().unwrap();
        assert!(got.is_err() && took < Duration::from_secs(5), "{took:?}");
        closed(&rx, &rid);
        // So does the end of the call (the page answered, Stop): its Pending goes.
        let rx = waiting(&shared, true);
        let s2 = shared.clone();
        let asking = std::thread::spawn(move || ask(&s2, 5, FORM, Duration::from_secs(60)));
        let (rid, _) = question(&rx);
        shared.pending.lock().unwrap().remove(&5).unwrap().unask();
        assert!(asking.join().unwrap().is_err());
        closed(&rx, &rid);
        // An answer that came cancels nothing.
        let rx = waiting(&shared, true);
        let s2 = shared.clone();
        let asking = std::thread::spawn(move || ask(&s2, 5, FORM, Duration::from_secs(60)));
        let (rid, _) = question(&rx);
        answered(&shared, &reply_to(&rid, serde_json::json!({ "action": "decline" })), Some("s"));
        assert!(asking.join().unwrap().is_ok());
        shared.pending.lock().unwrap().remove(&5).unwrap().unask();
        assert!(rx.try_recv().is_err());
    }

    // The relay (Claude Desktop) carries the question out on standard output and the AI app's answer back to Octet.
    #[test]
    fn the_relay_carries_a_question_and_its_answer() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let dir = std::env::temp_dir().join(format!("octet-relay-ask-{port}"));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(INFO), format!(r#"{{"port":{port},"token":"k3y","program":""}}"#)).unwrap();
        let head = |s: &TcpStream| {
            let (mut r, mut head) = (std::io::BufReader::new(s.try_clone().unwrap()), String::new());
            while r.read_line(&mut head).unwrap() > 2 && !head.ends_with("\r\n\r\n") {}
            let n = header(&head.lines().map(String::from).collect::<Vec<_>>(), "content-length").and_then(|n| n.parse().ok()).unwrap_or(0);
            let mut body = vec![0; n];
            r.read_exact(&mut body).unwrap();
            String::from_utf8(body).unwrap()
        };
        let server = std::thread::spawn(move || {
            // The call: its stream opens with the question; the answer comes as a POST of its own; then the reply.
            let (mut call, _) = listener.accept().unwrap();
            head(&call);
            write!(call, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\r\nevent: message\ndata: {{\"jsonrpc\":\"2.0\",\"id\":\"octet-ask-1\",\"method\":\"elicitation/create\",\"params\":{{}}}}\n\n").unwrap();
            call.flush().unwrap();
            let (mut back, _) = listener.accept().unwrap();
            let answer = head(&back);
            write!(back, "HTTP/1.1 202 Accepted\r\nContent-Length: 0\r\n\r\n").unwrap();
            write!(call, "event: message\ndata: {{\"jsonrpc\":\"2.0\",\"id\":7,\"result\":{{}}}}\n\n").unwrap();
            answer
        });
        let out = Lines::default();
        let relay = Relay::new(Some(dir.clone()), Box::new(out.clone()));
        let r2 = relay.clone();
        let calling = std::thread::spawn(move || run(&r2, r#"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"draw"}}"#));
        let asked = (0..100).any(|_| { std::thread::sleep(Duration::from_millis(50)); !out.0.lock().unwrap().is_empty() });
        assert!(asked, "the question came out");
        assert_eq!(out.all()[0]["method"], "elicitation/create");
        run(&relay, r#"{"jsonrpc":"2.0","id":"octet-ask-1","result":{"action":"decline"}}"#);
        calling.join().unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&server.join().unwrap()).unwrap()["result"]["action"], "decline");
        assert_eq!(out.all()[1]["id"], 7);
        let _ = std::fs::remove_dir_all(dir);
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
