// Run: node src/doctype.check.ts. A .oct file shows its own icon on each system: the brand-blue page with the mark
// (brand/app-icon/document). Tauri's fileAssociations gives a file type no icon of its own, so each system has its own
// way in, and each must stay in step with tauri.conf.json:
// - macOS: Info.plist's UTExportedTypeDeclarations takes the place of the one Tauri writes, with UTTypeIconFile added.
//   It must declare the same type, and oct.icns must be in Contents/Resources.
// - Windows: oct.ico goes beside the program, and the installer hook gives Tauri's class its icon.
// - Linux: the .deb and .rpm put the icon in the hicolor theme under the MIME type's own name.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const has = (f: string) => existsSync(new URL(`../${f}`, import.meta.url));
const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
const oct = conf.bundle.fileAssociations.find((a: { ext: string[] }) => a.ext.includes("oct"));

// macOS
const plist = read("src-tauri/Info.plist");
const decl = plist.slice(plist.indexOf("<key>UTExportedTypeDeclarations</key>"), plist.indexOf("</array>\n\t<key>NSAppleEventsUsageDescription</key>"));
const strings = [...decl.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);
assert.ok(strings.includes(oct.exportedType.identifier), "Info.plist declares the .oct type");
for (const c of oct.exportedType.conformsTo) assert.ok(strings.includes(c), `the type conforms to ${c}`);
for (const e of oct.ext) assert.ok(strings.includes(e), `the type has the extension ${e}`);
assert.ok(strings.includes(oct.mimeType) && strings.includes(oct.description), "the type has the MIME type and the description");
assert.match(decl, /<key>UTTypeIconFile<\/key>\s*<string>oct\.icns<\/string>/, "the type has its icon");
assert.equal(conf.bundle.macOS.files["Resources/oct.icns"], "icons/oct.icns", "oct.icns is in Contents/Resources");
assert.ok(has("src-tauri/icons/oct.icns"));

// Windows
const windows = JSON.parse(read("src-tauri/tauri.windows.conf.json"));
assert.equal(windows.bundle.resources["icons/oct.ico"], "oct.ico", "oct.ico goes beside the program");
assert.ok(has("src-tauri/icons/oct.ico"));
const nsh = read("src-tauri/windows/hooks.nsh").replace(/\r\n/g, "\n");
assert.ok(nsh.includes(`WriteRegStr HKCU "Software\\Classes\\${oct.name}\\DefaultIcon" "" '$INSTDIR\\oct.ico'`), "the installer gives the class its icon");
assert.ok(nsh.indexOf("!insertmacro OCTET_DOCUMENT_ICON") > nsh.indexOf("!macro NSIS_HOOK_POSTINSTALL"), "after Tauri's association");

// Linux
const name = oct.mimeType.replace("/", "-");
assert.match(read("src-tauri/linux/octet-mime.xml"), new RegExp(`<mime-type type="${oct.mimeType}">[\\s\\S]*?<icon name="${name}"/>`));
for (const pkg of ["deb", "rpm"]) {
  const files: Record<string, string> = conf.bundle.linux[pkg].files;
  for (const z of [16, 24, 32, 48, 64, 128, 256, 512]) {
    const source = files[`/usr/share/icons/hicolor/${z}x${z}/mimetypes/${name}.png`];
    assert.ok(source && has(`src-tauri/${source}`), `the ${pkg} has the ${z} px icon`);
  }
  assert.ok(has(`src-tauri/${files[`/usr/share/icons/hicolor/scalable/mimetypes/${name}.svg`]}`), `the ${pkg} has the scalable icon`);
}

console.log("doctype: ok");
