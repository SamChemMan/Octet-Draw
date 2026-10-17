// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, State, Wry};
use tauri_plugin_dialog::DialogExt;

mod clipboard;
mod export;
mod recent;

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

// The menu bar built again with the user's colours and shortcuts. A shortcut the menu cannot take leaves every
// command on its default, so the menu is never lost.
fn rebuild(app: &AppHandle) -> Result<(), String> {
    let names = app.state::<Palette>().0.lock().unwrap().clone();
    let keys = app.state::<MenuKeys>().0.lock().unwrap().clone();
    let (bar, checks, list) = menu(app, &names, &keys).or_else(|_| menu(app, &names, &HashMap::new())).map_err(|e| e.to_string())?;
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
// Octet saves .oct, a CDXML file with Octet's drawing inside (decision 0004), or .cdxml, which is the same file.
// It opens both, and the older .octet files.
const OPEN: (&str, &[&str]) = ("Drawings", &["oct", "cdxml", "octet"]);
const SAVE: [(&str, &[&str]); 2] = [("Octet drawing", &["oct"]), ("ChemDraw drawing", &["cdxml"])];

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
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    picked.0.lock().unwrap().insert(path.clone());
    recent::note(&app, &path);
    Ok(Some((path.to_string_lossy().into_owned(), text)))
}

// Opens one of Octet's own links in the browser. The page names it; only these fixed addresses can be opened.
#[tauri::command]
fn open_link(name: String) -> Result<(), String> {
    let url = match name.as_str() {
        "author" => "https://www.linkedin.com/in/sam-ellis-132781206/",
        _ => return Err("Octet has no such link.".into()),
    };
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
    command.arg(url).spawn().map(|_| ()).map_err(|e| e.to_string())
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
    // An old .octet file is saved as a new .oct beside it, so Save asks where, as Save As does.
    let given = path.map(PathBuf::from);
    let stem = given.as_ref().and_then(|p| p.file_stem()).map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "Untitled".into());
    let known = given.filter(|p| picked.0.lock().unwrap().contains(p) && p.extension().is_some_and(|e| e == "oct" || e == "cdxml"));
    let target = match known {
        Some(p) => p,
        None => {
            let dialog = SAVE.iter().fold(app.dialog().file(), |d, (name, ext)| d.add_filter(*name, ext));
            let Some(file) = dialog.set_file_name(format!("{stem}.oct")).blocking_save_file() else {
                return Ok(None);
            };
            let mut p = file.into_path().map_err(|e| e.to_string())?;
            if p.extension().is_none_or(|e| e != "oct" && e != "cdxml") {
                p.set_extension("oct");
            }
            p
        }
    };
    write_atomic(&target, contents.as_bytes()).map_err(|e| e.to_string())?;
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
    section.replace("File".into());
    let file = Submenu::with_items(app, "File", true, &[
        &item("home", "Home", "")?,
        &item("new", "New", "CmdOrCtrl+N")?,
        &item("open", "Open…", "CmdOrCtrl+O")?,
        &item("import", "Import a Structure…", "")?,
        &sep()?,
        &item("save", "Save", "CmdOrCtrl+S")?,
        &item("save_as", "Save As…", "CmdOrCtrl+Shift+S")?,
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
        &item("copy_smiles", "Copy As SMILES", "Alt+CmdOrCtrl+C")?,
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
        &PredefinedMenuItem::quit(app, None)?,
    ])?;
    let mut items: Vec<&dyn IsMenuItem<Wry>> = Vec::new();
    #[cfg(target_os = "macos")]
    items.push(&octet);
    items.extend([&file as &dyn IsMenuItem<Wry>, &edit, &view, &object, &structure, &text, &curves, &colour, &window]);
    let listed = list.borrow().clone();
    Ok((Menu::with_items(app, &items)?, vec![snap, warnings], listed))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Picked::default())
        .manage(recent::Recents::default())
        .manage(MenuKeys::default())
        .manage(MenuList::default())
        .manage(Palette::default())
        .invoke_handler(tauri::generate_handler![recent::recent_list, recent::recent_thumb, recent::recent_remove, recent::open_recent, menu_items, set_menu_keys, open_link, open_drawing, save_drawing, set_check, set_palette, import_structure, print_page, clipboard::copy_to_clipboard, clipboard::read_clipboard, export::export_file])
        .setup(|app| {
            let handle = app.handle();
            let (bar, checks, list) = menu(handle, &[], &HashMap::new())?;
            app.set_menu(bar)?;
            app.manage(Checks(Mutex::new(checks)));
            *app.state::<MenuList>().0.lock().unwrap() = list;
            app.on_menu_event(|app, event| {
                let _ = app.emit("menu", event.id().0.as_str());
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Octet");
}
