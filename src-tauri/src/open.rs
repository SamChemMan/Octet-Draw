// Files Octet is asked to open (REL-14, CH-6): from Finder, Explorer or the Dock (a double-click, Open With, a file
// dropped on the app's icon), as arguments on the command line, from a second launch on Windows and Linux (which gives
// its files to the Octet that runs, and ends), or dropped on the window. The system names them, never the page: the
// page takes them with take_opened, which reads only these paths, with Open's checks.
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{recent, Picked, MAX_BYTES};

const MOST: usize = 20; // files kept waiting at one time
const DRAWINGS: [&str; 3] = ["oct", "cdxml", "octet"];

// The files waiting for the page, each with the point in the window (CSS pixels) where it was dropped, if it was.
#[derive(Default)]
pub struct Waiting(Mutex<Vec<(PathBuf, Option<(f64, f64)>)>>);

// Files to open, or (with `at`) files dropped on the window. For files to open, the window comes to the front.
pub fn offer(app: &AppHandle, paths: impl IntoIterator<Item = PathBuf>, at: Option<(f64, f64)>) {
    let paths: Vec<PathBuf> = paths.into_iter().filter(|p| p.is_file()).take(MOST).collect();
    if paths.is_empty() {
        return;
    }
    {
        let waiting = app.state::<Waiting>();
        let mut list = waiting.0.lock().unwrap();
        list.extend(paths.into_iter().map(|p| (p, at)));
        let over = list.len().saturating_sub(MOST);
        list.drain(..over);
    }
    if at.is_none() {
        for window in app.webview_windows().values() {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
    let _ = app.emit("opened", ());
}

// The files a launch names: its arguments after the program's own path, read from `cwd`. Options ("-psn_…") are not files.
pub fn from_args(args: impl IntoIterator<Item = OsString>, cwd: &Path) -> Vec<PathBuf> {
    args.into_iter().skip(1).filter(|a| !a.to_string_lossy().starts_with('-')).map(|a| cwd.join(a)).collect()
}

#[derive(Serialize)]
pub struct OpenedFile {
    name: String,         // the file's name
    path: Option<String>, // set for a drawing Octet can save over (.oct, .cdxml, .octet) that opens
    text: Option<String>,
    error: Option<String>,
    at: Option<(f64, f64)>, // where it was dropped
}

// The files waiting, read as text. insert: the page puts dropped files into the drawing that is open; otherwise they
// open. A drawing that opens can be saved over, as one picked in Open can, and goes on Home's list of recent drawings.
#[tauri::command]
pub async fn take_opened(app: AppHandle, picked: State<'_, Picked>, insert: bool) -> Result<Vec<OpenedFile>, String> {
    let list = std::mem::take(&mut *app.state::<Waiting>().0.lock().unwrap());
    Ok(list
        .into_iter()
        .map(|(path, at)| {
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let read = read(&path, &name);
            let drawing = path.extension().and_then(|e| e.to_str()).is_some_and(|e| DRAWINGS.contains(&e.to_ascii_lowercase().as_str()));
            let kept = read.is_ok() && drawing && (at.is_none() || !insert);
            if kept {
                picked.0.lock().unwrap().insert(path.clone());
                recent::note(&app, &path);
            }
            let (text, error) = match read {
                Ok(t) => (Some(t), None),
                Err(e) => (None, Some(e)),
            };
            OpenedFile { name, path: kept.then(|| path.to_string_lossy().into_owned()), text, error, at }
        })
        .collect())
}

// A file's text, with Open's limits: 64 MB at most, and text (UTF-8) only.
fn read(path: &Path, name: &str) -> Result<String, String> {
    match fs::metadata(path) {
        Err(_) => Err("This file is not where it was. It was moved or deleted.".into()),
        Ok(m) if m.len() > MAX_BYTES => Err("This file is larger than 64 MB. Octet cannot open it.".into()),
        Ok(_) => fs::read_to_string(path).map_err(|_| format!("Octet cannot open {name}. It opens Octet and ChemDraw drawings (CDXML), MOL, SDF and SMILES files.")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_arguments_are_files() {
        let cwd = Path::new("/Users/me/Desktop");
        let args = ["/Applications/Octet.app/Contents/MacOS/octet", "-psn_0_12345", "aspirin.oct", "/tmp/b.cdxml"].map(OsString::from);
        assert_eq!(from_args(args, cwd), [PathBuf::from("/Users/me/Desktop/aspirin.oct"), PathBuf::from("/tmp/b.cdxml")]);
        assert!(from_args([OsString::from("octet")], cwd).is_empty());
    }

    #[test]
    fn files_are_read_with_opens_limits() {
        let dir = std::env::temp_dir().join(format!("octet-open-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let (text, png, big) = (dir.join("a.mol"), dir.join("b.png"), dir.join("c.cdxml"));
        fs::write(&text, "CCO\n").unwrap();
        fs::write(&png, [0x89, b'P', b'N', b'G', 0xff, 0xfe]).unwrap();
        fs::File::create(&big).unwrap().set_len(MAX_BYTES + 1).unwrap();
        assert_eq!(read(&text, "a.mol").as_deref(), Ok("CCO\n"));
        assert!(read(&png, "b.png").unwrap_err().starts_with("Octet cannot open b.png."));
        assert!(read(&big, "c.cdxml").unwrap_err().contains("64 MB"));
        assert!(read(&dir.join("gone.oct"), "gone.oct").unwrap_err().contains("moved or deleted"));
        fs::remove_dir_all(&dir).unwrap();
    }
}
