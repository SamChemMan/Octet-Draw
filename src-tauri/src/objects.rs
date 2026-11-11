// Octet Drawing objects in other programs' documents (decision 0023), on every system. Each object window
// ("object-N") has a session: its document's name, the drawing the document has, the window's newest drawing not
// sent yet, and whether the document closed. The page's File > Update and Close and Return come here (ole_update,
// ole_close) and go to the object's document:
// - Windows: an OLE object in Word (ole_windows.rs, whose objects hold a session each).
// - A file: `octet --object <file> --host <document>` opens the drawing in a PDF (Octet's or ChemDraw's, with CDXML
//   in it) or a CDXML file, and Update writes the new picture to that file atomically. LibreOffice's Octet extension
//   on Linux starts Octet this way (tools/libreoffice), and it opens an object window for tests on every system. The
//   extension watches the file and puts each new picture in its document. Two empty files beside it say what
//   happened: Octet writes `closed` when the window closes, and the extension writes `gone` when the document closes
//   first. The file's folder is the extension's own (mode 0700): $XDG_RUNTIME_DIR/app/<Octet's id>/, which a Flatpak
//   Octet can read and write with no file access of its own.
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
                                Fail::Gone => gone(&app, id),
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
    Cdxml, // the drawing's CDXML
}

impl Kind {
    fn of(path: &Path) -> Option<Kind> {
        match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
            "pdf" => Some(Kind::Pdf),
            "cdxml" => Some(Kind::Cdxml),
            _ => None,
        }
    }

    fn picture(self, svg: &str, cdxml: &str) -> Result<Vec<u8>, String> {
        match self {
            Kind::Pdf => crate::export::make_pdf(svg, Some(cdxml), None),
            Kind::Cdxml => Ok(crate::export::cdxml_document(cdxml).into_bytes()),
        }
    }
}

impl File {
    // The drawing in `path`, read as hostile: 64 MB at most, a PDF's CDXML through export's limits, and UTF-8. An
    // empty file is a new drawing.
    fn open(path: PathBuf, host: &str) -> Result<File, &'static str> {
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
            Kind::Cdxml => String::from_utf8(bytes).map_err(|_| CANNOT_OPEN)?,
        };
        Ok(File { session: Session::new(&crate::ole::host_name(host), oct), kind, to: To::Path(path) })
    }
}

// Update of a file object: the new picture replaces the file in one step (a temporary file renamed over it).
fn write(path: &Path, picture: &[u8], host: &str) -> Result<(), String> {
    crate::write_atomic(path, picture).map_err(|_| format!("Octet cannot update {host}. Try again."))
}

// The document took the drawing sent with message `seq`. A drawing the page kept after it stays for Close. A Word
// picture is in its document now, and the document's name can be new (Save As in Word): the window's title and File
// menu say it.
fn took(app: &AppHandle, id: u64, oct: String, seq: Option<u64>, name: Option<String>) {
    let renamed = {
        let files = app.state::<Files>();
        let mut files = files.0.lock().unwrap();
        let Some(f) = files.get_mut(&id) else { return };
        if seq.is_none_or(|n| n == f.session.seq.get()) {
            f.session.latest.take();
        }
        *f.session.oct.borrow_mut() = oct;
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
        let _ = app.emit_to(label(id), "ole-host", (name, title));
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

// `octet --object <file> --host <document>`: the file and the document's name ("Document" when none is given).
pub fn object_arg(args: impl IntoIterator<Item = OsString>, cwd: &Path) -> Option<(PathBuf, String)> {
    let args: Vec<OsString> = args.into_iter().skip(1).collect();
    let after = |flag: &str| args.iter().position(|a| a == flag).and_then(|k| args.get(k + 1));
    let host = after("--host").map(|h| h.to_string_lossy().into_owned()).unwrap_or_default();
    Some((cwd.join(after("--object")?), host))
}

// An object window for the drawing in a file. A file Octet cannot read opens nothing, and the user hears why. A file
// that is open already brings its window to the front, as a second double-click does in Word.
pub fn open_file(app: &AppHandle, path: PathBuf, host: String) {
    let open_already = app.state::<Files>().0.lock().unwrap().iter().find(|(_, f)| matches!(&f.to, To::Path(p) if *p == path)).map(|(id, _)| *id);
    if let Some(window) = open_already.and_then(|id| app.get_webview_window(&label(id))) {
        let _ = window.set_focus();
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match File::open(path.clone(), &host) {
            Ok(f) => {
                let id = f.session.id;
                open(&app, f).await;
                watch(app, id, path.with_file_name("gone"));
            }
            Err(e) => {
                mark(&path, "closed");
                use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                app.dialog().message(e).title(crate::ole::APP).kind(MessageDialogKind::Warning).show(|_| {});
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
    let f = File { session: Session::new(&found.host, found.oct), kind: Kind::Pdf, to: To::Word { mark: found.mark, placed: found.placed } };
    open(app, f).await;
}

async fn open(app: &AppHandle, f: File) {
    let (id, host) = (f.session.id, f.session.host.borrow().clone());
    let start = serde_json::json!({ "object": id, "oct": f.session.oct.borrow().as_str(), "host": host, "title": f.session.title() });
    app.state::<Files>().0.lock().unwrap().insert(id, f);
    if crate::windows::open_object(app.clone(), label(id), start, host).await.is_err() {
        app.state::<Files>().0.lock().unwrap().remove(&id);
    }
}

// An object window closed: its newest drawing, if the page kept one it did not send, goes to the document, as
// Windows' objects send theirs to Word with no question (decision 0023). back: Close and Return, which brings Word to
// the front on the Mac.
#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
pub fn closed(app: &AppHandle, id: u64, back: bool) {
    let Some(f) = app.state::<Files>().0.lock().unwrap().remove(&id) else { return };
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

    #[test]
    fn the_object_argument() {
        let args = |a: &[&str]| a.iter().map(OsString::from).collect::<Vec<_>>();
        let cwd = Path::new("/tmp/x");
        assert_eq!(object_arg(args(&["octet", "--object", "a.pdf", "--host", "Report.odt"]), cwd), Some((cwd.join("a.pdf"), "Report.odt".into())));
        assert_eq!(object_arg(args(&["octet", "--host", "R", "--object", "/a/b.cdxml"]), cwd), Some((PathBuf::from("/a/b.cdxml"), "R".into())));
        assert_eq!(object_arg(args(&["octet", "--object", "a.pdf"]), cwd), Some((cwd.join("a.pdf"), String::new())));
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
        let f = File::open(pdf.clone(), "Report\u{7}.odt").unwrap();
        assert!(f.session.oct.borrow().ends_with("<CDXML><page/></CDXML>"), "the PDF's CDXML");
        assert_eq!(*f.session.host.borrow(), "Report.odt", "no control characters");
        let picture = Kind::Pdf.picture(svg, "<CDXML><page><n/></page></CDXML>").unwrap();
        write(&pdf, &picture, "R").unwrap();
        assert_eq!(std::fs::read(&pdf).unwrap(), picture);
        assert!(crate::export::cdxml_from_pdf(&std::fs::read(&pdf).unwrap()).unwrap().ends_with("<CDXML><page><n/></page></CDXML>"));
        let leftovers = std::fs::read_dir(&dir).unwrap().filter(|e| e.as_ref().unwrap().file_name() != "a.pdf").count();
        assert_eq!(leftovers, 0, "no temporary file stays");
        // A CDXML file, an empty file (a new drawing), and files Octet refuses.
        let cdxml = dir.join("b.CDXML");
        std::fs::write(&cdxml, "<CDXML/>").unwrap();
        assert_eq!(*File::open(cdxml, "").unwrap().session.host.borrow(), "Document");
        let empty = dir.join("c.pdf");
        std::fs::write(&empty, "").unwrap();
        assert_eq!(*File::open(empty, "R").unwrap().session.oct.borrow(), "");
        let plain = dir.join("d.pdf");
        std::fs::write(&plain, crate::export::make_pdf(svg, None, None).unwrap()).unwrap();
        assert_eq!(File::open(plain, "R").err(), Some(CANNOT_OPEN), "a PDF with no drawing in it");
        let text = dir.join("e.cdxml");
        std::fs::write(&text, [0xff, 0xfe, 0]).unwrap();
        assert_eq!(File::open(text, "R").err(), Some(CANNOT_OPEN), "not UTF-8");
        let big = dir.join("f.cdxml");
        std::fs::File::create(&big).unwrap().set_len(crate::MAX_BYTES + 1).unwrap();
        assert_eq!(File::open(big, "R").err(), Some(CANNOT_OPEN), "larger than 64 MB");
        assert_eq!(File::open(dir.join("g.png"), "R").err(), Some(CANNOT_OPEN), "not a PDF or CDXML file");
        assert_eq!(File::open(dir.join("missing.pdf"), "R").err(), Some(CANNOT_OPEN));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
