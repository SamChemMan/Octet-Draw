// Run: node src/libreoffice-paste.check.ts. Issue 48 (1.1.3): a paste from Octet into LibreOffice Writer and Calc opens
// in Octet on Windows with LibreOffice 26.2 or later (Impress and Draw only with the Office object off), and into Calc on Linux
// (docs/plans/issue-48-48w-1-1-3.md, decision 0025). Copy on Windows and
// Linux puts LibreOffice's own copy of a picture (SVXB) last, holding the PDF. This checks Copy's names and SVXB's form
// in clipboard.rs, which picture each LibreOffice program takes from Octet's copy on each system (its paste tables,
// from LibreOffice's public source), and that the extension opens such a picture in a Calc sheet. clipboard::tests
// (libreoffice_reads_octets_svxb, windows_copy_types) check the bytes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(path(p), "utf8");
const clip = read("../src-tauri/src/clipboard.rs");

// The names: Windows registers the name in the MIME type's windows_formatname (vcl/win/dtrans/ftransl.cxx), Linux uses
// the MIME type. The Mac reads LibreOffice's copy but puts none.
const svxb = clip.match(/pub const SVXB: &str = "(.*)";/)?.[1] ?? "";
const svxbWindows = clip.match(/pub const SVXB_WINDOWS: &str = "(.*)";/)?.[1] ?? "";
assert.equal(svxb.replaceAll('\\"', '"'), 'application/x-openoffice-svxb;windows_formatname="SVXB (StarView Bitmap/Animation)"', "LibreOffice's MIME type for SVXB (sot/source/base/exchange.cxx)");
assert.equal(svxbWindows, "SVXB (StarView Bitmap/Animation)");
const system = (s: string) => clip.match(new RegExp(`System::${s} => match k \\{([\\s\\S]*?)\\n {8}\\},`))?.[1] ?? "";
assert.ok(/Svxb => &\[SVXB_WINDOWS\]/.test(system("Windows")) && /Svxb => &\[SVXB\]/.test(system("Linux")), "Windows and Linux names");
assert.ok(/Some\(svg\) if s == System::Mac => mac_picture\(svg, cdxml\)\?/.test(clip) && /if let Some\(svg\) = svg\.filter\(\|_\| s != System::Mac\)/.test(clip), "the Mac's copy makes no SVXB (LibreOffice for the Mac spells it svbx and reads none)");

// The form, as vcl's TypeSerializer::readGraphic reads it: "NAT5", an empty version 1 header, the link's version 1
// header with 10 bytes of fields, type 12 (GfxLinkType::NativePdf, include/vcl/gfxlink.hxx), the size, user 0, the PDF.
assert.ok(clip.includes('Some([b"NAT5".as_slice(), &[1, 0, 0, 0, 0, 0], &[1, 0, 10, 0, 0, 0], &12u16.to_le_bytes(), &n.to_le_bytes(), &[0; 4], pdf].concat())'), "svxb_of's form");
// Last, after Octet's JSON, so every type Word, PowerPoint, Excel and ChemDraw read keeps its place.
assert.ok(/put\(Kind::Octet, j\.into_bytes\(\)\);\s*\}\s*if let Some\(b\) = libreoffice \{\s*put\(Kind::Svxb, b\);\s*\}\s*Ok\(out\)/.test(clip), "SVXB goes last");
// Windows makes the PDF after the EMF, on the thread beside the bitmap.
assert.ok(/let emf = \|\| \(crate::vector::make_office_emf\(&tree, cdxml\), crate::export::pdf_pages\(&\[&tree\], cdxml, None\)\.ok\(\)\);\s*let \(made, bitmap\) = std::thread::scope/.test(clip), "the PDF is made while the bitmap is drawn");

// Each program takes the first format in its own table that the clipboard has; the clipboard's order does not count
// (sot/source/base/formats.cxx, GetTransferableAction_Impl). The tables' picture and object formats, in order:
const TABLES: Record<string, string[]> = {
  // The Writer free-area copy table.
  Writer: ["SVXB", "SD_OLE", "EMBED_SOURCE", "EMBEDDED_OBJ", "PDF", "PNG", "JPEG", "BITMAP", "GDIMETAFILE", "EMBED_SOURCE_OLE", "EMBEDDED_OBJ_OLE"],
  // sd View::InsertData with no format (DoPaste). "OLE" is its OLE step: with EMBED_SOURCE_OLE (or EMBEDDED_OBJ_OLE)
  // and OBJECTDESCRIPTOR_OLE it inserts the object only when there is no GDIMETAFILE, and otherwise inserts the
  // GDIMETAFILE and stops, before SVXB.
  Impress: ["PDF", "EMBED_SOURCE", "OLE", "SVXB", "GDIMETAFILE", "BITMAP"],
  // The Calc free-area copy table, which ScViewFunc::PasteFromSystem asks first.
  Calc: ["SVXB", "SD_OLE", "EMBED_SOURCE", "EMBEDDED_OBJ", "GDIMETAFILE", "PNG", "JPEG", "BITMAP", "EMBED_SOURCE_OLE", "EMBEDDED_OBJ_OLE"],
};
// What LibreOffice sees in Octet's copy on each system. Windows: CF_ENHMETAFILE is EMF, from which GDIMETAFILE is
// offered too (vcl/source/treelist/transfer.cxx), CF_DIB is BITMAP, and with Settings' Office object on "Embed Source"
// and "Object Descriptor" are EMBED_SOURCE_OLE and OBJECTDESCRIPTOR_OLE (sot/source/base/exchange.cxx). Linux: image/png, application/pdf and SVXB. The Mac: com.adobe.pdf is application/pdf, and
// nothing else of Octet's is a picture LibreOffice knows (vcl/osx/DataFlavorMapping.cxx).
const OFFERS: Record<string, string[]> = {
  "Windows, Office object on": ["EMBED_SOURCE_OLE", "OBJECTDESCRIPTOR_OLE", "EMF", "GDIMETAFILE", "BITMAP", "SVXB"],
  "Windows, Office object off": ["EMF", "GDIMETAFILE", "BITMAP", "SVXB"],
  Linux: ["PNG", "PDF", "SVXB"],
  Mac: ["PDF"],
};
// Draw pastes through the same View::InsertData as Impress.
TABLES.Draw = TABLES.Impress;
const ole = (offer: string[]) => (offer.includes("EMBED_SOURCE_OLE") || offer.includes("EMBEDDED_OBJ_OLE")) && offer.includes("OBJECTDESCRIPTOR_OLE");
const takes = (program: string, offer: string[]) => {
  const f = TABLES[program].find((f) => (f === "OLE" ? ole(offer) : offer.includes(f)));
  return f !== "OLE" ? f : offer.includes("GDIMETAFILE") ? "GDIMETAFILE" : "EMBED_SOURCE_OLE";
};
for (const [where, offer] of Object.entries(OFFERS)) {
  for (const program of Object.keys(TABLES)) {
    const got = takes(program, offer);
    // A PDF or an SVXB with the PDF in it: the picture is a PDF that LibreOffice keeps, which the extension opens.
    const opens = got === "PDF" || got === "SVXB";
    // Calc on the Mac takes nothing of Octet's as a PDF. Impress and Draw on Windows with the Office object on take
    // the EMF (converted, losing Octet's comment) in their OLE step, before SVXB.
    const want = !(where === "Mac" && program === "Calc") && !(where === "Windows, Office object on" && (program === "Impress" || program === "Draw"));
    assert.equal(opens, want, `${program} on ${where} takes ${got}`);
  }
}
// Before 1.1.3's SVXB, Windows' Writer took the bitmap and Calc the converted metafile: neither opened in Octet.
const before = OFFERS["Windows, Office object off"].filter((f) => f !== "SVXB");
assert.deepEqual([takes("Writer", before), takes("Impress", before), takes("Calc", before)], ["BITMAP", "GDIMETAFILE", "GDIMETAFILE"]);
assert.deepEqual([takes("Writer", OFFERS["Windows, Office object on"]), takes("Impress", OFFERS["Windows, Office object on"]), takes("Calc", OFFERS["Windows, Office object on"])], ["SVXB", "GDIMETAFILE", "SVXB"]);
// LibreOffice for Windows before 26.2 (24.2 to 25.8) reads the name "SVXB (StarView Bitmap/Animation)" as
// application/x-openoffice-svbx (its vcl/win/dtrans/ftransl.cxx table, line 132), which is no format it knows
// (sot/source/base/exchange.cxx has svxb). Commit dbdc2f17d64a (10 November 2025, in 26.2) mends the spelling. So
// there Octet's SVXB is not seen, and nothing pasted opens in Octet: Writer takes the bitmap, Calc the metafile.
for (const offer of [OFFERS["Windows, Office object on"], OFFERS["Windows, Office object off"]]) {
  const old = offer.filter((f) => f !== "SVXB");
  assert.deepEqual(["Writer", "Impress", "Calc"].map((p) => takes(p, old)), ["BITMAP", "GDIMETAFILE", "GDIMETAFILE"]);
}

// The extension: in a Calc sheet, the pasted picture (LibreOffice keeps it as "0fdp", the length, then the PDF, its
// /Metadata deflated with the /Filter taken off, as pdfium saves it) gets Edit in Octet Draw and opens on a
// double-click, on Windows with --app Calc. Stand-ins for LibreOffice's UNO modules and for starting Octet.
const script = String.raw`
import sys, types, struct, zlib, tempfile, shutil, atexit
tempfile.tempdir = tempfile.mkdtemp(prefix="octet-check-")
atexit.register(shutil.rmtree, tempfile.tempdir, True)
class Any:
    def __init__(self, *a, **k): pass
    def __getattr__(self, n): return lambda *a, **k: None
class Module(types.ModuleType):
    def __getattr__(self, n): return type(n, (Any,), {})
for n in ["unohelper", "com", "com.sun", "com.sun.star", "com.sun.star.awt", "com.sun.star.document", "com.sun.star.lang", "com.sun.star.task", "com.sun.star.ui", "com.sun.star.util"]:
    sys.modules[n] = Module(n)
uno = types.ModuleType("uno")
uno.Enum = lambda kind, value: (kind, value)
uno.createUnoStruct = lambda name: types.SimpleNamespace()
sys.modules["uno"] = uno
sys.path.insert(0, sys.argv[1])
import octet_draw as od
cdxml = b'<?xml version="1.0"?><!DOCTYPE CDXML><CDXML><page/></CDXML>'
packed = zlib.compress(cdxml)
pdf = b"%PDF-1.6\n3 0 obj\n<< /Type /Metadata /Subtype /XML /Length " + str(len(packed)).encode() + b" >>\nstream\n" + packed + b"\nendstream\nendobj\n%%EOF\n"
kept = b"0fdp" + struct.pack("<I", len(pdf)) + pdf
class Stream:
    def seek(self, n): pass
    def getLength(self): return len(kept)
    def readBytes(self, _, n): return (n, types.SimpleNamespace(value=kept[:n]))
class Provider:
    def storeGraphic(self, graphic, props): pass
od.service = lambda ctx, name, *a: Stream() if name.endswith("MemoryStream") else Provider()
class Doc:
    def supportsService(self, n): return n == "com.sun.star.sheet.SpreadsheetDocument"
    def getTitle(self): return "Sheet.ods"
    def isReadonly(self): return False
    def addCloseListener(self, l): pass
picture = types.SimpleNamespace(Graphic=types.SimpleNamespace(MimeType="application/pdf"), supportsService=lambda n: n == "com.sun.star.drawing.GraphicObjectShape")
class Shapes:
    def supportsService(self, n): return False
    def getCount(self): return 1
    def getByIndex(self, k): return picture
class Controller:
    def getModel(self): return Doc()
    def getSelection(self): return Shapes()
calc = Controller()
started = []
od.SYSTEM = "win32"
od.launch_windows = lambda args: started.append(args) or True
assert od.picture_of(None, picture.Graphic) == ("pdf", pdf) and od.has_drawing(pdf), "LibreOffice's form of the pasted PDF"
assert od.selected_picture(calc) is picture
assert od.Clicks(None, calc).mousePressed(types.SimpleNamespace(ClickCount=2, Buttons=1)) is True
assert started and started[0][-4:] == ["--app", "Calc", "--host", "Sheet.ods"] and started[0][1].endswith("drawing.pdf"), started
open(started[0][1].rsplit("drawing.pdf", 1)[0] + "closed", "wb").close()
print("ok")
`;
const py = spawnSync("python3", ["-I", "-B", "-c", script, path("../tools/libreoffice")], { encoding: "utf8", timeout: 120_000 });
if (py.error) console.log("libreoffice-paste: python3 is not here; the extension's Calc case is not run");
else assert.equal(py.stdout.trim().split("\n").at(-1), "ok", py.stderr.slice(-2000));

// The documents say what the source says, and the checklist asks for the real runs.
const decision = read("../docs/decisions/0025-libreoffice.md"), manual = read("../docs/testing/libreoffice-manual.md");
assert.ok(decision.includes("LibreOffice's own copy of a picture (SVXB, 1.1.3)") && decision.includes("spells SVXB `svbx`") && /Impress and Draw on Windows paste\s+LibreOffice's own picture/.test(decision), "decision 0025");
assert.ok(/LibreOffice 26\.2 or later/.test(decision) && /dbdc2f17d64a/.test(decision), "decision 0025: the Windows paste needs LibreOffice 26.2");
assert.ok(manual.includes("(W3) Settings > Import and export > Copy > Office object on") && manual.includes("(W3a)") && manual.includes("(L4) Copy a structure in Octet and paste it into Calc"), "the checklist");
assert.ok(/\(W3c\)/.test(manual) && /25\.8/.test(manual), "the checklist: an older LibreOffice for Windows");
console.log("libreoffice-paste: ok");
