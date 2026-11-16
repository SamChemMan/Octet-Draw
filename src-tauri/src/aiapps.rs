// Octet adds itself to the AI apps on this computer (decision 0021): by itself the first time it opens with AI apps on,
// which it then says in a notice that leads to Settings > AI tools, and with each app's switch there, which also takes
// it out again. Each app gets one entry, ENTRY, that starts Octet's relay (octet --mcp), so the app sees Octet's tools
// whether or not Octet is open.
// Octet changes only its own entry. It adds it when the app has none, puts it right when it points at a program that
// is gone, and removes it only while it is still Octet's (the same program). An entry with that name that the user
// made for another program stays as it is. A file Octet cannot read as JSON (VS Code allows comments) stays as it is.
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

// The beta app has an entry of its own, so it and the released Octet can both be connected.
pub const ENTRY: &str = if option_env!("OCTET_BETA").is_some() { "octet-draw-beta" } else { "octet-draw" };

#[derive(Clone, Copy, PartialEq, Debug)]
enum App {
    Claude,
    ClaudeCode,
    Cursor,
    VsCode,
    Windsurf,
}
const APPS: [App; 5] = [App::Claude, App::ClaudeCode, App::Cursor, App::VsCode, App::Windsurf];

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Found {
    id: &'static str,
    name: &'static str,
    // connected: the app has Octet's entry. waiting: Claude is open, and Octet adds its entry when Claude quits.
    // off: the app has no entry. taken: the app has an entry with Octet's name for another program. unreadable: Octet
    // cannot read the app's file.
    state: &'static str,
}

struct Places {
    home: PathBuf,
    // Windows' roaming folder (APPDATA) and Linux's config folder.
    roaming: Option<PathBuf>,
    config: Option<PathBuf>,
}
impl Places {
    fn here() -> Option<Places> {
        let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from).filter(|p| p.is_absolute())?;
        let roaming = std::env::var_os("APPDATA").map(PathBuf::from).filter(|p| cfg!(windows) && p.is_absolute());
        let config = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).filter(|p| p.is_absolute()).or_else(|| Some(home.join(".config")));
        Some(Places { home, roaming, config })
    }
    // Where each app keeps its own folder of settings (macOS, Windows, Linux).
    fn app_support(&self, name: &str) -> Option<PathBuf> {
        if cfg!(target_os = "macos") {
            Some(self.home.join("Library/Application Support").join(name))
        } else if cfg!(windows) {
            self.roaming.as_ref().map(|r| r.join(name))
        } else {
            self.config.as_ref().map(|c| c.join(name))
        }
    }
}

impl App {
    fn id(self) -> &'static str {
        match self {
            App::Claude => "claude",
            App::ClaudeCode => "claude-code",
            App::Cursor => "cursor",
            App::VsCode => "vscode",
            App::Windsurf => "windsurf",
        }
    }
    fn name(self) -> &'static str {
        match self {
            App::Claude => "Claude",
            App::ClaudeCode => "Claude Code",
            App::Cursor => "Cursor",
            App::VsCode => "VS Code",
            App::Windsurf => "Windsurf",
        }
    }
    // The file with the app's MCP servers. Claude has no Linux app.
    fn file(self, p: &Places) -> Option<PathBuf> {
        match self {
            App::Claude if cfg!(target_os = "linux") => None,
            App::Claude => p.app_support("Claude").map(|d| d.join("claude_desktop_config.json")),
            App::ClaudeCode => Some(p.home.join(".claude.json")),
            App::Cursor => Some(p.home.join(".cursor/mcp.json")),
            App::VsCode => p.app_support("Code").map(|d| d.join("User/mcp.json")),
            App::Windsurf => Some(p.home.join(".codeium/windsurf/mcp_config.json")),
        }
    }
    // The app is on this computer: it has made its folder of settings.
    fn installed(self, p: &Places) -> bool {
        let Some(file) = self.file(p) else { return false };
        match self {
            App::ClaudeCode => file.exists() || p.home.join(".claude").is_dir(),
            App::Cursor => p.home.join(".cursor").is_dir(),
            _ => file.parent().is_some_and(Path::is_dir),
        }
    }
    fn key(self) -> &'static str {
        if self == App::VsCode { "servers" } else { "mcpServers" }
    }
    fn entry(self, program: &str, args: &[String]) -> Value {
        let args: Vec<&str> = args.iter().map(String::as_str).chain(["--mcp"]).collect();
        if self == App::VsCode { json!({ "type": "stdio", "command": program, "args": args }) } else { json!({ "command": program, "args": args }) }
    }
}

#[derive(PartialEq, Debug)]
enum Has {
    Ours,
    None,
    // An entry with Octet's name for a program that is still there.
    Other,
    Unreadable,
}
fn read(file: &Path) -> Result<Value, ()> {
    match std::fs::read(file) {
        Ok(b) if b.iter().all(u8::is_ascii_whitespace) => Ok(json!({})),
        Ok(b) => serde_json::from_slice::<Value>(&b).ok().filter(Value::is_object).ok_or(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
        Err(_) => Err(()),
    }
}
fn has(app: App, file: &Path, program: &str) -> Has {
    let Ok(v) = read(file) else { return Has::Unreadable };
    match v.get(app.key()).and_then(|s| s.get(ENTRY)).and_then(|e| e.get("command")).and_then(Value::as_str) {
        None => Has::None,
        Some(c) if c == program => Has::Ours,
        // A program that is gone (an Octet that was moved or removed) is Octet's to put right; "flatpak" is a command.
        Some(c) if Path::new(c).is_absolute() && !Path::new(c).exists() => Has::None,
        Some(_) => Has::Other,
    }
}
// Writes the file whole, so the app never reads half of it: a new file beside it, then a rename over it.
fn write(file: &Path, v: &Value) -> Result<(), String> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = file.with_extension("octet-tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(v).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, file).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}
fn add(app: App, file: &Path, program: &str, args: &[String]) -> Result<(), String> {
    let mut v = read(file).map_err(|_| "unreadable".to_string())?;
    let servers = v.as_object_mut().unwrap().entry(app.key()).or_insert_with(|| json!({}));
    let Some(servers) = servers.as_object_mut() else { return Err("unreadable".into()) };
    servers.insert(ENTRY.into(), app.entry(program, args));
    write(file, &v)
}
fn remove(app: App, file: &Path, program: &str) -> Result<(), String> {
    if has(app, file, program) != Has::Ours {
        return Ok(());
    }
    let mut v = read(file).map_err(|_| "unreadable".to_string())?;
    if let Some(servers) = v.get_mut(app.key()).and_then(Value::as_object_mut) {
        servers.remove(ENTRY);
    }
    write(file, &v)
}

// Claude writes its settings file again from what it read when it opened, so an entry added while it is open is lost,
// and one added just after it opened too. While Octet is open and the user wants Claude connected, a thread keeps
// Claude's entry there: it reads the file every few seconds, and when the entry is gone it waits for Claude to quit
// (asking twice a second) and adds it at once, before Claude can open again.
fn claude_open() -> bool {
    #[cfg(target_os = "macos")]
    return std::process::Command::new("pgrep").args(["-x", "Claude"]).output().is_ok_and(|o| o.status.success());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        return std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq claude.exe", "/NH"])
            .creation_flags(0x0800_0000) // no console window
            .output()
            .is_ok_and(|o| String::from_utf8_lossy(&o.stdout).to_ascii_lowercase().contains("claude.exe"));
    }
    #[allow(unreachable_code)]
    false
}
// WAITING: Claude's entry is gone and Claude is open. WATCHING: the thread runs. WANT_CLAUDE: the user wants Claude
// connected (its switch off clears it, and the thread ends).
static WAITING: AtomicBool = AtomicBool::new(false);
static WATCHING: AtomicBool = AtomicBool::new(false);
static WANT_CLAUDE: AtomicBool = AtomicBool::new(false);
fn keep_claude(file: PathBuf, program: String, args: Vec<String>) {
    WANT_CLAUDE.store(true, Ordering::SeqCst);
    if WATCHING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        while WANT_CLAUDE.load(Ordering::SeqCst) {
            let gone = has(App::Claude, &file, &program) == Has::None;
            let open = gone && claude_open();
            WAITING.store(open, Ordering::SeqCst);
            if gone && !open {
                let _ = add(App::Claude, &file, &program, &args);
            }
            std::thread::sleep(Duration::from_millis(if open { 500 } else { 5000 }));
        }
        WAITING.store(false, Ordering::SeqCst);
        WATCHING.store(false, Ordering::SeqCst);
    });
}

// Only the released app and the beta connect themselves: a dev build's relay cannot start it (mcp.rs launch).
fn allowed() -> bool {
    !cfg!(debug_assertions) || option_env!("OCTET_BETA").is_some()
}
fn state(app: App, p: &Places, program: &str) -> Option<Found> {
    if !app.installed(p) {
        return None;
    }
    let file = app.file(p)?;
    let state = match has(app, &file, program) {
        _ if app == App::Claude && WAITING.load(Ordering::SeqCst) && WANT_CLAUDE.load(Ordering::SeqCst) => "waiting",
        Has::Ours => "connected",
        Has::None => "off",
        Has::Other => "taken",
        Has::Unreadable => "unreadable",
    };
    Some(Found { id: app.id(), name: app.name(), state })
}
fn list(p: &Places, program: &str) -> Vec<Found> {
    APPS.iter().filter_map(|&a| state(a, p, program)).collect()
}

// The AI apps on this computer and whether each has Octet.
#[tauri::command]
pub async fn ai_apps() -> Vec<Found> {
    tauri::async_runtime::spawn_blocking(|| {
        let (Some(p), true) = (Places::here(), allowed()) else { return Vec::new() };
        list(&p, &crate::mcp::own_program().0)
    })
    .await
    .unwrap_or_default()
}

// Adds Octet to each app in ids that does not have it yet.
#[tauri::command]
pub async fn ai_connect(ids: Vec<String>) -> Vec<Found> {
    tauri::async_runtime::spawn_blocking(move || {
        let (Some(p), true) = (Places::here(), allowed()) else { return Vec::new() };
        let (program, args) = crate::mcp::own_program();
        for app in APPS.into_iter().filter(|a| ids.iter().any(|i| i == a.id()) && a.installed(&p)) {
            let Some(file) = app.file(&p) else { continue };
            match has(app, &file, &program) {
                Has::Ours | Has::None if app == App::Claude => keep_claude(file, program.clone(), args.clone()),
                Has::None => {
                    let _ = add(app, &file, &program, &args);
                }
                _ => {}
            }
        }
        // The thread's first look sets WAITING; list says it.
        std::thread::sleep(Duration::from_millis(100));
        list(&p, &program)
    })
    .await
    .unwrap_or_default()
}

// Takes Octet's entry out of the app again.
#[tauri::command]
pub async fn ai_disconnect(id: String) -> Vec<Found> {
    tauri::async_runtime::spawn_blocking(move || {
        let (Some(p), true) = (Places::here(), allowed()) else { return Vec::new() };
        let program = crate::mcp::own_program().0;
        if let Some(app) = APPS.into_iter().find(|a| a.id() == id) {
            if app == App::Claude {
                WANT_CLAUDE.store(false, Ordering::SeqCst);
            }
            if let Some(file) = app.file(&p) {
                let _ = remove(app, &file, &program);
            }
        }
        list(&p, &program)
    })
    .await
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn places(name: &str) -> (PathBuf, Places) {
        let dir = std::env::temp_dir().join(format!("octet-aiapps-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = Places { home: dir.clone(), roaming: Some(dir.join("roaming")), config: Some(dir.join(".config")) };
        (dir, p)
    }

    // Octet adds its own entry, keeps the user's other servers and settings in their order, and takes only its own out.
    #[test]
    fn adds_and_removes_only_its_own_entry() {
        let (dir, p) = places("own");
        std::fs::create_dir_all(dir.join(".cursor")).unwrap();
        let file = App::Cursor.file(&p).unwrap();
        std::fs::write(&file, r#"{"zeta":1,"mcpServers":{"mine":{"command":"/bin/echo"}},"alpha":2}"#).unwrap();
        assert_eq!(list(&p, "/x/octet"), vec![Found { id: "cursor", name: "Cursor", state: "off" }]);
        add(App::Cursor, &file, "/x/octet", &[]).unwrap();
        let v = read(&file).unwrap();
        assert_eq!(v["mcpServers"][ENTRY], json!({ "command": "/x/octet", "args": ["--mcp"] }));
        assert_eq!(v["mcpServers"]["mine"], json!({ "command": "/bin/echo" }));
        assert_eq!(v.as_object().unwrap().keys().collect::<Vec<_>>(), ["zeta", "mcpServers", "alpha"]);
        assert_eq!(has(App::Cursor, &file, "/x/octet"), Has::Ours);
        // Another Octet's program does not take it out.
        remove(App::Cursor, &file, "/y/octet").unwrap();
        assert_eq!(has(App::Cursor, &file, "/x/octet"), Has::Ours);
        remove(App::Cursor, &file, "/x/octet").unwrap();
        let v = read(&file).unwrap();
        assert!(v["mcpServers"].get(ENTRY).is_none() && v["mcpServers"].get("mine").is_some());
        let _ = std::fs::remove_dir_all(dir);
    }

    // An entry with Octet's name for a program that is there is the user's; one for a program that is gone is not.
    #[test]
    fn leaves_the_users_entry_and_unreadable_files() {
        let (dir, p) = places("user");
        let file = App::ClaudeCode.file(&p).unwrap();
        std::fs::write(&file, format!(r#"{{"mcpServers":{{"{ENTRY}":{{"command":"/bin/echo"}}}}}}"#)).unwrap();
        assert_eq!(has(App::ClaudeCode, &file, "/x/octet"), Has::Other);
        std::fs::write(&file, format!(r#"{{"mcpServers":{{"{ENTRY}":{{"command":"/gone/octet"}}}}}}"#)).unwrap();
        assert_eq!(has(App::ClaudeCode, &file, "/x/octet"), Has::None);
        std::fs::write(&file, "{ // a comment\n}").unwrap();
        assert_eq!(has(App::ClaudeCode, &file, "/x/octet"), Has::Unreadable);
        assert!(add(App::ClaudeCode, &file, "/x/octet", &[]).is_err());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "{ // a comment\n}");
        let _ = std::fs::remove_dir_all(dir);
    }

    // VS Code's file takes servers with a type; a Flatpak's command is flatpak with its arguments.
    #[test]
    fn vs_code_and_flatpak_entries() {
        assert_eq!(App::VsCode.entry("octet", &[]), json!({ "type": "stdio", "command": "octet", "args": ["--mcp"] }));
        let args = vec!["run".to_string(), "--command=octet".into(), "io.x".into()];
        assert_eq!(App::Windsurf.entry("flatpak", &args), json!({ "command": "flatpak", "args": ["run", "--command=octet", "io.x", "--mcp"] }));
        let (dir, p) = places("none");
        assert!(list(&p, "/x/octet").is_empty()); // no app's folder: none listed
        let _ = std::fs::remove_dir_all(dir);
    }
}
