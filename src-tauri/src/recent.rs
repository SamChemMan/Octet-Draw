// Recent drawings, for Home and File > Open Recent: each drawing opened or saved, newest first (24 at most), kept in
// the app's data folder with a small picture of it. A recent drawing opens again without the file dialog; only files
// the user picked before are on the list, and the page never names any other path.
use std::collections::{BTreeMap, HashSet};
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
    // The drawing's Title and Author (Settings > Document > Properties) when it was last opened or saved (issue 100).
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "lenient")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "lenient")]
    pub author: Option<String>,
}

const MAX_ABOUT: usize = 200; // characters in a title or author (experiment.ts MAX_VALUE)

// A title or author as the list keeps it: one line of 1 to MAX_ABOUT characters, else none. A C1 character
// (U+0080 to U+009F) is allowed, as experiment.ts oneLine keeps it.
fn about(v: Option<String>) -> Option<String> {
    v.map(|t| t.trim().to_string()).filter(|t| !t.is_empty() && t.chars().count() <= MAX_ABOUT && !t.chars().any(|c| matches!(c, '\0'..='\x1f' | '\x7f')))
}

// A title or author from recent.json: one that is not text or fails the check is dropped, and the drawing stays.
fn lenient<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Ok(about(serde_json::Value::deserialize(d)?.as_str().map(str::to_string)))
}

#[derive(Default)]
pub struct Recents(pub Mutex<Option<Vec<Recent>>>);

fn store_path(app: &AppHandle, file: &str) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(file))
}

// A list (the recent drawings, or the Experiments list), read once from the data folder with parse. A damaged or
// oversized file gives an empty list.
fn with_store<E, T>(app: &AppHandle, held: &Mutex<Option<Vec<E>>>, file: &str, parse: fn(&str) -> Vec<E>, f: impl FnOnce(&mut Vec<E>) -> T) -> T {
    let mut guard = held.lock().unwrap();
    let list = guard.get_or_insert_with(|| {
        store_path(app, file)
            .filter(|p| fs::metadata(p).map(|m| m.len() <= MAX_LIST).unwrap_or(false))
            .and_then(|p| fs::read_to_string(p).ok())
            .map(|t| parse(&t))
            .unwrap_or_default()
    });
    f(list)
}

// Called inside with_store, so each write goes out while the list is locked and an older list never replaces a newer
// one on disk (issue 2).
fn save_store<E: Serialize>(app: &AppHandle, file: &str, list: &[E]) {
    let Some(path) = store_path(app, file) else { return };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string(list) {
        let _ = write_atomic(&path, text.as_bytes());
    }
}

fn with_list<T>(app: &AppHandle, f: impl FnOnce(&mut Vec<Recent>) -> T) -> T {
    let parse = |t: &str| serde_json::from_str::<Vec<Recent>>(t).map(|l| l.into_iter().filter(|r| r.path.len() < 4096 && r.name.len() < 512 && r.thumb.as_ref().is_none_or(|t| t.len() <= MAX_THUMB)).take(MOST).collect()).unwrap_or_default();
    with_store(app, &app.state::<Recents>().0, "recent.json", parse, f)
}
fn save_list(app: &AppHandle, list: &[Recent]) {
    save_store(app, "recent.json", list)
}

// The drawings on the list, by path (a project can take any of them: home.rs).
pub fn paths(app: &AppHandle) -> HashSet<String> {
    with_list(app, |list| list.iter().map(|r| r.path.clone()).collect())
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
    with_list(app, |list| {
        let (thumb, title, author) = list.iter().find(|r| r.path == key).map(|r| (r.thumb.clone(), r.title.clone(), r.author.clone())).unwrap_or_default();
        list.retain(|r| r.path != key);
        list.insert(0, Recent { path: key, name, at, thumb, title, author });
        list.truncate(MOST);
        save_list(app, list);
    });
    menu_changed(app, &before);
}

// File > Open Recent > Clear Menu: the list is emptied (Home shows the same list).
pub fn clear(app: &AppHandle) {
    let before = titles(app);
    with_list(app, |list| {
        list.clear();
        save_list(app, list);
    });
    menu_changed(app, &before);
}

#[derive(Serialize)]
pub struct RecentView {
    path: String,
    name: String,
    at: u64,
    thumb: Option<String>,
    title: Option<String>,
    author: Option<String>,
    found: bool, // the file is still where it was
}

// Async, so a stat of a drive that has stopped answering does not hold up the app.
#[tauri::command]
pub async fn recent_list(app: AppHandle) -> Vec<RecentView> {
    with_list(&app, |list| list.clone())
        .into_iter()
        .map(|r| RecentView { found: Path::new(&r.path).is_file(), path: r.path, name: r.name, at: r.at, thumb: r.thumb, title: r.title, author: r.author })
        .collect()
}

// The drawing's picture, title and author, from the page, for a drawing already on the list. A picture too large, or
// not a picture, leaves the one kept (the tile shows the drawing's name only); a title or author that fails the
// check is none.
#[tauri::command]
pub fn recent_thumb(app: AppHandle, path: String, svg: Option<String>, title: Option<String>, author: Option<String>) -> Result<(), String> {
    let svg = svg.filter(|s| s.len() <= MAX_THUMB && s.trim_start().starts_with("<svg"));
    let (title, author) = (about(title), about(author));
    with_list(&app, |list| {
        let Some(r) = list.iter_mut().find(|r| r.path == path) else { return };
        if svg.is_none() && r.title == title && r.author == author {
            return;
        }
        r.thumb = svg.or(r.thumb.take());
        (r.title, r.author) = (title, author);
        save_list(&app, list);
    });
    Ok(())
}

#[tauri::command]
pub fn recent_remove(app: AppHandle, path: String) {
    let before = titles(&app);
    with_list(&app, |list| {
        list.retain(|r| r.path != path);
        save_list(&app, list);
    });
    menu_changed(&app, &before);
}

// Opens a drawing from the list, from a project or from the Experiments list on Home (only a path on one of them), as
// Open does after its dialog.
#[tauri::command]
pub async fn open_recent(app: AppHandle, picked: State<'_, Picked>, path: String) -> Result<(String, String), String> {
    if !with_list(&app, |list| list.iter().any(|r| r.path == path)) && !crate::home::has(&app, &path) && !with_experiments(&app, |list| list.iter().any(|e| e.path == path)) {
        return Err("Octet cannot open this drawing from Home. Open it with File > Open.".into());
    }
    let p = PathBuf::from(&path);
    let size = fs::metadata(&p).map_err(|_| "This drawing is not where it was. It was moved or deleted.".to_string())?.len();
    if size > MAX_BYTES {
        return Err("This file is larger than 64 MB. Octet cannot open it.".into());
    }
    crate::stamp(&app, &p);
    let text = crate::read_text_or_cdx(&p).map_err(|e| e.to_string())?;
    picked.0.lock().unwrap().insert(p.clone());
    note(&app, &p);
    Ok((path, text))
}

// Home's Experiments list (discussion #15): each drawing with experiment details (src/experiment.ts), newest first, as
// it was last opened or saved. It is kept in experiments.json, longer than the recent list and with no picture (Home
// takes the recent list's). The page can only add a drawing on the recent list, and each record is checked when it
// comes from the page and when it is read back, as a file could carry anything.
const MOST_EXPERIMENTS: usize = 1000;
const DETAILS: [&str; 10] = ["title", "number", "date", "notebook", "project", "author", "temperature", "time", "pressure", "solvent"]; // experiment.ts FIELDS
const MAX_VALUE: usize = 200; // characters in a detail (experiment.ts MAX_VALUE)

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Experiment {
    details: BTreeMap<String, String>,
    #[serde(default, rename = "yield", skip_serializing_if = "Option::is_none")]
    yld: Option<f64>, // the first product's yield, a fraction
}

impl Experiment {
    // Known details only, each one line of 1 to MAX_VALUE characters, and a yield from 0 to 10000%.
    fn ok(&self) -> bool {
        !self.details.is_empty()
            && self.details.iter().all(|(k, v)| DETAILS.contains(&k.as_str()) && !v.trim().is_empty() && v.chars().count() <= MAX_VALUE && !v.chars().any(|c| c.is_ascii_control()))
            && self.yld.is_none_or(|y| y.is_finite() && (0.0..=100.0).contains(&y))
    }
}

#[derive(Serialize, Deserialize, Clone)]
struct Entry {
    path: String,
    name: String,
    at: u64,
    experiment: Experiment,
}

#[derive(Default)]
pub struct Experiments(Mutex<Option<Vec<Entry>>>);

// The records that pass the checks, MOST_EXPERIMENTS at most, from the file's text. A damaged file gives none.
fn read_experiments(text: &str) -> Vec<Entry> {
    serde_json::from_str::<Vec<Entry>>(text).map(|l| l.into_iter().filter(|e| e.path.len() < 4096 && e.name.len() < 512 && e.experiment.ok()).take(MOST_EXPERIMENTS).collect()).unwrap_or_default()
}

fn with_experiments<T>(app: &AppHandle, f: impl FnOnce(&mut Vec<Entry>) -> T) -> T {
    with_store(app, &app.state::<Experiments>().0, "experiments.json", read_experiments, f)
}
fn save_experiments(app: &AppHandle, list: &[Entry]) {
    save_store(app, "experiments.json", list)
}

// The list with a drawing's record put first (experiment) or taken out (None, or details that fail the checks).
fn put_experiment(list: &mut Vec<Entry>, path: &str, name: String, at: u64, experiment: Option<Experiment>) {
    list.retain(|e| e.path != path);
    if let Some(experiment) = experiment.filter(Experiment::ok) {
        list.insert(0, Entry { path: path.to_string(), name, at, experiment });
        list.truncate(MOST_EXPERIMENTS);
    }
}

// A drawing on the recent list was opened or saved: its experiment details and yield, or None when it has none.
#[tauri::command]
pub fn experiment_note(app: AppHandle, path: String, experiment: Option<Experiment>) {
    let Some(name) = with_list(&app, |list| list.iter().find(|r| r.path == path).map(|r| r.name.clone())) else { return };
    let at = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    with_experiments(&app, |list| {
        if experiment.is_none() && !list.iter().any(|e| e.path == path) {
            return; // nothing to take out
        }
        put_experiment(list, &path, name, at, experiment);
        save_experiments(&app, list);
    });
}

#[derive(Serialize)]
pub struct ExperimentView {
    path: String,
    name: String,
    at: u64,
    found: bool,
    details: BTreeMap<String, String>,
    #[serde(rename = "yield", skip_serializing_if = "Option::is_none")]
    yld: Option<f64>,
}

#[tauri::command]
pub async fn experiment_list(app: AppHandle) -> Vec<ExperimentView> {
    with_experiments(&app, |list| list.clone())
        .into_iter()
        .map(|e| ExperimentView { found: Path::new(&e.path).is_file(), path: e.path, name: e.name, at: e.at, details: e.experiment.details, yld: e.experiment.yld })
        .collect()
}

#[tauri::command]
pub fn experiment_remove(app: AppHandle, path: String) {
    with_experiments(&app, |list| {
        list.retain(|e| e.path != path);
        save_experiments(&app, list);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn experiment(pairs: &[(&str, &str)], yld: Option<f64>) -> Experiment {
        Experiment { details: pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(), yld }
    }

    #[test]
    fn a_title_and_author_are_checked_and_a_bad_one_keeps_the_drawing() {
        assert_eq!(about(Some("  Aspirin, route 2 ".into())).as_deref(), Some("Aspirin, route 2"));
        assert_eq!(about(Some("é".repeat(MAX_ABOUT))).map(|t| t.chars().count()), Some(MAX_ABOUT), "characters, not bytes");
        for bad in ["", "  ", "two\nlines", "tab\there", "\u{7}"] {
            assert_eq!(about(Some(bad.into())), None, "{bad:?}");
        }
        assert_eq!(about(Some("x".repeat(MAX_ABOUT + 1))), None);
        assert_eq!(about(Some("a\u{85}b".into())).as_deref(), Some("a\u{85}b"), "C1, as oneLine keeps it");
        let long = "x".repeat(10_000);
        let text = format!(r#"[{{"path":"/a.oct","name":"a","at":1,"title":"Zoë 😀","author":"Sam"}},{{"path":"/b.oct","name":"b","at":2,"title":{{"x":1}},"author":"{long}"}},{{"path":"/c.oct","name":"c","at":3,"title":"a\nb","author":7}},{{"path":"/d.oct","name":"d","at":4}}]"#);
        let list: Vec<Recent> = serde_json::from_str(&text).unwrap();
        assert_eq!(list.len(), 4, "every drawing stays");
        assert_eq!((list[0].title.as_deref(), list[0].author.as_deref()), (Some("Zoë 😀"), Some("Sam")));
        assert!(list[1..].iter().all(|r| r.title.is_none() && r.author.is_none()));
        let again = serde_json::to_string(&list).unwrap();
        assert!(again.contains(r#""title":"Zoë 😀""#) && !again.contains(r#""path":"/d.oct","name":"d","at":4,"title""#));
    }

    #[test]
    fn experiment_details_are_checked() {
        assert!(experiment(&[("title", "Boc protection"), ("date", "2026-11-04")], Some(0.85)).ok());
        assert!(experiment(&[("title", "Wet product")], Some(1.2)).ok(), "a yield over 100% is kept");
        assert!(!experiment(&[], None).ok(), "no details");
        assert!(!experiment(&[("script", "x")], None).ok(), "an unknown detail");
        assert!(!experiment(&[("title", " ")], None).ok(), "an empty value");
        assert!(!experiment(&[("title", "two\nlines")], None).ok(), "a control character");
        assert!(!experiment(&[("title", &"x".repeat(MAX_VALUE + 1))], None).ok(), "too long");
        assert!(experiment(&[("title", &"é".repeat(MAX_VALUE))], None).ok(), "characters, not bytes");
        for bad in [f64::NAN, f64::INFINITY, -0.1, 101.0] {
            assert!(!experiment(&[("title", "x")], Some(bad)).ok(), "{bad}");
        }
    }

    #[test]
    fn a_damaged_or_hostile_file_gives_only_good_records() {
        assert!(read_experiments("{not json").is_empty());
        assert!(read_experiments(r#"{"path":"/a.oct"}"#).is_empty());
        let good = r#"{"path":"/a.oct","name":"a","at":1,"experiment":{"details":{"title":"A"},"yield":0.5}}"#;
        let bad = r#"{"path":"/b.oct","name":"b","at":1,"experiment":{"details":{"onload":"x"}}}"#;
        let list = read_experiments(&format!("[{good},{bad}]"));
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].experiment.yld, Some(0.5));
        let many = format!("[{}]", vec![good; MOST_EXPERIMENTS + 5].join(","));
        assert_eq!(read_experiments(&many).len(), MOST_EXPERIMENTS);
    }

    #[test]
    fn a_record_goes_first_once_and_goes_with_its_details() {
        let mut list = Vec::new();
        let e = |t: &str| Some(experiment(&[("title", t)], None));
        put_experiment(&mut list, "/a.oct", "a".into(), 1, e("A"));
        put_experiment(&mut list, "/b.oct", "b".into(), 2, e("B"));
        put_experiment(&mut list, "/a.oct", "a".into(), 3, e("A2"));
        assert_eq!(list.iter().map(|x| x.path.as_str()).collect::<Vec<_>>(), ["/a.oct", "/b.oct"]);
        assert_eq!(list[0].experiment.details["title"], "A2");
        put_experiment(&mut list, "/b.oct", "b".into(), 4, None);
        assert_eq!(list.len(), 1, "a drawing whose details went leaves the list");
        put_experiment(&mut list, "/a.oct", "a".into(), 5, Some(experiment(&[("x", "y")], None)));
        assert!(list.is_empty(), "details that fail the checks take it out");
        for k in 0..MOST_EXPERIMENTS + 3 {
            put_experiment(&mut list, &format!("/{k}.oct"), "k".into(), k as u64, e("T"));
        }
        assert_eq!(list.len(), MOST_EXPERIMENTS);
    }
}
