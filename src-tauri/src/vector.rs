// Export as EPS and EMF (Windows Enhanced Metafile, the picture Windows Office uses), from the same SVG as the PDF
// (export.rs). Both are vector: every shape is a path, filled or stroked in one colour. Text is drawn as its glyph
// outlines (usvg's flattened text), so the file needs no fonts. Neither format has transparency: a colour drawn at
// part opacity is blended with white, as it shows on white paper, and a gradient (a shaded shape) takes the mean of its
// stops' colours.

use svg2pdf::usvg::{self, tiny_skia_path::{PathSegment, Point, Transform}, Node, Paint};

// One shape: its outline in pt (y down, from the picture's top left), as subpaths of MoveTo, LineTo and cubic CurveTo
// segments, and how it is painted.
enum Seg {
    Move(f32, f32),
    Line(f32, f32),
    Curve(f32, f32, f32, f32, f32, f32),
    Close,
}
struct Stroke {
    rgb: [u8; 3],
    width: f32,       // pt
    cap: u8,          // 0 butt, 1 round, 2 square
    join: u8,         // 0 miter, 1 round, 2 bevel
    dash: Vec<f32>,   // pt
}
struct Shape {
    segs: Vec<Seg>,
    fill: Option<([u8; 3], bool)>, // colour, even-odd
    stroke: Option<Stroke>,
}

// A paint's colour on white paper at `opacity` (0 to 1).
fn colour(p: &Paint, opacity: f32) -> [u8; 3] {
    let (c, a) = match p {
        Paint::Color(c) => ([c.red, c.green, c.blue].map(f32::from), opacity),
        Paint::LinearGradient(g) => mean(g.stops(), opacity),
        Paint::RadialGradient(g) => mean(g.stops(), opacity),
        Paint::Pattern(_) => ([0.0; 3], opacity),
    };
    c.map(|v| (v * a + 255.0 * (1.0 - a)).round().clamp(0.0, 255.0) as u8)
}
fn mean(stops: &[usvg::Stop], opacity: f32) -> ([f32; 3], f32) {
    if stops.is_empty() {
        return ([0.0; 3], opacity);
    }
    let n = stops.len() as f32;
    let sum = stops.iter().fold([0.0f32; 4], |s, x| {
        let c = x.color();
        [s[0] + f32::from(c.red), s[1] + f32::from(c.green), s[2] + f32::from(c.blue), s[3] + x.opacity().get()]
    });
    ([sum[0] / n, sum[1] / n, sum[2] / n], opacity * sum[3] / n)
}

// Every visible path in the tree, in drawing order, in pt. usvg measures in CSS px (96 to the inch); pt are 72.
fn shapes(tree: &usvg::Tree) -> Vec<Shape> {
    let mut out = Vec::new();
    walk(tree.root(), 1.0, &mut out);
    out
}
fn walk(g: &usvg::Group, opacity: f32, out: &mut Vec<Shape>) {
    for node in g.children() {
        match node {
            Node::Group(c) => walk(c, opacity * c.opacity().get(), out),
            Node::Text(t) => walk(t.flattened(), opacity, out),
            Node::Image(_) => {}
            Node::Path(p) if p.is_visible() => {
                let t = p.abs_transform().post_scale(0.75, 0.75);
                let at = |q: Point| {
                    let mut q = q;
                    t.map_point(&mut q);
                    (q.x, q.y)
                };
                let mut segs = Vec::new();
                let mut last = Point::zero();
                for s in p.data().segments() {
                    match s {
                        PathSegment::MoveTo(a) => { last = a; let (x, y) = at(a); segs.push(Seg::Move(x, y)); }
                        PathSegment::LineTo(a) => { last = a; let (x, y) = at(a); segs.push(Seg::Line(x, y)); }
                        PathSegment::QuadTo(c, a) => {
                            // A quadratic as the cubic it equals.
                            let c1 = Point::from_xy(last.x + 2.0 / 3.0 * (c.x - last.x), last.y + 2.0 / 3.0 * (c.y - last.y));
                            let c2 = Point::from_xy(a.x + 2.0 / 3.0 * (c.x - a.x), a.y + 2.0 / 3.0 * (c.y - a.y));
                            last = a;
                            let ((x1, y1), (x2, y2), (x, y)) = (at(c1), at(c2), at(a));
                            segs.push(Seg::Curve(x1, y1, x2, y2, x, y));
                        }
                        PathSegment::CubicTo(c1, c2, a) => {
                            last = a;
                            let ((x1, y1), (x2, y2), (x, y)) = (at(c1), at(c2), at(a));
                            segs.push(Seg::Curve(x1, y1, x2, y2, x, y));
                        }
                        PathSegment::Close => segs.push(Seg::Close),
                    }
                }
                let k = scale(&t);
                let fill = p.fill().map(|f| (colour(f.paint(), opacity * f.opacity().get()), f.rule() == usvg::FillRule::EvenOdd));
                let stroke = p.stroke().map(|s| Stroke {
                    rgb: colour(s.paint(), opacity * s.opacity().get()),
                    width: s.width().get() * k,
                    cap: match s.linecap() { usvg::LineCap::Butt => 0, usvg::LineCap::Round => 1, usvg::LineCap::Square => 2 },
                    join: match s.linejoin() { usvg::LineJoin::Round => 1, usvg::LineJoin::Bevel => 2, _ => 0 },
                    dash: s.dasharray().map(|d| d.iter().map(|v| v * k).collect()).unwrap_or_default(),
                });
                out.push(Shape { segs, fill, stroke });
            }
            Node::Path(_) => {}
        }
    }
}
// How much a transform scales lengths (the square root of its area scale).
fn scale(t: &Transform) -> f32 {
    (t.sx * t.sy - t.kx * t.ky).abs().sqrt()
}

// The picture's size in pt.
fn size(tree: &usvg::Tree) -> (f32, f32) {
    (tree.size().width() * 0.75, tree.size().height() * 0.75)
}

// ---- EPS ----

// An EPS file (PostScript level 2, EPSF 3.0) of the SVG at true size, its bounding box the picture's.
pub fn make_eps(tree: &usvg::Tree) -> Vec<u8> {
    let (w, h) = size(tree);
    let n = |v: f32| format!("{}", (v * 1000.0).round() / 1000.0);
    let mut s = format!(
        "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 {} {}\n%%HiResBoundingBox: 0 0 {} {}\n%%Creator: Octet\n%%LanguageLevel: 2\n%%Pages: 1\n%%EndComments\n%%BeginProlog\n%%EndProlog\n%%Page: 1 1\ngsave\n0 {} translate 1 -1 scale\n",
        w.ceil(), h.ceil(), n(w), n(h), n(h)
    );
    for sh in shapes(tree) {
        let mut path = String::from("newpath\n");
        for seg in &sh.segs {
            match *seg {
                Seg::Move(x, y) => path += &format!("{} {} moveto\n", n(x), n(y)),
                Seg::Line(x, y) => path += &format!("{} {} lineto\n", n(x), n(y)),
                Seg::Curve(a, b, c, d, e, f) => path += &format!("{} {} {} {} {} {} curveto\n", n(a), n(b), n(c), n(d), n(e), n(f)),
                Seg::Close => path += "closepath\n",
            }
        }
        let rgb = |c: [u8; 3]| format!("{} {} {} setrgbcolor\n", n(f32::from(c[0]) / 255.0), n(f32::from(c[1]) / 255.0), n(f32::from(c[2]) / 255.0));
        if let Some((c, even)) = sh.fill {
            s += &path;
            s += &rgb(c);
            s += if even { "eofill\n" } else { "fill\n" };
        }
        if let Some(st) = &sh.stroke {
            s += &path;
            s += &rgb(st.rgb);
            s += &format!("{} setlinewidth {} setlinecap {} setlinejoin [{}] 0 setdash stroke\n", n(st.width), st.cap, st.join, st.dash.iter().map(|d| n(*d)).collect::<Vec<_>>().join(" "));
        }
    }
    s += "grestore\nshowpage\n%%EOF\n";
    s.into_bytes()
}

// ---- EMF ----

// Logical units per pt (so 1/20 pt), and the reference device the metafile is recorded on: a 96 dpi screen of
// 1920 by 1080 px, 508 by 285.75 mm (rounded to whole mm in the header, as GDI does).
const UNIT: f32 = 20.0;
const DEVICE: (i32, i32) = (1920, 1080);
const DEVICE_MM: (i32, i32) = (508, 286);

struct Emf {
    out: Vec<u8>,
    records: u32,
}
impl Emf {
    fn record(&mut self, kind: u32, body: &[i32]) {
        let size = 8 + 4 * body.len() as u32;
        self.out.extend_from_slice(&kind.to_le_bytes());
        self.out.extend_from_slice(&size.to_le_bytes());
        for v in body {
            self.out.extend_from_slice(&v.to_le_bytes());
        }
        self.records += 1;
    }
}
const COLORREF: fn([u8; 3]) -> i32 = |c| i32::from(c[0]) | (i32::from(c[1]) << 8) | (i32::from(c[2]) << 16);
// Stock objects: NULL_BRUSH and NULL_PEN.
const NULL_BRUSH: i32 = 0x8000_0005u32 as i32;
const NULL_PEN: i32 = 0x8000_0008u32 as i32;

// An EMF of the SVG at true size: its frame (which Word, PowerPoint and Keynote place it by) is the picture's size.
pub fn make_emf(tree: &usvg::Tree) -> Vec<u8> {
    let (w, h) = size(tree);
    let (lw, lh) = ((w * UNIT).ceil().max(1.0) as i32, (h * UNIT).ceil().max(1.0) as i32);
    // The picture in device px, and in hundredths of a mm.
    let px = |pt: f32, dev: i32, mm: i32| ((pt * 25.4 / 72.0) * dev as f32 / mm as f32).ceil().max(1.0) as i32;
    let (dw, dh) = (px(w, DEVICE.0, DEVICE_MM.0), px(h, DEVICE.1, DEVICE_MM.1));
    let (fw, fh) = ((w * 2540.0 / 72.0).round() as i32, (h * 2540.0 / 72.0).round() as i32);
    let mut e = Emf { out: Vec::new(), records: 0 };
    // EMR_HEADER (filled in at the end with the totals): bounds, frame, " EMF", version, bytes, records, handles,
    // reserved, description, palette, device, millimetres, pixel format, OpenGL, micrometres.
    e.record(1, &[0, 0, dw - 1, dh - 1, 0, 0, fw, fh, 0x464D_4520, 0x10000, 0, 0, 3, 0, 0, 0, DEVICE.0, DEVICE.1, DEVICE_MM.0, DEVICE_MM.1, 0, 0, 0, DEVICE_MM.0 * 1000, DEVICE_MM.1 * 1000]);
    e.record(17, &[8]); // EMR_SETMAPMODE MM_ANISOTROPIC
    e.record(9, &[lw, lh]); // EMR_SETWINDOWEXTEX
    e.record(10, &[0, 0]); // EMR_SETWINDOWORGEX
    e.record(11, &[dw, dh]); // EMR_SETVIEWPORTEXTEX
    e.record(12, &[0, 0]); // EMR_SETVIEWPORTORGEX
    e.record(18, &[1]); // EMR_SETBKMODE TRANSPARENT
    let at = |v: f32| (v * UNIT).round() as i32;
    for sh in shapes(tree) {
        // The outline as a GDI path, with its bounds.
        let path = |e: &mut Emf| {
            e.record(59, &[]); // EMR_BEGINPATH
            for seg in &sh.segs {
                match *seg {
                    Seg::Move(x, y) => e.record(27, &[at(x), at(y)]), // EMR_MOVETOEX
                    Seg::Line(x, y) => e.record(54, &[at(x), at(y)]), // EMR_LINETO
                    Seg::Curve(a, b, c, d, x, y) => {
                        let xs = [at(a), at(c), at(x)];
                        let ys = [at(b), at(d), at(y)];
                        let bounds = [*xs.iter().min().unwrap(), *ys.iter().min().unwrap(), *xs.iter().max().unwrap(), *ys.iter().max().unwrap()];
                        e.record(5, &[bounds[0], bounds[1], bounds[2], bounds[3], 3, xs[0], ys[0], xs[1], ys[1], xs[2], ys[2]]); // EMR_POLYBEZIERTO
                    }
                    Seg::Close => e.record(61, &[]), // EMR_CLOSEFIGURE
                }
            }
            e.record(60, &[]); // EMR_ENDPATH
        };
        let bounds = [0, 0, lw, lh];
        if let Some((c, even)) = sh.fill {
            e.record(19, &[if even { 1 } else { 2 }]); // EMR_SETPOLYFILLMODE ALTERNATE or WINDING
            e.record(39, &[1, 0, COLORREF(c), 0]); // EMR_CREATEBRUSHINDIRECT 1: BS_SOLID
            e.record(37, &[1]); // EMR_SELECTOBJECT
            e.record(37, &[NULL_PEN]);
            path(&mut e);
            e.record(62, &bounds); // EMR_FILLPATH
            e.record(37, &[NULL_BRUSH]);
            e.record(40, &[1]); // EMR_DELETEOBJECT
        }
        if let Some(st) = &sh.stroke {
            // PS_GEOMETRIC, solid or the dashes (PS_USERSTYLE), with the cap and join.
            let cap = [0x200, 0, 0x100][st.cap as usize];
            let join = [0x2000, 0, 0x1000][st.join as usize];
            let dashes: Vec<i32> = st.dash.iter().map(|d| at(*d).max(1)).collect();
            let style = 0x10000 | cap | join | if dashes.is_empty() { 0 } else { 7 };
            let mut body = vec![2, 0, 0, 0, 0, style, at(st.width).max(1), 0, COLORREF(st.rgb), 0, dashes.len() as i32];
            body.extend(dashes);
            e.record(95, &body); // EMR_EXTCREATEPEN 2
            e.record(37, &[2]);
            e.record(37, &[NULL_BRUSH]);
            path(&mut e);
            e.record(64, &bounds); // EMR_STROKEPATH
            e.record(37, &[NULL_PEN]);
            e.record(40, &[2]);
        }
    }
    e.record(14, &[0, 16, 20]); // EMR_EOF: no palette, nSizeLast
    let (bytes, records) = (e.out.len() as u32, e.records);
    e.out[48..52].copy_from_slice(&bytes.to_le_bytes());
    e.out[52..56].copy_from_slice(&records.to_le_bytes());
    e.out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree(svg: &str) -> usvg::Tree {
        usvg::Tree::from_str(svg, &usvg::Options::default()).unwrap()
    }
    const SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="72pt" height="36pt" viewBox="0 0 72 36"><path d="M0 0L72 36" stroke="#000" stroke-width="2"/><rect x="10" y="10" width="20" height="10" fill="#213C99" fill-opacity="0.5"/></svg>"##;

    #[test]
    fn eps_has_its_box_and_paths() {
        let eps = String::from_utf8(make_eps(&tree(SVG))).unwrap();
        assert!(eps.starts_with("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 72 36\n"));
        assert!(eps.contains("2 setlinewidth"));
        assert!(eps.contains(" curveto\n") || eps.contains(" lineto\n"));
        // Half-opacity Octet Blue on white paper.
        assert!(eps.contains("0.565 0.62 0.8 setrgbcolor"), "{eps}");
        assert!(eps.ends_with("showpage\n%%EOF\n"));
    }

    #[test]
    fn emf_header_and_records_add_up() {
        let emf = make_emf(&tree(SVG));
        let u = |at: usize| u32::from_le_bytes(emf[at..at + 4].try_into().unwrap());
        assert_eq!(u(0), 1);
        assert_eq!(u(40), 0x464D_4520);
        assert_eq!(u(48) as usize, emf.len());
        // The frame: 1 in by 0.5 in, in hundredths of a mm.
        assert_eq!((u(24), u(28), u(32), u(36)), (0, 0, 2540, 1270));
        // Every record's size takes the next record to the end, which is EMR_EOF.
        let (mut at, mut count, mut last) = (0, 0, 0);
        while at < emf.len() {
            last = u(at);
            at += u(at + 4) as usize;
            count += 1;
        }
        assert_eq!(at, emf.len());
        assert_eq!(count, u(52));
        assert_eq!(last, 14);
    }
}
