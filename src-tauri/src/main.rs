// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, State, WindowEvent, Wry};
use tauri_plugin_dialog::DialogExt;

mod clipboard;
mod crashlog;
mod export;
mod feedback;
mod open;
mod quit;
mod recent;
mod recovery;

// File > Print: the system's print dialog for the window, which prints only the page the editor laid out for it.
#[tauri::command]
fn print_page(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

// Files the user picked in an Open or Save dialog this session. The webview can only save to these,
// so a compromised page can't write anywhere else.
#[derive(Default)]
pub struct Picked(pub Mutex<HashSet<PathBuf>>);

// Tickable menu items, so the page can set their ticks from the user's saved settings.
struct Checks(Mutex<Vec<CheckMenuItem<Wry>>>);

// Shortcuts for menu commands. MenuKeys: the user's own (Settings > Keyboard shortcuts), an accelerator for each
// command they changed, "" for none. MenuList: every command as the menu was last built (its id, its name, the menu
// it is in and its default shortcut), for Settings to list. Palette: the user's colour names, for building again.
#[derive(Default)]
struct MenuKeys(Mutex<HashMap<String, String>>);
#[derive(Default)]
struct MenuList(Mutex<Vec<(String, String, String, String)>>);
#[derive(Default)]
struct Palette(Mutex<Vec<String>>);
type Built = (Menu<Wry>, Vec<CheckMenuItem<Wry>>, Vec<(String, String, String, String)>);

// The menu bar built again with the user's colours and shortcuts, and the recent drawings. A shortcut the menu cannot
// take leaves every command on its default, so the menu is never lost. The ticks stay as they were.
fn rebuild(app: &AppHandle) -> Result<(), String> {
    let names = app.state::<Palette>().0.lock().unwrap().clone();
    let keys = app.state::<MenuKeys>().0.lock().unwrap().clone();
    let (bar, checks, list) = menu(app, &names, &keys).or_else(|_| menu(app, &names, &HashMap::new())).map_err(|e| e.to_string())?;
    if let Some(old) = app.try_state::<Checks>() {
        for (c, was) in checks.iter().filter_map(|c| old.0.lock().unwrap().iter().find(|o| o.id() == c.id()).map(|o| (c, o.is_checked()))) {
            let _ = c.set_checked(was.unwrap_or(true));
        }
    }
    app.set_menu(bar).map_err(|e| e.to_string())?;
    *app.state::<Checks>().0.lock().unwrap() = checks;
    *app.state::<MenuList>().0.lock().unwrap() = list;
    Ok(())
}

#[tauri::command]
fn menu_items(list: State<'_, MenuList>) -> Vec<(String, String, String, String)> {
    list.0.lock().unwrap().clone()
}

// The user's menu shortcuts (at most 500, ids and accelerators of bounded length); the menu bar is built again
// with them. The frontend sets its check marks again afterwards.
#[tauri::command]
fn set_menu_keys(app: AppHandle, keys: HashMap<String, String>) -> Result<(), String> {
    let keys: HashMap<String, String> = keys.into_iter().filter(|(id, k)| id.len() <= 60 && k.len() <= 40 && !k.chars().any(char::is_control)).take(500).collect();
    *app.state::<MenuKeys>().0.lock().unwrap() = keys;
    rebuild(&app)
}

#[tauri::command]
fn set_check(checks: State<'_, Checks>, id: String, checked: bool) -> Result<(), String> {
    let checks = checks.0.lock().unwrap();
    let item = checks.iter().find(|c| c.id().0 == id).ok_or("no such menu item")?;
    item.set_checked(checked).map_err(|e| e.to_string())
}

// The user's own colours, by name, in the Colour menu: the menu bar is built again with them (20 at most, names
// cut to 40 characters). The frontend sets its check marks again afterwards.
#[tauri::command]
fn set_palette(app: AppHandle, names: Vec<String>) -> Result<(), String> {
    let names: Vec<String> = names.into_iter().take(20).map(|n| n.chars().filter(|c| !c.is_control()).take(40).collect()).collect();
    *app.state::<Palette>().0.lock().unwrap() = names;
    rebuild(&app)
}

pub const MAX_BYTES: u64 = 64 * 1024 * 1024;
// Octet saves .oct, a CDXML file with Octet's drawing inside (decision 0004), or .cdxml, which is the same file, or
// .cdx, ChemDraw's binary file with Octet's drawing inside (decision 0009). It opens all three, and the older .octet
// files.
const OPEN: (&str, &[&str]) = ("Drawings", &["oct", "cdxml", "cdx", "octet"]);
const SAVE: [(&str, &[&str]); 3] = [("Octet drawing", &["oct"]), ("ChemDraw drawing (CDXML)", &["cdxml"]), ("ChemDraw drawing (CDX)", &["cdx"])];
const SAVES: [&str; 3] = ["oct", "cdxml", "cdx"];

// A file's contents for the page: its text, or a CDX file's bytes in base64 (which starts "VmpDRDAxMDA", the
// magic). Anything else that is not UTF-8 text is an InvalidData error.
pub fn read_text_or_cdx(path: &Path) -> std::io::Result<String> {
    use base64::Engine;
    let bytes = fs::read(path)?;
    if bytes.starts_with(b"VjCD0100") {
        return Ok(base64::engine::general_purpose::STANDARD.encode(bytes));
    }
    String::from_utf8(bytes).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

// Write to a temporary file next to the target, flush it to disk, then rename it over the target.
// A crash mid-save leaves the old file intact.
pub fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let dir = path.parent().unwrap_or(Path::new("."));
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = dir.join(format!(".{name}.saving-{}", std::process::id()));
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(data)?;
        file.sync_all()?;
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[tauri::command]
async fn open_drawing(app: AppHandle, picked: State<'_, Picked>) -> Result<Option<(String, String)>, String> {
    let Some(file) = app.dialog().file().add_filter(OPEN.0, OPEN.1).blocking_pick_file() else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > MAX_BYTES {
        return Err("This file is larger than 64 MB. Octet cannot open it.".into());
    }
    let text = read_text_or_cdx(&path).map_err(|e| e.to_string())?;
    picked.0.lock().unwrap().insert(path.clone());
    recent::note(&app, &path);
    Ok(Some((path.to_string_lossy().into_owned(), text)))
}

// File > Revert to Saved: the drawing's file as it is on disk, for a file the user picked before.
#[tauri::command]
async fn revert_drawing(picked: State<'_, Picked>, path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !picked.0.lock().unwrap().contains(&p) {
        return Err("Octet cannot read this drawing again. Open it with File > Open.".into());
    }
    let size = fs::metadata(&p).map_err(|_| "This drawing is not where it was. It was moved or deleted.".to_string())?.len();
    if size > MAX_BYTES {
        return Err("This file is larger than 64 MB. Octet cannot open it.".into());
    }
    read_text_or_cdx(&p).map_err(|e| e.to_string())
}

// Opens a link or a file in the system's own app for it.
pub fn system_open(what: &std::ffi::OsStr) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", ""]);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command.arg(what).spawn().map(|_| ())
}

// Opens one of Octet's own links in the browser. The page names it; only these fixed addresses can be opened.
#[tauri::command]
fn open_link(name: String) -> Result<(), String> {
    let url = match name.as_str() {
        "author" => "https://www.linkedin.com/in/sam-ellis-132781206/",
        _ => return Err("Octet has no such link.".into()),
    };
    system_open(url.as_ref()).map_err(|e| e.to_string())
}

// Import a structure from another program's file (MOL, SDF, RXN, SMILES, InChI, CDXML, CDX). Returns its name and
// text (a CDX file's bytes in base64).
#[tauri::command]
async fn import_structure(app: AppHandle) -> Result<Option<(String, String)>, String> {
    let Some(file) = app.dialog().file().add_filter("Structures", &["mol", "sdf", "rxn", "smi", "smiles", "inchi", "cdxml", "cdx", "ket", "txt"]).blocking_pick_file() else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_BYTES {
        return Err("This file is larger than 64 MB. Octet cannot import it.".into());
    }
    let text = read_text_or_cdx(&path).map_err(|_| "Octet can only import structure files (MOL, SDF, RXN, SMILES, InChI, CDXML, CDX).".to_string())?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(Some((name, text)))
}

// Saves to `path` if the user picked it earlier, otherwise asks where to save. Returns the path, or None if cancelled.
// name: the name the Save dialog suggests when there is no path (a recovered drawing keeps its name). contents: the
// .oct (and .cdxml) file; cdx: the .cdx file in base64, which the page sends when the file may be a .cdx.
#[tauri::command]
async fn save_drawing(app: AppHandle, picked: State<'_, Picked>, path: Option<String>, name: Option<String>, contents: String, cdx: Option<String>) -> Result<Option<String>, String> {
    if contents.len() as u64 > MAX_BYTES || cdx.as_ref().is_some_and(|c| c.len() as u64 > MAX_BYTES / 3 * 4 + 4) {
        return Err("This drawing is larger than 64 MB. Octet cannot save it.".into());
    }
    // An old .octet file is saved as a new .oct beside it, so Save asks where, as Save As does.
    let given = path.map(PathBuf::from);
    let stem = given.as_ref().and_then(|p| p.file_stem()).map(|s| s.to_string_lossy().into_owned())
        .or_else(|| name.map(|n| n.chars().filter(|c| !c.is_control() && !"/\\:".contains(*c)).take(200).collect::<String>()).filter(|n| !n.trim().is_empty()))
        .unwrap_or_else(|| "Untitled".into());
    let known = given.filter(|p| picked.0.lock().unwrap().contains(p) && p.extension().is_some_and(|e| SAVES.iter().any(|s| e == *s)));
    let target = match known {
        Some(p) => p,
        None => {
            let dialog = SAVE.iter().fold(app.dialog().file(), |d, (name, ext)| d.add_filter(*name, ext));
            let Some(file) = dialog.set_file_name(format!("{stem}.oct")).blocking_save_file() else {
                return Ok(None);
            };
            let mut p = file.into_path().map_err(|e| e.to_string())?;
            if p.extension().is_none_or(|e| !SAVES.iter().any(|s| e == *s)) {
                p.set_extension("oct");
            }
            p
        }
    };
    let bytes = if target.extension().is_some_and(|e| e == "cdx") {
        use base64::Engine;
        let b64 = cdx.ok_or("Octet cannot save this drawing as CDX.")?;
        base64::engine::general_purpose::STANDARD.decode(b64).map_err(|_| "Octet cannot save this drawing as CDX.".to_string())?
    } else {
        contents.into_bytes()
    };
    write_atomic(&target, &bytes).map_err(|e| e.to_string())?;
    picked.0.lock().unwrap().insert(target.clone());
    recent::note(&app, &target);
    Ok(Some(target.to_string_lossy().into_owned()))
}

// File and Edit menus. Custom items send their id to the page as a "menu" event; Cut, Copy and Paste
// stay native so the page gets ordinary clipboard events. Select All selects the drawing, not the page.
fn menu(app: &AppHandle, palette: &[String], overrides: &HashMap<String, String>) -> tauri::Result<Built> {
    // Every command goes through here: it is listed (with the menu it is in) and takes the user's shortcut if they
    // set one, else its default ("" for none).
    let (list, section) = (RefCell::new(Vec::new()), RefCell::new(String::new()));
    let item = |id: &str, text: &str, keys: &str| {
        list.borrow_mut().push((id.to_string(), text.to_string(), section.borrow().clone(), keys.to_string()));
        let k = overrides.get(id).cloned().unwrap_or_else(|| keys.to_string());
        MenuItem::with_id(app, id, text, true, if k.is_empty() { None } else { Some(k) })
    };
    let sep = || PredefinedMenuItem::separator(app);
    // Open Recent, as ChemDraw's and every Mac app's: the recent drawings (Home's list), newest first, then Clear Menu.
    // The items are not commands with shortcuts, so Settings does not list them.
    let recents = recent::titles(app)
        .into_iter()
        .enumerate()
        .map(|(k, title)| MenuItem::with_id(app, format!("recent_{k}"), title, true, None::<&str>))
        .collect::<tauri::Result<Vec<_>>>()?;
    let (recent_sep, clear) = (sep()?, MenuItem::with_id(app, "recent_clear", "Clear Menu", !recents.is_empty(), None::<&str>)?);
    let mut recent_items: Vec<&dyn IsMenuItem<Wry>> = recents.iter().map(|m| m as &dyn IsMenuItem<Wry>).collect();
    if !recents.is_empty() {
        recent_items.push(&recent_sep);
    }
    recent_items.push(&clear);
    let open_recent = Submenu::with_items(app, "Open Recent", true, &recent_items)?;
    section.replace("File".into());
    let file = Submenu::with_items(app, "File", true, &[
        &item("home", "Home", "")?,
        &item("new", "New", "CmdOrCtrl+N")?,
        &item("open", "Open…", "CmdOrCtrl+O")?,
        &open_recent,
        &item("import", "Import a Structure…", "")?,
        &sep()?,
        &item("save", "Save", "CmdOrCtrl+S")?,
        &item("save_as", "Save As…", "CmdOrCtrl+Shift+S")?,
        &item("revert", "Revert to Saved", "")?,
        // ChemDraw's key: ⌃⌘E.
        // ⌃⌘E on the Mac; Ctrl+Shift+E elsewhere, where Control and Command are both Ctrl.
        &item("export", "Export…", if cfg!(target_os = "macos") { "Ctrl+CmdOrCtrl+E" } else { "CmdOrCtrl+Shift+E" })?,
        &sep()?,
        &item("page_setup", "Page Setup…", "CmdOrCtrl+Shift+P")?,
        &item("print", "Print…", "CmdOrCtrl+P")?,
        &sep()?,
        &item("document", "Document Settings…", "")?,
        &sep()?,
        &PredefinedMenuItem::close_window(app, None)?,
    ])?;
    // Copy As, as ChemDraw's: each puts the selected structures (or all of them) on the clipboard as text. ChemDraw's
    // keys: ⌥⌘C SMILES, ⌘D CDXML Text, ⌥⌘O MOL Text (V3000 since ChemDraw 26.1), ⇧⌥⌘O MOL V2000 Text.
    section.replace("Edit › Copy As".into());
    let copy_as = Submenu::with_items(app, "Copy As", true, &[
        &item("copy_smiles", "SMILES", "Alt+CmdOrCtrl+C")?,
        &item("copy_inchi", "InChI", "")?,
        &item("copy_inchikey", "InChIKey", "")?,
        &item("copy_cdxml", "CDXML Text", "CmdOrCtrl+D")?,
        &item("copy_mol", "MOL Text", "Alt+CmdOrCtrl+O")?,
        &item("copy_mol_v2000", "MOL V2000 Text", "Alt+Shift+CmdOrCtrl+O")?,
    ])?;
    section.replace("Edit".into());
    let edit = Submenu::with_items(app, "Edit", true, &[
        &item("undo", "Undo", "CmdOrCtrl+Z")?,
        &item("redo", "Redo", "CmdOrCtrl+Y")?,
        &sep()?,
        &PredefinedMenuItem::cut(app, None)?,
        &PredefinedMenuItem::copy(app, None)?,
        &PredefinedMenuItem::paste(app, None)?,
        &item("select_all", "Select All", "CmdOrCtrl+A")?,
        &item("invert_selection", "Invert Selection", "CmdOrCtrl+Shift+I")?,
        &sep()?,
        &copy_as,
    ])?;
    let snap = CheckMenuItem::with_id(app, "snap", "Snap to Objects", true, true, None::<&str>)?;
    // ChemDraw's View > Show Chemical Warnings.
    let warnings = CheckMenuItem::with_id(app, "warnings", "Show Chemical Warnings", true, true, None::<&str>)?;
    section.replace("View".into());
    let view = Submenu::with_items(app, "View", true, &[
        // ChemDraw's keys: Magnify, Reduce and Fit to Window.
        &item("zoom_actual", "Actual Size", "CmdOrCtrl+\\")?,
        &item("zoom_fit", "Fit to Window", "CmdOrCtrl+/")?,
        &item("zoom_in", "Magnify", "CmdOrCtrl+Shift+.")?,
        &item("zoom_out", "Reduce", "CmdOrCtrl+Shift+,")?,
        &sep()?,
        &snap,
        &warnings,
        &item("actions", "Show or Hide Actions", "")?,
        &item("properties", "Show or Hide Properties", "")?,
        // Not ⌘K, which is ChemDraw's Scale.
        &item("command_palette", "Command Palette…", "CmdOrCtrl+Shift+A")?,
    ])?;
    // Structure commands keep ChemDraw's shortcuts.
    section.replace("Structure".into());
    let structure = Submenu::with_items(app, "Structure", true, &[
        &item("clean_up", "Clean Up Structure", "CmdOrCtrl+Shift+K")?,
        &item("clean_reaction", "Clean Up Reaction", "CmdOrCtrl+Shift+X")?,
        &item("atom_properties", "Atom Properties…", "")?,
        &sep()?,
        &item("expand_label", "Expand Label", "")?,
        &item("contract_label", "Contract Label", "")?,
        &item("aromatic_display", "Toggle Aromatic Display", "Alt+CmdOrCtrl+K")?,
        &item("structure_perspective", "Structure Perspective", "Alt+CmdOrCtrl+S")?,
        &sep()?,
        &item("stoichiometry", "Analyze Stoichiometry", "")?,
        &sep()?,
        &item("predict_1h", "Predict ¹H-NMR Shifts", "")?,
        &item("predict_13c", "Predict ¹³C-NMR Shifts", "")?,
        &sep()?,
        &item("name_to_structure", "Convert Name to Structure", "CmdOrCtrl+Shift+N")?,
        &item("structure_to_name", "Convert Structure to Name", "Alt+CmdOrCtrl+N")?,
    ])?;
    // Align and Distribute, as ChemDraw's (lined up on the highest thing; spaced out between the two at the ends).
    section.replace("Object › Align".into());
    let align = Submenu::with_items(app, "Align", true, &[
        &item("arrange_left", "Left Edges", "Alt+Shift+CmdOrCtrl+L")?,
        &item("arrange_centre", "Left-Right Centres", "Alt+Shift+CmdOrCtrl+C")?,
        &item("arrange_right", "Right Edges", "Alt+Shift+CmdOrCtrl+R")?,
        &item("arrange_top", "Top Edges", "Alt+Shift+CmdOrCtrl+T")?,
        &item("arrange_middle", "Top-Bottom Centres", "Alt+Shift+CmdOrCtrl+M")?,
        &item("arrange_bottom", "Bottom Edges", "Alt+Shift+CmdOrCtrl+B")?,
    ])?;
    section.replace("Object › Distribute".into());
    let distribute = Submenu::with_items(app, "Distribute", true, &[
        &item("arrange_across", "Horizontally", "Alt+Shift+CmdOrCtrl+H")?,
        &item("arrange_down", "Vertically", "Alt+Shift+CmdOrCtrl+V")?,
    ])?;
    // Add Frame, as ChemDraw's: a frame round everything selected.
    section.replace("Object › Add Frame".into());
    let frame = Submenu::with_items(app, "Add Frame", true, &[
        &item("frame_brackets", "Brackets", "")?,
        &item("frame_parens", "Parentheses", "")?,
        &item("frame_braces", "Braces", "")?,
        &item("frame_box", "Rectangle", "")?,
        &item("frame_rounded", "Rounded Rectangle", "")?,
        &item("frame_box_shadow", "Rectangle with Shadow", "")?,
        &item("frame_rounded_shadow", "Rounded Rectangle with Shadow", "")?,
    ])?;
    section.replace("Object".into());
    let object = Submenu::with_items(app, "Object", true, &[
        &align,
        &distribute,
        &sep()?,
        &item("show_stereo", "Show Stereochemistry", "")?,
        &item("atom_numbers", "Show Atom Numbers", "")?,
        &sep()?,
        &item("group", "Group", "CmdOrCtrl+G")?,
        &item("ungroup", "Ungroup", "CmdOrCtrl+Shift+G")?,
        // ChemDraw's Group > Integral: a click on any part picks the whole group.
        &item("group_integral", "Pick as One", "")?,
        &sep()?,
        &item("bring_front", "Bring to Front", "CmdOrCtrl+[")?,
        &item("send_back", "Send to Back", "CmdOrCtrl+]")?,
        &sep()?,
        &frame,
        &sep()?,
        // ChemDraw's Flip (a mirror image, no key) and Rotate 180° (stereo kept, ⇧⌘H and ⇧⌘V).
        &item("flatten", "Flatten", "")?,
        &item("mirror_h", "Flip Horizontal", "")?,
        &item("mirror_v", "Flip Vertical", "")?,
        &item("flip_h", "Rotate 180° Horizontal", "CmdOrCtrl+Shift+H")?,
        &item("flip_v", "Rotate 180° Vertical", "CmdOrCtrl+Shift+V")?,
        &item("rotate_dialog", "Rotate…", "CmdOrCtrl+R")?,
        &item("scale_dialog", "Scale…", "CmdOrCtrl+K")?,
    ])?;
    // Text commands style the caption being typed, or the picked captions.
    section.replace("Text › Size".into());
    let sizes = [8, 9, 10, 12, 14, 18, 24]
        .map(|pt| item(&format!("size_{pt}"), &format!("{pt} pt"), ""))
        .into_iter()
        .collect::<tauri::Result<Vec<_>>>()?;
    let size_items: Vec<&dyn IsMenuItem<Wry>> = sizes.iter().map(|m| m as &dyn IsMenuItem<Wry>).collect();
    let size = Submenu::with_items(app, "Size", true, &size_items)?;
    // ChemDraw's text keys: Plain ⌘T, Bold ⌘B, Italic ⌘I, Underline ⌘U, Subscript ⌘-, Superscript ⌘+, Formula ⌘F.
    section.replace("Text › Font".into());
    let fonts = ["Arial", "Helvetica", "Times New Roman", "Calibri", "Cambria", "Georgia"].iter().enumerate()
        .map(|(k, f)| item(&format!("font_{k}"), f, ""))
        .collect::<tauri::Result<Vec<_>>>()?;
    let font_items: Vec<&dyn IsMenuItem<Wry>> = fonts.iter().map(|m| m as &dyn IsMenuItem<Wry>).collect();
    let font = Submenu::with_items(app, "Font", true, &font_items)?;
    section.replace("Text".into());
    let text = Submenu::with_items(app, "Text", true, &[
        &font,
        &sep()?,
        &item("text_plain", "Plain", "CmdOrCtrl+T")?,
        &item("text_bold", "Bold", "CmdOrCtrl+B")?,
        &item("text_italic", "Italic", "CmdOrCtrl+I")?,
        &item("text_underline", "Underline", "CmdOrCtrl+U")?,
        &item("text_sub", "Subscript", "CmdOrCtrl+-")?,
        &item("text_super", "Superscript", "CmdOrCtrl+=")?,
        &item("text_formula", "Formula", "CmdOrCtrl+F")?,
        &sep()?,
        &item("align_left", "Flush Left", "CmdOrCtrl+Shift+L")?,
        &item("align_centre", "Centre", "CmdOrCtrl+Shift+C")?,
        &item("align_right", "Flush Right", "CmdOrCtrl+Shift+R")?,
        &sep()?,
        &size,
    ])?;
    // Curves, as ChemDraw's Curves menu: the line, a head at either end (again takes it off), and a closed curve's fill.
    section.replace("Curves".into());
    let curves = Submenu::with_items(app, "Curves", true, &[
        &item("curves_plain", "Plain", "")?,
        &item("curves_dashed", "Dashed", "")?,
        &item("curves_bold", "Bold", "")?,
        &item("curves_doubled", "Double", "")?,
        &sep()?,
        &item("curves_start_full", "Arrowhead at Start", "")?,
        &item("curves_end_full", "Arrowhead at End", "")?,
        &item("curves_start_left", "Half Arrowhead at Start, Left", "")?,
        &item("curves_start_right", "Half Arrowhead at Start, Right", "")?,
        &item("curves_end_left", "Half Arrowhead at End, Left", "")?,
        &item("curves_end_right", "Half Arrowhead at End, Right", "")?,
        &sep()?,
        &item("curves_closed", "Closed", "")?,
        &item("curves_solid", "Filled", "")?,
        &item("curves_shaded", "Shaded", "")?,
        &item("curves_faded", "Faded", "")?,
    ])?;
    // Colour, as ChemDraw's Color menu: it colours whatever is selected. The colours are docstyle.ts's COLOURS.
    // Then the user's own colours by name, and Edit Colours…, which opens them in Settings.
    section.replace("Colour".into());
    let builtin = ["Black", "Ink", "Octet Blue", "Bright Blue", "Green", "Amber", "Red"].iter().enumerate()
        .map(|(k, name)| item(&format!("colour_{k}"), name, ""))
        .collect::<tauri::Result<Vec<_>>>()?;
    let mine = palette.iter().enumerate()
        .map(|(k, name)| item(&format!("colour_user_{k}"), name, ""))
        .collect::<tauri::Result<Vec<_>>>()?;
    let (sep1, sep2) = (sep()?, sep()?);
    let edit_colours = item("colour_other", "Edit Colours…", "")?;
    let mut colour_items: Vec<&dyn IsMenuItem<Wry>> = builtin.iter().map(|m| m as &dyn IsMenuItem<Wry>).collect();
    if !mine.is_empty() {
        colour_items.push(&sep1);
        colour_items.extend(mine.iter().map(|m| m as &dyn IsMenuItem<Wry>));
    }
    colour_items.push(&sep2);
    colour_items.push(&edit_colours);
    let colour = Submenu::with_items(app, "Colour", true, &colour_items)?;
    section.replace("Window".into());
    let window = Submenu::with_items(app, "Window", true, &[
        &PredefinedMenuItem::minimize(app, None)?,
        &PredefinedMenuItem::fullscreen(app, None)?,
    ])?;
    section.replace("Octet".into());
    #[cfg(target_os = "macos")]
    let octet = Submenu::with_items(app, "Octet", true, &[
        // Octet's own About window (src/About.tsx): the mark, who made it, and the credits the licences ask for.
        &item("about", "About Octet", "")?,
        &item("tutorial", "Tutorial", "")?,
        &sep()?,
        &item("settings", "Settings…", "CmdOrCtrl+,")?,
        &sep()?,
        &PredefinedMenuItem::services(app, None)?,
        &sep()?,
        &PredefinedMenuItem::hide(app, None)?,
        &PredefinedMenuItem::hide_others(app, None)?,
        &PredefinedMenuItem::show_all(app, None)?,
        &sep()?,
        // Not the system's Quit, which closes Octet at once: the page asks to save unsaved changes first.
        &item("quit", "Quit Octet", "CmdOrCtrl+Q")?,
    ])?;
    let mut items: Vec<&dyn IsMenuItem<Wry>> = Vec::new();
    #[cfg(target_os = "macos")]
    items.push(&octet);
    items.extend([&file as &dyn IsMenuItem<Wry>, &edit, &view, &object, &structure, &text, &curves, &colour, &window]);
    let listed = list.borrow().clone();
    Ok((Menu::with_items(app, &items)?, vec![snap, warnings], listed))
}

fn main() {
    let builder = tauri::Builder::default();
    // Windows and Linux start a second Octet for each file opened from Explorer or a file manager. It gives its files
    // to the Octet that runs, and ends. (On the Mac the system sends them to the running Octet itself.)
    #[cfg(any(windows, target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        open::offer(app, open::from_args(args.into_iter().map(std::ffi::OsString::from), Path::new(&cwd)), None)
    }));
    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(Picked::default())
        .manage(open::Waiting::default())
        .manage(recent::Recents::default())
        .manage(MenuKeys::default())
        .manage(MenuList::default())
        .manage(Palette::default())
        .invoke_handler(tauri::generate_handler![recent::recent_list, recent::recent_thumb, recent::recent_remove, recent::open_recent, revert_drawing, menu_items, set_menu_keys, open_link, open_drawing, save_drawing, set_check, set_palette, import_structure, print_page, clipboard::copy_to_clipboard, clipboard::read_clipboard, export::export_file, export::system_fonts, feedback::snapshot, feedback::send_feedback, recovery::recovery_write, recovery::recovery_clear, recovery::recovery_list, recovery::recovery_open, recovery::recovery_discard, crashlog::log_error, crashlog::crash_report, crashlog::show_log, quit::set_edited, open::take_opened])
        .setup(|app| {
            let handle = app.handle();
            // Files named when Octet starts (Explorer and file managers pass them as arguments).
            let cwd = std::env::current_dir().unwrap_or_default();
            open::offer(handle, open::from_args(std::env::args_os(), &cwd), None);
            crashlog::install(handle);
            quit::install(handle);
            app.manage(recovery::start(handle));
            let (bar, checks, list) = menu(handle, &[], &HashMap::new())?;
            app.set_menu(bar)?;
            app.manage(Checks(Mutex::new(checks)));
            *app.state::<MenuList>().0.lock().unwrap() = list;
            app.on_menu_event(|app, event| {
                if event.id() == "quit" {
                    quit::front(app);
                }
                if event.id() == "recent_clear" {
                    recent::clear(app);
                }
                let _ = app.emit("menu", event.id().0.as_str());
            });
            Ok(())
        })
        // Files dropped on the window, with where they were dropped in CSS pixels from the top left. wry 0.57 gives
        // WebView2's point in device pixels, and WebKit's (Mac, Linux) in CSS pixels already.
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, position }) = event {
                #[cfg(windows)]
                let position = position.to_logical::<f64>(window.scale_factor().unwrap_or(1.0));
                open::offer(window.app_handle(), paths.clone(), Some((position.x, position.y)));
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running Octet")
        .run(|_app, _event| {
            // Files opened from Finder or the Dock (a double-click, Open With, a drop on the Dock icon).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                open::offer(_app, urls.into_iter().filter_map(|u| u.to_file_path().ok()), None);
            }
        });
}
