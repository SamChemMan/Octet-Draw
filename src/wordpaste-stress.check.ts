// Run: node src/wordpaste-stress.check.ts. Issue 166's stress cases: the picture of an Octet Drawing object in Word,
// PowerPoint and Excel for Windows (make_office_emf, an EMF+ dual EMF). Every case of the plan's stress list
// (docs/plans/issue-166-word-paste-sharp.md, S1 to S29) and more (M1 on), and how each is checked:
// - rust: a Rust test runs it (src-tauri/src/wordpaste_stress_tests.rs, and the plan's own tests). This check makes
//   sure the test is there; with OCTET_STRESS_CARGO=1 it also runs the stress tests (cargo, slow).
// - here: this check runs it (the page's and the MCP's code, or the sources' wiring).
// - windows: a Rust test with "ole" in its name, which only Windows runs (platforms.yml, job Office objects).
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
const rustTests = [stress, plus, clipboard, oleWin].join("\n");

type Case = { id: string; what: string; rust?: string[]; windows?: string[]; hand?: RegExp; here?: () => void | Promise<void> };
const fnBody = (src: string, head: RegExp) => {
  const at = src.search(head);
  assert.ok(at >= 0, `no ${head}`);
  return src.slice(at, src.indexOf("\n}\n", at) + 3);
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const cases: Case[] = [
  { id: "S1", what: "an empty drawing (Insert > Object > Create New, Update with nothing drawn)", rust: ["plus_draws_each_case", "stress_every_office_emf_reads_by_the_specs"] },
  { id: "S2", what: "one label of one letter", rust: ["plus_draws_each_case", "stress_text_runs_and_outlines"] },
  { id: "S3", what: "40 paclitaxels: copy time and size", rust: ["windows_copy_time"] },
  { id: "S4", what: "a 500-residue peptide: one path of about 25,000 points", rust: ["stress_large_drawings_sizes"], windows: ["ole_plus_large_path"] },
  { id: "S5", what: "a drawing with a photo: a GetDC section, the pixels once", rust: ["plus_bytes_are_steady_and_small", "stress_photos_are_getdc_sections"], windows: ["ole_plus_photo"] },
  { id: "S6", what: "a structure turned 30 degrees and flipped, with labels", rust: ["plus_draws_each_case"] },
  { id: "S7", what: "a photo turned (30 and 45 degrees)", rust: ["stress_photos_are_getdc_sections"], windows: ["ole_plus_photo"] },
  { id: "S8", what: "overlapping fills in one nonzero path", rust: ["plus_draws_each_case"], windows: ["ole_plus_fill_mode"] },
  { id: "S9", what: "an even-odd path", rust: ["plus_draws_each_case"], windows: ["ole_plus_fill_mode"] },
  { id: "S10", what: "dashed bonds and arrows, a hairline, a 10 pt line", rust: ["plus_pens_carry_caps_joins_and_dashes", "stress_pens_and_dashes"] },
  { id: "S11", what: "Colour by Element and a highlight at part opacity", rust: ["plus_draws_each_case"] },
  {
    id: "S12", what: "text GDI cannot draw (a missing face, right to left, an emoji, underlined) is outlines", rust: ["stress_text_runs_and_outlines", "stress_s12_right_to_left_text_is_outlines"],
    // usvg gives right-to-left glyphs left to right, as they show, so pick_runs' test (a glyph left of the last one)
    // never sees them: Hebrew and Arabic go in as runs. In the EMF+ record Arabic letters then stand apart
    // (DrawDriverString draws each character's own glyph). The Rust test shows it; this looks for a test of the
    // characters' direction in pick_runs.
    here: () => assert.match(fnBody(vector, /^fn pick_runs\(/m), /\\u\{5[9-9A-F]0\}|0x0?590|bidi|right_to_left|rtl/i, "pick_runs takes Hebrew and Arabic as runs of text"),
  },
  {
    id: "S13", what: "Office object off, or the class not registered: 1.1.2's EMF", rust: ["windows_copy_with_and_without_the_object"],
    here: () => {
      // The object goes on only with the picture and the switch (the page), and when Windows has the class (Rust),
      // and the EMF is chosen by that same flag.
      assert.match(editor, /const object = WINDOWS && on\.office !== false && on\.pdf;/);
      assert.match(clipboard, /let object = oct\.filter\(\|o\| text\.is_none\(\) && o\.len\(\) <= MAX_TYPE && crate::ole::win::offered\(\)\);/);
      assert.match(clipboard, /if object \{ crate::vector::make_office_emf\(&tree, cdxml\) \} else \{ crate::vector::make_emf\(&tree, cdxml, None\) \}/);
    },
  },
  {
    id: "S14", what: "Export as EMF, Quick export, --convert and the MCP's read emf keep 1.1.2's EMF",
    here: () => {
      assert.match(exportRs, /"emf" => crate::vector::make_emf\(/, "Export writes make_emf");
      // make_office_emf is made only for the object: the Windows copy with the object, and the object window's picture.
      const users = [["export.rs", exportRs], ["objects.rs", objects], ["clipboard.rs", clipboard.slice(0, clipboard.indexOf("mod tests"))], ["ole_windows.rs", oleWin.slice(0, oleWin.indexOf("mod tests"))]]
        .filter(([, s]) => s.includes("make_office_emf")).map(([n]) => n);
      assert.deepEqual(users, ["clipboard.rs", "ole_windows.rs"]);
      assert.match(fnBody(oleWin, /pub async fn update\(/), /make_office_emf\(&crate::export::tree\(&svg\)\?, Some\(&cdxml\)\)/);
    },
  },
  {
    id: "S15", what: "the Mac's copy for Office keeps its bytes (PDF comment, no EMF+)", rust: ["mac_copy_puts_offices_copy_first"],
    here: () => assert.match(clipboard, /Some\(svg\) if s == System::Mac => mac_picture\(svg, cdxml\)\?/),
  },
  {
    id: "S16", what: "Word's copy, or the picture alone, pastes into Octet 1.2, 1.1.2 and 1.1.1", rust: ["paste_reads_the_plus_emf_and_refuses_a_hostile_one", "stress_cdxml_comment_round_trips"],
    here: () => {
      // The reader is 1.1.1's and 1.1.2's to the byte (git show v1.1.2:src-tauri/src/vector.rs), so those versions read
      // the CDXML out of the EMF+ picture as this one does.
      assert.equal(sha(fnBody(vector, /^pub fn cdxml_from_emf/m)), "1fd9c97d2b89062e942bb232497de4f44142d66d6a965910452e8868d7107c62", "cdxml_from_emf is no longer 1.1.2's");
      assert.equal(sha(fnBody(exportRs, /^pub fn cdxml_from_picture/m)), "321be5d75a8455ac9ea144983f447e030348e0d7f34bf27067be880e4bf1c1b8", "cdxml_from_picture is no longer 1.1.2's");
    },
  },
  { id: "S17", what: "a hostile or damaged EMF on the clipboard", rust: ["stress_paste_reads_damaged_office_emfs_safely", "paste_reads_the_plus_emf_and_refuses_a_hostile_one"] },
  { id: "S18", what: "Ctrl+C 20 times fast, two selections in turn", rust: ["windows_copies_in_a_row_give_the_same_bytes", "stress_same_bytes_on_many_threads"] },
  { id: "S19", what: "Word zoomed from 10% to 500%", windows: ["ole_plus_zoom"], hand: /400%/ },
  {
    id: "S20", what: "an object pasted from 1.1.2 is smooth after File > Update", hand: /Update/,
    here: () => assert.match(fnBody(editor, /const officeUpdate = async/), /invoke\("ole_update", \{ oct, svg: pictureOf\(sent\) \?\? BLANK_SVG, cdxml: formatOf\(sent, "cdxml"\) \?\? "", send: true,/),
  },
  { id: "S21", what: "Undo and Redo in an object window, Update after each: the same drawing, the same bytes", rust: ["stress_same_bytes_on_many_threads", "plus_bytes_are_steady_and_small"] },
  { id: "S22", what: "two objects from two documents open, then Quit", hand: /Quit/ },
  {
    id: "S23", what: "an AI app's run_command copy is the page's own Copy, so it gets the EMF+ picture",
    here: () => {
      assert.match(editor, /copy: \(\) => clipCommand\("copy"\),/);
      const onCopy = editor.slice(editor.indexOf("const onCopy = (e: ClipboardEvent)"), editor.indexOf("const copyOut = "));
      assert.doesNotMatch(onCopy, /mcpCalling/, "Copy runs during an AI app's call");
      assert.match(onCopy, /return copyOut\(part, e\);/);
    },
  },
  {
    id: "S24", what: "the MCP: a misspelt copy, read with format emf+ or wmf",
    here: async () => {
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
  { id: "S25", what: "a poster 2 m wide (and a picture 10 km wide)", rust: ["plus_draws_each_case", "stress_hostile_pictures"] },
  {
    id: "S26", what: "Copy in dark mode gives the light mode's bytes",
    // Checked on 17 November 2026 in the dev server (Chromium, as WebView2): the reaction scheme's Export picture in
    // dark mode was the light mode's to the byte (9,203 bytes). The EMF is a function of that picture (S18, S21).
    here: () => {
      const body = exportTs.slice(exportTs.indexOf("export function standaloneSvg"), exportTs.indexOf("export function frameOf"));
      assert.match(body, /canvas\.setAttribute\("data-theme", "light"\);/);
      assert.match(body, /canvas\.style\.removeProperty\("--ink"\);/);
    },
  },
  { id: "S27", what: "Word run as administrator (no class): a picture, the EMF+ copy", hand: /administrator|class/ },
  { id: "S28", what: "the document opened in Word for Mac", hand: /Word for Mac|on the Mac/ },
  { id: "S29", what: "printed from Word for Windows, and saved as PDF", hand: /PDF/ },

  { id: "M1", what: "a chemist's messy page of 200 structures (salts, charges, wedges, 949 labels: the page's own Export picture with OCTET_STRESS_SVGS, and a generator)", rust: ["stress_every_office_emf_reads_by_the_specs", "stress_both_streams_agree_on_every_drawing", "stress_gdi_records_header_and_size_are_1_1_2s", "stress_large_drawings_sizes"] },
  { id: "M2", what: "Octet's starter drawings (structure, reaction, cycle) as the page exports them", rust: ["stress_both_streams_agree_on_every_drawing"] },
  { id: "M3", what: "hostile pictures: deep nesting, 200,000 points, 0.01 pt, a scale of 1e-30, dashes of 1e-7, control characters, a broken image, 10,000 labels", rust: ["stress_hostile_pictures"] },
  { id: "M4", what: "runs of 1 to 9 characters in 10 faces, weights 100 to 900, italic, letter spacing, anchors, spaces, 0.05 pt and 280 pt labels, a 2,000-character caption", rust: ["stress_text_runs_and_outlines"] },
  { id: "M5", what: "dashes: odd lists, a negative offset, 20 dashes, 1/1000 pt, square caps over small gaps, dots, an offset of a million", rust: ["stress_pens_and_dashes"] },
  { id: "M6", what: "a reader of its own, by MS-EMF and MS-EMFPLUS, on every drawing", rust: ["stress_every_office_emf_reads_by_the_specs"] },
  { id: "M7", what: "true size: Word's size (ole::extent) and the header are 1.1.2's for every drawing", rust: ["stress_gdi_records_header_and_size_are_1_1_2s"] },
  { id: "M8", what: "the CDXML comment: every padding, UTF-8, \"EMF+\" and the tag inside it, 6 MB", rust: ["stress_cdxml_comment_round_trips"] },
  { id: "M9", what: "copy speed for the page of 200 structures, release build", rust: ["stress_copy_time"] },
  {
    id: "M10", what: "an AI app's run_command cut and paste act, as copy does (the plan's siblings: cut gets the EMF+ picture)",
    here: () => {
      // run_command wraps the call in host.begin, which sets mcpCalling; Cut and Paste then return at once, and
      // run_command still answers "Ran cut." (mcp.ts runCommand).
      assert.match(editor, /cut: \(\) => clipCommand\("cut"\),/);
      const onCut = editor.slice(editor.indexOf("const onCut = (e: ClipboardEvent)"), editor.indexOf("addEventListener(\"keydown\", onKey);"));
      assert.doesNotMatch(onCut, /mcpCalling\.current/, "run_command cut does nothing during the AI app's own call, and says it ran");
      const onPaste = editor.slice(editor.indexOf("const onPaste = (e: ClipboardEvent)"), editor.indexOf("const onPaste = (e: ClipboardEvent)") + 400);
      assert.doesNotMatch(onPaste, /mcpCalling\.current/, "run_command paste does nothing during the AI app's own call, and says it ran");
    },
  },
  {
    id: "M11", what: "the 1.1.1 paste the reporter asked for: Settings > Import and export > Copy > Office object, on by default, found by \"word\"",
    here: () => {
      assert.match(settingsUi, /\["office", "Office object", "[^"]*\bword\b[^"]*"\]/);
      assert.match(settingsUi, /clipboard: \{ office: true,/);
      assert.match(settingsUi, /\.\.\.\(WINDOWS \? \[\["office", "Office object"/, "Windows only");
    },
  },
  { id: "M12", what: "GDI+ draws every stress drawing with no error, its ink box GDI's", windows: ["ole_stress_gdiplus_draws_every_drawing"] },
  { id: "M13", what: "GDI+ never writes an EMF+ record over 65,020 bytes; the page of 200 structures stays under, the peptide does not", rust: ["stress_large_drawings_sizes"], windows: ["ole_plus_large_path", "ole_plus_large_path_continued"] },
  {
    id: "M14", what: "copy in one drawing, paste in another: Octet's own form comes first, not the picture",
    here: () => {
      const paste = editor.slice(editor.indexOf("const onPaste = (e: ClipboardEvent)"), editor.indexOf("const onCopy = (e: ClipboardEvent)"));
      const at = (s: string) => paste.indexOf(s);
      assert.ok(at("if (clip.octet)") >= 0 && at("if (clip.octet)") < at("if (clip.oct &&") && at("if (clip.oct &&") < at("clip.picture ?"), "Octet's JSON, then the object's drawing, then the picture");
    },
  },
  {
    id: "M15", what: "keyboard: Ctrl+C and Ctrl+X are ChemDraw's and unchanged; Copy needs no mouse",
    here: () => assert.match(editor, /copy: `\$\{MOD\}C`/),
  },
  {
    id: "M16", what: "CI runs the stress tests: every push (check.yml, cargo test) and Windows (platforms.yml, tests with ole in their names)",
    here: () => {
      assert.match(checkYml, /cargo test --manifest-path src-tauri\/Cargo\.toml\n/);
      assert.match(platforms, /cargo test --manifest-path src-tauri\/Cargo\.toml --bin octet ole -- --nocapture/);
      assert.match(plus, /#\[path = "wordpaste_stress_tests\.rs"\]\nmod stress;/);
    },
  },
  // M17: ChemDraw 22.2 opening the CDXML the picture carries. On 17 November 2026 ChemDraw 22.2 opened no file (by
  // open -g or AppleScript; 25 documents of other sessions were open, likely behind a dialog), so it is not checked.
  // The item changes no CDXML or CDX bytes: windows_copy_with_and_without_the_object compares every other type.
  { id: "M17", what: "the copy's CDX and CDXML are 1.1.2's (ChemDraw reads those)", rust: ["windows_copy_with_and_without_the_object"] },
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

// The Rust stress tests themselves, when asked (they need cargo and take minutes in a cold build).
if (process.env.OCTET_STRESS_CARGO) {
  const run = spawnSync("cargo", ["test", "--bin", "octet", "stress_"], { cwd: new URL("../src-tauri/", import.meta.url).pathname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (run.status !== 0) failed.push(`cargo test stress_: ${(run.stdout + run.stderr).split("\n").filter((l) => /FAILED|panicked|fail:/.test(l)).join("; ").slice(0, 600)}`);
}

assert.equal(new Set(cases.map((c) => c.id)).size, cases.length, "case ids are unique");
assert.ok(cases.filter((c) => c.id.startsWith("S")).length === 29, "every case of the plan's stress list");
assert.equal(failed.length, 0, `${failed.length} of ${cases.length} stress cases fail:\n${failed.join("\n")}`);
console.log(`wordpaste-stress: ${cases.length} cases pass.`);
process.exit(0);
