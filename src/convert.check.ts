// Run: node src/convert.check.ts. --convert works in every build (issue 91), and Windows and Linux check it with the
// AI features off (1.1.3) and on (1.2): .github/workflows/platforms.yml reads src/features.ts's own line, runs the
// steps that need Octet with no window (--headless --mcp) only when AI is on, and runs --convert in every build on
// drawings Octet made (scripts/examples/convert), with one SDF of every compound (--into). The scripting page says the
// same. The Rust side (convert.rs tests) checks --into's records.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromCdxml } from "./cdxml.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
// The workflow's steps with no comment lines (a comment before a step ends the chunk of the step before it).
const features = read("features.ts"), platforms = read("../.github/workflows/platforms.yml").replace(/^ *#.*\n/gm, ""), page = read("../docs/scripting.md"), rust = read("../src-tauri/src/convert.rs");

// The workflow's test for AI is features.ts's line as it is written.
const ai = /grep -qx '(export const AI = true;)' src\/features\.ts/.exec(platforms);
assert.ok(ai, "platforms.yml reads AI from src/features.ts");
assert.match(features, /^export const AI = (true|false);$/m);
assert.equal(features.includes(`\n${ai[1]}\n`), /^export const AI = true;$/m.test(features));

// Each step that starts Octet with no window or the relay runs only with AI on, in a job that asks first.
const jobs = platforms.split(/\n {2}(?=[\w-]+:\n)/);
for (const job of jobs) {
  const steps = job.split(/\n {6}- /);
  const asks = steps.findIndex((s) => /\bid: ai\b/.test(s));
  steps.forEach((s, k) => {
    if (!/run-all\.mjs|one-request\.mjs|mcp-acceptance\.mjs/.test(s)) return;
    assert.ok(asks >= 0 && asks < k, `the AI step comes first: ${s.split("\n")[0]}`);
    assert.match(s, /steps\.ai\.outputs\.on == 'true'|AI: \$\{\{ steps\.ai\.outputs\.on \}\}/, `only with AI on: ${s.split("\n")[0]}`);
  });
}

// --convert runs in every build on the drawings committed for it, which Octet wrote: never on a file a script made.
const converts = platforms.split(/\n {6}- /).filter((s) => /--convert/.test(s));
assert.ok(converts.length >= 3, "--convert on Linux, on Windows, and in the installed Octet");
for (const s of converts) {
  assert.doesNotMatch(s, /steps\.ai\.outputs\.on == 'true'/, `--convert runs with AI off: ${s.split("\n")[0]}`);
  assert.match(s, /scripts\/examples\/convert/, `--convert reads the committed drawings: ${s.split("\n")[0]}`);
  assert.doesNotMatch(s, /examples-out\/in\//);
}
const cdxml = readFileSync(new URL("../scripts/examples/convert/scheme1.cdxml", import.meta.url), "utf8");
const cdx = readFileSync(new URL("../scripts/examples/convert/scheme2.cdx", import.meta.url));
assert.match(cdxml, /CreationProgram="Octet /, "Octet made scheme1.cdxml");
assert.equal(cdx.subarray(0, 8).toString("latin1"), "VjCD0100", "scheme2.cdx is CDX");
const { mol } = fromCdxml(cdxml);
assert.ok(mol.atoms.length > 0, "scheme1.cdxml opens");
// The workflow's count of records: scheme1's three compounds (7, 3 and 9) and scheme2's two (9 and 4).
assert.deepEqual([...cdxml.matchAll(/<s [^>]*face="1">(\d+)<\/s>/g)].map((m) => m[1]), ["7", "3", "9"]);
for (const s of converts.filter((s) => /--into/.test(s))) assert.match(s, /5/, "five records");
assert.ok(converts.some((s) => /--into/.test(s) && /Linux/.test(s.split("\n")[0])) && converts.some((s) => /--into/.test(s) && /Windows/.test(s.split("\n")[0])), "--into on Linux and Windows");

// The page: --into is documented as the program takes it, the AI sections say they need AI apps, and Convert many
// files says it works in every build.
assert.match(rust, /\[--each \| --into FILE\]/);
assert.match(page, /--into/);
assert.match(page, /## Convert many files\n\nThis works in Octet Draw 1\.1\.3 and later, with or without the AI features\./);
assert.match(page, /Scripts need the AI features, which are in Octet Draw 1\.2 and later\./);
console.log("convert.check: --convert in every build, the AI steps only with AI on, and --into on the page ok");
