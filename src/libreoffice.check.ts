// Run: node src/libreoffice.check.ts. Octet in LibreOffice on Linux (tools/libreoffice): Copy's formats, and the
// extension that Settings > General > Add to LibreOffice opens. The extension's files are the ones src-tauri/build.rs
// puts in octet-draw.oxt, its manifest registers the Python component and both configuration files, the Python
// component is the service the job and the menu items name, and it runs only Octet, with fixed arguments and no shell.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(path(p), "utf8");
const dir = "../tools/libreoffice/";
const conf = JSON.parse(read("../src-tauri/tauri.conf.json"));
const linuxConf = JSON.parse(read("../src-tauri/tauri.linux.conf.json"));
const build = read("../src-tauri/build.rs"), main = read("../src-tauri/src/main.rs"), objects = read("../src-tauri/src/objects.rs");
const clipboard = read("../src-tauri/src/clipboard.rs"), settings = read("./SettingsWindow.tsx");
const py = read(dir + "octet_draw.py"), manifest = read(dir + "META-INF/manifest.xml"), description = read(dir + "description.xml");
const jobs = read(dir + "Jobs.xcu"), addons = read(dir + "Addons.xcu");

// Copy on Linux: the PNG (with the CDXML in it), the Mac's PDF and the SVG, which Settings names. Paste reads the PDF,
// and LibreOffice's own copy of a picture (SVXB), which holds the PDF as it was pasted in.
const linux = clipboard.match(/System::Linux => match k \{([\s\S]*?)\n {8}\},/)?.[1] ?? "";
assert.ok(/Png => &\["image\/png"\]/.test(linux) && /Pdf => &\["application\/pdf"\]/.test(linux) && /Svg => &\["image\/svg\+xml"\]/.test(linux) && /Svxb => &\[SVXB\]/.test(linux), "Linux's clipboard names");
assert.ok(/put\(Kind::Png, png\?\.0\);\s*put\(Kind::Pdf, pdf\?\);\s*(\/\/.*\s*)*put\(Kind::Svg,/.test(clipboard), "Copy puts the PNG, the PDF and the SVG, in that order");
assert.ok(/const PICTURE = .*LINUX \? "PDF, PNG and SVG"/.test(settings), "Settings names Linux's pictures");
assert.ok(/\[Octet, Object, Cdxml, Cdx, Molfile, Smiles, Pdf, Svxb,/.test(clipboard), "paste reads the PDF and LibreOffice's copy");

// The .oxt: exactly the extension's files, with Octet's identifier, bundled on Linux and opened from Settings.
const files = (sub: string): string[] => readdirSync(path(dir + sub), { withFileTypes: true }).filter((e) => !e.name.startsWith(".") && e.name !== "__pycache__").flatMap((e) => (e.isDirectory() ? files(`${sub}${e.name}/`) : [`${sub}${e.name}`]));
const listed = [...(build.match(/const OXT: \[&str; \d+\] = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual([...listed].sort(), files("").sort(), "build.rs puts every file of tools/libreoffice in the .oxt, and nothing else");
assert.ok(build.includes(`const OXT: [&str; ${listed.length}]`));
assert.equal(description.match(/<identifier value="([^"]+)"\/>/)?.[1], conf.identifier);
assert.ok(description.includes('<version value="0.0.0"/>') && build.includes('replace("<version value=\\"0.0.0\\"/>"'), "build.rs writes Octet's version");
assert.deepEqual(linuxConf, { bundle: { resources: { "gen/octet-draw.oxt": "libreoffice/octet-draw.oxt" } } }, "Linux builds bundle the .oxt");
assert.ok(main.includes('resolve("libreoffice/octet-draw.oxt"') && /#\[cfg\(target_os = "linux"\)\] add_to_libreoffice/.test(main), "Add to LibreOffice opens the bundled .oxt, on Linux");
assert.ok(settings.includes('invoke("add_to_libreoffice")') && settings.includes(">Add to LibreOffice<"));

// The manifest registers the Python component and the configuration, and each file it names is there.
const entries = [...manifest.matchAll(/manifest:media-type="([^"]+)" manifest:full-path="([^"]+)"/g)].map((m) => [m[2], m[1]]);
assert.deepEqual(entries, [["octet_draw.py", "application/vnd.sun.star.uno-component;type=Python"], ["Jobs.xcu", "application/vnd.sun.star.configuration-data"], ["Addons.xcu", "application/vnd.sun.star.configuration-data"]]);
for (const [file] of entries) assert.ok(listed.includes(file), file);

// One service: the Python component registers it, the job runs it for each new view, and the menu items call it.
const service = py.match(/^SERVICE = "([^"]+)"$/m)?.[1];
assert.ok(service && py.includes("g_ImplementationHelper.addImplementation(Octet, SERVICE, (SERVICE,))"));
assert.ok(jobs.includes(`<prop oor:name="Service"><value>${service}</value></prop>`) && jobs.includes('<node oor:name="OnViewCreated" oor:op="fuse">'));
assert.ok(addons.includes(`<value>service:${service}?insert</value>`) && addons.includes("<value>Octet Drawing</value>"), "Insert > Octet Drawing");
assert.ok(py.includes('"service:" + SERVICE + "?edit"') && py.includes('"Edit in Octet Draw"'), "the context menu item");
assert.ok(/if command == "insert":[\s\S]*elif command == "edit":/.test(py), "the commands the menu items send");
assert.equal(py.match(/^APP_ID = "([^"]+)"$/m)?.[1], conf.identifier, "the folder a Flatpak Octet can read");

// It runs Octet only, with its fixed arguments and no shell: through the user's service manager (systemd-run, which
// takes $$ for $), else directly. Nothing else in it runs a program.
const runs = [...py.matchAll(/\b(subprocess\.\w+|os\.(system|popen|exec\w*|spawn\w*|posix_spawn\w*)|eval|exec)\s*\(/g)].map((m) => m[1]);
assert.deepEqual(runs, ["subprocess.run", "subprocess.Popen"]);
assert.ok(py.includes('args = command + ["--object", self.path, "--host", title]') && !/shell\s*=/.test(py));
assert.ok(py.includes('subprocess.run([manager, "--user", "--quiet", "--collect"] + setenv + ["--"] + [a.replace("$", "$$") for a in args], ') && py.includes('manager = shutil.which("systemd-run")'));
assert.ok(py.includes("subprocess.Popen(args, "));
const octet = py.match(/\ndef octet\(\):\n([\s\S]*?)\n\n/)?.[1] ?? "";
assert.deepEqual([...octet.matchAll(/return (.+)$/gm)].map((m) => m[1]), ['["/usr/bin/octet"]', '[flatpak, "run", APP_ID]', "[found] if found else None"], "the programs it runs: Octet, or Flatpak's Octet");
assert.ok(/after\("--object"\)/.test(objects) && /after\("--host"\)/.test(objects), "Octet reads those arguments");
assert.ok(py.includes("O_EXCL | os.O_NOFOLLOW, 0o600") && py.includes('tempfile.mkdtemp(prefix="libreoffice-", dir=base)'), "a private folder and new files");

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
print(" ".join(str(octet_draw.has_drawing(bytes.fromhex(h))) for h in sys.argv[2:]))`;
const python = spawnSync("python3", ["-I", "-B", "-c", stubs, path(dir), ...cases.map(([b]) => b.toString("hex"))], { encoding: "utf8" });
if (python.error) {
  console.log("libreoffice: python3 is not here; the Python is not run");
} else {
  assert.equal(python.status, 0, python.stderr);
  assert.equal(python.stdout.trim(), cases.map(([, d]) => (d ? "True" : "False")).join(" "));
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
