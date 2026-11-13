// AI apps are on by default (Sam, 13 November 2026), and off only when the user turned them off with the switch: a
// saved false from before (a 1.2 beta saved the old default with every setting) does not count. (settings.ts needs
// the bundler to load, so this reads its source, as export.check reads the editor's.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const settings = read("settings.ts"), editor = read("Editor.tsx");
assert.match(settings, /updates: true, mcp: true, mcpChosen: false,/, "on in the defaults");
const line = /mcp: (saved\.mcpChosen === true \? saved\.mcp !== false : true), mcpChosen: saved\.mcpChosen === true,/.exec(settings);
assert.ok(line, "the saved setting is read with mcpChosen");
const mcp = new Function("saved", `return ${line[1]};`) as (saved: Record<string, unknown>) => boolean;
assert.equal(mcp({}), true, "a new install, or 1.1.x, which saved no mcp");
assert.equal(mcp({ mcp: false }), true, "a beta's saved old default");
assert.equal(mcp({ mcp: false, mcpChosen: true }), false, "turned off with the switch");
assert.equal(mcp({ mcp: true, mcpChosen: true }), true, "turned on with the switch");
assert.match(editor, /onMcp=\{\(on, newKey\) => \{ setSettings\(\(s\) => \(\{ \.\.\.s, mcp: on, mcpChosen: true \}\)\);/, "the switch marks the choice");
console.log("mcpdefault.check: ok");
