// Octet Drawing objects in other programs' documents (decision 0023), on every system. Each object window
// ("object-N") has a session: its document's name, the drawing the document has, the window's newest drawing not
// sent yet, and whether the document closed. The page's File > Update and Close and Return come here (ole_update,
// ole_close) and go to the object's document:
// - Windows: an OLE object in Word (ole_windows.rs, whose objects hold a session each).
// - A file: `octet --object <file> --app <program> --host <document>` opens the drawing in a PDF (Octet's or
//   ChemDraw's, with CDXML in it), an EMF (Octet's, with CDXML in a comment) or a CDXML file, and Update writes the
//   new picture to that file atomically, as the same kind of picture. LibreOffice's Octet extension starts Octet this
//   way on Linux and Windows (tools/libreoffice, decision 0025), and it opens an object window for tests on every
//   system. On the Mac the extension opens the file with `open -b` and writes the program's and document's names in
//   a file beside it (marked). The extension watches the file and puts each new picture in its document. Two empty
//   files beside it say what happened: Octet writes `closed` when the window closes, and the extension writes `gone`
//   when the document closes first. The file's folder is the extension's own (mode 0700): on Linux under
//   $XDG_RUNTIME_DIR/app/<Octet's id>/, which a Flatpak Octet can read and write with no file access of its own; on
//   Windows and the Mac in the user's temporary folder.
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Window};

use crate::ole::CANNOT_OPEN;

static NEXT: AtomicU64 = AtomicU64::new(1);

pub fn label(id: u64) -> String {
    format!("object-{id}")
}

pub fn id_of(label: &str) -> Option<u64> {
    label.strip_prefix("object-")?.parse().ok()
}

// One object's session. Cells, as Windows' objects use it on one thread only (the main thread, an STA); file objects
// keep theirs behind a lock (Files).
pub struct Session {
    pub id: u64,
    pub host: RefCell<String>, // the document's name, for the window's title and File menu
    pub app: RefCell<String>,  // the program that has the document (Word, PowerPoint), for Update in Word; or empty
    pub oct: RefCell<String>,  // the drawing the document has, as a .oct file; empty for a new object
    // The window's newest drawing and picture, not sent to the document yet. The page keeps it up to date while the
    // user draws, so Close and Quit send it at once and never wait for the page.
    pub latest: RefCell<Option<(String, Vec<u8>)>>,
    // The number of the newest message from the page that Octet took: an older one that arrives late is dropped.
    pub seq: Cell<u64>,
    // Word's Close is in progress (Windows): the page's messages wait for nothing and change nothing.
    #[cfg_attr(not(windows), allow(dead_code))]
    pub closing: Cell<bool>,
    pub gone: Cell<bool>, // the document closed (or its program went away) while the window was open
}

// What a message from the page does (ole_update).
#[derive(Debug, PartialEq, Eq)]
pub enum Taken {
    Old,                   // older than one already taken: dropped
    Kept,                  // a changed drawing, kept for Close and Quit
    Same(Vec<u8>),         // the drawing the document has: only its picture
    Send(String, Vec<u8>), // Update: the drawing and its picture go into the document now
}

impl Session {
    pub fn new(host: &str, oct: String) -> Self {
        Session {
            id: NEXT.fetch_add(1, Ordering::Relaxed),
            host: RefCell::new(host.into()),
            app: RefCell::default(),
            oct: RefCell::new(oct),
            latest: RefCell::new(None),
            seq: Cell::new(0),
            closing: Cell::new(false),
            gone: Cell::new(false),
        }
    }

    pub fn title(&self) -> String {
        crate::ole::title(&self.host.borrow(), self.gone.get())
    }

    // Each message makes its picture on a thread of its own, so they can come out of order: an older one is dropped.
    // send false: not for the document yet. The same drawing (sent when the window opens, with no .oct) is only its
    // picture; a changed one is kept for Close and Quit.
    pub fn message(&self, seq: Option<u64>, send: bool, oct: String, picture: Vec<u8>) -> Taken {
        if let Some(n) = seq {
            if n <= self.seq.get() {
                return Taken::Old;
            }
            self.seq.set(n);
        }
        if send {
            return Taken::Send(oct, picture);
        }
        if oct.is_empty() || *self.oct.borrow() == oct {
            self.latest.borrow_mut().take();
            Taken::Same(picture)
        } else {
            *self.latest.borrow_mut() = Some((oct, picture));
            Taken::Kept
        }
    }

    // The document took the drawing sent with message `seq`. A drawing the page kept after that message stays for
    // Close, unless it is the drawing just sent: the page's message to keep it can arrive while the document takes
    // the Update, and Close must not send the same drawing a second time.
    fn sent(&self, seq: Option<u64>, oct: String) {
        if seq.is_none_or(|n| n == self.seq.get()) || self.latest.borrow().as_ref().is_some_and(|(o, _)| *o == oct) {
            self.latest.take();
        }
        *self.oct.borrow_mut() = oct;
    }
}

// ---------------------------------------------------------------------------------------------------------------
// The page's commands: File > Update <document> and Close and Return to <document>.

const CLOSED: &str = "The document is closed. Save a copy to keep this drawing.";

// File > Update (⌘S or Ctrl+S): the drawing as a .oct file, and its picture as an SVG with its CDXML, which become
// the document's picture here, as Copy makes it. send false: nothing goes to the document. The window sends its
// picture once the drawing is open, and then its newest drawing after each change, for Close and Quit.
#[tauri::command]
pub async fn ole_update(app: AppHandle, window: Window, oct: String, svg: String, cdxml: String, send: Option<bool>, seq: Option<u64>) -> Result<(), String> {
    let id = id_of(window.label()).ok_or("This window holds no object.")?;
    if [oct.len(), svg.len(), cdxml.len()].iter().any(|n| *n as u64 > crate::ole::MAX_STREAM) {
        return Err("This drawing is larger than 64 MB. Octet cannot update the document with it.".into());
    }
    let kind = app.state::<Files>().0.lock().unwrap().get(&id).map(|f| f.kind);
    match kind {
        Some(kind) => {
            let picture = kind.picture(&svg, &cdxml)?;
            // The message is taken under the lock. The document changes after it, as Word can take a second.
            let sent = {
                let files = app.state::<Files>();
                let files = files.0.lock().unwrap();
                let f = files.get(&id).ok_or(CLOSED)?;
                match f.session.message(seq, send != Some(false), oct, picture) {
                    Taken::Send(oct, picture) => Some((f.to.clone(), f.session.host.borrow().clone(), oct, picture)),
                    _ => None,
                }
            };
            let Some((to, host, oct, picture)) = sent else { return Ok(()) };
            let name = match to {
                To::Path(path) => write(&path, &picture, &host).map(|_| None),
                #[cfg(target_os = "macos")]
                To::Word { mark, placed } => {
                    use crate::word::Fail;
                    match tauri::async_runtime::spawn_blocking(move || crate::word::put(&mark, placed, &picture)).await.unwrap_or(Err(Fail::Failed)) {
                        Ok(name) => Ok(Some(name)),
                        Err(f) => {
                            match f {
                                // A picture that is no longer in the document ends the session as a closed document does,
                                // so the window can close with the question about a copy.
                                Fail::Gone | Fail::Lost => gone(&app, id),
                                Fail::Denied => crate::word::tell(&app, &f, Some(&host)),
                                _ => {}
                            }
                            Err(crate::word::message(&f, Some(&host)))
                        }
                    }
                }
            }?;
            took(&app, id, oct, seq, name);
            Ok(())
        }
        #[cfg(windows)]
        None => crate::ole::win::update(app, id, oct, svg, cdxml, send, seq).await,
        #[cfg(not(windows))]
        None => Err(CLOSED.into()),
    }
}

// Close and Return to <document>: the document gets the window's newest drawing, then the window closes. The page
// sends its changes first (ole_update).
#[tauri::command]
pub async fn ole_close(app: AppHandle, window: Window) -> Result<(), String> {
    let id = id_of(window.label()).ok_or("This window holds no object.")?;
    closed(&app, id, true);
    // Word takes the shading off and gets the focus back.
    #[cfg(windows)]
    crate::ole::win::on_main(&app, move || crate::ole::win::closed(id)).await?;
    // The menu bar comes off first, as in close_window (windows.rs).
    #[cfg(not(target_os = "macos"))]
    let _ = window.remove_menu();
    window.destroy().map_err(|e| e.to_string())?;
    // An Octet that Windows started for Word ends when Word holds no object and no window of Octet's is open.
    #[cfg(windows)]
    {
        let a = app.clone();
        crate::ole::win::on_main(&app, move || crate::ole::win::maybe_exit(&a)).await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------------------------
// Objects in files, and pictures in Word on the Mac (word.rs)

#[derive(Default)]
pub struct Files(Mutex<HashMap<u64, File>>);

struct File {
    session: Session,
    kind: Kind,
    to: To,
}

// Where Update puts the picture.
#[derive(Clone)]
enum To {
    Path(PathBuf),
    // A picture in a Word document on the Mac: its hidden bookmark, and whether the picture is in the document (a new
    // drawing at Word's cursor is not, until its first Update).
    #[cfg(target_os = "macos")]
    Word { mark: String, placed: bool },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Kind {
    Pdf,   // a PDF with the drawing's CDXML in it, as Copy makes on the Mac (export::make_pdf)
    Emf,   // an EMF with the drawing's CDXML in a comment, as Copy makes on Windows (vector::make_emf)
    Cdxml, // the drawing's CDXML
    // A picture in Word on the Mac: the pictures Copy gives Word, Office's own copy and the PDF (word::picture)
    #[cfg(target_os = "macos")]
    Word,
}

impl Kind {
    fn of(path: &Path) -> Option<Kind> {
        match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
            "pdf" => Some(Kind::Pdf),
            "emf" => Some(Kind::Emf),
            "cdxml" => Some(Kind::Cdxml),
            _ => None,
        }
    }

    fn picture(self, svg: &str, cdxml: &str) -> Result<Vec<u8>, String> {
        match self {
            Kind::Pdf => crate::export::make_pdf(svg, Some(cdxml), None),
            Kind::Emf => crate::export::tree(svg).map(|t| crate::vector::make_emf(&t, Some(cdxml), None)),
            Kind::Cdxml => Ok(crate::export::cdxml_document(cdxml).into_bytes()),
            #[cfg(target_os = "macos")]
            Kind::Word => crate::word::picture(svg, cdxml),
        }
    }
}

impl File {
    // The drawing in `path`, read as hostile: 64 MB at most, a PDF's or EMF's CDXML through export's limits (an EMF's
    // comment can come after Office's PDF comment), and UTF-8. An empty file is a new drawing.
    fn open(path: PathBuf, host: &str, program: &str) -> Result<File, &'static str> {
        let kind = Kind::of(&path).ok_or(CANNOT_OPEN)?;
        let file = std::fs::File::open(&path).map_err(|_| CANNOT_OPEN)?;
        if file.metadata().map_err(|_| CANNOT_OPEN)?.len() > crate::MAX_BYTES {
            return Err(CANNOT_OPEN);
        }
        let mut bytes = Vec::new();
        file.take(crate::MAX_BYTES).read_to_end(&mut bytes).map_err(|_| CANNOT_OPEN)?;
        let oct = match kind {
            _ if bytes.is_empty() => String::new(),
            Kind::Pdf => crate::export::cdxml_from_pdf(&bytes).ok_or(CANNOT_OPEN)?,
            Kind::Emf if bytes.get(40..44) == Some(b" EMF") => crate::vector::cdxml_from_emf(&bytes).ok_or(CANNOT_OPEN)?,
            Kind::Emf => return Err(CANNOT_OPEN),
            Kind::Cdxml => String::from_utf8(bytes).map_err(|_| CANNOT_OPEN)?,
            // No file is one: Kind::of gives it for none.
            #[cfg(target_os = "macos")]
            Kind::Word => return Err(CANNOT_OPEN),
        };
        let session = Session::new(&crate::ole::host_name(host), oct);
        *session.app.borrow_mut() = crate::ole::program_name(program);
        Ok(File { session, kind, to: To::Path(path) })
    }
}

// Update of a file object: the new picture replaces the file in one step (a temporary file renamed over it). Windows
// refuses to replace a file while the extension reads it, so there Octet tries again, 20 times at most, 25 ms apart.
// Save is not changed (write_atomic).
fn write(path: &Path, picture: &[u8], host: &str) -> Result<(), String> {
    retry(if cfg!(windows) { 20 } else { 1 }, Duration::from_millis(25), || crate::write_atomic(path, picture)).map_err(|_| format!("Octet cannot update {host}. Try again."))
}

// `f` until it works or fails for a reason other than a file in use, `tries` times at most.
fn retry(tries: u32, gap: Duration, mut f: impl FnMut() -> std::io::Result<()>) -> std::io::Result<()> {
    let mut n = 1;
    loop {
        match f() {
            Err(e) if n < tries && in_use(&e) => {
                std::thread::sleep(gap);
                n += 1;
            }
            done => return done,
        }
    }
}

// ERROR_ACCESS_DENIED (PermissionDenied), ERROR_SHARING_VIOLATION (32) or ERROR_LOCK_VIOLATION (33): another program
// has the file open.
fn in_use(e: &std::io::Error) -> bool {
    e.kind() == std::io::ErrorKind::PermissionDenied || (cfg!(windows) && matches!(e.raw_os_error(), Some(32 | 33)))
}

// The document took the drawing sent with message `seq` (Session::sent). A Word picture is in its document now, and
// the document's name can be new (Save As in Word): the window's title and File menu say it.
fn took(app: &AppHandle, id: u64, oct: String, seq: Option<u64>, name: Option<String>) {
    let renamed = {
        let files = app.state::<Files>();
        let mut files = files.0.lock().unwrap();
        let Some(f) = files.get_mut(&id) else { return };
        f.session.sent(seq, oct);
        #[cfg(target_os = "macos")]
        if let To::Word { placed, .. } = &mut f.to {
            *placed = true;
        }
        let renamed = name.filter(|n| *n != *f.session.host.borrow());
        renamed.map(|n| {
            *f.session.host.borrow_mut() = n.clone();
            (n, f.session.title())
        })
    };
    if let Some((name, title)) = renamed {
        crate::windows::object_host(app, &label(id), &name);
        let program = app.state::<Files>().0.lock().unwrap().get(&id).map(|f| f.session.app.borrow().clone()).unwrap_or_default();
        let _ = app.emit_to(label(id), "ole-host", (name, title, program));
    }
}

// The document closed while the window was open: the title says so, and Update stops. Save Copy As still works.
fn gone(app: &AppHandle, id: u64) {
    let title = {
        let files = app.state::<Files>();
        let files = files.0.lock().unwrap();
        let Some(f) = files.get(&id) else { return };
        f.session.gone.set(true);
        f.session.title()
    };
    let _ = app.emit_to(label(id), "ole-gone", title);
}

// `octet --object <file> --app <program> --host <document>`: the file, the document's name ("Document" when none is
// given) and the program's (Writer, for Update in Writer; empty when none is given). Each flag takes the argument after
// it, so a document named "--app" is only a name.
pub fn object_arg(args: impl IntoIterator<Item = OsString>, cwd: &Path) -> Option<(PathBuf, String, String)> {
    let (mut file, mut host, mut program) = (None, None, None);
    let mut args = args.into_iter().skip(1);
    while let Some(flag) = args.next() {
        match flag.to_str() {
            Some("--object") => file = args.next(),
            Some("--host") => host = args.next(),
            Some("--app") => program = args.next(),
            _ => {}
        }
    }
    let text = |a: Option<OsString>| a.map(|a| a.to_string_lossy().into_owned()).unwrap_or_default();
    Some((cwd.join(file?), text(host), text(program)))
}

// The Mac. LibreOffice's extension opens a picture with `open -b <Octet's id> <folder>/drawing.pdf` (or .emf): an
// Apple Event, which reaches an Octet that runs, or starts one, and carries no arguments. So the extension writes
// `object` beside the picture first: the program's name (Writer), a line end, then the document's name. A file is an
// object only when all of this holds, so a drawing.pdf opened from Finder anywhere else stays an ordinary drawing:
// its name is drawing.pdf or drawing.emf; its folder is a real folder (no link), the user's own, that no one else can
// read or enter (0700); and `object` is a real file (no link), the user's own, 4 KB at most, in UTF-8. Gives the
// document's name and the program's.
#[cfg(unix)]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn marked(path: &Path) -> Option<(String, String)> {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    if !matches!(path.file_name()?.to_str()?, "drawing.pdf" | "drawing.emf") {
        return None;
    }
    let folder = path.parent()?;
    let me = uid();
    let dir = std::fs::symlink_metadata(folder).ok()?;
    if !dir.file_type().is_dir() || dir.uid() != me || dir.permissions().mode() & 0o077 != 0 {
        return None;
    }
    let marker = folder.join("object");
    let seen = std::fs::symlink_metadata(&marker).ok()?;
    if !seen.file_type().is_file() || seen.uid() != me || seen.len() > 4096 {
        return None;
    }
    // The file opened is the one looked at: not one put in its place since.
    let file = std::fs::File::open(&marker).ok()?;
    let now = file.metadata().ok()?;
    if (now.dev(), now.ino()) != (seen.dev(), seen.ino()) {
        return None;
    }
    let mut bytes = Vec::new();
    file.take(4097).read_to_end(&mut bytes).ok()?;
    if bytes.len() > 4096 {
        return None;
    }
    let text = String::from_utf8(bytes).ok()?;
    let (program, host) = text.split_once('\n')?;
    Some((host.to_string(), program.to_string()))
}

#[cfg(unix)]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn uid() -> u32 {
    unsafe extern "C" {
        safe fn getuid() -> u32;
    }
    getuid()
}

// Files opened from Finder or by `open` (RunEvent::Opened): each picture LibreOffice's extension marked opens as an
// object; the others are given back, for open::offer. A picture that started Octet can come before Octet's setup
// (AppKit sends it while it launches): it waits for `ready`, as an --object start waits on Linux and Windows. Both run
// on the main thread.
#[cfg(target_os = "macos")]
pub fn opened(app: &AppHandle, paths: impl Iterator<Item = PathBuf>) -> Vec<PathBuf> {
    paths
        .filter_map(|p| match marked(&p) {
            Some((host, program)) => {
                match EARLY.lock().unwrap().as_mut() {
                    Some(early) => early.push((p, host, program)),
                    None => open_file(app, p, host, program),
                }
                None
            }
            None => Some(p),
        })
        .collect()
}

// The objects asked for before setup; None once setup is done.
#[cfg(target_os = "macos")]
static EARLY: Mutex<Option<Vec<(PathBuf, String, String)>>> = Mutex::new(Some(Vec::new()));

// Setup is done (the menu bar is there): the objects that came first open now.
#[cfg(target_os = "macos")]
pub fn ready(app: &AppHandle) {
    let early = EARLY.lock().unwrap().take().unwrap_or_default();
    for (p, host, program) in early {
        open_file(app, p, host, program);
    }
}

// What the user hears when a file does not open. Nothing for a file that is gone: after an update Octet starts again
// with the arguments it had, and the extension removed that object's folder when its window closed.
fn refused(path: &Path, why: &'static str) -> Option<&'static str> {
    path.exists().then_some(why)
}

// The files whose windows are opening: a second request for one while it opens (ten fast double-clicks) opens no
// second window. Its window comes to the front when it opens.
static OPENING: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

// An object window for the drawing in a file. A file Octet cannot read opens nothing, and the user hears why. A file
// that is open already brings its window to the front, as a second double-click does in Word.
pub fn open_file(app: &AppHandle, path: PathBuf, host: String, program: String) {
    let open_already = app.state::<Files>().0.lock().unwrap().iter().find(|(_, f)| matches!(&f.to, To::Path(p) if *p == path)).map(|(id, _)| *id);
    if let Some(window) = open_already.and_then(|id| app.get_webview_window(&label(id))) {
        let _ = window.set_focus();
        return;
    }
    {
        let mut opening = OPENING.lock().unwrap();
        if opening.contains(&path) {
            return;
        }
        opening.push(path.clone());
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let opened = File::open(path.clone(), &host, &program);
        let done = || OPENING.lock().unwrap().retain(|p| *p != path);
        match opened {
            Ok(f) => {
                let id = f.session.id;
                open(&app, f).await;
                done();
                watch(app, id, path.with_file_name("gone"));
            }
            Err(e) => {
                done();
                mark(&path, "closed");
                if let Some(e) = refused(&path, e) {
                    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                    app.dialog().message(e).title(crate::ole::APP).kind(MessageDialogKind::Warning).show(|_| {});
                }
            }
        }
    });
}

// The document closed first: the extension wrote `gone`. Looked for four times a second while the window is open.
fn watch(app: AppHandle, id: u64, gone_file: PathBuf) {
    std::thread::spawn(move || {
        while app.state::<Files>().0.lock().unwrap().contains_key(&id) {
            if gone_file.exists() {
                return gone(&app, id);
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    });
}

// An empty file `name` beside the object's file. create_new: never through a link, and never over a file.
fn mark(path: &Path, name: &str) {
    let _ = std::fs::OpenOptions::new().write(true).create_new(true).open(path.with_file_name(name));
}

// Edit Picture from Word (word.rs): an object window for the picture, or for a new drawing at Word's cursor.
#[cfg(target_os = "macos")]
pub async fn open_word(app: &AppHandle, found: crate::word::Found) {
    let f = File { session: Session::new(&found.host, found.oct), kind: Kind::Word, to: To::Word { mark: found.mark, placed: found.placed } };
    *f.session.app.borrow_mut() = "Word".into();
    open(app, f).await;
}

// The bookmarks of the Word pictures open in object windows, and one's window in front: a double-click in Word
// (word.rs) on a picture that is open already. A new drawing not updated yet has no picture in the document.
#[cfg(target_os = "macos")]
pub fn word_marks(app: &AppHandle) -> Vec<String> {
    let files = app.state::<Files>();
    let files = files.0.lock().unwrap();
    files.values().filter_map(|f| if let To::Word { mark, placed: true } = &f.to { Some(mark.clone()) } else { None }).collect()
}

#[cfg(target_os = "macos")]
pub async fn front_word(app: &AppHandle, mark: &str) {
    let id = app.state::<Files>().0.lock().unwrap().iter().find(|(_, f)| matches!(&f.to, To::Word { mark: m, .. } if m == mark)).map(|(id, _)| *id);
    if let Some(id) = id {
        let _ = crate::windows::window_show(app.clone(), label(id)).await;
    }
}

async fn open(app: &AppHandle, f: File) {
    let (id, host) = (f.session.id, f.session.host.borrow().clone());
    let start = serde_json::json!({ "object": id, "oct": f.session.oct.borrow().as_str(), "host": host, "title": f.session.title(), "app": f.session.app.borrow().as_str() });
    app.state::<Files>().0.lock().unwrap().insert(id, f);
    if crate::windows::open_object(app.clone(), label(id), start, host).await.is_err() {
        app.state::<Files>().0.lock().unwrap().remove(&id);
    }
}

// An object window closed: its newest drawing, if the page kept one it did not send, goes to the document, as
// Windows' objects send theirs to Word with no question (decision 0023). back: Close and Return, which brings Word to
// the front on the Mac.
pub fn closed(app: &AppHandle, id: u64, back: bool) {
    close(&app.state::<Files>(), id, back);
}

// Octet ends (RunEvent::Exit) with object windows open. Quit destroys no window, so `closed` did not run for them.
// Each object in a file closes here as its window does: the file has its newest drawing, and the extension hears
// `closed`. A Word picture on the Mac stays as it is: Word can take a second, and Octet ends now.
pub fn shutdown(files: &Files) {
    let in_file = |to: &To| match to {
        To::Path(_) => true,
        #[cfg(target_os = "macos")]
        To::Word { .. } => false,
    };
    let ids: Vec<u64> = files.0.lock().unwrap().iter().filter(|(_, f)| in_file(&f.to)).map(|(id, _)| *id).collect();
    for id in ids {
        close(files, id, false);
    }
}

// The close step of object `id`, for `closed` and `shutdown`.
#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
fn close(files: &Files, id: u64, back: bool) {
    let Some(f) = files.0.lock().unwrap().remove(&id) else { return };
    let latest = f.session.latest.take().filter(|_| !f.session.gone.get());
    match f.to {
        To::Path(path) => {
            if let Some((_, picture)) = latest {
                let _ = write(&path, &picture, "");
            }
            mark(&path, "closed");
        }
        // Word can take a second: a thread of its own, never the main thread.
        #[cfg(target_os = "macos")]
        To::Word { mark, placed } => {
            std::thread::spawn(move || {
                if let Some((_, picture)) = latest {
                    let _ = crate::word::put(&mark, placed, &picture);
                }
                if back {
                    crate::word::back();
                }
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels() {
        assert_eq!(label(7), "object-7");
        assert_eq!(id_of("object-7"), Some(7));
        assert_eq!(id_of("draw-7"), None);
        assert_eq!(id_of("object-x"), None);
    }

    // The page's messages: in order only, the same drawing as its picture, a changed one kept, Update sent.
    #[test]
    fn the_session_takes_the_pages_messages() {
        let s = Session::new("Report.docx", "A".into());
        let t = Session::new("x", String::new());
        assert!(t.id > s.id, "every object has a number of its own");
        assert_eq!(s.title(), "Octet Drawing in Report.docx");
        assert_eq!(s.message(Some(1), false, String::new(), b"p1".to_vec()), Taken::Same(b"p1".to_vec()), "the picture when the window opens");
        assert_eq!(s.message(Some(3), false, "B".into(), b"p3".to_vec()), Taken::Kept);
        assert_eq!(*s.latest.borrow(), Some(("B".into(), b"p3".to_vec())));
        assert_eq!(s.message(Some(2), false, "C".into(), b"p2".to_vec()), Taken::Old, "an older message that came late");
        assert_eq!(s.message(Some(3), true, "C".into(), b"p2".to_vec()), Taken::Old, "the same number again");
        assert_eq!(*s.latest.borrow(), Some(("B".into(), b"p3".to_vec())));
        assert_eq!(s.message(Some(4), false, "A".into(), b"p4".to_vec()), Taken::Same(b"p4".to_vec()), "back as it was");
        assert_eq!(*s.latest.borrow(), None);
        assert_eq!(s.message(Some(5), true, "D".into(), b"p5".to_vec()), Taken::Send("D".into(), b"p5".to_vec()));
        assert_eq!(s.message(None, false, "E".into(), b"p6".to_vec()), Taken::Kept, "a message with no number");
        s.gone.set(true);
        assert_eq!(s.title(), "Octet Drawing (Report.docx is closed)");
    }

    // The page's message to keep a drawing arrives while the document takes an Update of that drawing: nothing stays
    // for Close, which would send it a second time. A newer drawing kept in that time stays.
    #[test]
    fn a_drawing_just_sent_is_not_kept_for_close() {
        let s = Session::new("Report.docx", "A".into());
        assert_eq!(s.message(Some(1), true, "B".into(), b"p1".to_vec()), Taken::Send("B".into(), b"p1".to_vec()));
        assert_eq!(s.message(Some(2), false, "B".into(), b"p2".to_vec()), Taken::Kept);
        s.sent(Some(1), "B".into());
        assert_eq!(*s.latest.borrow(), None, "the same drawing");
        assert_eq!(*s.oct.borrow(), "B");
        assert_eq!(s.message(Some(3), true, "C".into(), b"p3".to_vec()), Taken::Send("C".into(), b"p3".to_vec()));
        assert_eq!(s.message(Some(4), false, "D".into(), b"p4".to_vec()), Taken::Kept);
        s.sent(Some(3), "C".into());
        assert_eq!(*s.latest.borrow(), Some(("D".into(), b"p4".to_vec())), "a newer drawing");
    }

    // Quit with an object window open: the file gets the drawing the page kept, and `closed` beside it. A Word
    // picture on the Mac is left as it is.
    #[test]
    fn quit_closes_the_objects_in_files() {
        let dir = std::env::temp_dir().join(format!("octet-quit-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("drawing.cdxml");
        std::fs::write(&path, "<CDXML/>").unwrap();
        let f = File::open(path.clone(), "Report.odt", "Writer").unwrap();
        let id = f.session.id;
        assert_eq!(f.session.message(Some(1), false, "<CDXML><page/></CDXML>".into(), b"new".to_vec()), Taken::Kept);
        let files = Files::default();
        files.0.lock().unwrap().insert(id, f);
        #[cfg(target_os = "macos")]
        files.0.lock().unwrap().insert(0, File { session: Session::new("Report.docx", String::new()), kind: Kind::Word, to: To::Word { mark: "m".into(), placed: true } });
        shutdown(&files);
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        assert!(dir.join("closed").exists());
        assert_eq!(files.0.lock().unwrap().keys().copied().collect::<Vec<_>>(), if cfg!(target_os = "macos") { vec![0] } else { vec![] });
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_object_argument() {
        let args = |a: &[&str]| a.iter().map(OsString::from).collect::<Vec<_>>();
        let cwd = Path::new("/tmp/x");
        let o = |file: &str, host: &str, program: &str| Some((cwd.join(file), host.to_string(), program.to_string()));
        assert_eq!(object_arg(args(&["octet", "--object", "a.pdf", "--host", "Report.odt"]), cwd), o("a.pdf", "Report.odt", ""));
        assert_eq!(object_arg(args(&["octet", "--host", "R", "--object", "/a/b.cdxml"]), cwd), o("/a/b.cdxml", "R", ""));
        assert_eq!(object_arg(args(&["octet", "--object", "a.pdf"]), cwd), o("a.pdf", "", ""));
        assert_eq!(object_arg(args(&["octet", "--object", "a.pdf", "--app", "Writer", "--host", "Report.odt"]), cwd), o("a.pdf", "Report.odt", "Writer"));
        assert_eq!(object_arg(args(&["octet", "--object", "a.pdf", "--host", "--app", "--app", "Impress"]), cwd), o("a.pdf", "--app", "Impress"), "a document named --app");
        assert_eq!(object_arg(args(&["octet", "--object", "a.pdf", "--app"]), cwd), o("a.pdf", "", ""));
        assert_eq!(object_arg(args(&["octet", "--object"]), cwd), None);
        assert_eq!(object_arg(args(&["octet", "a.pdf"]), cwd), None);
        assert_eq!(object_arg(args(&["--object"]), cwd), None, "the program's own path is not an argument");
    }

    // The empty files beside a file object (`closed`, and the extension's `gone`): made new, never through a link and
    // never over a file.
    #[test]
    fn marks_are_new_files() {
        let dir = std::env::temp_dir().join(format!("octet-marks-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("drawing.pdf");
        mark(&path, "closed");
        assert_eq!(std::fs::read(dir.join("closed")).unwrap(), b"");
        std::fs::write(dir.join("gone"), "kept").unwrap();
        mark(&path, "gone");
        assert_eq!(std::fs::read_to_string(dir.join("gone")).unwrap(), "kept");
        #[cfg(unix)]
        {
            std::fs::write(dir.join("target"), "kept").unwrap();
            std::os::unix::fs::symlink(dir.join("target"), dir.join("link")).unwrap();
            mark(&path, "link");
            assert_eq!(std::fs::read_to_string(dir.join("target")).unwrap(), "kept");
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }

    // A PDF with CDXML opens as its drawing; Update writes the new picture over it, and Close the newest one kept.
    #[test]
    fn a_file_object_round_trips() {
        let dir = std::env::temp_dir().join(format!("octet-objects-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="72pt" height="36pt" viewBox="0 0 72 36"><path d="M1 1H71V2H1Z"/></svg>"#;
        let pdf = dir.join("a.pdf");
        std::fs::write(&pdf, crate::export::make_pdf(svg, Some("<CDXML><page/></CDXML>"), None).unwrap()).unwrap();
        let f = File::open(pdf.clone(), "Report\u{7}.odt", " Writer\u{7}").unwrap();
        assert!(f.session.oct.borrow().ends_with("<CDXML><page/></CDXML>"), "the PDF's CDXML");
        assert_eq!(*f.session.host.borrow(), "Report.odt", "no control characters");
        assert_eq!(*f.session.app.borrow(), "Writer", "Update in Writer");
        let picture = Kind::Pdf.picture(svg, "<CDXML><page><n/></page></CDXML>").unwrap();
        write(&pdf, &picture, "R").unwrap();
        assert_eq!(std::fs::read(&pdf).unwrap(), picture);
        assert!(crate::export::cdxml_from_pdf(&std::fs::read(&pdf).unwrap()).unwrap().ends_with("<CDXML><page><n/></page></CDXML>"));
        let leftovers = std::fs::read_dir(&dir).unwrap().filter(|e| e.as_ref().unwrap().file_name() != "a.pdf").count();
        assert_eq!(leftovers, 0, "no temporary file stays");
        // A CDXML file, an empty file (a new drawing), and files Octet refuses.
        let cdxml = dir.join("b.CDXML");
        std::fs::write(&cdxml, "<CDXML/>").unwrap();
        let f = File::open(cdxml, "", "").unwrap();
        assert_eq!((f.session.host.borrow().as_str(), f.session.app.borrow().as_str()), ("Document", ""), "no program: Update Document");
        let empty = dir.join("c.pdf");
        std::fs::write(&empty, "").unwrap();
        assert_eq!(*File::open(empty, "R", "").unwrap().session.oct.borrow(), "");
        let plain = dir.join("d.pdf");
        std::fs::write(&plain, crate::export::make_pdf(svg, None, None).unwrap()).unwrap();
        assert_eq!(File::open(plain, "R", "").err(), Some(CANNOT_OPEN), "a PDF with no drawing in it");
        let text = dir.join("e.cdxml");
        std::fs::write(&text, [0xff, 0xfe, 0]).unwrap();
        assert_eq!(File::open(text, "R", "").err(), Some(CANNOT_OPEN), "not UTF-8");
        let big = dir.join("f.cdxml");
        std::fs::File::create(&big).unwrap().set_len(crate::MAX_BYTES + 1).unwrap();
        assert_eq!(File::open(big, "R", "").err(), Some(CANNOT_OPEN), "larger than 64 MB");
        assert_eq!(File::open(dir.join("g.png"), "R", "").err(), Some(CANNOT_OPEN), "not a PDF or CDXML file");
        assert_eq!(File::open(dir.join("missing.pdf"), "R", "").err(), Some(CANNOT_OPEN));
        // The user hears why a file does not open, but nothing for a file that is gone.
        assert_eq!(refused(&dir.join("d.pdf"), CANNOT_OPEN), Some(CANNOT_OPEN));
        assert_eq!(refused(&dir.join("missing.pdf"), CANNOT_OPEN), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    // An EMF object (Windows' Copy, and Update in LibreOffice on Windows): it opens as its drawing, Update writes an EMF
    // as Copy makes it, and the drawing reads back. Office's Mac EMF (a PDF comment first) opens too. An empty file is
    // a new drawing, and Update with nothing drawn still holds a drawing. Hostile EMFs open nothing.
    #[test]
    fn an_emf_object_round_trips() {
        let dir = std::env::temp_dir().join(format!("octet-emf-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="72pt" height="36pt" viewBox="0 0 72 36"><path d="M1 1H71V2H1Z"/></svg>"#;
        let path = dir.join("drawing.emf");
        std::fs::write(&path, Kind::Emf.picture(svg, "<CDXML><page/></CDXML>").unwrap()).unwrap();
        let f = File::open(path.clone(), "Report.odt", "Writer").unwrap();
        assert_eq!(f.kind, Kind::Emf);
        assert_eq!(*f.session.oct.borrow(), "<CDXML><page/></CDXML>");
        let picture = Kind::Emf.picture(svg, "<CDXML><page><n/></page></CDXML>").unwrap();
        assert_eq!(picture, crate::vector::make_emf(&crate::export::tree(svg).unwrap(), Some("<CDXML><page><n/></page></CDXML>"), None), "as Copy on Windows makes it");
        write(&path, &picture, "R").unwrap();
        assert_eq!(crate::export::cdxml_from_picture(&std::fs::read(&path).unwrap()).as_deref(), Some("<CDXML><page><n/></page></CDXML>"));
        let leftovers = std::fs::read_dir(&dir).unwrap().filter(|e| e.as_ref().unwrap().file_name() != "drawing.emf").count();
        assert_eq!(leftovers, 0, "no temporary file stays");
        // Update with nothing drawn: the blank page's picture, which still holds the (empty) drawing.
        let blank = r#"<svg xmlns="http://www.w3.org/2000/svg" width="72pt" height="72pt" viewBox="0 0 72 72"></svg>"#;
        write(&path, &Kind::Emf.picture(blank, "<CDXML><page/></CDXML>").unwrap(), "R").unwrap();
        assert_eq!(*File::open(path.clone(), "R", "").unwrap().session.oct.borrow(), "<CDXML><page/></CDXML>");
        // Office's EMF on the Mac: the PDF in a comment, then Octet's.
        let office = dir.join("office.emf");
        let tree = crate::export::tree(svg).unwrap();
        std::fs::write(&office, crate::vector::make_emf(&tree, Some("<CDXML><o/></CDXML>"), Some(&crate::export::make_pdf(svg, None, None).unwrap()))).unwrap();
        assert_eq!(*File::open(office, "R", "").unwrap().session.oct.borrow(), "<CDXML><o/></CDXML>");
        let empty = dir.join("e.emf");
        std::fs::write(&empty, "").unwrap();
        assert_eq!(*File::open(empty, "R", "").unwrap().session.oct.borrow(), "");
        // No comment (ChemDraw's), a PDF named .emf, a comment with no CDXML or not UTF-8, records that run past the end.
        let plain = crate::vector::make_emf(&tree, None, None);
        let tagged = |data: &[u8]| {
            let mut e = plain.clone();
            let n = data.len().next_multiple_of(4);
            let record = [&70u32.to_le_bytes()[..], &((12 + n) as u32).to_le_bytes(), &(data.len() as u32).to_le_bytes(), data, &vec![0; n - data.len()]].concat();
            let at = u32::from_le_bytes(e[4..8].try_into().unwrap()) as usize;
            e.splice(at..at, record);
            e
        };
        let mut past = tagged(b"Octet CDXML\0<CDXML/>");
        let at = u32::from_le_bytes(past[4..8].try_into().unwrap()) as usize;
        past[at + 4..at + 8].copy_from_slice(&(u32::MAX - 3).to_le_bytes());
        for (name, bytes) in [("none", plain.clone()), ("pdf", crate::export::make_pdf(svg, Some("<CDXML/>"), None).unwrap()), ("text", tagged(b"Octet CDXML\0hello")), ("utf", tagged(b"Octet CDXML\0<CDXML>\xff</CDXML>")), ("past", past), ("short", plain[..20].to_vec())] {
            let p = dir.join(format!("{name}.emf"));
            std::fs::write(&p, bytes).unwrap();
            assert_eq!(File::open(p, "R", "").err(), Some(CANNOT_OPEN), "{name}");
        }
        assert_eq!(*File::open({ let p = dir.join("good.emf"); std::fs::write(&p, tagged(b"Octet CDXML\0<CDXML/>")).unwrap(); p }, "R", "").unwrap().session.oct.borrow(), "<CDXML/>");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    // Update on Windows meets the extension reading the file: a refused rename is tried again, 20 times at most. Other
    // failures are not.
    #[test]
    fn update_retries_a_busy_rename() {
        let busy = || std::io::Error::from(std::io::ErrorKind::PermissionDenied);
        let calls = Cell::new(0);
        let twice = || {
            calls.set(calls.get() + 1);
            if calls.get() <= 2 { Err(busy()) } else { Ok(()) }
        };
        assert!(retry(20, Duration::ZERO, twice).is_ok());
        assert_eq!(calls.get(), 3);
        calls.set(0);
        assert!(retry(20, Duration::ZERO, || { calls.set(calls.get() + 1); Err(busy()) }).is_err());
        assert_eq!(calls.get(), 20, "20 tries at most");
        calls.set(0);
        assert!(retry(20, Duration::ZERO, || { calls.set(calls.get() + 1); Err(std::io::ErrorKind::NotFound.into()) }).is_err());
        assert_eq!(calls.get(), 1, "the folder is gone: no second try");
        calls.set(0);
        assert!(retry(1, Duration::ZERO, || { calls.set(calls.get() + 1); Err(busy()) }).is_err());
        assert_eq!(calls.get(), 1, "the Mac and Linux try once");
        let start = std::time::Instant::now();
        assert!(retry(3, Duration::from_millis(25), || Err(busy())).is_err());
        assert!(start.elapsed() >= Duration::from_millis(50), "25 ms apart");
    }

    // The Mac's hand-off: a drawing.pdf or drawing.emf in the extension's own folder, with `object` beside it, is an
    // object. Any other file is an ordinary drawing. (A folder or file of another owner needs root to make.)
    #[cfg(unix)]
    #[test]
    fn marked_paths() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let base = std::env::temp_dir().join(format!("octet-marked-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        let folder = |name: &str, object: Option<&[u8]>| {
            let d = base.join(name);
            std::fs::create_dir(&d).unwrap();
            std::fs::set_permissions(&d, std::fs::Permissions::from_mode(0o700)).unwrap();
            std::fs::write(d.join("drawing.pdf"), "").unwrap();
            std::fs::write(d.join("drawing.emf"), "").unwrap();
            if let Some(o) = object {
                std::fs::write(d.join("object"), o).unwrap();
            }
            d
        };
        let good = folder("good", Some("Writer\nReport \u{202e}fdp.odt\nmore".as_bytes()));
        assert_eq!(marked(&good.join("drawing.pdf")), Some(("Report \u{202e}fdp.odt\nmore".into(), "Writer".into())));
        assert_eq!(marked(&good.join("drawing.emf")), Some(("Report \u{202e}fdp.odt\nmore".into(), "Writer".into())));
        assert_eq!(marked(&good.join("other.pdf")), None, "another name");
        assert_eq!(marked(&good.join("object")), None);
        let no_program = folder("none", Some(b"\n"));
        assert_eq!(marked(&no_program.join("drawing.pdf")), Some((String::new(), String::new())), "no names: Octet says Document");
        symlink(&good, base.join("link")).unwrap();
        assert_eq!(marked(&base.join("link").join("drawing.pdf")), None, "the folder a link");
        let open = folder("open", Some(b"Writer\nR"));
        std::fs::set_permissions(&open, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(marked(&open.join("drawing.pdf")), None, "a folder others can read");
        let missing = folder("missing", None);
        assert_eq!(marked(&missing.join("drawing.pdf")), None, "no object");
        let linked = folder("linked", None);
        symlink(good.join("object"), linked.join("object")).unwrap();
        assert_eq!(marked(&linked.join("drawing.pdf")), None, "object a link");
        assert_eq!(marked(&folder("empty", Some(b"")).join("drawing.pdf")), None, "object empty");
        assert_eq!(marked(&folder("big", Some(&[b"W\n".as_slice(), &[b'x'; 4095]].concat())).join("drawing.pdf")), None, "over 4 KB");
        assert!(marked(&folder("full", Some(&[b"W\n".as_slice(), &[b'x'; 4094]].concat())).join("drawing.pdf")).is_some(), "4 KB");
        assert_eq!(marked(&folder("bytes", Some(b"Writer\n\xff\xfe")).join("drawing.pdf")), None, "not UTF-8");
        let dir_object = folder("dir", None);
        std::fs::create_dir(dir_object.join("object")).unwrap();
        assert_eq!(marked(&dir_object.join("drawing.pdf")), None, "object a folder");
        std::fs::remove_dir_all(&base).unwrap();
    }
}
