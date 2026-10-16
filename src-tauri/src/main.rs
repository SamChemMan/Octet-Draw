// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, State, Wry};
use tauri_plugin_dialog::DialogExt;

// Files the user picked in an Open or Save dialog this session. The webview can only save to these,
// so a compromised page can't write anywhere else.
#[derive(Default)]
struct Picked(Mutex<HashSet<PathBuf>>);

// Tickable menu items, so the page can set their ticks from the user's saved settings.
struct Checks(Mutex<Vec<CheckMenuItem<Wry>>>);

#[tauri::command]
fn set_check(checks: State<'_, Checks>, id: String, checked: bool) -> Result<(), String> {
    let checks = checks.0.lock().unwrap();
    let item = checks.iter().find(|c| c.id().0 == id).ok_or("no such menu item")?;
    item.set_checked(checked).map_err(|e| e.to_string())
}

// The user's own colours, by name, in the Colour menu: the menu bar is built again with them (20 at most, names
// cut to 40 characters). The frontend sets its check marks again afterwards.
#[tauri::command]
fn set_palette(app: AppHandle, checks: State<'_, Checks>, names: Vec<String>) -> Result<(), String> {
    let names: Vec<String> = names.into_iter().take(20).map(|n| n.chars().filter(|c| !c.is_control()).take(40).collect()).collect();
    let (bar, items) = menu(&app, &names).map_err(|e| e.to_string())?;
    app.set_menu(bar).map_err(|e| e.to_string())?;
    *checks.0.lock().unwrap() = items;
    Ok(())
}

const MAX_BYTES: u64 = 64 * 1024 * 1024;
const FILTER: (&str, &[&str]) = ("Octet drawing", &["octet"]);

// Write to a temporary file next to the target, flush it to disk, then rename it over the target.
// A crash mid-save leaves the old file intact.
fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
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
    let Some(file) = app.dialog().file().add_filter(FILTER.0, FILTER.1).blocking_pick_file() else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > MAX_BYTES {
        return Err("This file is larger than 64 MB. Octet cannot open it.".into());
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    picked.0.lock().unwrap().insert(path.clone());
    Ok(Some((path.to_string_lossy().into_owned(), text)))
}

// Import a structure from another program's file (MOL, SDF, SMILES, CDXML). Returns its name and text.
#[tauri::command]
async fn import_structure(app: AppHandle) -> Result<Option<(String, String)>, String> {
    let Some(file) = app.dialog().file().add_filter("Structures", &["mol", "sdf", "smi", "smiles", "cdxml", "ket", "txt"]).blocking_pick_file() else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_BYTES {
        return Err("This file is larger than 64 MB. Octet cannot import it.".into());
    }
    let text = fs::read_to_string(&path).map_err(|_| "Octet can only import text files (MOL, SDF, SMILES, CDXML).".to_string())?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(Some((name, text)))
}

// Saves to `path` if the user picked it earlier, otherwise asks where to save. Returns the path, or None if cancelled.
#[tauri::command]
async fn save_drawing(app: AppHandle, picked: State<'_, Picked>, path: Option<String>, contents: String) -> Result<Option<String>, String> {
    if contents.len() as u64 > MAX_BYTES {
        return Err("This drawing is larger than 64 MB. Octet cannot save it.".into());
    }
    let known = path.map(PathBuf::from).filter(|p| picked.0.lock().unwrap().contains(p));
    let target = match known {
        Some(p) => p,
        None => {
            let Some(file) = app.dialog().file().add_filter(FILTER.0, FILTER.1).set_file_name("Untitled.octet").blocking_save_file() else {
                return Ok(None);
            };
            let mut p = file.into_path().map_err(|e| e.to_string())?;
            if p.extension().is_none_or(|e| e != "octet") {
                p.set_extension("octet");
            }
            p
        }
    };
    write_atomic(&target, contents.as_bytes()).map_err(|e| e.to_string())?;
    picked.0.lock().unwrap().insert(target.clone());
    Ok(Some(target.to_string_lossy().into_owned()))
}

// File and Edit menus. Custom items send their id to the page as a "menu" event; Cut, Copy and Paste
// stay native so the page gets ordinary clipboard events. Select All selects the drawing, not the page.
fn menu(app: &AppHandle, palette: &[String]) -> tauri::Result<(Menu<Wry>, Vec<CheckMenuItem<Wry>>)> {
    let item = |id: &str, text: &str, keys: &str| MenuItem::with_id(app, id, text, true, Some(keys));
    let sep = || PredefinedMenuItem::separator(app);
    let file = Submenu::with_items(app, "File", true, &[
        &item("new", "New", "CmdOrCtrl+N")?,
        &item("open", "Open…", "CmdOrCtrl+O")?,
        &MenuItem::with_id(app, "import", "Import a Structure…", true, None::<&str>)?,
        &sep()?,
        &item("save", "Save", "CmdOrCtrl+S")?,
        &item("save_as", "Save As…", "CmdOrCtrl+Shift+S")?,
        &sep()?,
        &MenuItem::with_id(app, "document", "Document Settings…", true, None::<&str>)?,
        &sep()?,
        &PredefinedMenuItem::close_window(app, None)?,
    ])?;
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
        &item("copy_smiles", "Copy As SMILES", "Alt+CmdOrCtrl+C")?,
    ])?;
    let snap = CheckMenuItem::with_id(app, "snap", "Snap to Objects", true, true, None::<&str>)?;
    let view = Submenu::with_items(app, "View", true, &[
        // ChemDraw's keys: Magnify, Reduce and Fit to Window.
        &item("zoom_actual", "Actual Size", "CmdOrCtrl+\\")?,
        &item("zoom_fit", "Fit to Window", "CmdOrCtrl+/")?,
        &item("zoom_in", "Magnify", "CmdOrCtrl+Shift+.")?,
        &item("zoom_out", "Reduce", "CmdOrCtrl+Shift+,")?,
        &sep()?,
        &snap,
        &MenuItem::with_id(app, "actions", "Show or Hide Actions", true, None::<&str>)?,
        // Not ⌘K, which is ChemDraw's Scale.
        &item("command_palette", "Command Palette…", "CmdOrCtrl+Shift+A")?,
    ])?;
    // Structure commands keep ChemDraw's shortcuts.
    let structure = Submenu::with_items(app, "Structure", true, &[
        &item("clean_up", "Clean Up Structure", "CmdOrCtrl+Shift+K")?,
        &item("clean_reaction", "Clean Up Reaction", "CmdOrCtrl+Shift+X")?,
        &sep()?,
        &item("name_to_structure", "Convert Name to Structure", "CmdOrCtrl+Shift+N")?,
        &item("structure_to_name", "Convert Structure to Name", "Alt+CmdOrCtrl+N")?,
    ])?;
    let object = Submenu::with_items(app, "Object", true, &[
        &item("bring_front", "Bring to Front", "CmdOrCtrl+[")?,
        &item("send_back", "Send to Back", "CmdOrCtrl+]")?,
        &sep()?,
        // ChemDraw's Flip (a mirror image, no key) and Rotate 180° (stereo kept, ⇧⌘H and ⇧⌘V).
        &MenuItem::with_id(app, "mirror_h", "Flip Horizontal", true, None::<&str>)?,
        &MenuItem::with_id(app, "mirror_v", "Flip Vertical", true, None::<&str>)?,
        &item("flip_h", "Rotate 180° Horizontal", "CmdOrCtrl+Shift+H")?,
        &item("flip_v", "Rotate 180° Vertical", "CmdOrCtrl+Shift+V")?,
    ])?;
    // Text commands style the caption being typed, or the picked captions.
    let sizes = [8, 9, 10, 12, 14, 18, 24]
        .map(|pt| MenuItem::with_id(app, format!("size_{pt}"), format!("{pt} pt"), true, None::<&str>))
        .into_iter()
        .collect::<tauri::Result<Vec<_>>>()?;
    let size_items: Vec<&dyn IsMenuItem<Wry>> = sizes.iter().map(|m| m as &dyn IsMenuItem<Wry>).collect();
    let size = Submenu::with_items(app, "Size", true, &size_items)?;
    let text = Submenu::with_items(app, "Text", true, &[
        &item("text_bold", "Bold", "CmdOrCtrl+B")?,
        &item("text_italic", "Italic", "CmdOrCtrl+I")?,
        &item("text_underline", "Underline", "CmdOrCtrl+U")?,
        &sep()?,
        &item("align_left", "Flush Left", "CmdOrCtrl+Shift+L")?,
        &item("align_centre", "Centre", "CmdOrCtrl+Shift+C")?,
        &item("align_right", "Flush Right", "CmdOrCtrl+Shift+R")?,
        &sep()?,
        &size,
    ])?;
    // Curves, as ChemDraw's Curves menu: the line, a head at either end (again takes it off), and a closed curve's fill.
    let curves = Submenu::with_items(app, "Curves", true, &[
        &MenuItem::with_id(app, "curves_plain", "Plain", true, None::<&str>)?,
        &MenuItem::with_id(app, "curves_dashed", "Dashed", true, None::<&str>)?,
        &MenuItem::with_id(app, "curves_bold", "Bold", true, None::<&str>)?,
        &MenuItem::with_id(app, "curves_doubled", "Double", true, None::<&str>)?,
        &sep()?,
        &MenuItem::with_id(app, "curves_start_full", "Arrowhead at Start", true, None::<&str>)?,
        &MenuItem::with_id(app, "curves_end_full", "Arrowhead at End", true, None::<&str>)?,
        &MenuItem::with_id(app, "curves_start_left", "Half Arrowhead at Start, Left", true, None::<&str>)?,
        &MenuItem::with_id(app, "curves_start_right", "Half Arrowhead at Start, Right", true, None::<&str>)?,
        &MenuItem::with_id(app, "curves_end_left", "Half Arrowhead at End, Left", true, None::<&str>)?,
        &MenuItem::with_id(app, "curves_end_right", "Half Arrowhead at End, Right", true, None::<&str>)?,
        &sep()?,
        &MenuItem::with_id(app, "curves_closed", "Closed", true, None::<&str>)?,
        &MenuItem::with_id(app, "curves_solid", "Filled", true, None::<&str>)?,
        &MenuItem::with_id(app, "curves_shaded", "Shaded", true, None::<&str>)?,
        &MenuItem::with_id(app, "curves_faded", "Faded", true, None::<&str>)?,
    ])?;
    // Colour, as ChemDraw's Color menu: it colours whatever is selected. The colours are docstyle.ts's COLOURS.
    // Then the user's own colours by name, and Edit Colours…, which opens them in Settings.
    let builtin = ["Black", "Ink", "Octet Blue", "Bright Blue", "Green", "Amber", "Red"].iter().enumerate()
        .map(|(k, name)| MenuItem::with_id(app, format!("colour_{k}"), *name, true, None::<&str>))
        .collect::<tauri::Result<Vec<_>>>()?;
    let mine = palette.iter().enumerate()
        .map(|(k, name)| MenuItem::with_id(app, format!("colour_user_{k}"), name, true, None::<&str>))
        .collect::<tauri::Result<Vec<_>>>()?;
    let (sep1, sep2) = (sep()?, sep()?);
    let edit_colours = MenuItem::with_id(app, "colour_other", "Edit Colours…", true, None::<&str>)?;
    let mut colour_items: Vec<&dyn IsMenuItem<Wry>> = builtin.iter().map(|m| m as &dyn IsMenuItem<Wry>).collect();
    if !mine.is_empty() {
        colour_items.push(&sep1);
        colour_items.extend(mine.iter().map(|m| m as &dyn IsMenuItem<Wry>));
    }
    colour_items.push(&sep2);
    colour_items.push(&edit_colours);
    let colour = Submenu::with_items(app, "Colour", true, &colour_items)?;
    let window = Submenu::with_items(app, "Window", true, &[
        &PredefinedMenuItem::minimize(app, None)?,
        &PredefinedMenuItem::fullscreen(app, None)?,
    ])?;
    #[cfg(target_os = "macos")]
    let octet = Submenu::with_items(app, "Octet", true, &[
        &PredefinedMenuItem::about(app, None, None)?,
        &sep()?,
        &item("settings", "Settings…", "CmdOrCtrl+,")?,
        &sep()?,
        &PredefinedMenuItem::services(app, None)?,
        &sep()?,
        &PredefinedMenuItem::hide(app, None)?,
        &PredefinedMenuItem::hide_others(app, None)?,
        &PredefinedMenuItem::show_all(app, None)?,
        &sep()?,
        &PredefinedMenuItem::quit(app, None)?,
    ])?;
    let mut items: Vec<&dyn IsMenuItem<Wry>> = Vec::new();
    #[cfg(target_os = "macos")]
    items.push(&octet);
    items.extend([&file as &dyn IsMenuItem<Wry>, &edit, &view, &object, &structure, &text, &curves, &colour, &window]);
    Ok((Menu::with_items(app, &items)?, vec![snap]))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Picked::default())
        .invoke_handler(tauri::generate_handler![open_drawing, save_drawing, set_check, set_palette, import_structure])
        .setup(|app| {
            let handle = app.handle();
            let (bar, checks) = menu(handle, &[])?;
            app.set_menu(bar)?;
            app.manage(Checks(Mutex::new(checks)));
            app.on_menu_event(|app, event| {
                let _ = app.emit("menu", event.id().0.as_str());
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Octet");
}
