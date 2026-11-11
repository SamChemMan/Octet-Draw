// `Octet Draw --convert INPUT... --to FORMAT` (plan 18.3, issue 91): batch conversion with no window, no menu item
// and no setting. It is Octet with no window (--headless) with the loop and the file reads and writes here: each file
// opens in a hidden drawing window as File > Open opens it (open::read's limits here, the page's reading there, every
// file treated as hostile), the page makes the file as read with a format makes it (Export's own code), and the
// window closes. Octet reads only the files and folders named here and writes only into --out or beside each input.
// A file that is there is never written over without --overwrite: the new one gets a number.
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde_json::json;
use tauri::{AppHandle, Manager};

use crate::export::{file_of, Export, FORMATS};

const USAGE: &str = "Use: Octet Draw --convert INPUT... --to FORMAT [--out FOLDER] [--width 89mm] [--dpi 600] [--style PRESET or FILE] [--each] [--recursive] [--overwrite]";
// The formats read gives in base64 (the rest it gives as the file's text).
const BINARY: [&str; 8] = ["pdf", "png", "emf", "eps", "tif", "jpg", "gif", "cdx"];

#[derive(Debug, PartialEq, Default)]
pub struct Job {
    inputs: Vec<PathBuf>,
    to: String, // an Export format's id (pdf, sdf2000, smi)
    out: Option<PathBuf>,
    width: Option<f64>, // mm
    dpi: Option<f64>,
    style: Option<String>, // a preset, or a drawing whose style to use
    each: bool,
    recursive: bool,
    overwrite: bool,
}

// The arguments after --convert, or what is wrong with them (with the usage).
pub fn parse(args: &[String]) -> Result<Job, String> {
    let mut job = Job::default();
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let mut value = |name: &str| it.next().cloned().ok_or(format!("{name} needs a value."));
        match a.as_str() {
            "--to" => job.to = format_of(&value("--to")?).ok_or("Octet cannot convert to that format.")?.to_string(),
            "--out" => job.out = Some(value("--out")?.into()),
            "--width" => job.width = Some(number(value("--width")?.trim_end_matches("mm"), 1.0, 2000.0).ok_or("--width is a width from 1 to 2000 mm, such as 89mm.")?),
            "--dpi" => job.dpi = Some(number(&value("--dpi")?, 36.0, 2400.0).ok_or("--dpi is a resolution from 36 to 2400.")?),
            "--style" => job.style = Some(value("--style")?),
            "--each" => job.each = true,
            "--recursive" => job.recursive = true,
            "--overwrite" => job.overwrite = true,
            x if x.starts_with("--") => return Err(format!("Octet does not know {x}. {USAGE}")),
            x => job.inputs.push(x.into()),
        }
    }
    if job.inputs.is_empty() || job.to.is_empty() {
        return Err(format!("Give the files or folders to convert, and --to. {USAGE}"));
    }
    if job.each && !job.to.starts_with("sdf") {
        return Err("--each goes with --to sdf.".into());
    }
    Ok(job)
}

fn number(text: &str, min: f64, max: f64) -> Option<f64> {
    text.trim().parse::<f64>().ok().filter(|n| (min..=max).contains(n))
}

// An Export format by its id or an extension it takes (tiff, jpeg, smiles), not a template file or Home's list.
fn format_of(name: &str) -> Option<&'static str> {
    let name = name.trim().trim_start_matches('.').to_ascii_lowercase();
    FORMATS.iter().filter(|f| !matches!(f.0, "ctp" | "cts" | "csv")).find(|f| f.0 == name || f.2.contains(&name.as_str())).map(|f| f.0)
}

// The files to convert: each file named, and every file in each folder named that Octet reads (in folders inside it
// too with --recursive, not following links), in order. A name that is neither is named with its reason. Only files:
// a named pipe or a device would never end.
fn files(job: &Job) -> (Vec<PathBuf>, Vec<(PathBuf, String)>) {
    let (mut found, mut wrong) = (Vec::new(), Vec::new());
    for input in &job.inputs {
        match fs::metadata(input) {
            Ok(m) if m.is_dir() => folder(input, job.recursive, &mut found, &mut wrong),
            Ok(m) if m.is_file() => found.push(input.clone()),
            Ok(_) => wrong.push((input.clone(), "This is not a file.".into())),
            Err(e) => wrong.push((input.clone(), reason(&e))),
        }
    }
    (found, wrong)
}
fn folder(dir: &Path, recursive: bool, found: &mut Vec<PathBuf>, wrong: &mut Vec<(PathBuf, String)>) {
    let mut entries: Vec<PathBuf> = match fs::read_dir(dir) {
        Ok(list) => list.filter_map(|e| e.ok().map(|e| e.path())).collect(),
        Err(e) => return wrong.push((dir.to_path_buf(), reason(&e))),
    };
    entries.sort();
    for p in entries {
        let Ok(m) = fs::symlink_metadata(&p) else { continue };
        if m.is_dir() {
            if recursive {
                folder(&p, true, found, wrong);
            }
        } else if m.is_file() && p.extension().and_then(|e| e.to_str()).is_some_and(|e| reads(&e.to_ascii_lowercase())) {
            found.push(p);
        }
    }
}
// What a folder gives: the drawings Open opens and the files Import a Structure reads (not every .txt file).
fn reads(ext: &str) -> bool {
    crate::open::DRAWINGS.contains(&ext) || (crate::STRUCTURES.contains(&ext) && ext != "txt")
}
fn reads_drawing(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).is_some_and(|e| crate::open::DRAWINGS.contains(&e.to_ascii_lowercase().as_str()))
}
fn reason(e: &std::io::Error) -> String {
    match e.kind() {
        std::io::ErrorKind::NotFound => "There is no such file or folder.".into(),
        std::io::ErrorKind::PermissionDenied => "Octet does not have permission to read it.".into(),
        _ => e.to_string(),
    }
}

// Where a file's new file goes: in --out or beside it, with the format's extension. One that is there already is kept,
// and the new one gets a number (figure3 2.pdf), unless --overwrite. One this run wrote (a.cdxml and a.smi, both to
// a.pdf) is never written over: --overwrite is for the files that were there before.
fn target(input: &Path, out: Option<&Path>, ext: &str, overwrite: bool, written: &HashSet<PathBuf>) -> PathBuf {
    let dir = out.or(input.parent()).unwrap_or(Path::new("."));
    let stem = input.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "Untitled".into());
    let mut path = dir.join(format!("{stem}.{ext}"));
    let mut n = 2;
    while written.contains(&path) || (!overwrite && fs::symlink_metadata(&path).is_ok()) {
        path = dir.join(format!("{stem} {n}.{ext}"));
        n += 1;
    }
    path
}

// Converts every file, one line each on standard output (a file it cannot convert on standard error, with the reason),
// and the count at the end. Returns the exit code: 1 when any file failed.
pub fn run(app: &AppHandle, job: &Job) -> i32 {
    let (found, wrong) = files(job);
    for (p, why) in &wrong {
        say!(stderr, "{}: {why}", p.display());
    }
    // A style from a drawing: read once, with Open's limits.
    let style_file = job.style.as_deref().map(Path::new).filter(|p| p.is_file());
    // (Only a drawing: another file is read as structures, which have no style.)
    let style_text = match style_file.map(|p| if reads_drawing(p) { crate::open::read(p, &p.display().to_string()) } else { Err("This file is not a drawing. --style takes a preset, or an Octet or ChemDraw drawing.".into()) }) {
        Some(Err(why)) => {
            say!(stderr, "{}: {why}", job.style.as_deref().unwrap_or_default());
            return 1;
        }
        Some(Ok(t)) => Some(t),
        None => None,
    };
    // The style, tried once before any file: a file that is not a drawing or has no style, or a preset Octet does not
    // have, ends the run here with its reason (each file would otherwise fail with it).
    if let Some(style) = &job.style {
        let start = style_text.as_ref().map_or(json!({ "new": "quick" }), |t| json!({ "text": t, "name": "style", "style": t }));
        let tried = hidden(app, start, |w| match style_text {
            Some(_) => crate::mcp::call(app, w, "read", json!({})).map(drop).map_err(|why| format!("Octet cannot take a style from this file. {why}")),
            None => restyle(app, w, job, None),
        });
        if let Err(why) = tried {
            say!(stderr, "{style}: {why}");
            return 1;
        }
    }
    if let Some(out) = &job.out {
        if let Err(e) = fs::create_dir_all(out) {
            say!(stderr, "{}: {e}", out.display());
            return 1;
        }
    }
    let ext = FORMATS.iter().find(|f| f.0 == job.to).map_or(job.to.as_str(), |f| f.2[0]);
    let (mut done, mut written) = (0, HashSet::new());
    for p in &found {
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        match convert(app, job, p, &name, style_text.as_deref()).and_then(|(bytes, lost)| {
            let to = target(p, job.out.as_deref(), ext, job.overwrite, &written);
            crate::write_atomic(&to, &bytes).map(|_| (to, lost)).map_err(|e| e.to_string())
        }) {
            Ok((to, lost)) => {
                done += 1;
                // What File > Open says it could not keep, said here too.
                let lost = lost.map(|l| format!(" (Octet left out {l}.)")).unwrap_or_default();
                say!(stdout, "{name} -> {}{lost}", to.file_name().map(|n| n.to_string_lossy()).unwrap_or_default());
                written.insert(to);
            }
            Err(why) => say!(stderr, "{name}: {why}"),
        }
    }
    let all = found.len() + wrong.len();
    say!(stdout, "Converted {done} of {all} file{}.", if all == 1 { "" } else { "s" });
    i32::from(done < all)
}

// A hidden drawing window that opens `start`, for `work`, closed after.
fn hidden<T>(app: &AppHandle, start: serde_json::Value, work: impl FnOnce(&str) -> Result<T, String>) -> Result<T, String> {
    let window = crate::windows::open(app, start)?;
    let made = work(&window);
    if let Some(w) = app.get_webview_window(&window) {
        let _ = w.destroy();
    }
    made
}

// A drawing in its new style: a drawing's style (`style`) it took as it opened; a preset is set here.
fn restyle(app: &AppHandle, window: &str, job: &Job, style: Option<&str>) -> Result<(), String> {
    if let Some(preset) = job.style.as_deref().filter(|_| style.is_none()) {
        crate::mcp::call(app, window, "advanced", json!({ "tool": "set_style", "args": { "preset": preset } }))?;
    }
    Ok(())
}

// What the page could not keep of the file it opened, from a reply (the page adds it with no window).
fn lost(reply: &serde_json::Value) -> Option<String> {
    reply["lost"].as_str().map(String::from)
}

// One file's new file, and what Octet left out of it: opened in a hidden window as File > Open opens it, restyled, then
// made as read makes it.
fn convert(app: &AppHandle, job: &Job, path: &Path, name: &str, style: Option<&str>) -> Result<(Vec<u8>, Option<String>), String> {
    // (A file Octet may not read is named so, not as a file it cannot open.)
    fs::File::open(path).map_err(|e| reason(&e))?;
    let text = crate::open::read(path, name)?;
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    hidden(app, json!({ "text": text, "name": stem, "style": style }), |window| {
        restyle(app, window, job, style)?;
        if job.each {
            return each(app, window, &job.to);
        }
        let mut args = json!({ "format": job.to });
        for (k, v) in [("dpi", job.dpi), ("width_mm", job.width)] {
            if let Some(v) = v {
                args[k] = json!(v);
            }
        }
        let read = crate::mcp::call(app, window, "read", args)?;
        let text = read["text"].as_str().unwrap_or_default().to_string();
        if BINARY.contains(&job.to.as_str()) {
            return base64::engine::general_purpose::STANDARD.decode(text).map(|b| (b, lost(&read))).map_err(|e| e.to_string());
        }
        if job.to == "svg" {
            return Ok((text.into_bytes(), lost(&read)));
        }
        // The text formats as Export writes them (a newline after SMILES and InChI).
        let mut e = Export::default();
        *match job.to.as_str() {
            "oct" => &mut e.oct,
            "cdxml" => &mut e.cdxml,
            "smi" => &mut e.smiles,
            "inchi" => &mut e.inchi,
            _ => &mut e.mdl,
        } = Some(text);
        file_of(&job.to, &e).map(|b| (b, lost(&read)))
    })
}

// --to sdf --each: every compound in the drawing, each a record with its compound number as a data field.
fn each(app: &AppHandle, window: &str, to: &str) -> Result<(Vec<u8>, Option<String>), String> {
    let summary = crate::mcp::call(app, window, "read", json!({}))?;
    let mut out = String::new();
    for s in summary["structures"].as_array().into_iter().flatten() {
        let mol = crate::mcp::call(app, window, "read", json!({ "format": if to == "sdf2000" { "mol2000" } else { "mol" }, "ids": [s["id"]] }))?;
        out += mol["text"].as_str().unwrap_or_default().trim_end();
        if let Some(n) = s["number"].as_str() {
            out += &format!("\n> <Number>\n{n}\n");
        }
        out += "\n$$$$\n";
    }
    Ok((out.into_bytes(), lost(&summary)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(line: &str) -> Vec<String> {
        line.split(' ').map(String::from).collect()
    }

    #[test]
    fn the_arguments_are_read() {
        let job = parse(&args("a.cdxml figures --to PDF --out out --width 89mm --dpi 600 --style ACS --recursive")).unwrap();
        assert_eq!(job, Job { inputs: vec!["a.cdxml".into(), "figures".into()], to: "pdf".into(), out: Some("out".into()), width: Some(89.0), dpi: Some(600.0), style: Some("ACS".into()), each: false, recursive: true, overwrite: false });
        assert_eq!(parse(&args("a.cdx --to tiff --overwrite")).map(|j| (j.to, j.overwrite)), Ok(("tif".into(), true)));
        assert_eq!(parse(&args("a.cdx --to smiles")).map(|j| j.to), Ok("smi".into()));
        assert_eq!(parse(&args("a.cdx --to .sdf --each")).map(|j| (j.to, j.each)), Ok(("sdf".into(), true)));
        assert_eq!(parse(&args("a.cdx --to width --width 89")).err().as_deref(), Some("Octet cannot convert to that format."));
        for wrong in ["a.cdx", "--to pdf", "a.cdx --to ctp", "a.cdx --to csv", "a.cdx --to pdf --each", "a.cdx --to pdf --width 0mm", "a.cdx --to png --dpi 9999", "a.cdx --to pdf --dpi", "a.cdx --to pdf --colour red"] {
            assert!(parse(&args(wrong)).is_err(), "{wrong}");
        }
    }

    #[test]
    fn a_file_there_is_never_written_over() {
        let dir = std::env::temp_dir().join(format!("octet-convert-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let (input, none) = (dir.join("figure3.cdxml"), HashSet::new());
        assert_eq!(target(&input, None, "pdf", false, &none), dir.join("figure3.pdf"));
        fs::write(dir.join("figure3.pdf"), "kept").unwrap();
        assert_eq!(target(&input, None, "pdf", false, &none), dir.join("figure3 2.pdf"));
        fs::write(dir.join("figure3 2.pdf"), "kept").unwrap();
        assert_eq!(target(&input, None, "pdf", false, &none), dir.join("figure3 3.pdf"));
        assert_eq!(target(&input, None, "pdf", true, &none), dir.join("figure3.pdf"));
        // With --overwrite, a file this run wrote is still kept (figure3.cdxml and figure3.smi, both to figure3.pdf).
        let written = HashSet::from([dir.join("figure3.pdf"), dir.join("figure3 2.pdf")]);
        assert_eq!(target(&dir.join("figure3.smi"), None, "pdf", true, &written), dir.join("figure3 3.pdf"));
        // --out: there, not beside the input.
        assert_eq!(target(&input, Some(&dir.join("out")), "pdf", false, &none), dir.join("out/figure3.pdf"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn folders_give_the_files_octet_reads() {
        let dir = std::env::temp_dir().join(format!("octet-convert-walk-{}", std::process::id()));
        fs::create_dir_all(dir.join("inner")).unwrap();
        for f in ["b.cdxml", "a.oct", "notes.txt", "c.MOL", "e.rdf", "f.cml", "g.ket", "inner/d.cdx"] {
            fs::write(dir.join(f), "x").unwrap();
        }
        // A named pipe, in the folder and named: never read (it would never end).
        #[cfg(unix)]
        assert!(std::process::Command::new("mkfifo").arg(dir.join("pipe.cdxml")).status().unwrap().success());
        let mut inputs = vec![dir.clone(), dir.join("gone.cdxml")];
        if cfg!(unix) {
            inputs.push(dir.join("pipe.cdxml"));
        }
        let job = |recursive| Job { inputs: inputs.clone(), recursive, ..Default::default() };
        let (found, wrong) = files(&job(false));
        assert_eq!(found, ["a.oct", "b.cdxml", "c.MOL", "e.rdf", "f.cml", "g.ket"].map(|f| dir.join(f)));
        assert_eq!(wrong[0], (dir.join("gone.cdxml"), "There is no such file or folder.".to_string()));
        if cfg!(unix) {
            assert_eq!(wrong[1], (dir.join("pipe.cdxml"), "This is not a file.".to_string()));
        }
        assert!(reads_drawing(Path::new("a.CDXML")) && reads_drawing(Path::new("b.oct")) && !reads_drawing(Path::new("notes.txt")) && !reads_drawing(Path::new("c.mol")));
        assert_eq!(files(&job(true)).0, ["a.oct", "b.cdxml", "c.MOL", "e.rdf", "f.cml", "g.ket", "inner/d.cdx"].map(|f| dir.join(f)));
        fs::remove_dir_all(&dir).unwrap();
    }
}
