// Stress cases for the Office object's EMF (issue 166, make_office_emf). src/wordpaste-stress.check.ts lists every case
// and names the test here that runs it. Each EMF is read back by a reader of its own, written from MS-EMF and
// MS-EMFPLUS apart from the plus tests' reader (plus_ops), so a misreading the writer and that reader share shows up.
// Drawings: the plus tests' own, Octet 1.1.2's starters as the page exported them, a messy page of 200 structures,
// text, dashes, photos, and hostile SVGs. OCTET_STRESS_SVGS=<folder> adds every .svg in that folder (pictures
// exported from the dev server) to the cases that take any drawing.
// The tests with "ole" in their names need Windows (GDI+ draws each drawing), and run in the Office objects job.

use super::*;
use std::panic::{catch_unwind, AssertUnwindSafe};

// GDI+'s own largest EMF+ record: it writes larger objects as continued records (MS-EMFPLUS 2.3.5.1) of this size.
pub(super) const GDIPLUS_LARGEST_RECORD: usize = 65_020;

// ---- An EMF and EMF+ reader of its own --------------------------------------------------------------------------

#[derive(Default, Debug)]
pub(super) struct Facts {
    pub plus_records: usize,
    pub comments: usize,
    pub largest_record: usize, // the largest EMF+ record, bytes
    pub paths: usize,
    pub winding_paths: usize,
    pub single_point_figures: usize,
    pub strings: Vec<Vec<u16>>, // each DrawDriverString's characters
    pub pens: Vec<Vec<f32>>,              // each pen's dashes, in widths (empty: solid)
    pub get_dc: usize,
    pub ink: Option<[f32; 4]>, // the box of every EMF+ point, px
    pub frame_px: (f32, f32),  // the frame's size at the header's dpi
}

fn rd16(b: &[u8], k: usize) -> Result<u16, String> {
    b.get(k..k + 2).map(|s| u16::from_le_bytes([s[0], s[1]])).ok_or_else(|| format!("2 bytes at {k} past the end ({})", b.len()))
}
fn rd32(b: &[u8], k: usize) -> Result<u32, String> {
    b.get(k..k + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]])).ok_or_else(|| format!("4 bytes at {k} past the end ({})", b.len()))
}
fn rdf(b: &[u8], k: usize) -> Result<f32, String> {
    let v = f32::from_bits(rd32(b, k)?);
    if v.is_finite() { Ok(v) } else { Err(format!("the float at {k} is {v}")) }
}
fn grow(ink: &mut Option<[f32; 4]>, x: f32, y: f32) {
    *ink = Some(ink.map_or([x, y, x, y], |b| [b[0].min(x), b[1].min(y), b[2].max(x), b[3].max(y)]));
}
fn need(ok: bool, what: impl FnOnce() -> String) -> Result<(), String> {
    if ok { Ok(()) } else { Err(what()) }
}
fn version(b: &[u8], k: usize) -> Result<(), String> {
    let v = rd32(b, k)?;
    need(v >> 12 == 0xDBC01, || format!("EmfPlusGraphicsVersion {v:#x} at {k}"))
}

// Reads `emf` by MS-EMF, and its EMF+ records by MS-EMFPLUS. `plus`: whether it must hold EMF+ records.
pub(super) fn read_emf(emf: &[u8], plus: bool) -> Result<Facts, String> {
    let mut f = Facts::default();
    // EMR_HEADER: type 1, its size, bounds, frame, " EMF", version 1.0, the totals, handles, the reference device.
    need(emf.len() >= 108, || "shorter than a header".into())?;
    need(rd32(emf, 0)? == 1 && rd32(emf, 4)? as usize >= 88 && rd32(emf, 4)? % 4 == 0, || "no EMR_HEADER".into())?;
    need(&emf[40..44] == b" EMF" && rd32(emf, 44)? == 0x10000, || "no signature or version".into())?;
    let frame = [24, 28, 32, 36].map(|k| rd32(emf, k).unwrap_or(0) as i32);
    need(frame[2] > frame[0] && frame[3] > frame[1], || format!("frame {frame:?}"))?;
    let device = (rd32(emf, 72)? as f32, rd32(emf, 76)? as f32);
    let mm = (rd32(emf, 80)? as f32, rd32(emf, 84)? as f32);
    need(device.0 > 0.0 && device.1 > 0.0 && mm.0 > 0.0 && mm.1 > 0.0, || "reference device".into())?;
    need(rd16(emf, 56)? >= 1, || "nHandles".into())?;
    // Every record: whole 4-byte words, inside the file; EMR_EOF last, of 20 bytes.
    let mut records = Vec::new();
    let mut at = 0;
    while at < emf.len() {
        let (kind, size) = (rd32(emf, at)?, rd32(emf, at + 4)? as usize);
        need(size >= 8 && size % 4 == 0 && at + size <= emf.len(), || format!("record {kind} of {size} bytes at {at}"))?;
        need(records.last().is_none_or(|(k, _, _)| *k != 14), || "a record after EMR_EOF".into())?;
        records.push((kind, at, size));
        at += size;
    }
    need(rd32(emf, 48)? as usize == emf.len() && rd32(emf, 52)? as usize == records.len(), || "the header's totals".into())?;
    let last = records.last().copied().unwrap();
    need(last.0 == 14 && last.2 == 20 && rd32(emf, last.1 + 16)? == 20, || "EMR_EOF".into())?;
    // The EMF+ comments, and the GDI records between a GetDC and the next comment.
    let is_plus = |r: &(u32, usize, usize)| r.0 == 70 && r.2 >= 16 && emf.get(r.1 + 12..r.1 + 16) == Some(&b"EMF+"[..]);
    let mut objects: [Option<u16>; 64] = [None; 64];
    let (mut header, mut ended, mut in_dc, mut saved) = (false, false, false, 0i32);
    let dpi = 96.0;
    for (i, r) in records.iter().enumerate() {
        if !is_plus(r) {
            if r.0 == 70 {
                need(rd32(emf, r.1 + 8)? as usize <= r.2 - 12, || "a comment longer than its record".into())?;
            }
            if in_dc {
                saved += match r.0 {
                    33 => 1,
                    34 => -1,
                    _ => 0,
                };
                need(saved >= 0, || "EMR_RESTOREDC with no EMR_SAVEDC".into())?;
            }
            continue;
        }
        if in_dc {
            need(saved == 0, || format!("a GetDC section ends with {saved} saves open"))?;
            in_dc = false;
        }
        f.comments += 1;
        need(i == 1 || header, || "an EMF+ comment before the EMF+ header".into())?;
        let (_, at, size) = *r;
        need(rd32(emf, at + 8)? as usize == size - 12, || "the EMF+ comment's DataSize".into())?;
        let data = &emf[at + 16..at + size];
        let mut k = 0;
        while k < data.len() {
            need(!ended, || "a record after EmfPlusEndOfFile".into())?;
            let (kind, flags, rsize, dsize) = (rd16(data, k)?, rd16(data, k + 2)?, rd32(data, k + 4)? as usize, rd32(data, k + 8)? as usize);
            need(rsize >= 12 && rsize % 4 == 0 && k + rsize <= data.len() && dsize + 12 == rsize, || format!("EMF+ record {kind:#x}: Size {rsize}, DataSize {dsize}, {} left", data.len() - k))?;
            f.plus_records += 1;
            f.largest_record = f.largest_record.max(rsize);
            let d = &data[k + 12..k + rsize];
            need(header || kind == 0x4001, || format!("record {kind:#x} before the EMF+ header"))?;
            match kind {
                0x4001 => {
                    need(!header && i == 1 && k == 0, || "the EMF+ header is not first, or not alone".into())?;
                    need(flags & !1 == 0 && dsize == 16, || "EmfPlusHeader's flags or size".into())?;
                    version(d, 0)?;
                    need(rd32(d, 4)? <= 1 && rd32(d, 8)? > 0 && rd32(d, 12)? > 0, || "EmfPlusHeader's flags or dpi".into())?;
                    need(rd32(d, 8)? == 96 && rd32(d, 12)? == 96, || "EmfPlusHeader's dpi is not the reference device's".into())?;
                    header = true;
                }
                0x4002 => {
                    need(flags == 0 && dsize == 0 && i == records.len() - 2 && k + rsize == data.len(), || "EmfPlusEndOfFile is not the last record before EMR_EOF".into())?;
                    ended = true;
                }
                0x4004 => {
                    need(flags == 0 && dsize == 0, || "EmfPlusGetDC".into())?;
                    need(k + rsize == data.len(), || "GDI records follow a GetDC only after its comment".into())?;
                    f.get_dc += 1;
                    in_dc = true;
                }
                0x401E => need(dsize == 0 && flags >> 8 == 0 && (flags >> 1) & 0x7F <= 5, || format!("SetAntiAliasMode {flags:#x}"))?,
                0x401F => need(dsize == 0 && flags <= 5, || format!("SetTextRenderingHint {flags:#x}"))?,
                0x4021 => need(dsize == 0 && flags <= 7, || format!("SetInterpolationMode {flags:#x}"))?,
                0x4022 => need(dsize == 0 && flags <= 4, || format!("SetPixelOffsetMode {flags:#x}"))?,
                0x4030 => {
                    need(dsize == 4 && (1..=6).contains(&flags) && rdf(d, 0)? > 0.0, || "SetPageTransform".into())?;
                    need(flags == 2 && rdf(d, 0)? == 1.0, || "the page is not px at scale 1".into())?;
                }
                0x4008 => {
                    let (id, ty) = (usize::from(flags & 0xFF), (flags >> 8) & 0x7F);
                    need(id < 64 && flags & 0x8000 == 0, || format!("object flags {flags:#x}"))?;
                    version(d, 0)?;
                    match ty {
                        3 => {
                            let n = rd32(d, 4)? as usize;
                            let pf = rd32(d, 8)?;
                            need(n >= 1 && pf & 0x4800 == 0, || format!("a path of {n} points, flags {pf:#x} (R 0x800, C 0x4000)"))?;
                            need(pf & !0x2000 == 0, || format!("path flags {pf:#x}"))?;
                            need(dsize == (12 + 9 * n).next_multiple_of(4), || "the path's size".into())?;
                            f.paths += 1;
                            f.winding_paths += usize::from(pf & 0x2000 != 0);
                            let types = &d[12 + 8 * n..12 + 9 * n];
                            let mut figure_len = 0usize;
                            let mut run = 0; // Bézier points since the last other point
                            for (j, t) in types.iter().enumerate() {
                                let (base, flag) = (t & 0x0F, t & 0xF0);
                                need(matches!(base, 0 | 1 | 3) && flag & !0x80 == 0, || format!("point type {t:#x}"))?;
                                need(j > 0 || base == 0, || "a path starts with a start point".into())?;
                                let (x, y) = (rdf(d, 12 + 8 * j)?, rdf(d, 16 + 8 * j)?);
                                need(x.abs() < 1e9 && y.abs() < 1e9, || format!("point ({x}, {y})"))?;
                                if base == 0 {
                                    need(run % 3 == 0, || "Bézier points not in threes".into())?;
                                    if j > 0 && figure_len == 1 {
                                        f.single_point_figures += 1;
                                    }
                                    figure_len = 0;
                                    run = 0;
                                }
                                figure_len += 1;
                                run = if base == 3 { run + 1 } else if run % 3 == 0 { 0 } else { return Err("a line inside a Bézier".into()) };
                                // The ink: every point but a Bézier's control points.
                                if base != 3 || run % 3 == 0 {
                                    grow(&mut f.ink, x, y);
                                }
                                if flag & 0x80 != 0 {
                                    need(types.get(j + 1).is_none_or(|u| u & 0x0F == 0), || "a point after a figure's close that does not start one".into())?;
                                }
                            }
                            need(run % 3 == 0, || "Bézier points not in threes at the end".into())?;
                            if figure_len == 1 {
                                f.single_point_figures += 1;
                            }
                        }
                        2 => {
                            need(rd32(d, 4)? == 0, || "a pen's type".into())?;
                            let pf = rd32(d, 8)?;
                            need(pf & !0x1FFF == 0 && rd32(d, 12)? <= 6, || format!("pen flags {pf:#x}"))?;
                            need(rdf(d, 16)? > 0.0, || "a pen's width".into())?;
                            let mut j = 20;
                            if pf & 1 != 0 {
                                j += 24;
                            }
                            for (bit, ok) in [(0x02u32, &[0u32, 1, 2, 3][..]), (0x04, &[0, 1, 2, 3]), (0x08, &[0, 1, 2, 3])] {
                                if pf & bit != 0 {
                                    let v = rd32(d, j)?;
                                    need(ok.contains(&v), || format!("pen field {bit:#x} is {v}"))?;
                                    j += 4;
                                }
                            }
                            if pf & 0x10 != 0 {
                                need(rdf(d, j)? >= 1.0, || "a miter limit under 1".into())?;
                                j += 4;
                            }
                            let style = if pf & 0x20 != 0 {
                                let s = rd32(d, j)?;
                                j += 4;
                                need(s <= 5, || format!("line style {s}"))?;
                                Some(s)
                            } else {
                                None
                            };
                            if pf & 0x40 != 0 {
                                need([0, 2, 3].contains(&rd32(d, j)?), || "dash cap".into())?;
                                j += 4;
                            }
                            if pf & 0x80 != 0 {
                                rdf(d, j)?;
                                j += 4;
                            }
                            let mut dashes = Vec::new();
                            if pf & 0x100 != 0 {
                                need(style.is_none_or(|s| s == 5), || "dashes with a line style that is not custom".into())?;
                                let n = rd32(d, j)? as usize;
                                need((1..=4096).contains(&n), || format!("{n} dashes"))?;
                                for q in 0..n {
                                    let v = rdf(d, j + 4 + 4 * q)?;
                                    need(v > 0.0, || format!("dash {q} is {v}"))?;
                                    dashes.push(v);
                                }
                                j += 4 + 4 * n;
                            }
                            need(pf & 0x1E00 == 0, || "alignment, compound or custom caps".into())?;
                            // The brush: solid, opaque.
                            version(d, j)?;
                            need(rd32(d, j + 4)? == 0 && rd32(d, j + 8)? >> 24 == 0xFF && j + 12 == d.len(), || "a pen's brush".into())?;
                            f.pens.push(dashes);
                        }
                        6 => {
                            need(rdf(d, 4)? > 0.0 && (2..=6).contains(&rd32(d, 8)?) && rd32(d, 12)? <= 0xF && rd32(d, 16)? == 0, || "a font's size, unit or style".into())?;
                            let n = rd32(d, 20)? as usize;
                            need((1..=31).contains(&n) && dsize == (24 + 2 * n).next_multiple_of(4), || format!("a face of {n} characters"))?;
                            let face: Vec<u16> = (0..n).map(|q| rd16(d, 24 + 2 * q)).collect::<Result<_, _>>()?;
                            need(!face.contains(&0), || "a NUL in the face".into())?;
                        }
                        _ => return Err(format!("object type {ty}")),
                    }
                    objects[id] = Some(ty);
                }
                0x4014 | 0x4015 => {
                    need(objects[usize::from(flags & 0xFF)] == Some(3), || format!("record {kind:#x} with no path {}", flags & 0xFF))?;
                    need(dsize == 4, || "a fill or draw's size".into())?;
                    if kind == 0x4014 {
                        need(flags & 0x7F00 == 0, || "FillPath flags".into())?;
                        if flags & 0x8000 != 0 {
                            need(rd32(d, 0)? >> 24 == 0xFF, || "a fill that is not opaque".into())?;
                        } else {
                            need(objects.get(rd32(d, 0)? as usize).copied().flatten() == Some(1), || "a fill with no brush".into())?;
                        }
                    } else {
                        need(flags & 0xFF00 == 0 && objects.get(rd32(d, 0)? as usize).copied().flatten() == Some(2), || "DrawPath with no pen".into())?;
                    }
                }
                0x4036 => {
                    need(objects[usize::from(flags & 0xFF)] == Some(6) && flags & 0x7F00 == 0, || "DrawDriverString with no font".into())?;
                    let (options, matrix, n) = (rd32(d, 4)?, rd32(d, 8)?, rd32(d, 12)? as usize);
                    need(options <= 0xF && matrix <= 1 && n >= 1, || "DrawDriverString's options".into())?;
                    need(dsize == 16 + 10 * n + 24 * matrix as usize, || format!("DrawDriverString of {n} glyphs is {dsize} bytes"))?;
                    if flags & 0x8000 != 0 {
                        need(rd32(d, 0)? >> 24 == 0xFF, || "text that is not opaque".into())?;
                    }
                    let chars: Vec<u16> = (0..n).map(|q| rd16(d, 16 + 2 * q)).collect::<Result<_, _>>()?;
                    need(!chars.contains(&0), || "a NUL glyph".into())?;
                    for q in 0..n {
                        let (x, y) = (rdf(d, 16 + 2 * n + 8 * q)?, rdf(d, 20 + 2 * n + 8 * q)?);
                        // The ink: each character's origin, but a space at the end (which pads an odd run).
                        if q + 1 < n || chars[q] != 0x20 {
                            grow(&mut f.ink, x, y);
                        }
                    }
                    f.strings.push(chars);
                }
                _ => return Err(format!("EMF+ record {kind:#x}, which Octet does not write")),
            }
            k += rsize;
        }
    }
    need(!in_dc || saved == 0, || "the last GetDC section leaves saves open".into())?;
    need(header == plus && ended == plus, || format!("EMF+ header {header}, end {ended}; expected {plus}"))?;
    f.frame_px = ((frame[2] - frame[0]) as f32 / 2540.0 * dpi, (frame[3] - frame[1]) as f32 / 2540.0 * dpi);
    Ok(f)
}

// ---- Drawings -----------------------------------------------------------------------------------------------

fn page(w: f32, h: f32, body: &str) -> String {
    format!(r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}pt" height="{h}pt" viewBox="0 0 {w} {h}">{body}</svg>"##)
}

// The page's Export pictures of Octet 1.1.2's starter drawings (tests/pictures), and the object window's blank picture
// (Editor.tsx BLANK_SVG).
fn real_drawings() -> Vec<(String, String)> {
    let mut out = vec![
        ("the structure starter".to_string(), include_str!("../tests/pictures/starter-structure.svg").to_string()),
        ("the reaction starter".to_string(), include_str!("../tests/pictures/starter-reaction.svg").to_string()),
        ("the cycle starter".to_string(), include_str!("../tests/pictures/starter-cycle.svg").to_string()),
        ("the blank object".to_string(), r#"<svg xmlns="http://www.w3.org/2000/svg" width="72pt" height="72pt" viewBox="0 0 72 72"></svg>"#.to_string()),
        // A chemist's messy page: 200 structures of 40 bonds, wedges, double bonds and labels.
        ("200 structures".to_string(), octet_drawing(200, 40, 12, 10)),
    ];
    if let Ok(dir) = std::env::var("OCTET_STRESS_SVGS") {
        let mut files: Vec<_> = std::fs::read_dir(&dir).map(|d| d.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "svg")).collect()).unwrap_or_default();
        files.sort();
        out.extend(files.into_iter().filter_map(|p| Some((p.file_name()?.to_string_lossy().into_owned(), std::fs::read_to_string(&p).ok()?))));
    }
    out
}

// Text: runs of 1 to 9 characters in each face Octet writes as text, every weight, italic, letter spacing and
// anchors; and text that must be outlines in both streams. Each face list ends as the page's does (sans-serif), so
// Linux CI, which has no Arial or Verdana, draws Liberation Sans, not nothing. Zapfino is the Mac's face Windows
// lacks, DejaVu Sans Linux's.
fn text_drawings() -> Vec<(String, String)> {
    let mut out = Vec::new();
    let faces = ["Arial", "Helvetica", "Times New Roman", "Times", "Courier New", "Courier", "Verdana", "Georgia", "Tahoma", "Trebuchet MS"];
    for face in faces {
        let mut body = String::new();
        for n in 1..=9 {
            let s: String = "CH3OHNaCl".chars().take(n).collect();
            body += &format!(r#"<text x="5" y="{}" font-family="{face}, sans-serif" font-size="10">{s}</text>"#, 12 * n);
        }
        out.push((format!("runs of 1 to 9 characters in {face}"), page(80.0, 120.0, &body)));
    }
    let mut body = String::new();
    for (i, w) in (100..=900).step_by(100).enumerate() {
        body += &format!(r#"<text x="{}" y="20" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="{w}">N</text><text x="{}" y="40" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="{w}" font-style="italic">Cl</text>"#, 5 + 15 * i, 5 + 15 * i);
    }
    out.push(("weights 100 to 900, upright and italic".into(), page(150.0, 50.0, &body)));
    out.push(("letter spacing, anchors, a space-only run and spaces inside".into(), page(120.0, 80.0, r#"<text x="5" y="15" font-family="Arial, Helvetica, sans-serif" font-size="10" letter-spacing="2">CO2Me</text><text x="60" y="35" font-family="Arial, Helvetica, sans-serif" font-size="10" text-anchor="middle">NHBoc</text><text x="115" y="55" font-family="Arial, Helvetica, sans-serif" font-size="10" text-anchor="end">OTBS</text><text x="5" y="75" font-family="Arial, Helvetica, sans-serif" font-size="10" xml:space="preserve">Ph   Me</text><text x="80" y="75" font-family="Arial, Helvetica, sans-serif" font-size="10" xml:space="preserve">   </text>"#)));
    out.push(("tiny and huge labels".into(), page(400.0, 300.0, r#"<text x="5" y="5" font-family="Arial, Helvetica, sans-serif" font-size="0.05">O</text><text x="5" y="290" font-family="Arial, Helvetica, sans-serif" font-size="280">N</text>"#)));
    out.push(("a 2,000-character caption".into(), page(12000.0, 20.0, &format!(r#"<text x="5" y="15" font-family="Arial, Helvetica, sans-serif" font-size="10">{}</text>"#, "Reflux in toluene, then ".repeat(84)))));
    // Outlines in both streams: emoji, Hebrew, Arabic, CJK, a combining accent, underline, a face Windows lacks, a
    // control character, a character outside the Basic Multilingual Plane, turned 90 degrees.
    for (name, text, extra) in [
        ("an emoji", "😀", "Arial, Helvetica, sans-serif"),
        ("Chinese", "化学", "Arial, Helvetica, sans-serif"),
        ("a combining accent", "e\u{301}", "Arial, Helvetica, sans-serif"),
        ("underlined", "NH2", "Arial, Helvetica, sans-serif\" text-decoration=\"underline"),
        ("a face Windows lacks", "OMe", "Zapfino, DejaVu Sans"),
        ("a mathematical letter", "𝑥", "Arial, Helvetica, sans-serif"),
        ("turned 90 degrees", "OH", "Arial, Helvetica, sans-serif\" transform=\"rotate(90 20 20)"),
    ] {
        out.push((format!("outlined text: {name}"), page(80.0, 40.0, &format!(r#"<text x="10" y="25" font-family="{extra}" font-size="10">{text}</text>"#))));
    }
    out
}

// Right-to-left text: Hebrew and Arabic captions, and a Hebrew letter after Latin ones.
fn right_to_left() -> Vec<(String, String, bool)> {
    [("Hebrew", "שלום"), ("Arabic", "مرحبا"), ("Arabic with Latin", "Compound مرحبا"), ("a Hebrew letter after Latin", "Ring א")]
        .into_iter()
        .map(|(name, text)| (format!("right to left: {name}"), page(120.0, 40.0, &format!(r#"<text x="10" y="25" font-family="Arial, Helvetica, sans-serif" font-size="10">{text}</text>"#)), false))
        .collect()
}

// Strokes and dashes: odd dash lists, a negative offset, a long list, dashes thinner than 1/20 pt, square caps with
// gaps under a width, dashes on curves, and every cap and join.
fn stroke_drawings() -> Vec<(String, String)> {
    let mut out = Vec::new();
    let line = |y: i32, extra: &str| format!(r##"<path d="M10 {y}C40 {} 70 {} 110 {y}" fill="none" stroke="#000"{extra}/>"##, y - 8, y + 8);
    let cases = [
        ("an odd dash list", r#" stroke-width="1" stroke-dasharray="3""#),
        ("three dashes", r#" stroke-width="1" stroke-dasharray="3 1 0.5""#),
        ("a negative offset", r#" stroke-width="1" stroke-dasharray="4 2" stroke-dashoffset="-3""#),
        ("a long dash list", r#" stroke-width="0.5" stroke-dasharray="1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20""#),
        ("dashes thinner than 1/20 pt", r#" stroke-width="1" stroke-dasharray="0.001 0.002""#),
        ("square caps, gaps under a width", r#" stroke-width="3" stroke-dasharray="1 1" stroke-linecap="square""#),
        ("round dots", r#" stroke-width="2" stroke-dasharray="0 3" stroke-linecap="round""#),
        ("a hairline of 0.01 pt", r#" stroke-width="0.01""#),
        ("a 30 pt line with a miter limit of 1", r#" stroke-width="30" stroke-linejoin="miter" stroke-miterlimit="1""#),
        ("an offset of a million", r#" stroke-width="1" stroke-dasharray="2 2" stroke-dashoffset="1000000""#),
    ];
    for (i, (name, extra)) in cases.iter().enumerate() {
        out.push((name.to_string(), page(120.0, 60.0, &line(20 + i as i32 % 3, extra))));
    }
    out.push(("a zero-length line with round caps (a dot)".into(), page(40.0, 40.0, r##"<path d="M20 20L20 20" stroke="#000" stroke-width="4" stroke-linecap="round"/>"##)));
    out.push(("a closed one-point path".into(), page(40.0, 40.0, r##"<path d="M20 20Z" fill="#000" stroke="#000" stroke-width="1"/>"##)));
    out.push(("an arc, a quadratic and a rectangle with rounded corners".into(), page(120.0, 80.0, r##"<path d="M10 40A20 20 0 1 1 50 40Q70 10 90 40" fill="none" stroke="#C00" stroke-width="1.5"/><rect x="60" y="45" width="50" height="30" rx="8" fill="#FFD400" stroke="#000"/>"##)));
    out.push(("a gradient, a pattern, a clip path and a group at 0 opacity".into(), page(120.0, 60.0, r##"<defs><linearGradient id="g"><stop offset="0" stop-color="#F00"/><stop offset="1" stop-color="#00F"/></linearGradient><pattern id="p" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0h2v2h-2z"/></pattern><clipPath id="c"><rect x="0" y="0" width="30" height="30"/></clipPath></defs><rect x="5" y="5" width="30" height="30" fill="url(#g)"/><rect x="40" y="5" width="30" height="30" fill="url(#p)"/><g clip-path="url(#c)"><circle cx="30" cy="30" r="20" fill="#080"/></g><g opacity="0"><rect x="80" y="5" width="30" height="30" fill="#000"/></g>"##)));
    out
}

// Photos: two of them, one first and one last, one at half opacity, one under a label, one turned.
fn photo_cases() -> Vec<(String, String)> {
    let photo = picture_svg();
    let image = photo[photo.find("<image").unwrap()..photo.rfind("/>").unwrap() + 2].to_string();
    vec![
        ("two photos, first and last".into(), page(72.0, 36.0, &format!(r##"{image}<path d="M1 1H70V2H1Z" fill="#000"/><g transform="translate(36 0)">{image}</g>"##))),
        ("a photo at half opacity under a label".into(), page(72.0, 36.0, &format!(r##"<g opacity="0.5">{image}</g><text x="5" y="20" font-family="Arial, Helvetica, sans-serif" font-size="10">OH</text>"##))),
        ("only a photo, turned 45 degrees".into(), page(72.0, 72.0, &format!(r#"<g transform="rotate(45 36 36)">{image}</g>"#))),
    ]
}

// Every drawing a stress case takes, with whether it has a photo.
fn all_drawings() -> Vec<(String, String, bool)> {
    let mut out: Vec<(String, String, bool)> = drawings().into_iter().map(|(n, s)| (n.to_string(), s, false)).collect();
    out.extend(photo_drawings().into_iter().map(|(n, s)| (n.to_string(), s, true)));
    out.extend(real_drawings().into_iter().map(|(n, s)| (n, s, false)));
    out.extend(text_drawings().into_iter().chain(stroke_drawings()).map(|(n, s)| (n, s, false)));
    out.extend(photo_cases().into_iter().map(|(n, s)| (n, s, true)));
    out.extend(right_to_left());
    out
}

// Runs `f` for each drawing and collects every failure, so one case does not hide the rest.
fn each(cases: &[(String, String, bool)], f: impl Fn(&str, &usvg::Tree, bool) -> Result<(), String>) {
    let mut failed = Vec::new();
    for (name, svg, photo) in cases {
        let Ok(tree) = crate::export::tree(svg) else {
            failed.push(format!("{name}: usvg does not read it"));
            continue;
        };
        match catch_unwind(AssertUnwindSafe(|| f(name, &tree, *photo))) {
            Ok(Ok(())) => {}
            Ok(Err(e)) => failed.push(format!("{name}: {e}")),
            Err(p) => failed.push(format!("{name}: panicked: {}", p.downcast_ref::<String>().cloned().or_else(|| p.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default())),
        }
    }
    assert!(failed.is_empty(), "{} of {} drawings fail:\n{}", failed.len(), cases.len(), failed.join("\n"));
}

// ---- The cases ----------------------------------------------------------------------------------------------

// Every drawing's Office EMF reads by MS-EMF and MS-EMFPLUS (this reader), with and without its CDXML, and
// make_emf's has no EMF+ record. Every EMF+ point but a Bézier's control points and a run's last space is within 2 px
// of the frame, and every run has an even number of characters.
#[test]
fn stress_every_office_emf_reads_by_the_specs() {
    each(&all_drawings(), |_, tree, _| {
        for cdxml in [None, Some(X)] {
            let office = make_office_emf(tree, cdxml);
            let f = read_emf(&office, true)?;
            read_emf(&make_emf(tree, cdxml, None), false)?;
            if let Some(b) = f.ink {
                let slack = 2.0;
                need(b[0] >= -slack && b[1] >= -slack && b[2] <= f.frame_px.0 + slack && b[3] <= f.frame_px.1 + slack, || format!("EMF+ ink {b:?} outside the frame {:?}", f.frame_px))?;
            }
            for chars in &f.strings {
                need(chars.len() % 2 == 0, || "an odd run".into())?;
            }
        }
        Ok(())
    });
}

// Both streams draw the same picture (the plus tests' comparison) on the real, messy, text, stroke and photo
// drawings, not only the plus tests' own.
#[test]
fn stress_both_streams_agree_on_every_drawing() {
    each(&all_drawings(), |name, tree, _| {
        same_picture(name, &make_office_emf(tree, Some(X)));
        Ok(())
    });
}

// The GDI records are 1.1.2's (make_emf's to the byte, without the EMF+ comments), the header is make_emf's but for
// its totals, and the size Word gets (the frame, ole::extent) is the same: true size is unchanged.
#[test]
fn stress_gdi_records_header_and_size_are_1_1_2s() {
    each(&all_drawings(), |_, tree, photo| {
        let (plain, office) = (make_emf(tree, Some(X), None), make_office_emf(tree, Some(X)));
        need(photo || without_plus(&office) == plain, || "the GDI records differ from make_emf's".into())?;
        need(office[..48] == plain[..48] && office[56..HEADER] == plain[56..HEADER], || "the header differs".into())?;
        let (a, b) = (crate::ole::extent(&plain), crate::ole::extent(&office));
        need(a == b && a.is_some_and(crate::ole::valid_extent), || format!("extent {a:?} and {b:?}"))
    });
}

// Text: each run Octet writes as text is one DrawDriverString with the same characters (and a space after an odd
// count); text GDI cannot draw is outlines in both streams, with no DrawDriverString and no EXTTEXTOUTW.
#[test]
fn stress_text_runs_and_outlines() {
    let cases: Vec<_> = text_drawings().into_iter().map(|(n, s)| (n, s, false)).collect();
    each(&cases, |name, tree, _| {
        let emf = make_office_emf(tree, None);
        let f = read_emf(&emf, true)?;
        let gdi_runs = emf_records(&emf).iter().filter(|r| r.0 == 84).count();
        need(f.strings.len() == gdi_runs, || format!("{} DrawDriverStrings, {gdi_runs} EXTTEXTOUTW", f.strings.len()))?;
        if name.starts_with("outlined text") {
            need(gdi_runs == 0, || format!("{gdi_runs} runs of text"))?;
        }
        if name.starts_with("runs of 1 to 9") && !name.contains("Times") && !name.contains("Courier") && !name.contains("Helvetica") {
            need(gdi_runs >= 9, || format!("{gdi_runs} runs for 9 labels"))?;
        }
        Ok(())
    });
}

// S3 (S12 before), right to left: Hebrew and Arabic labels, alone and with Latin, are outlines in both streams of
// both EMFs (right_to_left in vector.rs). usvg gives their glyphs in the order they show: GDI's EXTTEXTOUTW would order
// them again, and EMF+'s DrawDriverString (CmapLookup, no shaping) would draw each Arabic letter on its own.
#[test]
fn stress_s12_right_to_left_text_is_outlines() {
    each(&right_to_left(), |_, tree, _| {
        for (which, emf, plus) in [("Export's EMF", make_emf(tree, None, None), false), ("the Office EMF", make_office_emf(tree, None), true)] {
            let texts = emf_records(&emf).iter().filter(|r| r.0 == 84).count();
            let strings: Vec<String> = read_emf(&emf, plus)?.strings.iter().map(|c| String::from_utf16_lossy(c)).collect();
            need(texts == 0 && strings.is_empty(), || format!("{which}: {texts} EXTTEXTOUTW, DrawDriverString {strings:?}"))?;
            need(emf_records(&emf).iter().any(|r| r.0 == 62), || format!("{which}: no outlines"))?;
        }
        Ok(())
    });
}

// Pens: every dash a positive length in widths, no more dashes than GDI's pen, and a solid pen for a solid stroke.
#[test]
fn stress_pens_and_dashes() {
    let cases: Vec<_> = stroke_drawings().into_iter().map(|(n, s)| (n, s, false)).collect();
    each(&cases, |_, tree, _| {
        let emf = make_office_emf(tree, None);
        let f = read_emf(&emf, true)?;
        let gdi_dashes: Vec<usize> = emf_records(&emf).iter().filter(|r| r.0 == 95).map(|r| u32_at(&emf, r.1 + 48) as usize).collect();
        let plus_dashes: Vec<usize> = f.pens.iter().map(Vec::len).collect();
        need(gdi_dashes == plus_dashes, || format!("GDI pens' dashes {gdi_dashes:?}, EMF+ {plus_dashes:?}"))
    });
}

// Photos: each one is a GetDC section that saves and restores the DC, and its pixels go in once (under 1 KB more
// each). The plus tests check that GDI plays the same pixels.
#[test]
fn stress_photos_are_getdc_sections() {
    let cases: Vec<_> = photo_cases().into_iter().map(|(n, s)| (n, s, true)).collect();
    each(&cases, |_, tree, _| {
        let (plain, office) = (make_emf(tree, Some(X), None), make_office_emf(tree, Some(X)));
        let f = read_emf(&office, true)?;
        let pictures = emf_records(&office).iter().filter(|r| r.0 == 81).count();
        need(f.get_dc == pictures && pictures > 0, || format!("{} GetDC for {pictures} pictures", f.get_dc))?;
        need(office.len() - plain.len() < 1024 * pictures, || format!("{} bytes more for {pictures} pictures", office.len() - plain.len()))
    });
}

// The paste reader (1.1.2's, unchanged) on a damaged Office EMF: every truncation, 6,000 bytes changed one at a
// time, and every record's size and the comments' sizes set to 0, odd, huge and past the end. It never panics,
// takes no more than a moment, and gives the CDXML only when the CDXML comment is whole.
#[test]
fn stress_paste_reads_damaged_office_emfs_safely() {
    let x = "<CDXML><page><fragment><n id=\"1\" p=\"1 2\"/></fragment></page></CDXML>";
    let emf = make_office_emf(&crate::export::tree(PROLINE).unwrap(), Some(x));
    let records = emf_records(&emf);
    let cdxml_at = records[2];
    let start = std::time::Instant::now();
    let read = |b: &[u8]| -> Option<String> {
        let _ = crate::ole::extent(b);
        crate::export::cdxml_from_picture(b)
    };
    for cut in 0..emf.len() {
        let got = read(&emf[..cut]);
        assert!(got.is_none() || cut >= cdxml_at.1 + cdxml_at.2, "a cut at {cut} gives {got:?}");
    }
    let mut seed = 0x9E37_79B9_7F4A_7C15u64;
    let mut next = || {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed
    };
    for _ in 0..6_000 {
        let mut b = emf.clone();
        let k = (next() % b.len() as u64) as usize;
        b[k] = next() as u8;
        let got = read(&b);
        if !(cdxml_at.1..cdxml_at.1 + cdxml_at.2).contains(&k) && k >= 8 {
            // A change outside the CDXML comment (and past the header's type and size) still gives the CDXML or
            // nothing, never other text.
            assert!(got.is_none() || got.as_deref() == Some(x), "byte {k}: {got:?}");
        }
    }
    for r in &records {
        for at in [r.1 + 4, r.1 + 8] {
            for v in [0u32, 1, 3, 0x7FFF_FFFF, u32::MAX, emf.len() as u32, (emf.len() - r.1) as u32 + 4] {
                let mut b = emf.clone();
                if at + 4 <= b.len() {
                    b[at..at + 4].copy_from_slice(&v.to_le_bytes());
                    let _ = read(&b);
                }
            }
        }
    }
    assert!(start.elapsed() < std::time::Duration::from_secs(20), "the damaged EMFs took {:?}", start.elapsed());
}

// The CDXML comment after the EMF+ header: every padding (lengths 1 to 8 over a whole word), UTF-8 of 1 to 4 bytes,
// "EMF+" and the comment's own tag inside the CDXML, and a CDXML of 6 MB. Paste reads each back exactly, the EMF+
// header stays the second record, and the CDXML comment the third.
#[test]
fn stress_cdxml_comment_round_trips() {
    let tree = crate::export::tree(PROLINE).unwrap();
    let mut texts: Vec<String> = (0..8).map(|n| format!("<CDXML>{}</CDXML>", "a".repeat(n))).collect();
    texts.push("<CDXML><t>Ç é ü — 化学 😀 EMF+ Octet CDXML\0 </t></CDXML>".into());
    texts.push(format!("<CDXML>{}</CDXML>", "<n id=\"1\" p=\"1.5 2.5\"/>".repeat(8 << 20 >> 5)));
    for x in &texts {
        let emf = make_office_emf(&tree, Some(x));
        read_emf(&emf, true).unwrap();
        let records = emf_records(&emf);
        assert!(is_plus(&emf, &records[1]) && records[2].0 == 70, "{} bytes of CDXML: the records' order", x.len());
        assert_eq!(cdxml_from_emf(&emf).as_deref(), Some(x.as_str()), "{} bytes of CDXML", x.len());
    }
}

// The same drawing gives the same bytes on 16 threads at once, each reading its SVG again (Ctrl+C held down, two
// windows copying, Undo and Update in an object window).
#[test]
fn stress_same_bytes_on_many_threads() {
    let svgs = [PROLINE.to_string(), picture_svg(), octet_drawing(20, 40, 12, 10), include_str!("../tests/pictures/starter-reaction.svg").to_string()];
    let first: Vec<Vec<u8>> = svgs.iter().map(|s| make_office_emf(&crate::export::tree(s).unwrap(), Some(X))).collect();
    std::thread::scope(|t| {
        let runs: Vec<_> = (0..16).map(|k| t.spawn({
            let (svgs, first) = (&svgs, &first);
            move || {
                for i in 0..8 {
                    let j = (k + i) % svgs.len();
                    assert!(make_office_emf(&crate::export::tree(&svgs[j]).unwrap(), Some(X)) == first[j], "thread {k}, drawing {j} differs");
                }
            }
        })).collect();
        for r in runs {
            r.join().unwrap();
        }
    });
}

// Hostile and odd pictures: each is read (or refused) by usvg, then its Office EMF is made on a thread with the
// copy's stack (2 MB, as std::thread gives the copy's EMF thread), within 10 s, with no panic, and it reads by the
// specs. A refused picture is fine; a panic or a bad EMF is not. Nesting: on a 2 MB stack usvg's reader runs out
// before the EMF writers do (a debug build: usvg at under 500 groups, make_emf and make_office_emf between 500 and
// 1,000), so the copy's EMF thread is never the first to; 200 groups is as deep as a debug build reads.
#[test]
fn stress_hostile_pictures() {
    let deep = |n: usize| page(40.0, 40.0, &format!("{}<path d=\"M1 1H30V3H1Z\"/>{}", "<g>".repeat(n), "</g>".repeat(n)));
    let mut long = String::from("M0 0");
    for i in 0..200_000 {
        long += &format!("L{} {}", i % 400, (i / 400) % 300);
    }
    let cases: Vec<(String, String)> = vec![
        ("200 nested groups".into(), deep(200)),
        ("one path of 200,000 points".into(), page(400.0, 300.0, &format!(r##"<path d="{long}" fill="none" stroke="#000" stroke-width="0.2"/>"##))),
        ("a picture 0.01 pt square".into(), page(0.01, 0.01, r#"<path d="M0 0H0.01V0.01Z"/>"#)),
        ("a picture 10 km wide".into(), page(2.83e7, 10.0, r#"<path d="M0 0H2.83e7V5H0Z"/>"#)),
        ("a scale of 1e-30".into(), page(40.0, 40.0, r#"<g transform="scale(1e-30)"><path d="M0 0H30V30Z"/></g>"#)),
        ("a stroke 1e-6 pt wide with dashes of 1e-7".into(), page(40.0, 40.0, r##"<path d="M0 0H40" stroke="#000" stroke-width="0.000001" stroke-dasharray="0.0000001 0.0000001"/>"##)),
        ("text with a NUL-like control".into(), page(40.0, 40.0, r#"<text x="5" y="20" font-family="Arial, Helvetica, sans-serif" font-size="10">A&#x1;B</text>"#)),
        ("text with U+FFFF".into(), page(40.0, 40.0, "<text x=\"5\" y=\"20\" font-family=\"Arial, Helvetica, sans-serif\" font-size=\"10\">A\u{FFFF}B</text>")),
        ("an image that is not a picture".into(), page(40.0, 40.0, r#"<image width="10" height="10" href="data:image/png;base64,AAAA"/>"#)),
        ("an image 1 px by 1 px".into(), page(40.0, 40.0, r#"<image width="30" height="30" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=="/>"#)),
        ("10,000 one-letter labels".into(), page(1000.0, 1000.0, &(0..10_000).map(|i| format!(r#"<text x="{}" y="{}" font-family="Arial, Helvetica, sans-serif" font-size="8">{}</text>"#, (i % 100) * 10, 10 + (i / 100) * 10, ["O", "N", "S", "P"][i % 4])).collect::<String>())),
    ];
    let mut failed = Vec::new();
    for (name, svg) in &cases {
        let Ok(tree) = crate::export::tree(svg) else { continue };
        let start = std::time::Instant::now();
        let made = std::thread::scope(|t| std::thread::Builder::new().spawn_scoped(t, || catch_unwind(AssertUnwindSafe(|| make_office_emf(&tree, Some(X))))).unwrap().join());
        let took = start.elapsed();
        match made {
            Ok(Ok(emf)) => {
                // A fault make_emf (1.1.2's EMF) has too is not this item's: it is printed, not failed.
                match (read_emf(&emf, true), read_emf(&make_emf(&tree, Some(X), None), false)) {
                    (Err(e), Ok(_)) => failed.push(format!("{name}: {e}")),
                    (Err(e), Err(was)) => eprintln!("{name}: {e} (make_emf: {was})"),
                    _ => {}
                }
                if took > std::time::Duration::from_secs(10) {
                    failed.push(format!("{name}: {took:?}"));
                }
            }
            _ => failed.push(format!("{name}: make_office_emf panicked")),
        }
    }
    assert!(failed.is_empty(), "{}", failed.join("\n"));
}

// A messy page of 200 structures, and a 500-residue peptide: the Office EMF is at most 3 times make_emf's, and its
// largest EMF+ record. GDI+ itself never writes a record over 65,020 bytes (it continues an object over records of
// that size); the page of 200 structures stays under it. It prints the sizes.
#[test]
fn stress_large_drawings_sizes() {
    for (name, svg, under) in [("200 structures", octet_drawing(200, 40, 12, 10), true), ("a 500-residue peptide", octet_drawing(1, 3_500, 1_500, 70), false)] {
        let tree = crate::export::tree(&svg).unwrap();
        let (plain, office) = (make_emf(&tree, Some(X), None), make_office_emf(&tree, Some(X)));
        let f = read_emf(&office, true).unwrap();
        eprintln!("{name}: the Office EMF is {} bytes, make_emf's {} ({:.2} times); {} EMF+ records in {} comments, the largest {} bytes; {} paths, {} of them nonzero, {} one-point figures.", office.len(), plain.len(), office.len() as f64 / plain.len() as f64, f.plus_records, f.comments, f.largest_record, f.paths, f.winding_paths, f.single_point_figures);
        assert!(office.len() <= 3 * plain.len(), "{name}");
        if under {
            assert!(f.largest_record <= GDIPLUS_LARGEST_RECORD, "{name}: an EMF+ record of {} bytes", f.largest_record);
        }
    }
}

// How long the Office EMF takes against make_emf for the messy page of 200 structures, and a copy (the EMF on a
// thread beside the bitmap) against 1.1.2's (the EMF, then the bitmap). Release only; the middle of 9 runs in turn:
// cargo test --release --bin octet stress_copy_time -- --ignored --nocapture
#[test]
#[ignore]
fn stress_copy_time() {
    let svg = octet_drawing(200, 40, 12, 10);
    let tree = crate::export::tree(&svg).unwrap();
    let time = |f: &dyn Fn()| {
        let t = std::time::Instant::now();
        f();
        t.elapsed()
    };
    let mut all: [Vec<std::time::Duration>; 4] = Default::default();
    for _ in 0..9 {
        let steps: [&dyn Fn(); 4] = [
            &|| drop(make_emf(&tree, Some(X), None)),
            &|| drop(make_office_emf(&tree, Some(X))),
            &|| {
                drop(make_emf(&tree, Some(X), None));
                drop(crate::export::clipboard_pixels(&tree, true, 600.0, None).unwrap());
            },
            &|| {
                std::thread::scope(|t| {
                    let e = t.spawn(|| make_office_emf(&tree, Some(X)));
                    drop(crate::export::clipboard_pixels(&tree, true, 600.0, None).unwrap());
                    drop(e.join().unwrap());
                });
            },
        ];
        for (list, step) in all.iter_mut().zip(steps) {
            list.push(time(step));
        }
    }
    let [plain, office, before, now] = all.map(|mut v| {
        v.sort();
        v[4]
    });
    eprintln!("200 structures: make_emf {plain:?}, make_office_emf {office:?}; 1.1.2's copy {before:?}, this copy {now:?}.");
    assert!(cfg!(debug_assertions) || now <= before + before / 10 + std::time::Duration::from_millis(2), "the copy takes {now:?}, 1.1.2's {before:?}");
    assert!(cfg!(debug_assertions) || office <= 2 * plain + std::time::Duration::from_millis(1), "make_office_emf {office:?}, make_emf {plain:?}");
}

// Windows: GDI+ draws every stress drawing with no error, and its ink box is GDI's to within 2 px (as T2), at 2 px a
// pt. Hostile pictures and the 10 km one are left out (no bitmap that size).
#[cfg(windows)]
#[test]
fn ole_stress_gdiplus_draws_every_drawing() {
    use super::windows::*;
    let cases: Vec<_> = all_drawings().into_iter().filter(|(n, ..)| !n.contains("poster") && !n.contains("200 structures")).collect();
    each(&cases, |_, tree, _| {
        let (w, h) = px(tree, 2.0);
        let (plain, office) = (make_emf(tree, Some(X), None), make_office_emf(tree, Some(X)));
        let gdi = draw(&plain, w, h, false);
        let plus = render(&office, w, h, true)?;
        match (gdi.ink(200), plus.ink(200)) {
            (None, None) => Ok(()),
            (Some(a), Some(b)) => need(a.iter().zip(b).all(|(p, q)| (p - q).abs() <= 2), || format!("GDI's ink box {a:?}, GDI+'s {b:?}")),
            (a, b) => Err(format!("GDI's ink box {a:?}, GDI+'s {b:?}")),
        }
    });
}


