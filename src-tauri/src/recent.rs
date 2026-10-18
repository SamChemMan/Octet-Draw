// Recent drawings, for Home and File > Open Recent: each drawing opened or saved, newest first (24 at most), kept in
// the app's data folder with a small picture of it. A recent drawing opens again without the file dialog; only files
// the user picked before are on the list, and the page never names any other path.
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{write_atomic, Picked, MAX_BYTES};

const MOST: usize = 24;
const IN_MENU: usize = 10; // drawings in File > Open Recent
const MAX_THUMB: usize = 400_000; // characters of SVG for one picture
const MAX_LIST: u64 = 16 * 1024 * 1024; // bytes of the list file read back

#[derive(Serialize, Deserialize, Clone)]
pub struct Recent {
    pub path: String,
    pub name: String,
    pub at: u64, // seconds since 1970
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumb: Option<String>,
}

#[derive(Default)]
pub struct Recents(pub Mutex<Option<Vec<Recent>>>);

fn store_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("recent.json"))
}

// The list, read once from the data folder. A damaged or oversized file gives an empty list.
fn with_list<T>(app: &AppHandle, f: impl FnOnce(&mut Vec<Recent>) -> T) -> T {
    let state = app.state::<Recents>();
    let mut guard = state.0.lock().unwrap();
    let list = guard.get_or_insert_with(|| {
        store_path(app)
            .filter(|p| fs::metadata(p).map(|m| m.len() <= MAX_LIST).unwrap_or(false))
            .and_then(|p| fs::read_to_string(p).ok())
            .and_then(|t| serde_json::from_str::<Vec<Recent>>(&t).ok())
            .map(|l| l.into_iter().filter(|r| r.path.len() < 4096 && r.name.len() < 512 && r.thumb.as_ref().is_none_or(|t| t.len() <= MAX_THUMB)).take(MOST).collect())
            .unwrap_or_default()
    });
    f(list)
}

fn save_list(app: &AppHandle, list: &[Recent]) {
    let Some(path) = store_path(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string(list) {
        let _ = write_atomic(&path, text.as_bytes());
    }
}

// The menu's names for the drawings in File > Open Recent: each file's name, in the list's order.
pub fn titles(app: &AppHandle) -> Vec<String> {
    with_list(app, |list| list.iter().take(IN_MENU).map(|r| Path::new(&r.path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| r.name.clone())).collect())
}

// File > Open Recent is built again when the drawings in it change (on the main thread, where menus are made).
fn menu_changed(app: &AppHandle, before: &[String]) {
    if titles(app) != before {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let _ = crate::rebuild(&handle);
        });
    }
}

// A drawing was opened or saved: it goes to the top of the list, keeping its picture.
pub fn note(app: &AppHandle, path: &Path) {
    let key = path.to_string_lossy().into_owned();
    let name = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| key.clone());
    let at = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let before = titles(app);
    let list = with_list(app, |list| {
        let thumb = list.iter().find(|r| r.path == key).and_then(|r| r.thumb.clone());
        list.retain(|r| r.path != key);
        list.insert(0, Recent { path: key, name, at, thumb });
        list.truncate(MOST);
        list.clone()
    });
    save_list(app, &list);
    menu_changed(app, &before);
}

// File > Open Recent > Clear Menu: the list is emptied (Home shows the same list).
pub fn clear(app: &AppHandle) {
    let before = titles(app);
    with_list(app, |list| list.clear());
    save_list(app, &[]);
    menu_changed(app, &before);
}

#[derive(Serialize)]
pub struct RecentView {
    path: String,
    name: String,
    at: u64,
    thumb: Option<String>,
    found: bool, // the file is still where it was
}

#[tauri::command]
pub fn recent_list(app: AppHandle) -> Vec<RecentView> {
    with_list(&app, |list| list.clone())
        .into_iter()
        .map(|r| RecentView { found: Path::new(&r.path).is_file(), path: r.path, name: r.name, at: r.at, thumb: r.thumb })
        .collect()
}

// The drawing's picture, from the page, for a drawing already on the list.
#[tauri::command]
pub fn recent_thumb(app: AppHandle, path: String, svg: String) -> Result<(), String> {
    if svg.len() > MAX_THUMB || !svg.trim_start().starts_with("<svg") {
        return Ok(()); // too large, or not a picture: the tile shows the drawing's name only
    }
    let list = with_list(&app, |list| {
        let found = list.iter_mut().find(|r| r.path == path).map(|r| r.thumb = Some(svg)).is_some();
        found.then(|| list.clone())
    });
    if let Some(list) = list {
        save_list(&app, &list);
    }
    Ok(())
}

#[tauri::command]
pub fn recent_remove(app: AppHandle, path: String) {
    let before = titles(&app);
    let list = with_list(&app, |list| {
        list.retain(|r| r.path != path);
        list.clone()
    });
    save_list(&app, &list);
    menu_changed(&app, &before);
}

// Opens a drawing from the list (only a path on the list), as Open does after its dialog.
#[tauri::command]
pub async fn open_recent(app: AppHandle, picked: State<'_, Picked>, path: String) -> Result<(String, String), String> {
    if !with_list(&app, |list| list.iter().any(|r| r.path == path)) {
        return Err("Octet cannot open this drawing from Home. Open it with File > Open.".into());
    }
    let p = PathBuf::from(&path);
    let size = fs::metadata(&p).map_err(|_| "This drawing is not where it was. It was moved or deleted.".to_string())?.len();
    if size > MAX_BYTES {
        return Err("This file is larger than 64 MB. Octet cannot open it.".into());
    }
    let text = crate::read_text_or_cdx(&p).map_err(|e| e.to_string())?;
    picked.0.lock().unwrap().insert(p.clone());
    note(&app, &p);
    Ok((path, text))
}
