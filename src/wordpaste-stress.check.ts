// Run: node src/wordpaste-stress.check.ts. Issue 166's stress cases: the picture of an Octet Drawing object in Word,
// PowerPoint and Excel for Windows (make_office_emf, an EMF+ dual EMF). The 20 cases of the plan's stress list
// (docs/plans/issue-166-word-paste-sharp.md, S1 to S20; the old ids in brackets), and how each is checked:
// - rust: a Rust test runs it (src-tauri/src/wordpaste_stress_tests.rs, and the plan's own tests). This check makes
//   sure the test is there; with OCTET_STRESS_CARGO=1 it also runs the stress tests (cargo, slow).
// - here: this check runs it (the page's and the MCP's code, or the sources' wiring).
// - windows: a Rust test with "ole" in its name, which only Windows runs (check.yml's smoke job on every push, and
//   platforms.yml's Office objects job).
// - hand: only Word, PowerPoint or Excel on Windows can show it (docs/testing/ole-manual.md).
// Every case runs; the failures are listed together at the end.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const editor = read("Editor.tsx"), mcp = read("mcp.ts"), settingsUi = read("SettingsWindow.tsx"), exportTs = read("export.ts");
const clipboard = read("../src-tauri/src/clipboard.rs"), vector = read("../src-tauri/src/vector.rs"), oleWin = read("../src-tauri/src/ole_windows.rs");
const exportRs = read("../src-tauri/src/export.rs"), objects = read("../src-tauri/src/objects.rs");
const stress = read("../src-tauri/src/wordpaste_stress_tests.rs"), plus = read("../src-tauri/src/vector_plus_tests.rs");
const platforms = read("../.github/workflows/platforms.yml"), checkYml = read("../.github/workflows/check.yml"), manual = read("../docs/testing/ole-manual.md");
const rustTests = [stress, plus, clipboard, oleWin, vector].join("\n");

type Case = { id: string; what: string; rust?: string[]; windows?: string[]; hand?: RegExp; here?: () => void | Promise<void> };
const fnBody = (src: string, head: RegExp) => {
  const at = src.search(head);
  assert.ok(at >= 0, `no ${head}`);
  return src.slice(at, src.indexOf("\n}\n", at) + 3);
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const cases: Case[] = [
  { id: "S1", what: "an empty drawing (Insert > Object > Create New, Update with nothing drawn) [S1]", rust: ["plus_draws_each_case", "stress_every_office_emf_reads_by_the_specs"] },
  {
    id: "S2", what: "labels: one letter, 10 faces, weights 100 to 900, 0.05 pt and 280 pt, a 2,000-character caption [S2, M4]",
    rust: ["plus_draws_each_case", "stress_text_runs_and_outlines", "labels_are_text_at_their_glyph_positions"], windows: ["ole_plus_labels"],
  },
  {
    id: "S3", what: "text GDI cannot draw as text: Hebrew, Arabic, Arabic with Latin, a direction mark, an emoji, underlined, a face Windows lacks [S12]",
    rust: ["stress_s12_right_to_left_text_is_outlines", "a_direction_mark_makes_a_label_outlines", "stress_text_runs_and_outlines"],
    // D11: pick_runs names the right-to-left scripts and the direction marks, for both EMFs.
    here: () => {
      const runs = fnBody(vector, /^fn pick_runs\(/m);
      assert.match(runs, /\|\| right_to_left\(c\)/, "pick_runs makes right-to-left text outlines");
      assert.match(vector, /'\\u\{590\}'\.\.='\\u\{8FF\}' \| '\\u\{FB1D\}'\.\.='\\u\{FDFF\}' \| '\\u\{FE70\}'\.\.='\\u\{FEFF\}' \| '\\u\{200E\}' \| '\\u\{200F\}' \| '\\u\{202A\}'\.\.='\\u\{202E\}' \| '\\u\{2066\}'\.\.='\\u\{2069\}'/, "the plan's ranges (D11)");
    },
  },
  {
    id: "S4", what: "40 paclitaxels, and a chemist's page of 200 structures with 949 labels [S3, M1, M2, M6, M7, M9]",
    rust: ["windows_copy_time", "stress_copy_time", "stress_every_office_emf_reads_by_the_specs", "stress_both_streams_agree_on_every_drawing", "stress_gdi_records_header_and_size_are_1_1_2s", "stress_large_drawings_sizes"],
    windows: ["ole_stress_gdiplus_draws_every_drawing"],
  },
  { id: "S5", what: "a 500-residue peptide: one path of about 25,000 points, a record over 65,020 bytes [S4, M13]", rust: ["stress_large_drawings_sizes"], windows: ["ole_plus_large_path", "ole_plus_large_path_continued"] },
  { id: "S6", what: "photos: 12 megapixels; turned 30 and 45 degrees [S5, S7]", rust: ["stress_photos_are_getdc_sections", "plus_bytes_are_steady_and_small"], windows: ["ole_plus_photo"] },
  { id: "S7", what: "a structure turned 30 degrees and flipped, with labels [S6]", rust: ["plus_draws_each_case"] },
  {
    id: "S8", what: "fills: overlapping subpaths in one nonzero path, the same in a reader that fills even-odd (LibreOffice); an even-odd orbital lobe [S8, S9]",
    rust: ["plus_draws_each_case", "plus_fills_draw_the_same_in_any_fill_mode"], windows: ["ole_plus_fill_mode"],
  },
  {
    id: "S9", what: "pens: dashed bonds, a dashed curved arrow with round caps, 0.1 pt and 10 pt lines, odd dash lists, a negative offset, 1/1000 pt dashes [S10, M5]",
    rust: ["stress_pens_and_dashes", "plus_pens_carry_caps_joins_and_dashes"], windows: ["ole_plus_ink_box_and_gdi_pixels"],
  },
  {
    id: "S10", what: "Colour by Element; a highlight at 40% opacity; Copy in dark mode gives the light mode's bytes [S11, S26]", rust: ["plus_draws_each_case"],
    // Checked on 17 November 2026 in the dev server (Chromium, as WebView2): the reaction scheme's Export picture in
    // dark mode was the light mode's to the byte (9,203 bytes). The EMF is a function of that picture (S15).
    here: () => {
      const body = exportTs.slice(exportTs.indexOf("export function standaloneSvg"), exportTs.indexOf("export function frameOf"));
      assert.match(body, /canvas\.setAttribute\("data-theme", "light"\);/);
      assert.match(body, /canvas\.style\.removeProperty\("--ink"\);/);
    },
  },
  { id: "S11", what: "hostile pictures copied: deep nesting, 200,000 points, a scale of 1e-30, control characters, a broken image, 10,000 labels, a poster 2 m wide, a picture 10 km wide [M3, S25]", rust: ["stress_hostile_pictures", "plus_draws_each_case"] },
  { id: "S12", what: "a damaged EMF pasted: truncations, changed bytes, bad record sizes, an EMF+ comment longer than the file [S17]", rust: ["stress_paste_reads_damaged_office_emfs_safely", "paste_reads_the_plus_emf_and_refuses_a_hostile_one"] },
  {
    id: "S13", what: "paste back: Word's copy into Octet 1.2 and 1.1.2, the EMF+ picture alone, odd CDXML comments [S16, M8, M14]",
    rust: ["stress_cdxml_comment_round_trips", "paste_reads_the_plus_emf_and_refuses_a_hostile_one"],
    here: () => {
      // The reader is 1.1.1's and 1.1.2's to the byte (git show v1.1.2:src-tauri/src/vector.rs), so those versions read
      // the CDXML out of the EMF+ picture as this one does.
      assert.equal(sha(fnBody(vector, /^pub fn cdxml_from_emf/m)), "1fd9c97d2b89062e942bb232497de4f44142d66d6a965910452e8868d7107c62", "cdxml_from_emf is no longer 1.1.2's");
      assert.equal(sha(fnBody(exportRs, /^pub fn cdxml_from_picture/m)), "321be5d75a8455ac9ea144983f447e030348e0d7f34bf27067be880e4bf1c1b8", "cdxml_from_picture is no longer 1.1.2's");
      // Octet's own forms come before the picture.
      const paste = editor.slice(editor.indexOf("const onPaste = (e: ClipboardEvent)"), editor.indexOf("const onCopy = (e: ClipboardEvent)"));
      const at = (s: string) => paste.indexOf(s);
      assert.ok(at("if (clip.octet)") >= 0 && at("if (clip.octet)") < at("if (clip.oct &&") && at("if (clip.oct &&") < at("clip.picture ?"), "Octet's JSON, then the object's drawing, then the picture");
    },
  },
  {
    id: "S14", what: "plain copies: Office object off, the class not registered, Export as EMF, Quick export, --convert, the MCP's read emf, the Mac's Office copy [S13, S14, S15, M11, M17]; since 1.1.3 (issue 167) every Windows copy and Export as EMF are the EMF+ dual EMF too",
    rust: ["windows_copy_with_and_without_the_object", "mac_copy_puts_offices_copy_first"],
    here: () => {
      // The object goes on only with the picture and the switch (the page), and when Windows has the class (Rust).
      // The EMF is the EMF+ dual EMF with the object and without it (issue 167: Word dropped thin bond outlines of the
      // GDI-only EMF, Office object off or on).
      assert.match(editor, /const object = WINDOWS && on\.office !== false && on\.pdf;/);
      assert.match(clipboard, /let object = oct\.filter\(\|o\| text\.is_none\(\) && o\.len\(\) <= MAX_TYPE && crate::ole::win::offered\(\)\);/);
      assert.match(clipboard, /let emf = \|\| crate::vector::make_office_emf\(&tree, cdxml\);/);
      // The switch the reporter asked for (D9): Settings > Import and export > Copy > Office object, Windows only, on
      // by default, found by "word".
      assert.match(settingsUi, /\["office", "Office object", "[^"]*\bword\b[^"]*"\]/);
      assert.match(settingsUi, /clipboard: \{ office: true,/);
      assert.match(settingsUi, /\.\.\.\(WINDOWS \? \[\["office", "Office object"/, "Windows only");
      // Export writes the EMF+ dual EMF too (issue 167), as the Windows copy and the object window's picture do.
      assert.match(exportRs, /"emf" => crate::vector::make_office_emf\(/, "Export writes make_office_emf");
      const users = [["export.rs", exportRs], ["objects.rs", objects], ["clipboard.rs", clipboard.slice(0, clipboard.indexOf("mod tests"))], ["ole_windows.rs", oleWin.slice(0, oleWin.indexOf("mod tests"))]]
        .filter(([, s]) => s.includes("make_office_emf")).map(([n]) => n);
      assert.deepEqual(users, ["export.rs", "clipboard.rs", "ole_windows.rs"]);
      assert.match(fnBody(oleWin, /pub async fn update\(/), /make_office_emf\(&crate::export::tree\(&svg\)\?, Some\(&cdxml\)\)/);
      // The Mac's copy for Office keeps its picture (PDF comment, no EMF+).
      assert.match(clipboard, /Some\(svg\) if s == System::Mac => mac_picture\(svg, cdxml\)\?/);
    },
  },
  {
    id: "S15", what: "Ctrl+C 20 times fast, two selections in turn, from 4 threads; Undo and Redo in an object window with Update after each [S18, S21]",
    rust: ["windows_copies_in_a_row_give_the_same_bytes", "stress_same_bytes_on_many_threads", "plus_bytes_are_steady_and_small"],
    // Ctrl+C is ChemDraw's key and unchanged.
    here: () => assert.match(editor, /copy: `\$\{MOD\}C`/),
  },
  {
    id: "S16", what: "an object pasted from 1.1.2 is smooth after File > Update [S20]", hand: /An object pasted with 1\.1\.2[^.]*: jagged when opened[\s\S]*?now smooth/,
    here: () => assert.match(fnBody(editor, /const officeUpdate = async/), /invoke\("ole_update", \{ oct, svg: pictureOf\(sent\) \?\? BLANK_SVG, cdxml: formatOf\(sent, "cdxml"\) \?\? "", send: true,/),
  },
  { id: "S17", what: "two objects from two documents open and changed, then Quit [S22]", hand: /two objects from two documents, change both/ },
  { id: "S18", what: "Word at 10% to 500%; printed; Save as PDF [S19, S29]", windows: ["ole_plus_zoom"], hand: /400%[\s\S]*Save As > PDF/ },
  { id: "S19", what: "Word without Octet's class (run as administrator); the document opened in Word for Mac [S27, S28]", hand: /Start Word with Run as administrator[^\n]*smooth[\s\S]*in Word for Mac: the picture shows, smooth/ },
  {
    id: "S20", what: "AI apps: run_command copy is the page's own Copy (EMF+); a misspelt copy; read with format emf+, wmf or 42 [S23, S24]",
    here: async () => {
      assert.match(editor, /copy: \(\) => clipCommand\("copy"\),/);
      const onCopy = editor.slice(editor.indexOf("const onCopy = (e: ClipboardEvent)"), editor.indexOf("const copyOut = "));
      assert.doesNotMatch(onCopy, /mcpCalling/, "Copy runs during an AI app's call");
      assert.match(onCopy, /return copyOut\(part, e\);/);
      if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) return;
      const { load, drawing, session } = await import("../scripts/headless/host.ts");
      const { handle } = await import("./mcp.ts");
      await load();
      const d = drawing("paper", "Stress");
      let n = 0;
      const call = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session("Check", "stress"))).result;
      assert.ok(!(await call("set_brief", { destination: { kind: "paper" } })).isError);
      assert.ok(!(await call("draw", { structures: [{ text: "CCO" }] })).isError);
      for (const [name, args, says] of [
        ["advanced", { tool: "run_command", args: { command: "cpy" } }, /has no command cpy/],
        ["advanced", { tool: "run_command", args: { command: "COPY" } }, /has no command COPY/],
        ["advanced", { tool: "run_command", args: { command: "copy", ids: ["nope"] } }, /nothing with the id nope/],
        ["advanced", { tool: "run_command", args: { command: "copy", ids: "s1" } }, /not a list/],
        ["read", { format: "emf+" }, /not one of/],
        ["read", { format: "wmf" }, /not one of/],
        ["read", { format: 42 }, /not text/],
      ] as [string, unknown, RegExp][]) {
        const r = await call(name, args);
        assert.ok(r.isError, `${JSON.stringify(args)} is refused`);
        assert.match(r.content[0].text, says, JSON.stringify(args));
      }
    },
  },
];

// The tests that only Windows runs (J3: T1 to T9 and the stress drawing test). Each is in a #[cfg(windows)] item and
// its name starts with "ole", so the Windows steps' filter runs it.
const windowsTests = [
  "ole_plus_is_smooth", "ole_plus_ink_box_and_gdi_pixels", "ole_plus_photo", "ole_plus_fill_mode", "ole_plus_large_path",
  "ole_cache_keeps_the_plus_picture", "ole_plus_labels", "ole_plus_zoom", "ole_stress_gdiplus_draws_every_drawing",
];

const failed: string[] = [];
for (const c of cases) {
  try {
    for (const t of [...(c.rust ?? []), ...(c.windows ?? [])]) assert.match(rustTests, new RegExp(`\\bfn ${t}\\(`), `the test ${t} is gone`);
    for (const t of c.windows ?? []) assert.ok(t.startsWith("ole"), `${t} runs on Windows only if its name starts with ole`);
    if (c.hand) assert.match(manual, c.hand, "docs/testing/ole-manual.md lists it");
    await c.here?.();
  } catch (e) {
    failed.push(`${c.id} (${c.what}): ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
}

// J3 and J8: the Windows tests run on every push. Each is gated to Windows, its name has "ole" in it, and check.yml's
// smoke job runs "cargo test ... --bin octet ole" on its Windows machine (platforms.yml does too, on main).
try {
  for (const t of windowsTests) {
    assert.ok(t.startsWith("ole"), `${t} runs on Windows only if its name starts with ole`);
    const at = rustTests.search(new RegExp(`\\bfn ${t}\\(`));
    assert.ok(at >= 0, `the test ${t} is gone`);
    const gated = oleWin.includes(`fn ${t}(`) ? /#\[cfg\(windows\)\]\n#\[path = "ole_windows\.rs"\]/.test(read("../src-tauri/src/ole.rs")) : /#\[cfg\(windows\)\]\n(#\[\w+\]\n)*$/.test(rustTests.slice(Math.max(0, at - 80), at));
    assert.ok(gated, `${t} builds on Windows only`);
  }
  const smoke = checkYml.slice(checkYml.indexOf("\n  smoke:"));
  assert.match(smoke, /\n      - name: The Office object's tests \(Windows\)\n        if: runner\.os == 'Windows'\n        run: cargo test --manifest-path src-tauri\/Cargo\.toml --bin octet ole -- --nocapture\n/, "check.yml's smoke job runs the Windows tests");
  assert.match(smoke, /platform: \[windows-latest,/, "the smoke job has a Windows machine");
  assert.match(checkYml, /push:\n    branches: \["\*\*"\]/, "check.yml runs on every push");
  assert.match(platforms, /cargo test --manifest-path src-tauri\/Cargo\.toml --bin octet ole -- --nocapture/);
  // The Mac and Linux machines run the stress tests in check.yml's cargo test.
  assert.match(checkYml, /cargo test --manifest-path src-tauri\/Cargo\.toml\n/);
  assert.match(plus, /#\[path = "wordpaste_stress_tests\.rs"\]\nmod stress;/);
} catch (e) {
  failed.push(`CI (J3, J8): ${e instanceof Error ? e.message.split("\n")[0] : e}`);
}

// The Rust stress tests themselves, when asked (they need cargo and take minutes in a cold build).
if (process.env.OCTET_STRESS_CARGO) {
  const run = spawnSync("cargo", ["test", "--bin", "octet", "stress_"], { cwd: new URL("../src-tauri/", import.meta.url).pathname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (run.status !== 0) failed.push(`cargo test stress_: ${(run.stdout + run.stderr).split("\n").filter((l) => /FAILED|panicked|fail:/.test(l)).join("; ").slice(0, 600)}`);
}

assert.deepEqual(cases.map((c) => c.id), Array.from({ length: 20 }, (_, i) => `S${i + 1}`), "the plan's 20 stress cases, in order");
assert.equal(failed.length, 0, `${failed.length} of ${cases.length} stress cases fail:\n${failed.join("\n")}`);
console.log(`wordpaste-stress: ${cases.length} cases pass.`);
process.exit(0);
