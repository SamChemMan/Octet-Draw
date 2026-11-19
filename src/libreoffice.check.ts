// Run: node src/libreoffice.check.ts. Octet in LibreOffice on Linux, Windows and the Mac (tools/libreoffice, decision
// 0025, issue 48): Copy's formats, and the extension that Settings > General > Add to LibreOffice opens. The
// extension's files are the ones src-tauri/build.rs puts in octet-draw.oxt, which every installer carries, its
// manifest registers the Python component and both configuration files, the Python component is the service the job
// and the menu items name, and it runs only Octet, with fixed arguments and no shell. src/libreoffice.check.py runs
// its Windows and Mac branches, EMF pictures, Calc, read-only documents and crops with stand-ins for LibreOffice.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(path(p), "utf8");
const dir = "../tools/libreoffice/";
const conf = JSON.parse(read("../src-tauri/tauri.conf.json"));
const build = read("../src-tauri/build.rs"), main = read("../src-tauri/src/main.rs"), objects = read("../src-tauri/src/objects.rs");
const lo = read("../src-tauri/src/libreoffice.rs"), ole = read("../src-tauri/src/ole.rs");
const linuxRs = read("../src-tauri/src/linux.rs");
const clipboard = read("../src-tauri/src/clipboard.rs"), settings = read("./SettingsWindow.tsx");
const py = read(dir + "octet_draw.py"), manifest = read(dir + "META-INF/manifest.xml"), description = read(dir + "description.xml");
const jobs = read(dir + "Jobs.xcu"), addons = read(dir + "Addons.xcu");

// Copy on Linux: the PNG (with the CDXML in it), the Mac's PDF and the SVG, which Settings names. Paste reads the PDF,
// and LibreOffice's own copy of a picture (SVXB), which holds the PDF as it was pasted in.
const linux = clipboard.match(/System::Linux => match k \{([\s\S]*?)\n {8}\},/)?.[1] ?? "";
assert.ok(/Png => &\["image\/png"\]/.test(linux) && /Pdf => &\["application\/pdf"\]/.test(linux) && /Svg => &\["image\/svg\+xml"\]/.test(linux) && /Svxb => &\[SVXB\]/.test(linux), "Linux's clipboard names");
assert.ok(/put\(Kind::Png, png\?\.0\);\s*if let Some\(pdf\) = pdf \{\s*libreoffice = svxb_of\(&pdf\);\s*put\(Kind::Pdf, pdf\);\s*\}\s*(\/\/.*\s*)*put\(Kind::Svg,/.test(clipboard), "Copy puts the PNG, the PDF and the SVG, in that order");
assert.ok(/const PICTURE = .*LINUX \? "PDF, PNG and SVG"/.test(settings), "Settings names Linux's pictures");
assert.ok(/\[Octet, Object, Cdxml, Cdx, Molfile, Smiles, Pdf, Svxb,/.test(clipboard), "paste reads the PDF and LibreOffice's copy");

// The .oxt: exactly the extension's files, with Octet's identifier, bundled on Linux and opened from Settings.
const files = (sub: string): string[] => readdirSync(path(dir + sub), { withFileTypes: true }).filter((e) => !e.name.startsWith(".") && e.name !== "__pycache__").flatMap((e) => (e.isDirectory() ? files(`${sub}${e.name}/`) : [`${sub}${e.name}`]));
const listed = [...(build.match(/const OXT: \[&str; \d+\] = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual([...listed].sort(), files("").sort(), "build.rs puts every file of tools/libreoffice in the .oxt, and nothing else");
assert.ok(build.includes(`const OXT: [&str; ${listed.length}]`));
assert.equal(description.match(/<identifier value="([^"]+)"\/>/)?.[1], conf.identifier);
assert.ok(description.includes('<version value="0.0.0"/>') && build.includes('replace("<version value=\\"0.0.0\\"/>"'), "build.rs writes Octet's version");
// Every installer carries the .oxt (the Mac, Windows and Linux), and Add to LibreOffice is there on every system.
assert.equal(conf.bundle.resources["gen/octet-draw.oxt"], "libreoffice/octet-draw.oxt", "every bundle has the .oxt");
assert.ok(!existsSync(path("../src-tauri/tauri.linux.conf.json")), "no Linux-only configuration");
assert.ok(lo.includes('resolve("libreoffice/octet-draw.oxt"') && /\blibreoffice::add_to_libreoffice,/.test(main) && !/cfg\([^)]*\)\] (libreoffice::)?add_to_libreoffice/.test(main), "Add to LibreOffice opens the bundled .oxt, on every system");
// In LibreOffice's Extension Manager through `unopkg gui`, as fixed arguments: the .oxt opened as a file asks to be
// installed again after LibreOffice's restart, so it is opened only when there is no unopkg or it does not start. The
// Mac and Windows find unopkg (libreoffice::tests); Windows starts it with no console.
assert.ok(lo.includes('crate::linux::spawn(std::process::Command::new("unopkg").arg("gui").arg(&oxt)).or_else(|_| crate::open_external(&oxt))'), "Linux runs unopkg gui on the .oxt");
assert.ok(lo.includes('if found().is_some_and(|unopkg| start(&unopkg, &oxt).is_ok())') && lo.includes('c.arg("gui").arg(oxt)') && lo.includes("c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW"), "the Mac and Windows run unopkg gui, else open the .oxt");
assert.ok(lo.includes('"org.libreoffice.script"') && lo.includes('"Software\\\\LibreOffice\\\\UNO\\\\InstallPath"') && lo.includes('App Paths\\\\unopkg.exe'), "where unopkg is looked for");
// From an AppImage, the programs Octet starts (unopkg, xdg-open and the other openers) get the session's environment,
// not the AppImage's.
assert.ok(/#\[cfg\(target_os = "linux"\)\]\npub fn open_external[\s\S]*?for mut opener in ::open::commands\(target\) \{\n\s*result = linux::spawn\(&mut opener\);/.test(main), "the openers start through linux::spawn");
assert.ok(main.includes('linux::spawn(std::process::Command::new("xdg-open")'), "the folder of a file starts through linux::spawn");
assert.ok(/if let Some\(\(_, mount\)\) = appimage\(\) \{\n\s*for \(key, value\) in session_env\(std::env::vars_os\(\), &mount\)/.test(linuxRs), "spawn gives the session's environment");
// The button says so when it cannot open the extension (no LibreOffice, or nothing that opens an .oxt): the page runs
// the command and shows the failure as a notice, as it does for every other command.
assert.ok(settings.includes("onClick={p.onAddToLibreOffice}>Add to LibreOffice<"), "Settings has the button");
assert.ok(/\n {6}d\("general", "LibreOffice", "Edit structures in LibreOffice", "libreoffice writer impress draw calc [^"]*", \(\n\s*<button className="text-button" onClick=\{p\.onAddToLibreOffice\}>/.test(settings), "the row shows on every system");
const editor = read("./Editor.tsx");
assert.ok(editor.includes('const addToLibreOffice = () => invoke("add_to_libreoffice").then(() => undefined, (e) => { const text = failure("Octet cannot open LibreOffice.", e); setNotice(text); return text; });') && editor.includes("add_to_libreoffice: () => void addToLibreOffice(),") && editor.includes("onAddToLibreOffice={() => commands.current.add_to_libreoffice()}"), "a failure shows a notice");
// MCP: run_command add_to_libreoffice, as a command that opens a dialog (LibreOffice's Extension Manager asks the user),
// so Octet with no window refuses it (mcp.check.ts).
assert.ok(/\n {2}"add_to_libreoffice",\n\] as const;/.test(read("./mcp.ts")) && /dialog: \(id\) => .*\|\| id === "add_to_libreoffice",/.test(editor), "the MCP command");

// The manifest registers the Python component and the configuration, and each file it names is there.
const entries = [...manifest.matchAll(/manifest:media-type="([^"]+)" manifest:full-path="([^"]+)"/g)].map((m) => [m[2], m[1]]);
assert.deepEqual(entries, [["octet_draw.py", "application/vnd.sun.star.uno-component;type=Python"], ["Jobs.xcu", "application/vnd.sun.star.configuration-data"], ["Addons.xcu", "application/vnd.sun.star.configuration-data"]]);
for (const [file] of entries) assert.ok(listed.includes(file), file);

// One service: the Python component registers it, the job runs it for each new view, and the menu items call it.
const service = py.match(/^SERVICE = "([^"]+)"$/m)?.[1];
assert.ok(service && py.includes("g_ImplementationHelper.addImplementation(Octet, SERVICE, (SERVICE,))"));
assert.ok(jobs.includes(`<prop oor:name="Service"><value>${service}</value></prop>`) && jobs.includes('<node oor:name="OnViewCreated" oor:op="fuse">'));
assert.ok(addons.includes(`<value>service:${service}?insert</value>`) && addons.includes("<value>Octet Drawing</value>"), "Insert > Octet Drawing");
assert.ok(addons.includes("<value>com.sun.star.text.TextDocument,com.sun.star.presentation.PresentationDocument,com.sun.star.drawing.DrawingDocument,com.sun.star.sheet.SpreadsheetDocument</value>"), "in Writer, Impress, Draw and Calc");
assert.ok(py.includes('"service:" + SERVICE + "?edit"') && py.includes('"Edit in Octet Draw"'), "the context menu item");
assert.ok(/if command == "insert":[\s\S]*elif command == "edit" and not read_only\(controller\):/.test(py), "the commands the menu items send");
assert.equal(py.match(/^APP_ID = "([^"]+)"$/m)?.[1], conf.identifier, "the folder a Flatpak Octet can read");

// It runs Octet only, with its fixed arguments and no shell. Linux: through the user's service manager (systemd-run,
// which takes $$ for $), else directly. Windows: the program Octet's Office class names. The Mac: /usr/bin/open -b
// Octet's id. Nothing else in it runs a program.
const runs = [...py.matchAll(/\b(subprocess\.\w+|os\.(system|popen|exec\w*|spawn\w*|posix_spawn\w*|startfile)|eval|exec)\s*\(/g)].map((m) => m[1]);
assert.deepEqual(runs, ["subprocess.run", "subprocess.Popen", "subprocess.Popen", "subprocess.run"]);
assert.ok(py.includes('subprocess.Popen([program] + args, ') && py.includes('subprocess.run(["/usr/bin/open", "-b", APP_ID, path], '), "Windows and the Mac");
assert.equal(py.match(/^CLSID = "([^"]+)"$/m)?.[1], ole.match(/pub const CLSID: &str = "([^"]+)";/)?.[1], "Octet's Office class");
// The program's name (Update in Writer, Impress, Draw, Calc) from the document's service, then the document's first
// 260 characters.
assert.ok(py.includes('program = next((name for service_name, name in DOCUMENTS if self.doc.supportsService(service_name)), "")') && py.includes('title = title.replace("\\0", "")[:260]') && py.includes('return ["--object", path] + (["--app", program] if program else []) + ["--host", title]') && py.includes("args = command + args") && !/shell\s*=/.test(py));
assert.ok(py.includes('DOCUMENTS = (("com.sun.star.text.TextDocument", "Writer"), ("com.sun.star.presentation.PresentationDocument", "Impress"), ("com.sun.star.drawing.DrawingDocument", "Draw"), ("com.sun.star.sheet.SpreadsheetDocument", "Calc"))'), "Impress before Draw, and Calc");
// Every file it opens: never through a link where the system has O_NOFOLLOW, and as bytes on Windows. os.O_NOFOLLOW
// itself is not named: Windows' Python has none.
const opens = [...py.matchAll(/os\.open\(([^\n]*)\)/g)].map((m) => m[1]);
assert.ok(opens.length === 3 && opens.every((o) => o.includes("NOFOLLOW | BINARY")) && !py.includes("os.O_NOFOLLOW") && !py.includes("os.O_BINARY"), opens.join("\n"));
assert.ok(py.includes('NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)') && py.includes('BINARY = getattr(os, "O_BINARY", 0)'));
// KillMode=process: when that Octet ends, the service manager leaves what it started (the next Octet after an update).
assert.ok(py.includes('subprocess.run([manager, "--user", "--quiet", "--collect", "--property=KillMode=process"] + setenv + ["--"] + [a.replace("$", "$$") for a in args], ') && py.includes('manager = shutil.which("systemd-run")'));
assert.ok(py.includes("subprocess.Popen(args, "));
const octet = py.match(/\ndef octet\(\):\n([\s\S]*?)\n\n/)?.[1] ?? "";
assert.deepEqual([...octet.matchAll(/return (.+)$/gm)].map((m) => m[1]), ["[noted]", '["/usr/bin/octet"]', '[flatpak, "run", APP_ID]', "[found] if found else None"], "the programs it runs: Octet, or Flatpak's Octet");
assert.ok(['Some("--object")', 'Some("--host")', 'Some("--app")'].every((f) => objects.includes(f)), "Octet reads those arguments");
// Quit in Octet with an object window open: the extension still hears `closed`, as Quit destroys no window.
assert.ok(/tauri::RunEvent::Exit => \{[^}]*objects::shutdown\(/.test(main) && /pub fn shutdown\(files: &Files\) \{[\s\S]*?close\(files, id, false\);/.test(objects), "Quit closes the objects in files");
// Octet's own path (an AppImage's) in the file the extension reads first: Octet's config folder, written when Octet
// starts and at Add to LibreOffice.
assert.ok(linuxRs.includes('app.path().app_config_dir()') && linuxRs.includes('dir.join("octet-path")') && linuxRs.includes(".mode(0o600)"));
assert.ok(main.includes("linux::note_path(handle);") && /async fn add_to_libreoffice[\s\S]*?linux::note_path\(&app\);/.test(lo));
assert.ok(py.includes('os.path.join(config, APP_ID, "octet-path"), os.O_RDONLY | NOFOLLOW | BINARY'));
assert.ok(py.includes("O_EXCL | NOFOLLOW | BINARY, 0o600") && py.includes('tempfile.mkdtemp(prefix="libreoffice-", dir=base)') && py.includes('return tempfile.mkdtemp(prefix="octet-libreoffice-")'), "a private folder and new files");
// Impress, Draw and Calc insert a new drawing from a private copy of the picture checked: Octet's file can be gone by
// then.
assert.ok(py.includes('tempfile.mkstemp(suffix="." + (kind_of(data) or "pdf"))') && !py.includes("systemPathToFileUrl(self.path)"), "Insert reads a private copy");
// Octet opens EMF objects, and on the Mac a picture the extension marked (objects::marked) opens as an object.
assert.ok(objects.includes('"emf" => Some(Kind::Emf),') && objects.includes('Kind::Emf => crate::export::tree(svg).map(|t| crate::vector::make_emf(&t, Some(cdxml), None)),'), "EMF objects");
assert.ok(main.includes("tauri::RunEvent::Opened { urls } => open::offer(_app, objects::opened(_app, urls.into_iter().filter_map(|u| u.to_file_path().ok())), None),"), "the Mac's hand-off");
assert.ok(py.includes('EMF_TAG = b"Octet CDXML\\0"') && read("../src-tauri/src/vector.rs").includes('const CDXML_TAG: &[u8] = b"Octet CDXML\\0";'), "the EMF comment's tag");

// Python parses it, and the extension's test for a drawing in a PDF answers as Octet would: Octet's PDF, the PDF as
// LibreOffice keeps it (deflated with no /Filter), ChemDraw's plain CDXML, and a PDF with no drawing.
const cdxml = '<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd" >\n<CDXML><page/></CDXML>\n';
const pdf = (dict: string, data: Buffer) => Buffer.concat([Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Metadata 5 0 R >>\nendobj\n5 0 obj\n<< ${dict} >>\nstream\n`), data, Buffer.from("\nendstream\nendobj\n%%EOF\n")]);
const cases: [Buffer, boolean][] = [
  [pdf(`/Length 9 /Type /Metadata /Subtype /XML /Filter /FlateDecode /Vendor /org.octet`, deflateSync(cdxml)), true],
  [pdf(`/Length 9/Subtype/XML/Type/Metadata/Vendor/org.octet`, deflateSync(cdxml)), true],
  [pdf(`/Type /Metadata /Subtype /XML`, Buffer.from(cdxml)), true],
  [pdf(`/Type /Metadata /Subtype /XML`, Buffer.from("<x:xmpmeta/>")), false],
  [pdf(`/Filter /FlateDecode`, deflateSync(cdxml)), false],
  // A PDF filled with the word endstream: each one counts to the 2,000 places looked at, so a click stays fast.
  [Buffer.concat([Buffer.from("endstream ".repeat(1999)), pdf(`/Type /Metadata /Subtype /XML`, Buffer.from(cdxml))]), true],
  [Buffer.concat([Buffer.from("endstream ".repeat(2000)), pdf(`/Type /Metadata /Subtype /XML`, Buffer.from(cdxml))]), false],
];
const stubs = `import sys, types
class Any:
    def __init__(self, *a, **k): pass
    def __getattr__(self, n): return lambda *a, **k: None
made = {}
class Module(types.ModuleType):
    def __getattr__(self, n): return made.setdefault((self.__name__, n), type(n, (Any,), {}))
for n in ["uno", "unohelper", "com", "com.sun", "com.sun.star", "com.sun.star.awt", "com.sun.star.document", "com.sun.star.lang", "com.sun.star.task", "com.sun.star.ui", "com.sun.star.util"]:
    sys.modules[n] = Module(n)
sys.path.insert(0, sys.argv[1])
import octet_draw
octet_draw.SYSTEM = "linux"
print(" ".join(str(octet_draw.has_drawing(bytes.fromhex(h))) for h in sys.argv[2:]))
# The path Octet notes: a program the user owns and runs, named by its real path. Not a link, a file others can
# change, a file that does not run, a path file that is a link or a path file others can change.
import os, shutil, tempfile
def note(target, mode=0o755, linked=False, path_mode=0o600):
    home = os.environ["XDG_CONFIG_HOME"] = os.path.realpath(tempfile.mkdtemp())
    app, folder = os.path.join(home, "app"), os.path.join(home, octet_draw.APP_ID)
    os.mkdir(folder)
    open(app, "w").close()
    os.chmod(app, mode)
    os.symlink(app, os.path.join(home, "link"))
    with open(os.path.join(home, "path"), "w") as f:
        f.write(os.path.join(home, target))
    os.chmod(os.path.join(home, "path"), path_mode)
    if linked:
        os.symlink(os.path.join(home, "path"), os.path.join(folder, "octet-path"))
    else:
        os.rename(os.path.join(home, "path"), os.path.join(folder, "octet-path"))
    found = octet_draw.noted_octet()
    shutil.rmtree(home)
    return found == app
print(" ".join(str(x) for x in [note("app"), note("link"), note("app", 0o757), note("app", 0o644), note("app", linked=True), note("app", path_mode=0o620), note("missing")]))
# A start that fails (the service manager first, then Octet itself): the user hears it and the session's folder goes.
# The service manager gets KillMode=process, and the document's name goes as its first 260 characters.
import json, subprocess
calls, said = [], []
def fail(args, **options):
    calls.append(args)
    raise (ValueError if len(calls) == 1 else OSError)()
subprocess.run = subprocess.Popen = fail
shutil.which = lambda name: "/usr/bin/systemd-run"
octet_draw.octet = lambda: ["/gone/octet"]
octet_draw.message = lambda ctx, controller, text: said.append(text)
class Document:
    def supportsService(self, name): return name == "com.sun.star.text.TextDocument"
    def getTitle(self): return "T" * 300
session = octet_draw.Session.__new__(octet_draw.Session)
session.ctx = session.controller = None
session.doc, session.folder = Document(), tempfile.mkdtemp()
session.path = os.path.join(session.folder, "drawing.pdf")
octet_draw.start(session)
print(json.dumps([os.path.exists(session.folder), said, calls[0][:5], [len(c[-1]) for c in calls]]))`;
const python = spawnSync("python3", ["-I", "-B", "-c", stubs, path(dir), ...cases.map(([b]) => b.toString("hex"))], { encoding: "utf8" });
if (python.error) {
  console.log("libreoffice: python3 is not here; the Python is not run");
} else {
  assert.equal(python.status, 0, python.stderr);
  const [drawings, noted, started] = python.stdout.trim().split("\n");
  assert.equal(drawings, cases.map(([, d]) => (d ? "True" : "False")).join(" "));
  assert.equal(noted, "True False False False False False False", "the noted path: a real program, and nothing else");
  const notFound = "LibreOffice cannot find Octet Draw. Open Octet Draw once, then try again.";
  assert.deepEqual(JSON.parse(started), [false, [notFound], ["/usr/bin/systemd-run", "--user", "--quiet", "--collect", "--property=KillMode=process"], [260, 260]], "a start that fails says so and leaves no folder");
  // LibreOffice's own Python is 3.8 or later.
  const old = spawnSync("python3", ["-I", "-B", "-c", "import ast, sys; ast.parse(open(sys.argv[1]).read(), feature_version=(3, 8))", path(dir + "octet_draw.py")], { encoding: "utf8" });
  assert.equal(old.status, 0, old.stderr);
  // Windows, the Mac, EMF pictures, Calc, read-only documents and crops (src/libreoffice.check.py). Its last line is
  // the time of the double-click check on a 64 MB picture with no drawing, the median of 5.
  const more = spawnSync("python3", ["-I", "-B", path("./libreoffice.check.py"), path(dir)], { encoding: "utf8" });
  assert.equal(more.status, 0, more.stderr);
  const timing = JSON.parse(more.stdout.trim().split("\n").at(-1)!);
  assert.ok(timing.pdf_ms < 1000 && timing.emf_ms < 50, JSON.stringify(timing));
  console.log(`libreoffice: double-click check on 64 MB: PDF ${timing.pdf_ms} ms, EMF ${timing.emf_ms} ms`);
}

// The .oxt that build.rs made, when there is one: a stored zip of those files, with Octet's version.
const oxt = path("../src-tauri/gen/octet-draw.oxt");
if (existsSync(oxt)) {
  const zip = readFileSync(oxt), version = JSON.parse(read("../package.json")).version;
  const found: string[] = [];
  for (let at = 0; zip.readUInt32LE(at) === 0x04034b50; ) {
    const size = zip.readUInt32LE(at + 18), name = zip.toString("utf8", at + 30, at + 30 + zip.readUInt16LE(at + 26));
    const data = zip.subarray(at + 30 + name.length, at + 30 + name.length + size);
    const want = readFileSync(path(dir + name)).toString("utf8").replace('<version value="0.0.0"/>', `<version value="${version}"/>`);
    assert.equal(zip.readUInt16LE(at + 8), 0, `${name} is stored`);
    assert.equal(data.toString("utf8"), want, `${name} in the .oxt is the source`);
    found.push(name);
    at += 30 + name.length + size;
  }
  assert.deepEqual(found, listed);
}

console.log("libreoffice: ok");
