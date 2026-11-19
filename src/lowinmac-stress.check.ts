// Run: node src/lowinmac-stress.check.ts. Stress cases for Octet in LibreOffice on Windows and the Mac (issue 48): the
// plan's stress list (docs/plans/issue-48-libreoffice-win-mac.md, section 9) and more. Each case drives the real code:
// the extension's Python (tools/libreoffice/octet_draw.py, run by python3 with stand-ins for LibreOffice), the MCP
// (src/mcp.ts), Octet's CDXML writer, and, when asked, Octet's Rust and the Settings page in WebKit. A case that fails
// stays here and is listed at the end; the check then fails.
//
// Parts that need more than node and python3, each on when its variable is set:
// - OCTET_STRESS_RUST=1, with CARGO_TARGET_DIR: the Rust cases (object files, EMF and PDF pictures of a 200-structure
//   drawing, the Mac's `object` file, Update into a folder that is gone, a fuzzed EMF read by Rust and by Python). They
//   run in a copy of this tree with a test module added, so the product files do not change.
// - OCTET_STRESS_URL=http://localhost:1472/: Settings > General's LibreOffice row in WebKit, in light and dark mode.
// - OCTET_STRESS_CHEMDRAW=1 (a Mac with ChemDraw 22.2): ChemDraw opens the CDXML that an Update's EMF holds and saves
//   it again. Needs the Rust part. OCTET_STRESS_CHEMDRAW_LOCK names a folder other runs take first (made, then removed).
// LibreOffice itself is not run here. The cases marked "LibreOffice source" compare Octet's own clipboard with what
// LibreOffice's paste code takes (LibreOffice 24.8 to 26.8, and master), read from its public source.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(here(p), "utf8");
type Case = { id: string; title: string; ok: boolean; detail?: string };
const results: Case[] = [];
const check = (id: string, title: string, ok: boolean, detail = "") => results.push({ id, title, ok, detail });
const work = mkdtempSync(join(tmpdir(), "octet-lowinmac-"));
process.on("exit", () => rmSync(work, { recursive: true, force: true }));

// ---- Octet's CDXML for the fixtures: a messy 200-structure drawing, and an empty one (S1, S19) ----

const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const { parseStructure, ready } = await import("./chem.ts");
const { toCdxml, fromCdxml } = await import("./cdxml.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
const { EMPTY, merge } = await import("./edit.ts");
const { handle } = await import("./mcp.ts");
type Mol = import("./render.ts").Mol;
type Host = import("./mcp.ts").Host;
await ready;

const emptyCdxml = toCdxml(EMPTY, DEFAULT_STYLE);
check("S1.cdxml", "An empty drawing's CDXML starts its CDXML element in the first 4 KB (the extension looks there)", emptyCdxml.indexOf("<CDXML") >= 0 && emptyCdxml.indexOf("<CDXML") < 4096, `at ${emptyCdxml.indexOf("<CDXML")} of ${emptyCdxml.length} bytes`);

const PACLITAXEL = "CC1=C2C(C(=O)C3(C(CC4C(C3C(C(C2(C)C)(CC1OC(=O)C(C(C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C";
const IBUPROFEN = "CC(C)Cc1ccc(cc1)C(C)C(=O)O";
const t0 = performance.now();
const [pac, ibu] = [parseStructure(PACLITAXEL), parseStructure(IBUPROFEN)];
let messy: Mol = EMPTY;
for (let k = 0; k < 200; k++) messy = merge(messy, k < 40 ? pac : ibu, [(k % 20) * 12, -Math.floor(k / 20) * 10]);
const parseMs = performance.now() - t0;
const messyCdxml = toCdxml(messy, DEFAULT_STYLE);
const readBack = fromCdxml(messyCdxml);
check("S19.cdxml", "200 structures (40 paclitaxel, 160 ibuprofen) write to CDXML and read back with every atom", readBack.mol.atoms.length === messy.atoms.length && messy.atoms.length > 3000, `${messy.atoms.length} atoms, ${messyCdxml.length} bytes of CDXML, made in ${Math.round(parseMs)} ms`);

// The drawing's picture as the page gives Update one: a standalone SVG at true size (14.4 pt bonds), its bonds as
// paths and its labels as Arial text, with Greek, subscripts, degrees and a tick in a caption. (A flask emoji is in a
// drawing of its own, emoji.svg.)
function svgOf(m: Mol): string {
  const L = 14.4, xs = m.atoms.map((a) => a.location[0]), ys = m.atoms.map((a) => a.location[1]);
  const [x0, y0, x1, y1] = [Math.min(...xs) - 2, Math.min(...ys) - 2, Math.max(...xs) + 2, Math.max(...ys) + 4];
  const X = (x: number) => ((x - x0) * L).toFixed(2), Y = (y: number) => ((y1 - y) * L).toFixed(2);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${((x1 - x0) * L).toFixed(1)}pt" height="${((y1 - y0) * L).toFixed(1)}pt" viewBox="0 0 ${((x1 - x0) * L).toFixed(1)} ${((y1 - y0) * L).toFixed(1)}">`];
  out.push(`<path d="${m.bonds.map((b) => `M${X(m.atoms[b.atoms[0]].location[0])} ${Y(m.atoms[b.atoms[0]].location[1])}L${X(m.atoms[b.atoms[1]].location[0])} ${Y(m.atoms[b.atoms[1]].location[1])}`).join("")}" stroke="#000" stroke-width="0.6" fill="none"/>`);
  for (const a of m.atoms) if (a.label !== "C") out.push(`<text x="${X(a.location[0])}" y="${Y(a.location[1])}" font-family="Arial" font-size="10">${a.label}${a.label === "O" ? "H" : ""}</text>`);
  out.push(`<text x="20" y="${((y1 - y0) * L - 10).toFixed(1)}" font-family="Arial" font-size="10">α-β ₂ 25 °C, 3 h, 92% ✓</text>`);
  out.push("</svg>");
  return out.join("\n");
}
const messySvg = svgOf(messy);
writeFileSync(join(work, "messy.svg"), messySvg);
writeFileSync(join(work, "messy.cdxml"), messyCdxml);
writeFileSync(join(work, "empty.cdxml"), emptyCdxml);
const small = parseStructure("CC(=O)Oc1ccccc1C(=O)O");
writeFileSync(join(work, "small.svg"), svgOf(small));
writeFileSync(join(work, "small.cdxml"), toCdxml(small, DEFAULT_STYLE));
writeFileSync(join(work, "emoji.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="120pt" height="30pt" viewBox="0 0 120 30"><text x="5" y="20" font-family="Arial" font-size="10">Flask 🧪 step 2</text></svg>`);

// ---- The extension's Python, with stand-ins for LibreOffice (phase a before Rust, phase b after) ----

const PY = String.raw`
import importlib.util, json, os, random, shutil, stat, struct, subprocess, sys, tempfile, time, types, zlib

MODE, EXT, OUT, OLD = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]


class Any:
    def __init__(self, *a, **k):
        pass

    def __getattr__(self, n):
        return lambda *a, **k: None


made = {}


class Module(types.ModuleType):
    def __getattr__(self, n):
        return made.setdefault((self.__name__, n), type(n, (Any,), {}))


for n in ["unohelper", "com", "com.sun", "com.sun.star", "com.sun.star.awt", "com.sun.star.document", "com.sun.star.lang", "com.sun.star.task", "com.sun.star.ui", "com.sun.star.util"]:
    sys.modules[n] = Module(n)
uno = types.ModuleType("uno")
uno.createUnoStruct = lambda name: types.SimpleNamespace(struct=name, Top=0, Bottom=0, Left=0, Right=0)
uno.ByteSequence = bytes
uno.Enum = lambda kind, value: (kind, value)
uno.systemPathToFileUrl = lambda p: "file://" + p
sys.modules["uno"] = uno
sys.path.insert(0, EXT)
import octet_draw as od  # noqa: E402

out = []


def case(id, title, ok, detail=""):
    out.append({"id": id, "title": title, "ok": bool(ok), "detail": str(detail)[:700]})


def guard(id, title, f):
    try:
        f()
    except Exception as e:
        case(id, title, False, "raised %s: %s" % (type(e).__name__, e))


said = []
od.message = lambda ctx, controller, text: said.append(text)
NOT_FOUND = od.NOT_FOUND


def record(kind, data=b""):
    data += b"\0" * (-len(data) % 4)
    return struct.pack("<II", kind, 8 + len(data)) + data


def comment(data, n=None):
    pad = data + b"\0" * (-len(data) % 4)
    return struct.pack("<III", 70, 12 + len(pad), len(data) if n is None else n) + pad


def emf(*middle, eof=True):
    head = struct.pack("<I", 1) + struct.pack("<I", 108) + b"\0" * 32 + b" EMF" + b"\0" * 64
    return head + b"".join(middle) + (record(14, b"\0" * 12) if eof else b"")


CDXML = b'<?xml version="1.0" encoding="UTF-8" ?><CDXML><page/></CDXML>'
TAG = b"Octet CDXML\0"
wrap = lambda mark, body: mark + struct.pack("<I", len(body)) + body
PDF = b"%PDF-1.7\n1 0 obj\n<< /Type /Metadata /Subtype /XML >>\nstream\n" + CDXML + b"\nendstream\nendobj\n%%EOF\n"


def ms(f, n=5):
    times = []
    for _ in range(n):
        t = time.perf_counter()
        f()
        times.append((time.perf_counter() - t) * 1000)
    return sorted(times)[n // 2]


# LibreOffice stand-ins: a picture's graphic, the graphic provider, the document, its undo manager (as LibreOffice's:
# a new action clears Redo), shapes and the view.
class Stream:
    data = b""

    def seek(self, n):
        pass

    def getLength(self):
        return len(self.data)

    def readBytes(self, _, n):
        return n, types.SimpleNamespace(value=self.data[:n])


class Provider:
    def storeGraphic(self, graphic, props):
        next(p.Value for p in props if p.Name == "OutputStream").data = graphic.stored

    def queryGraphic(self, props):
        data = bytes(next(p.Value for p in props if p.Name == "InputStream"))
        return types.SimpleNamespace(Size100thMM=types.SimpleNamespace(Width=2540, Height=1270), data=data)


def service(ctx, name, *args):
    return {"com.sun.star.comp.MemoryStream": Stream, "com.sun.star.graphic.GraphicProvider": Provider}.get(name, lambda: args[0] if args else None)()


od.service = service
graphic = lambda mime, stored: types.SimpleNamespace(MimeType=mime, stored=stored)


class Undo:
    def __init__(self):
        self.done, self.undone, self.locked, self.contexts = [], [], 0, []

    def lock(self):
        self.locked += 1

    def unlock(self):
        self.locked -= 1

    def addUndoAction(self, a):
        if not self.locked:
            self.done.append(a)
            self.undone.clear()

    def enterUndoContext(self, title):
        self.contexts.append(title)

    def leaveUndoContext(self):
        pass

    def undo(self):
        a = self.done.pop()
        a.undo()
        self.undone.append(a)

    def redo(self):
        a = self.undone.pop()
        a.redo()
        self.done.append(a)


class Document:
    def __init__(self, kind="com.sun.star.text.TextDocument", title="Report.odt", readonly=False):
        self.kind, self.title, self.readonly, self.undo, self.listeners = kind, title, readonly, Undo(), []

    def supportsService(self, name):
        return name == self.kind

    def getTitle(self):
        return self.title

    def isReadonly(self):
        return self.readonly

    def getUndoManager(self):
        return self.undo

    def addCloseListener(self, listener):
        self.listeners.append(listener)


class Shapes:
    def __init__(self, *shapes):
        self.shapes = shapes

    def supportsService(self, name):
        return False

    def getCount(self):
        return len(self.shapes)

    def getByIndex(self, k):
        return self.shapes[k]


class Picture:
    def __init__(self, data=None, mime="application/pdf", mark=b"0fdp", crop=True):
        self.Graphic = data and graphic(mime, wrap(mark, data))
        self.Size = types.SimpleNamespace(Width=500, Height=500)
        if crop:
            self.GraphicCrop = types.SimpleNamespace(Top=100, Bottom=0, Left=50, Right=0)

    def supportsService(self, name):
        return name == "com.sun.star.drawing.GraphicObjectShape"


class Controller:
    def __init__(self, doc, selection=None):
        self.doc, self.selection = doc, selection

    def getModel(self):
        return self.doc

    def getSelection(self):
        return self.selection

    def getFrame(self):
        return None


started = []


def run(args, **options):
    started.append(("run", args))
    if run.raises:
        raise run.raises
    return types.SimpleNamespace(returncode=run.code)


run.code, run.raises = 0, None


def popen(args, **options):
    started.append(("popen", args))
    return types.SimpleNamespace(wait=lambda: 0)


subprocess.run, subprocess.Popen = run, popen
od.on_main = lambda ctx, f: f()


def session(doc, shape=None, kind="pdf", at=None):
    return od.Session(None, Controller(doc, Shapes(shape) if shape else None), shape, kind, at)


def clear():
    with od.LOCK:
        od.SESSIONS.clear()
    said.clear()
    started.clear()


def a_cases():
    # S2: Octet's own file at exactly 64 MB is read; one byte more is not.
    d = tempfile.mkdtemp(dir=OUT)
    p = os.path.join(d, "drawing.pdf")
    with open(p, "wb") as f:
        f.write(b"%PDF")
        f.truncate(od.MAX_BYTES)
    exact = od.read_picture(p)[0]
    with open(p, "ab") as f:
        f.write(b"\0")
    over = od.read_picture(p)[0]
    case("S2.read", "Octet's Update file of exactly 64 MB is read, and of 64 MB and 1 byte is not", exact is not None and exact is not False and len(exact) == od.MAX_BYTES and over is None, "exact %s, over %r" % (len(exact) if exact else exact, over))
    shutil.rmtree(d)

    # S3: hostile EMFs: no exception, an answer at once.
    body = comment(TAG + CDXML)
    hostile = {
        "63 records before the comment (the 65th record)": (emf(*[record(17, b"\0" * 4)] * 63, body), False),
        "comment size field 0xFFFFFFFF": (emf(comment(TAG + CDXML, 0xFFFFFFFF)), True),
        "comment size field 0": (emf(comment(TAG + CDXML, 0)), False),
        "a comment record of 12 bytes": (emf(struct.pack("<III", 70, 12, 0), body), True),
        "header size 0x7FFFFFFC": (struct.pack("<II", 1, 0x7FFFFFFC) + b"\0" * 32 + b" EMF" + b"\0" * 64 + body, False),
        "a record kind 2^32-1": (emf(struct.pack("<II", 0xFFFFFFFF, 8), body), True),
        "cut inside the CDXML": (emf(body)[: 108 + 30], False),
        "64 MB of zero records": (emf() [:108] + b"\0" * (od.MAX_BYTES - 108), False),
    }
    for name, (data, want) in hostile.items():
        try:
            got = od.has_drawing(data)
            t = ms(lambda: od.has_drawing(data), 3)
            case("S3." + name, "Hostile EMF, %s: %s, in under 5 ms" % (name, "Octet's" if want else "not Octet's"), got is want and t < 5, "answer %s in %.3f ms" % (got, t))
        except Exception as e:
            case("S3." + name, "Hostile EMF, %s: no exception" % name, False, "raised %s" % e)

    # S5, the Mac: each hostile name in the object file, for Rust's marked to read back (the Rust part).
    names = ['"', 'a"b', "end\\", "%PATH%", "^&|<>()", "tab\there", "line\nend\rx\u2028y\u0085z", "x" * 300, "\u202eright to left\u200f", "\U0001f9ea flask", "--convert", "--headless", "--object", "", " ", "Report final.odt", "bad \udc80 name", "nul\0name"]
    objects = os.path.join(OUT, "objects")
    os.makedirs(objects, exist_ok=True)
    listed = []
    od.SYSTEM = "darwin"
    for k, name in enumerate(names):
        # As the extension makes it (new_folder, then the picture, then launch).
        folder = tempfile.mkdtemp(dir=objects, prefix="octet-libreoffice-%02d-" % k)
        od.write_new(os.path.join(folder, "drawing.pdf"), PDF)
        title = name.replace("\0", "")[:260]
        ok = od.launch_mac(folder, os.path.join(folder, "drawing.pdf"), "Writer", title)
        with open(os.path.join(folder, "object"), "rb") as f:
            text = f.read().decode("utf-8")
        listed.append({"folder": folder, "name": name.encode("utf-8", "surrogatepass").decode("utf-8", "replace"), "object": text, "started": ok})
    with open(os.path.join(OUT, "objects.json"), "w") as f:
        json.dump(listed, f)
    case("S5.mac.object", "The Mac: every hostile name gives one line for the program and one for the name, in UTF-8, at most 260 characters", all(x["object"].count("\n") == 1 and x["object"].startswith("Writer\n") and len(x["object"]) <= 7 + 260 for x in listed), json.dumps([x["object"][:40] for x in listed])[:500])

    # S6: more LocalServer32 values.
    files = {"C:\\Program Files\\Octet Draw\\Octet Draw.exe": stat.S_IFREG | 0o755, "C:\\Octet\\octet.EXE": stat.S_IFREG | 0o755, "c:\\octet\\octet.exe": stat.S_IFREG | 0o755, "C:\\Octet\\octet.exe": stat.S_IFREG | 0o755}
    lstat = lambda p: types.SimpleNamespace(st_mode=files[p], st_file_attributes=0x20) if p in files else (_ for _ in ()).throw(FileNotFoundError(p))
    values = [('"C:\\Program Files\\Octet Draw\\Octet Draw.exe"', "C:\\Program Files\\Octet Draw\\Octet Draw.exe"), ("C:\\Octet\\octet.EXE", "C:\\Octet\\octet.EXE"), ("c:\\octet\\octet.exe", "c:\\octet\\octet.exe"),
              ('"C:\\Octet\\octet.exe" ', "C:\\Octet\\octet.exe"), ('"C:\\Octet\\octet.exe', None), ("\\\\?\\C:\\Octet\\octet.exe", None), ("C:\\Octet\\octet.exe:stream", None), ("C:\\Octet\\octet.exe\0", None)]
    bad = [(v, od.server_program(v, lstat), w) for v, w in values if od.server_program(v, lstat) != w]
    case("S6.localserver", "Windows: LocalServer32 is taken only as a plain or quoted absolute .exe path to a real file", not bad, repr(bad))

    # S6 and J3: open -b that takes longer than 10 s (Octet's first start, while macOS asks the user whether to open a
    # downloaded app, or a slow disk). Octet does start and is given the file; the extension must not tell the user
    # that Octet is missing, nor remove the folder Octet is about to open.
    clear()
    od.SYSTEM = "darwin"
    run.raises = subprocess.TimeoutExpired(["/usr/bin/open"], 10)
    s = session(Document(), Picture(PDF), "pdf")
    with open(s.path, "wb") as f:
        f.write(PDF)
    od.start(s)
    run.raises = None
    case("S6.slowstart", "The Mac: an open -b that takes over 10 s (a first start) keeps the session and its folder, and says nothing wrong", said != [NOT_FOUND] and os.path.isdir(s.folder), "said %r, folder there: %s" % (said, os.path.isdir(s.folder)))
    clear()

    # S7, Windows: ten fast double-clicks on one picture: one session, and each click starts the program that hands
    # the request to the running Octet.
    od.SYSTEM = "win32"
    od.windows_octet = lambda lstat=None: "C:\\Octet\\octet.exe"
    shape = Picture(PDF)
    doc = Document()
    for _ in range(10):
        od.edit(None, Controller(doc, Shapes(shape)), shape)
    case("S7.windows", "Windows: ten double-clicks on one picture keep one session", len(od.SESSIONS) == 1, "%d sessions, %d programs started" % (len(od.SESSIONS), len(started)))
    for s in list(od.SESSIONS):
        shutil.rmtree(s.folder, ignore_errors=True)
    clear()

    # S8 and O12: two pictures in two documents (one copied from the other in LibreOffice: the same bytes), each with a
    # session: each Update goes to its own picture.
    od.SYSTEM = "linux"
    od.octet = lambda: ["/usr/bin/octet"]
    shutil.which = lambda n: None
    a, b = Picture(PDF), Picture(PDF)
    da, db = Document(title="A.odt"), Document(title="B.odt")
    od.edit(None, Controller(da, Shapes(a)), a)
    od.edit(None, Controller(db, Shapes(b)), b)
    sa, sb = od.SESSIONS
    pa, pb = PDF.replace(b"<page/>", b"<page><a/></page>"), PDF.replace(b"<page/>", b"<page><b/></page>")
    for s, data in ((sa, pa), (sb, pb)):
        with open(s.path + ".n", "wb") as f:
            f.write(data)
        os.replace(s.path + ".n", s.path)
    for s in (sa, sb):
        od.look(s)
    case("S8.two", "Two pictures (one a copy of the other) in two documents: two sessions, each Update in its own picture", len(od.SESSIONS) == 2 and a.Graphic.data == pa and b.Graphic.data == pb and len(da.undo.done) == 1 and len(db.undo.done) == 1)
    for s in (sa, sb):
        shutil.rmtree(s.folder, ignore_errors=True)
    clear()

    # S9: 20 Updates in 2 s, with the extension's reads failing now and then (Windows: Octet's rename meets the read).
    s = session(Document(), Picture(PDF), "pdf")
    with open(s.path, "wb") as f:
        f.write(PDF)
    s.seen = od.stamp(s.path)
    real_read = od.read_picture
    flip = [0]

    def flaky(p):
        flip[0] += 1
        return (False, None) if flip[0] % 3 == 0 else real_read(p)

    od.read_picture = flaky
    pics = [PDF.replace(b"<page/>", b"<page><n%d/></page>" % k) for k in range(20)]
    for k, pic in enumerate(pics):
        with open(s.path + ".n", "wb") as f:
            f.write(pic)
        os.replace(s.path + ".n", s.path)
        od.look(s)
    for _ in range(3):
        od.look(s)
    od.read_picture = real_read
    shown = [x.undo.done for x in [s.doc]][0]
    last = s.shape.Graphic.data
    case("S9.twenty", "20 fast Updates while reads fail now and then: the last drawing is in the document, and no picture is put twice in a row", last == pics[-1] and all(shown[k].after[0].data != shown[k + 1].after[0].data for k in range(len(shown) - 1)), "%d Undo steps; last is the 20th: %s" % (len(shown), last == pics[-1]))
    shutil.rmtree(s.folder, ignore_errors=True)

    # S9: Octet's next Update renamed into place between the extension's look at the file and its read: one picture,
    # one Undo step.
    s = session(Document(), Picture(PDF), "pdf")
    with open(s.path, "wb") as f:
        f.write(PDF)
    s.seen = od.stamp(s.path)
    one, two = pics[0], pics[1]
    with open(s.path + ".n", "wb") as f:
        f.write(one)
    os.replace(s.path + ".n", s.path)
    real_stamp, raced = od.stamp, []

    def racing(p):
        st = real_stamp(p)
        if not raced:
            raced.append(1)
            with open(p + ".n", "wb") as f:
                f.write(two)
            os.replace(p + ".n", p)
        return st

    od.stamp = racing
    od.look(s)
    od.stamp = real_stamp
    od.look(s)
    od.look(s)
    puts = [x.after[0].data for x in s.doc.undo.done]
    case("S9.race", "An Update renamed in between the extension's look and its read: the new drawing goes in once (one Undo step)", puts == [two], "%d Undo steps for one drawing" % len(puts))
    shutil.rmtree(s.folder, ignore_errors=True)

    # S9: one Update renamed in between the look and the read, and the next one just after the read: each goes in once,
    # and the last is in the document.
    s = session(Document(), Picture(PDF), "pdf")
    with open(s.path, "wb") as f:
        f.write(PDF)
    s.seen = od.stamp(s.path)
    three = pics[2]
    with open(s.path + ".n", "wb") as f:
        f.write(one)
    os.replace(s.path + ".n", s.path)
    raced = []

    def after(p):
        got = real_read(p)
        with open(p + ".n", "wb") as f:
            f.write(three)
        os.replace(p + ".n", p)
        return got

    od.stamp, od.read_picture = racing, after
    od.look(s)
    od.stamp, od.read_picture = real_stamp, real_read
    od.look(s)
    od.look(s)
    puts = [x.after[0].data for x in s.doc.undo.done]
    case("S9.after", "An Update renamed in before the extension's read and the next one just after it: each goes in once, the last one last", puts == [two, three], "Undo steps: %s" % [pics.index(p) for p in puts])
    shutil.rmtree(s.folder, ignore_errors=True)

    # S10: Update 3 times, Undo 3, Redo 3, then Update after one Undo: LibreOffice's own Undo and Redo walk the
    # pictures, and the crop comes back with the first.
    shape = Picture(PDF)
    first = (shape.Graphic, shape.Size, shape.GraphicCrop)
    s = session(Document(), shape, "pdf")
    u = s.doc.undo
    for pic in pics[:3]:
        s.put(pic)
    seen = [shape.Graphic.data]
    for _ in range(3):
        u.undo()
    back = (shape.Graphic, shape.Size, shape.GraphicCrop) == first
    for _ in range(3):
        u.redo()
    seen.append(shape.Graphic.data)
    u.undo()
    s.put(pics[4])
    late = shape.Graphic.data == pics[4] and not u.undone
    walk = []
    for _ in range(3):
        u.undo()
        walk.append(shape.Graphic.data if shape.Graphic is not first[0] else "first")
    case("S10.undo", "Update x3, Undo x3, Redo x3, Update after one Undo: Undo reaches the first picture with its crop, Redo the third, the late Update clears Redo", back and seen == [pics[2], pics[2]] and late and walk == [pics[1], pics[0], "first"], "back %s, seen ok %s, late %s, walk %s" % (back, seen == [pics[2], pics[2]], late, [w if w == "first" else pics.index(w) for w in walk]))
    shutil.rmtree(s.folder, ignore_errors=True)

    # S11: the picture is deleted after an Update, then Edit > Undo twice in LibreOffice: LibreOffice's own Undo puts a
    # new copy back, and the next Undo is Octet's step on the old one, which is gone. An Undo step that raises makes
    # LibreOffice clear its whole Undo list.
    class Gone(Picture):
        dead = False

        def __setattr__(self, k, v):
            if self.dead and k in ("Graphic", "Size", "GraphicCrop"):
                raise RuntimeError("com.sun.star.lang.DisposedException")
            object.__setattr__(self, k, v)

    shape = Gone(PDF)
    s = session(Document(), shape, "pdf")
    s.put(pics[0])
    object.__setattr__(shape, "dead", True)
    try:
        s.doc.undo.undo()
        raised = None
    except Exception as e:
        raised = e
    case("S11.undo", "Edit > Undo of an Update on a picture that was deleted (and put back by LibreOffice's Undo): no exception reaches LibreOffice", raised is None, "raised %r" % raised)
    shutil.rmtree(s.folder, ignore_errors=True)

    # S12: the document closes while Octet's window is open: gone is written, and a later Update changes nothing.
    shape = Picture(PDF)
    s = session(Document(), shape, "pdf")
    od.Closing(s).notifyClosing(None)
    before = shape.Graphic
    s.put(pics[1])
    case("S12.closed", "The document closes first: gone is written once, and a later Update changes nothing", s.gone and os.path.exists(os.path.join(s.folder, "gone")) and shape.Graphic is before)
    shutil.rmtree(s.folder, ignore_errors=True)

    # Insert in Writer with the cursor in a table cell (or a frame or header), then the table is deleted before the
    # first Update: Writer cannot insert at that cursor any more. The session must not say the document is closed.
    class Text:
        def insertTextContent(self, at, shape, absorb):
            raise RuntimeError("com.sun.star.uno.RuntimeException: the range is not valid")

    class At:
        def getText(self):
            return Text()

    # Writer's view cursor, where the user is now: there the drawing goes in.
    inserted = []

    class Here:
        def getText(self):
            return types.SimpleNamespace(insertTextContent=lambda at, shape, absorb: inserted.append(shape), createTextCursorByRange=lambda r: Here())

        def getStart(self):
            return self

    doc = Document()
    doc.createInstance = lambda name: types.SimpleNamespace(supportsService=lambda n: False)
    controller = Controller(doc)
    controller.getViewCursor = lambda: Here()
    s = od.Session(None, controller, None, "pdf", At())
    s.put(pics[2])
    case("O24.anchor", "Writer: Insert > Octet Drawing in a table cell, then the table is deleted before the first Update: the drawing goes in at the cursor, and the session is not marked as a closed document", not s.gone and inserted == [s.shape], "gone %s (Octet's title then says Report.odt is closed), inserted %d" % (s.gone, len(inserted)))
    shutil.rmtree(s.folder, ignore_errors=True)

    # Calc: a double-click on a picture on the sheet goes the Impress and Draw way, with --app Calc (Linux).
    clear()
    shape = Picture(PDF)
    calc = Controller(Document("com.sun.star.sheet.SpreadsheetDocument", "Sheet.ods"), Shapes(shape))
    took = od.Clicks(None, calc).mousePressed(types.SimpleNamespace(ClickCount=2, Buttons=1))
    case("J6.calc", "Calc: a double-click on an Octet picture on the sheet opens it, with --app Calc", took and started and started[0][1][-4:] == ["--app", "Calc", "--host", "Sheet.ods"], repr(started[:1]))
    for s in list(od.SESSIONS):
        shutil.rmtree(s.folder, ignore_errors=True)
    clear()

    # Section 8: the double-click and right-click check on a hostile 64 MB PDF: 1,000 streams, each marked as XML
    # metadata, each a valid zlib stream of empty blocks that the check inflates to its end. LibreOffice waits for it.
    block = b"9 0 obj\n<< /Type /Metadata /Subtype /XML /Filter /FlateDecode >>\nstream\n" + b"x\x01" + b"\x00\x00\x00\xff\xff" * 13050 + b"\nendstream\nendobj\n"
    hostile_pdf = b"%PDF-1.7\n" + block * 1000
    hostile_pdf = hostile_pdf[: od.MAX_BYTES]
    t = ms(lambda: od.has_drawing(hostile_pdf), 3)
    case("S19.hostile.pdf", "A hostile 64 MB PDF (1,000 metadata streams to inflate): the double-click and right-click check, on LibreOffice's main thread, takes under 250 ms", t < 250, "%.0f ms, %d MB" % (t, len(hostile_pdf) >> 20))

    # 1.1.2's extension (Linux) with 1.2's pictures: an EMF and a Calc sheet are LibreOffice's own (section 7).
    if OLD:
        spec = importlib.util.spec_from_file_location("octet_draw_112", OLD)
        old = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(old)
        old.service = service
        emf_pic = graphic("image/x-emf", wrap(b"0fme", emf(body)))
        calc_known = any(n == "com.sun.star.sheet.SpreadsheetDocument" for n, _ in old.DOCUMENTS)
        found = old.pdf_of(None, emf_pic)
        case("7.old.extension", "1.1.2's extension: an EMF picture and a Calc sheet stay LibreOffice's own", found is None and not calc_known, "found %r, Calc known %s" % (found, calc_known))


def b_cases():
    def f(name):
        p = os.path.join(OUT, name)
        return open(p, "rb").read() if os.path.exists(p) else None

    for name, title in (("messy.emf", "EMF"), ("messy.pdf", "PDF")):
        data = f(name)
        if data is None:
            case("S19." + name, "The 200-structure %s from Rust" % title, False, "Rust made no file")
            continue
        got = od.has_drawing(data)
        t = ms(lambda: od.has_drawing(data))
        case("S19." + name, "The 200-structure drawing's %s Update: the extension knows it as Octet's in under 100 ms" % title, got and t < 100, "%s, %.2f ms, %d KB" % (got, t, len(data) >> 10))
    for name in ("blank.emf", "blank.pdf"):
        data = f(name)
        case("S1." + name, "Update with nothing drawn (%s): a double-click opens it again (the extension knows it)" % name, data is not None and od.has_drawing(data), "file %s" % (data is not None))
    p = os.path.join(OUT, "photo.emf")
    if os.path.exists(p):
        size = os.path.getsize(p)
        got = od.read_picture(p)[0]
        case("O2.photo", "Windows: Update of a drawing with a 24-megapixel photo (an EMF of %d MB): the extension takes Octet's picture" % (size >> 20), got not in (None, False), "the extension reads it" if got else "the extension reads nothing: LibreOffice keeps the old picture, and Octet says nothing")
        os.unlink(p)
    fuzz = os.path.join(OUT, "fuzz")
    if os.path.isdir(fuzz):
        rust = json.load(open(os.path.join(OUT, "fuzz-rust.json")))
        wrong, missed = [], 0
        for k, opens in enumerate(rust):
            data = open(os.path.join(fuzz, "%04d.emf" % k), "rb").read()
            try:
                py = od.has_drawing(data)
            except Exception as e:
                wrong.append((k, "raised %s" % e))
                continue
            if py and not opens:
                # The comment the extension found: Octet refuses it only when it is not UTF-8 or names no CDXML.
                at, why = 0, None
                while at + 8 <= len(data):
                    kind, size = struct.unpack_from("<II", data, at)
                    if size < 8 or size % 4 or at + size > len(data):
                        break
                    if kind == 70:
                        n = struct.unpack_from("<I", data, at + 8)[0]
                        x = data[at + 12: at + 12 + min(n, size - 12)]
                        if x.startswith(TAG):
                            try:
                                why = "utf8" if "<CDXML" in x[len(TAG):].decode("utf-8") else "nocdxml"
                            except UnicodeDecodeError:
                                why = "notutf8"
                            break
                    at += size
                if why != "notutf8":
                    wrong.append((k, why))
            if opens and not py:
                missed += 1
        case("S4.fuzz", "%d fuzzed EMFs: every one the extension takes, Octet opens (but for a comment that is not UTF-8, which Octet says it cannot open)" % len(rust), not wrong, "%d wrong %r; %d Octet could open that the extension leaves to LibreOffice" % (len(wrong), wrong[:8], missed))


(a_cases if MODE == "a" else b_cases)()
print(json.dumps(out))
`;
const pyFile = join(work, "stress.py");
writeFileSync(pyFile, PY);
const ext = here("../tools/libreoffice/");
const oldPy = join(work, "octet_draw_112.py");
const old = spawnSync("git", ["show", "v1.1.2:tools/libreoffice/octet_draw.py"], { cwd: here("../"), encoding: "utf8" });
if (old.status === 0) writeFileSync(oldPy, old.stdout);
else console.log("lowinmac-stress: no v1.1.2 tag here; 1.1.2's extension is not run");
const python = (mode: string) => {
  const r = spawnSync("python3", ["-I", "-B", pyFile, mode, ext, work, old.status === 0 ? oldPy : ""], { encoding: "utf8", maxBuffer: 64 << 20, timeout: 600_000 });
  if (r.error) { console.log("lowinmac-stress: python3 is not here; the Python cases are not run"); return; }
  if (r.status !== 0) { check(`python.${mode}`, `The Python cases (phase ${mode}) run`, false, r.stderr.slice(-1500)); return; }
  for (const c of JSON.parse(r.stdout.trim().split("\n").at(-1)!) as Case[]) results.push(c);
};
python("a");

// ---- LibreOffice source: what its paste takes from Octet's copy on each system ----

// Octet's copy, from clipboard.rs: on Windows the EMF (CF_ENHMETAFILE) and the bitmap (CF_DIB); on the Mac Office's own
// copy and the PDF; on Linux the PNG, the PDF and the SVG. On Windows and Linux, LibreOffice's own copy of a picture
// (SVXB) with the PDF goes last (issue 48, 1.1.3).
const clip = read("../src-tauri/src/clipboard.rs");
const windowsCopy = /if s == System::Windows \{[\s\S]*?put\(Kind::Emf,[\s\S]*?put\(Kind::Bitmap, b\)[\s\S]*?libreoffice = pdf\.and_then/.test(clip);
const macCopy = /out\.push\(\(name\(Kind::Office\)[\s\S]*?out\.push\(\(name\(Kind::Pdf\), pdf\)\)/.test(clip);
const svxbLast = /put\(Kind::Octet, j\.into_bytes\(\)\);\s*\}\s*if let Some\(b\) = libreoffice \{\s*put\(Kind::Svxb, b\);\s*\}\s*Ok\(out\)/.test(clip);
check("copy.formats", "Octet's copy: Windows puts the EMF and a bitmap, the Mac Office's copy and the PDF, and Windows and Linux LibreOffice's SVXB last", windowsCopy && macCopy && svxbLast);
// LibreOffice's Windows names: CF_DIB is its BITMAP, CF_ENHMETAFILE its EMF, from which it offers GDIMETAFILE too, and
// "SVXB (StarView Bitmap/Animation)" its SVXB (vcl/win/dtrans/ftransl.cxx, vcl/source/treelist/transfer.cxx). Writer's
// paste takes the first of these that is there (sot/source/base/formats.cxx, the Writer free-area copy table):
const WRITER = ["SVXB", "SD_OLE", "RICHTEXT", "EMBED_SOURCE", "EMBEDDED_OBJ", "RTF", "PDF", "PNG", "JPEG", "BITMAP", "HTML", "STRING", "GDIMETAFILE", "EMBED_SOURCE_OLE", "EMBEDDED_OBJ_OLE"];
const windowsOffer = new Set(["SVXB", "BITMAP", "EMF", "GDIMETAFILE", "EMBED_SOURCE_OLE", "EMBEDDED_OBJ_OLE"]);
const writerTakes = WRITER.find((f) => windowsOffer.has(f));
const decision = read("../docs/decisions/0025-libreoffice.md"), manual = read("../docs/testing/libreoffice-manual.md");
check("O14.writer.windows", "LibreOffice source: Writer on Windows takes Octet's SVXB (the PDF) before the bitmap, the EMF and the Office object, and decision 0025 and the checklist say so", writerTakes === "SVXB" && /Writer \(`sot\/source\/base\/formats\.cxx`, the free-area copy table\) and Calc/.test(decision) && /\(W3\) Settings > Import and export > Copy > Office object on/.test(manual), `Writer takes ${writerTakes}`);
// Impress and Draw (sd View::InsertData, with no format from DoPaste): a PDF first, then the OLE step, then SVXB, then
// GDIMETAFILE. The OLE step runs with EMBED_SOURCE_OLE and OBJECTDESCRIPTOR_OLE (Octet's object, Office object on); with
// a GDIMETAFILE there it inserts that (converted, losing Octet's comment) and stops, before SVXB.
const impress = (offer: Set<string>) => offer.has("PDF") ? "PDF" : offer.has("EMBED_SOURCE_OLE") && offer.has("OBJECTDESCRIPTOR_OLE") && offer.has("GDIMETAFILE") ? "GDIMETAFILE" : ["SVXB", "GDIMETAFILE", "BITMAP"].find((f) => offer.has(f));
const impressOn = impress(new Set([...windowsOffer, "OBJECTDESCRIPTOR_OLE"])), impressOff = impress(new Set(["SVXB", "BITMAP", "EMF", "GDIMETAFILE"]));
check("O15.impress.windows", "LibreOffice source: Impress and Draw on Windows take Octet's SVXB with the Office object off and the EMF with it on, decision 0025 says so, and Insert > Octet Drawing still asks for a PDF", impressOff === "SVXB" && impressOn === "GDIMETAFILE" && /Impress and Draw on Windows paste\s+LibreOffice's own picture/.test(decision) && /Session\(ctx, controller, None, "pdf", at\)/.test(readFileSync(ext + "octet_draw.py", "utf8")), `Impress takes ${impressOff} (object off), ${impressOn} (object on)`);
// Calc's paste table (formats.cxx, Calc free-area copy table) and ScViewFunc::PasteFromSystem have no PDF: SVXB first.
// The Mac's LibreOffice spells SVXB "svbx" in its pasteboard table, so it reads no SVXB from Octet there.
const CALC = ["SVXB", "EMBED_SOURCE", "GDIMETAFILE", "PNG", "JPEG", "BITMAP", "HTML", "STRING", "EMBED_SOURCE_OLE", "EMBEDDED_OBJ_OLE"];
const calcWindows = CALC.find((f) => windowsOffer.has(f)), calcLinux = CALC.find((f) => ["PNG", "PDF", "SVXB"].includes(f)), calcMac = CALC.find((f) => ["PDF"].includes(f));
check("O16.calc", "LibreOffice source: Calc takes Octet's SVXB on Windows and Linux; on the Mac it can take nothing of Octet's as a PDF, and decision 0025 says so", calcWindows === "SVXB" && calcLinux === "SVXB" && calcMac === undefined && !CALC.includes("PDF") && /Calc takes no PDF/.test(decision) && /in Calc on the Mac a structure goes\s+in by Insert > Octet Drawing/.test(decision), `Windows ${calcWindows}, Linux ${calcLinux}, Mac ${calcMac}`);
const writerMac = WRITER.find((f) => ["PDF", "PNG", "BITMAP"].includes(f));
check("mac.writer", "LibreOffice source: Writer and Impress on the Mac paste Octet's PDF before any bitmap", writerMac === "PDF");

// ---- The Mac's hand-off and Octet with no window (main.rs, objects.rs) ----

const main = read("../src-tauri/src/main.rs"), objects = read("../src-tauri/src/objects.rs");
const readyOnlyWithWindow = /#\[cfg\(target_os = "macos"\)\]\s*if !headless \{\s*objects::ready\(handle\);/.test(main);
const openedAlways = /RunEvent::Opened \{ urls \} => open::offer\(_app, objects::opened\(/.test(main);
// Octet with no window never calls objects::ready, so objects::opened refuses each marked picture there first: it
// writes `closed`, and the extension ends that session.
const refusedFirst = /\.filter_map\(\|p\| match marked\(&p\) \{\s*Some\(_\) if crate::windows::HEADLESS\.load\(Ordering::Relaxed\) => \{\s*mark\(&p, "closed"\);\s*None\s*\}\s*Some\(\(host, program\)\) => \{\s*match EARLY/.test(objects);
check("O22.headless", "The Mac: a LibreOffice picture sent to an Octet with no window (--headless --mcp, --convert) is opened or refused, never kept waiting", readyOnlyWithWindow && openedAlways && refusedFirst, "objects::opened queues a marked picture in an Octet with no window, which never calls objects::ready");

// ---- MCP: run_command add_to_libreoffice from an AI app, with odd arguments (S23) ----

let windowless = false, ran: string[] = [], libreOfficeFails: string | undefined;
const base: Partial<Host> = {
  libreoffice: async () => { ran.push("add_to_libreoffice"); return libreOfficeFails; },
  doc: () => EMPTY, style: () => DEFAULT_STYLE, dialog: (id) => id === "add_to_libreoffice", windowless: () => windowless, experiment: () => false,
  command: (id) => { ran.push(id); return true; }, act: (id) => { ran.push(id); return true; }, settle: async () => {}, asking: () => false, dismiss: () => {},
  select: () => {}, selection: () => ({ atoms: [], items: [] }), window: () => ({ id: "draw-1", name: "Untitled" }), windows: async () => [], target: async () => true,
  working: () => {}, said: () => {}, begin: () => {}, end: () => {}, set: (m) => m, problems: () => [], tables: () => [],
};
const host = new Proxy(base, { get: (t, k) => (k in t ? t[k as keyof Host] : typeof k === "symbol" || k === "then" ? undefined : () => undefined) }) as Host;
let n = 0;
const call = async (args: unknown) => {
  const r = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "advanced", arguments: { tool: "run_command", args } } }), () => host, "1.2.0", { client: "Test", session: "s-1" }));
  return { text: (r.result?.content?.[0]?.text ?? r.error?.message ?? "") as string, error: !!(r.result?.isError || r.error) };
};
const mcp: [string, string, unknown, (r: { text: string; error: boolean }) => boolean][] = [
  ["S23.run", "run_command add_to_libreoffice runs the command once", { command: "add_to_libreoffice" }, (r) => !r.error && /^Ran add_to_libreoffice\./.test(r.text)],
  ["S23.twice", "Called again at once, it runs again (LibreOffice's Extension Manager asks the user each time)", { command: "add_to_libreoffice" }, (r) => !r.error],
  ["S23.space", "Spaces round the name are ignored", { command: "  add_to_libreoffice\t" }, (r) => !r.error],
  ["S23.case", "A misspelt or capitalised name is refused by name", { command: "Add_To_LibreOffice" }, (r) => r.error && r.text.includes("Add_To_LibreOffice")],
  ["S23.libre_office", "add_to_libre_office is refused", { command: "add_to_libre_office" }, (r) => r.error],
  ["S23.ids", "With ids that are not in the drawing, the AI app hears which", { command: "add_to_libreoffice", ids: ["s999"] }, (r) => r.error && r.text.includes("s999")],
  ["S23.number", "A number for command is refused, with no crash", { command: 42 }, (r) => r.error],
  ["S23.null", "No command is refused", {}, (r) => r.error],
  ["S23.array", "An array for command is refused", { command: ["add_to_libreoffice"] }, (r) => r.error],
  ["S23.huge", "A 100 KB command name is refused", { command: "a".repeat(100_000) }, (r) => r.error && r.text.length < 2000],
];
for (const [id, title, args, ok] of mcp) {
  try {
    const before = ran.length, r = await call(args);
    check(id, `MCP: ${title}`, ok(r), `${r.error ? "error" : "ok"}: ${r.text.slice(0, 160)}; commands run ${ran.length - before}`);
  } catch (e) { check(id, `MCP: ${title}`, false, `raised ${e}`); }
}
windowless = true;
{
  const r = await call({ command: "add_to_libreoffice" });
  check("S23.windowless", "MCP: Octet with no window refuses add_to_libreoffice", r.error && r.text.includes("Octet with no window has no dialogs"), r.text);
}
windowless = false;
// run_command waits for Add to LibreOffice: when LibreOffice is not there, the AI app hears what the window said
// ("Octet cannot open LibreOffice."), never that a dialog shows. The Editor's MCP host and its menu command run the one
// function that shows that notice.
const editor = read("./Editor.tsx");
const oneWay = editor.includes("add_to_libreoffice: () => void addToLibreOffice(),") && editor.includes("libreoffice: () => addToLibreOffice(),");
{
  libreOfficeFails = "Octet cannot open LibreOffice.";
  const r = await call({ command: "add_to_libreoffice" });
  libreOfficeFails = undefined;
  check("S23.truth", "MCP: when LibreOffice cannot be opened, run_command add_to_libreoffice does not tell the AI app it showed a dialog", oneWay && r.error && r.text.startsWith("Octet cannot open LibreOffice.") && !/dialog/.test(r.text), `reply: ${r.text}`);
}

// ---- Rust (OCTET_STRESS_RUST=1): a copy of this tree with a test module added to objects.rs ----

const RUST = String.raw`
#[cfg(test)]
mod lowinmac_stress {
    use super::*;
    use std::time::Instant;

    fn say(id: &str, title: &str, ok: bool, detail: String) {
        println!("STRESS {}", serde_json::json!({ "id": id, "title": title, "ok": ok, "detail": detail }));
    }
    fn median(mut f: impl FnMut()) -> f64 {
        let mut t: Vec<f64> = (0..5).map(|_| { let s = Instant::now(); f(); s.elapsed().as_secs_f64() * 1000.0 }).collect();
        t.sort_by(|a, b| a.partial_cmp(b).unwrap());
        t[2]
    }
    // A folder named as the extension's (octet-libreoffice-…), so each case meets marked's other rules.
    fn folder(base: &Path, name: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let d = base.join(format!("octet-libreoffice-{name}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::set_permissions(&d, std::fs::Permissions::from_mode(0o700)).unwrap();
        d
    }

    #[test]
    fn stress() {
        let d = PathBuf::from(std::env::var("OCTET_STRESS_DIR").expect("OCTET_STRESS_DIR"));
        let text = |n: &str| std::fs::read_to_string(d.join(n)).unwrap();
        let (svg, cdxml, empty) = (text("messy.svg"), text("messy.cdxml"), text("empty.cdxml"));

        // S19: the 200-structure drawing's Update, as an EMF (Windows) and a PDF (the Mac, Linux), against Copy's makers.
        let emf = Kind::Emf.picture(&svg, &cdxml).unwrap();
        let pdf = Kind::Pdf.picture(&svg, &cdxml).unwrap();
        let (te, tp) = (median(|| drop(Kind::Emf.picture(&svg, &cdxml))), median(|| drop(Kind::Pdf.picture(&svg, &cdxml))));
        let tc = median(|| drop(crate::export::tree(&svg).map(|t| crate::vector::make_emf(&t, Some(cdxml.as_str()), None))));
        std::fs::write(d.join("messy.emf"), &emf).unwrap();
        std::fs::write(d.join("messy.pdf"), &pdf).unwrap();
        say("S19.update.time", "The 200-structure drawing: Update's EMF takes Copy's time (Windows), and both pictures are made in under 2 s", te <= tc * 1.25 + 5.0 && te < 2000.0 && tp < 2000.0, format!("EMF {te:.0} ms ({} KB), Copy's EMF {tc:.0} ms, PDF {tp:.0} ms ({} KB)", emf.len() >> 10, pdf.len() >> 10));
        let base = d.join("objects-rust");
        for (name, bytes) in [("drawing.emf", &emf), ("drawing.pdf", &pdf)] {
            let f = folder(&base, name);
            let path = f.join(name);
            std::fs::write(&path, bytes).unwrap();
            let file = File::open(path.clone(), "Report.odt", "Writer").unwrap();
            let same = *file.session.oct.borrow() == cdxml;
            let next = Kind::of(&path).unwrap().picture(&svg, &cdxml.replacen("<page", "<page id=\"9\"", 1)).unwrap();
            write(&path, &next, "Report.odt", Some(1)).unwrap();
            let left: Vec<_> = std::fs::read_dir(&f).unwrap().map(|e| e.unwrap().file_name()).filter(|n| n != name).collect();
            let again = File::open(path.clone(), "R", "").map(|f| f.session.oct.borrow().contains("<page id=\"9\"")).unwrap_or(false);
            say(&format!("S19.roundtrip.{name}"), &format!("The 200-structure drawing opens from {name}, and an Update reads back, with no file left over"), same && again && left.is_empty(), format!("same {same}, again {again}, left {left:?}"));
        }

        // S1: Update with nothing drawn: the page sends the blank picture and an empty drawing's CDXML.
        let blank = r#"<svg xmlns="http://www.w3.org/2000/svg" width="72pt" height="72pt" viewBox="0 0 72 72"></svg>"#;
        for kind in [Kind::Emf, Kind::Pdf] {
            let name = if kind == Kind::Emf { "blank.emf" } else { "blank.pdf" };
            let p = folder(&base, &format!("b-{name}")).join(if kind == Kind::Emf { "drawing.emf" } else { "drawing.pdf" });
            let made = kind.picture(blank, &empty).unwrap();
            std::fs::write(d.join(name), &made).unwrap();
            std::fs::write(&p, &made).unwrap();
            let oct = File::open(p, "R", "").map(|f| f.session.oct.borrow().clone());
            say(&format!("S1.rust.{name}"), &format!("Update with nothing drawn ({name}): Octet opens it again as the empty drawing"), oct.as_deref() == Ok(empty.as_str()), format!("{:?}", oct.map(|o| o.len())));
        }

        // O2: a drawing with a 24-megapixel picture (5400 by 4400, which Octet takes: under 40 megapixels and 12 MB).
        let (w, h) = (5400u32, 4400u32);
        let mut px = Vec::with_capacity((w * h * 3) as usize);
        for y in 0..h {
            for x in 0..w {
                px.extend([(x % 251) as u8, (y % 241) as u8, ((x / 7 + y / 5) % 256) as u8]);
            }
        }
        let mut png_bytes = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut png_bytes, w, h);
            enc.set_color(png::ColorType::Rgb);
            enc.set_depth(png::BitDepth::Eight);
            enc.write_header().unwrap().write_image_data(&px).unwrap();
        }
        drop(px);
        use base64::Engine;
        let photo = format!(r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="540pt" height="440pt" viewBox="0 0 540 440"><image x="0" y="0" width="540" height="440" xlink:href="data:image/png;base64,{}"/></svg>"#, base64::engine::general_purpose::STANDARD.encode(&png_bytes));
        match Kind::Emf.picture(&photo, &empty) {
            Ok(e) => {
                let p = folder(&base, "photo").join("drawing.emf");
                std::fs::write(&p, &e).unwrap();
                std::fs::write(d.join("photo.emf"), &e).unwrap();
                let opens = File::open(p, "R", "").is_ok();
                say("O2.photo.size", "Windows: Update of a drawing with a 24-megapixel picture makes an EMF that Octet and the extension take (64 MB at most)", e.len() as u64 <= crate::MAX_BYTES && opens, format!("EMF {} MB from a PNG of {} MB; Octet opens it again: {opens}; ole_update says nothing", e.len() >> 20, png_bytes.len() >> 20));
            }
            Err(e) => say("O2.photo.size", "Windows: Update of a drawing with a 24-megapixel picture", false, format!("no EMF: {e}")),
        }

        // A caption with an emoji (no font Octet can embed in a PDF): Update still works, as an EMF and as a PDF.
        let emoji = text("emoji.svg");
        let (e, p) = (Kind::Emf.picture(&emoji, &empty), Kind::Pdf.picture(&emoji, &empty));
        say("O10.emoji", "A drawing with an emoji in a caption: Update makes its EMF and its PDF", e.is_ok() && p.is_ok(), format!("EMF {:?}, PDF {:?}", e.map(|x| x.len()), p.map(|x| x.len())));

        // S5, the Mac: each hostile name as Python wrote it in object, read back by marked, and cleaned for the title.
        let listed: Vec<serde_json::Value> = serde_json::from_str(&text("objects.json")).unwrap();
        let mut back = Vec::new();
        for x in &listed {
            let f = PathBuf::from(x["folder"].as_str().unwrap());
            let got = marked(&f.join("drawing.pdf"));
            back.push(serde_json::json!({ "marked": got.as_ref().map(|(h, p)| [h.clone(), p.clone()]), "host": got.as_ref().map(|(h, _)| crate::ole::host_name(h)), "title": got.as_ref().map(|(h, _)| crate::ole::title(&crate::ole::host_name(h), false)) }));
        }
        std::fs::write(d.join("objects-rust.json"), serde_json::to_string(&back).unwrap()).unwrap();

        // S22 and section 4: the picture itself a link (to a drawing elsewhere): not an object.
        let linked = folder(&base, "linked");
        std::fs::write(linked.join("object"), "Writer\nReport.odt").unwrap();
        std::fs::write(base.join("elsewhere.pdf"), &pdf).unwrap();
        std::os::unix::fs::symlink(base.join("elsewhere.pdf"), linked.join("drawing.pdf")).unwrap();
        say("S22.link", "The Mac: drawing.pdf that is a link to another file is not taken as an object (the plan: no links)", marked(&linked.join("drawing.pdf")).is_none(), format!("marked: {:?}", marked(&linked.join("drawing.pdf"))));

        // S21: the temporary folder deleted while the window is open: Update says so.
        let gone = folder(&base, "gone");
        let path = gone.join("drawing.emf");
        std::fs::remove_dir_all(&gone).unwrap();
        let r = write(&path, &emf, "Report.odt", Some(1));
        say("S21.gone", "The folder is gone: Update says Octet cannot update Report.odt", r.clone().err().as_deref() == Some("Octet cannot update Report.odt. Try again."), format!("{r:?}"));

        // S2: Octet opens 64 MB at most.
        let big = folder(&base, "big").join("drawing.pdf");
        { let f = std::fs::File::create(&big).unwrap(); f.set_len(crate::MAX_BYTES + 1).unwrap(); }
        say("S2.rust", "Octet does not open an object file of 64 MB and 1 byte", File::open(big, "R", "").err() == Some(CANNOT_OPEN), String::new());

        // S4: a fuzzed EMF (Octet's own, of one structure): Rust's verdict for each, for the Python part.
        let base_emf = Kind::Emf.picture(&text("small.svg"), &text("small.cdxml")).unwrap();
        let fuzz = d.join("fuzz");
        std::fs::create_dir_all(&fuzz).unwrap();
        let mut seed = 0x9E37_79B9_7F4A_7C15u64;
        let mut rnd = move |n: usize| { seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17; (seed % n.max(1) as u64) as usize };
        let mut verdicts = Vec::new();
        let start = Instant::now();
        for k in 0..2000 {
            let mut m = base_emf.clone();
            for _ in 0..1 + rnd(3) {
                match rnd(5) {
                    0 => { let at = rnd(m.len()); m.truncate(at.max(1)); }
                    1 => { let at = rnd(m.len()); m[at] ^= 1u8 << rnd(8); }
                    2 => { let at = 108 + 4 + 4 * rnd(8); if at + 4 <= m.len() { m[at..at + 4].copy_from_slice(&(rnd(1 << 20) as u32).to_le_bytes()); } }
                    3 => { let at = (108 + 4 * rnd(64)).min(m.len()); m.splice(at..at, [70u8, 0, 0, 0, 16, 0, 0, 0, 4, 0, 0, 0, b'O', b'c', b't', 0]); }
                    _ => { if m.len() >= 4 { let at = (120 + 4 * rnd(200)).min(m.len() - 4); m[at..at + 4].copy_from_slice(&[0xff, 0xfe, 0xfd, 0xfc]); } }
                }
            }
            let opens = m.get(40..44) == Some(b" EMF") && crate::vector::cdxml_from_emf(&m).is_some();
            std::fs::write(fuzz.join(format!("{k:04}.emf")), &m).unwrap();
            verdicts.push(opens);
        }
        std::fs::write(d.join("fuzz-rust.json"), serde_json::to_string(&verdicts).unwrap()).unwrap();
        say("S4.fuzz.rust", "2,000 fuzzed EMFs: Octet reads each with no panic", true, format!("{} open, in {} ms", verdicts.iter().filter(|v| **v).count(), start.elapsed().as_millis()));

        // S3: Octet's own read of a hostile 64 MB EMF (zero records after the header): no hang.
        let mut hostile = base_emf[..108].to_vec();
        hostile.resize(crate::MAX_BYTES as usize, 0);
        let t = median(|| drop(crate::vector::cdxml_from_emf(&hostile)));
        say("S3.rust", "Octet's read of a hostile 64 MB EMF answers in under 50 ms", t < 50.0, format!("{t:.2} ms"));
    }
}
`;

function runRust() {
  const target = process.env.CARGO_TARGET_DIR;
  if (!target) { check("rust", "The Rust cases run", false, "OCTET_STRESS_RUST=1 needs CARGO_TARGET_DIR"); return false; }
  const root = here("../"), copy = join(work, "tree");
  mkdirSync(copy);
  for (const e of readdirSync(root)) if (!["node_modules", ".git", "target"].includes(e)) spawnSync("cp", ["-Rc", join(root, e), join(copy, e)]);
  writeFileSync(join(copy, "src-tauri/src/objects.rs"), readFileSync(join(copy, "src-tauri/src/objects.rs"), "utf8") + RUST);
  const t = performance.now();
  const r = spawnSync("cargo", ["test", "--manifest-path", join(copy, "src-tauri/Cargo.toml"), "--", "lowinmac_stress", "objects::", "libreoffice::", "--nocapture", "--test-threads=1"], { encoding: "utf8", maxBuffer: 256 << 20, env: { ...process.env, OCTET_STRESS_DIR: work }, timeout: 3_600_000 });
  const lines = `${r.stdout}`.split("\n");
  // The test harness can print its own words before the first line on the same line.
  for (const l of lines) if (l.includes("STRESS {")) results.push(JSON.parse(l.slice(l.indexOf("STRESS {") + 7)) as Case);
  const summary = lines.find((l) => l.startsWith("test result:")) ?? "";
  check("rust.tests", "The Rust cases and Octet's own object and LibreOffice tests pass in the copy", r.status === 0, `${summary} (${Math.round((performance.now() - t) / 1000)} s)${r.status ? `\n${(r.stderr ?? "").slice(-2000)}` : ""}`);
  // S5: what Rust read back from each object file Python wrote.
  if (existsSync(join(work, "objects-rust.json"))) {
    const py = JSON.parse(readFileSync(join(work, "objects.json"), "utf8")) as { name: string; object: string }[];
    const rs = JSON.parse(readFileSync(join(work, "objects-rust.json"), "utf8")) as { marked: [string, string] | null; host: string | null; title: string | null }[];
    const MAX_HOST = Number(read("../src-tauri/src/ole.rs").match(/const MAX_HOST: usize = (\d+);/)?.[1]);
    const bad = py.flatMap((p, k) => {
      const r = rs[k], want = p.object.slice(p.object.indexOf("\n") + 1);
      // eslint-disable-next-line no-control-regex
      return !r.marked || r.marked[0] !== want || r.marked[1] !== "Writer" || !r.host || /[\u0000-\u001f\u007f-\u009f]/.test(r.host) || [...r.host].length > MAX_HOST ? [`${JSON.stringify(p.name).slice(0, 30)} -> ${JSON.stringify(r)}`.slice(0, 160)] : [];
    });
    check("S5.mac.read", "The Mac: Octet reads each hostile name back from object as the extension wrote it, and its title has no control characters and at most 260 of them", !bad.length, bad.join("; "));
    const rlo = rs.find((r) => r.host?.includes("\u202e"));
    check("S5.mac.bidi", "The Mac and Windows: a name with a right-to-left override does not turn the rest of Octet's window title round", !rlo, rlo ? `title: ${JSON.stringify(rlo.title)}` : "");
  }
  return r.status === 0 || existsSync(join(work, "messy.emf"));
}
const rustRan = process.env.OCTET_STRESS_RUST === "1" && runRust();
if (rustRan) python("b");
else console.log("lowinmac-stress: the Rust cases are off (OCTET_STRESS_RUST=1 with CARGO_TARGET_DIR runs them)");

// ---- ChemDraw 22.2 (OCTET_STRESS_CHEMDRAW=1, after Rust): it opens the CDXML in Update's EMF and saves it again ----

if (rustRan && process.env.OCTET_STRESS_CHEMDRAW === "1" && existsSync(join(work, "messy.emf"))) {
  const emf = readFileSync(join(work, "messy.emf"));
  const tag = emf.indexOf("Octet CDXML\0"), size = emf.readUInt32LE(tag - 12 + 4), len = emf.readUInt32LE(tag - 4);
  const inEmf = emf.subarray(tag + 12, tag - 4 + Math.min(len + 4, size - 8)).toString("utf8").replace(/\0+$/, "");
  const file = join(work, "from-emf.cdxml"), saved = join(work, "from-chemdraw.cdxml"), lock = process.env.OCTET_STRESS_CHEMDRAW_LOCK ?? join(tmpdir(), "chemdraw.lock");
  writeFileSync(file, inEmf);
  let locked = false;
  for (let k = 0; k < 90 && !locked; k++) { try { mkdirSync(lock); locked = true; } catch { spawnSync("sleep", ["20"]); } }
  if (locked) {
    try {
      spawnSync("open", ["-g", "-a", "/Applications/ChemDraw 22.2.0.app", file]);
      const ask = (script: string) => spawnSync("osascript", ["-e", `tell application id "com.perkinelmer.ChemDraw.22" to ${script}`], { encoding: "utf8", timeout: 60_000 }).stdout.trim();
      let opened = false;
      for (let k = 0; k < 90 && !(opened = ask("get name of every document").split(", ").includes("from-emf.cdxml")); k++) spawnSync("sleep", ["2"]);
      if (opened) {
        const r = spawnSync("osascript", ["-e", `tell application id "com.perkinelmer.ChemDraw.22" to save document "from-emf.cdxml" in (POSIX file "${saved}") as "ChemDraw XML"`, "-e", `tell application id "com.perkinelmer.ChemDraw.22" to close document "from-emf.cdxml" saving no`], { encoding: "utf8", timeout: 120_000 });
        const back = existsSync(saved) ? fromCdxml(readFileSync(saved, "utf8")).mol : undefined;
        check("O8.chemdraw", "ChemDraw 22.2 opens the CDXML in the 200-structure Update EMF, and its save reads back in Octet with every atom", !!back && back.atoms.length === messy.atoms.length, back ? `${back.atoms.length} of ${messy.atoms.length} atoms` : `no file: ${r.stderr}`);
      } else console.log("lowinmac-stress: ChemDraw did not open the file in 3 minutes (a dialog of its own may be waiting); the ChemDraw case did not run");
    } finally { rmSync(lock, { recursive: true, force: true }); }
  } else check("O8.chemdraw", "ChemDraw 22.2 round trip", false, "the ChemDraw lock stayed taken for 30 minutes");
}

// ---- Settings > General in WebKit (OCTET_STRESS_URL): the LibreOffice row, light and dark, mouse and keyboard ----

const UI = String.raw`
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (find, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = find(); if (v) return v; await wait(100); } return null; };
const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const out = { dark: matchMedia("(prefers-color-scheme: dark)").matches };
await until(() => document.querySelector(".home, .editor"));
await wait(1200);
button("Skip")?.click();
await wait(800);
document.querySelector(".home-tile.new")?.click();
await until(() => document.querySelector(".actions .action"));
[...document.querySelectorAll(".coach button")].find((b) => /skip/i.test(b.textContent))?.click();
await wait(400);
document.querySelector(".actions-reopen")?.click();
await wait(500);
document.querySelector(".actions-settings")?.click();
await until(() => document.querySelector(".module"));
[...document.querySelectorAll(".module")].find((m) => m.textContent.trim() === "General")?.click();
await wait(800);
const add = await until(() => button("Add to LibreOffice"), 3000);
out.row = !!add;
const style = (b) => { const s = getComputedStyle(b), r = b.getBoundingClientRect(); return { font: s.font, height: Math.round(r.height), padding: s.padding, radius: s.borderRadius, color: s.color, background: s.backgroundColor, border: s.border }; };
const siblings = [...document.querySelectorAll(".settings-main button.text-button")].filter((b) => b !== add);
out.add = add && style(add);
out.siblings = siblings.map((b) => [b.textContent.trim(), style(b)]);
out.keyboard = !!add && add.tagName === "BUTTON" && add.tabIndex >= 0 && !add.disabled;
add?.focus();
out.focused = document.activeElement === add;
add?.click();
await wait(900);
out.notice = [...document.querySelectorAll("[role=alert], [role=status], .notice, .notice-bar")].map((e) => e.textContent.trim()).filter(Boolean).join(" | ").slice(0, 300);
const search = document.querySelector('input[aria-label="Search settings"]');
const found = {};
for (const q of ["libreoffice", "calc", "oxt", "writer", "LibreOffice"]) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(search, q);
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(500);
  found[q] = !!button("Add to LibreOffice");
}
out.search = found;
out.look = window.__look;
out.errors = window.__errors;
return JSON.stringify(out);
`;
const url = process.env.OCTET_STRESS_URL;
if (url && process.platform === "darwin") {
  const uiFile = join(work, "ui.js"), swift = read("../scripts/look/webkit.swift");
  writeFileSync(uiFile, UI);
  const dark = join(work, "webkit-dark.swift");
  writeFileSync(dark, swift.replace("app.setActivationPolicy(.accessory)", "app.setActivationPolicy(.accessory)\napp.appearance = NSAppearance(named: .darkAqua)"));
  for (const [mode, file] of [["light", here("../scripts/look/webkit.swift")], ["dark", dark]] as const) {
    const r = spawnSync("swift", [file, url, uiFile], { encoding: "utf8", timeout: 300_000 });
    let o: any;
    try { o = JSON.parse(r.stdout.trim().split("\n").pop()!); } catch { check(`ui.${mode}`, `WebKit (${mode}) runs`, false, `${r.stdout}${r.stderr}`.slice(-800)); continue; }
    check(`ui.${mode}.mode`, `WebKit: the page is in ${mode} mode`, o.dark === (mode === "dark"));
    check(`ui.${mode}.row`, `Settings > General shows Add to LibreOffice on the Mac (${mode})`, o.row);
    const same = o.siblings.length > 0 && o.siblings.every(([, s]: [string, Record<string, string>]) => ["font", "height", "padding", "radius", "color", "background", "border"].every((k) => s[k] === o.add?.[k]));
    check(`ui.${mode}.match`, `Add to LibreOffice is drawn as every other text button in Settings (${mode})`, same, JSON.stringify({ add: o.add, siblings: o.siblings }).slice(0, 700));
    check(`ui.${mode}.keyboard`, `A keyboard user reaches and presses Add to LibreOffice (${mode})`, o.keyboard && o.focused);
    check(`ui.${mode}.notice`, `With no LibreOffice to open (a browser here), the window says Octet cannot open LibreOffice (${mode})`, /Octet cannot open LibreOffice/.test(o.notice), o.notice);
    check(`ui.${mode}.search`, `Settings search finds the row by libreoffice, calc, oxt and writer (${mode})`, Object.values(o.search).every(Boolean), JSON.stringify(o.search));
    // A browser has no Octet shell: the button's call to it fails there, and only there.
    const errors = o.errors.filter((e: string) => !e.includes("__TAURI_INTERNALS__"));
    check(`ui.${mode}.look`, `No look: errors and no page errors but the missing shell's (${mode})`, !o.look.length && !errors.length, JSON.stringify([...o.look, ...errors]).slice(0, 600));
  }
} else console.log("lowinmac-stress: the WebKit cases are off (OCTET_STRESS_URL=http://localhost:1472/ runs them on a Mac)");

// ---- Results ----

rmSync(work, { recursive: true, force: true });
const failed = results.filter((c) => !c.ok);
for (const c of results) if (c.ok) console.log(`ok   ${c.id}: ${c.title}${c.detail ? ` (${c.detail})` : ""}`);
for (const c of failed) console.error(`FAIL ${c.id}: ${c.title}\n     ${c.detail}`);
console.log(`lowinmac-stress: ${results.length - failed.length} of ${results.length} cases pass.${failed.length ? ` Failing: ${failed.map((c) => c.id).join(", ")}.` : ""}`);
if (failed.length) process.exitCode = 1;
