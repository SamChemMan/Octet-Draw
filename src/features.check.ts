// Run: node src/features.check.ts. The AI switch (features.ts AI) and the Rust one (main.rs AI) say the same, and with
// AI off nothing AI starts or shows: the server, connecting the AI apps, Settings > AI tools, the AI card, Image to
// Structure (File menu, commands, Actions panel), the relay and Octet with no window.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI } from "./features.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const main = read("../src-tauri/src/main.rs"), editor = read("Editor.tsx"), settings = read("SettingsWindow.tsx"), actions = read("Actions.tsx");
assert.equal(/pub const AI: bool = (true|false);/.exec(main)?.[1], String(AI), "main.rs and features.ts say the same");
// The page: the server, the AI apps, Settings' status, and the commands start only with AI.
assert.match(editor, /if \(AI && TAURI && HOME_WINDOW\) void invoke<McpInfo \| null>\("mcp_set", \{ on: settings\.mcp \}\)/);
assert.match(editor, /if \(!AI \|\| !TAURI \|\| !HOME_WINDOW \|\| !settings\.mcp\) return;\n\s*void invoke<AiApp\[\]>\("ai_apps"\)/);
assert.match(editor, /if \(!AI \|\| !TAURI \|\| !settingsOpen\) return;/);
assert.match(editor, /\.\.\.\(AI \? \{ connect_ai: \(\) => setSettingsOpen\("ai"\) \} : \{\}\),/);
assert.match(editor, /\.\.\.\(AI \? \{ image_to_structure: /);
assert.match(actions, /if \(AI && context\.shape === "picture"\)/);
// Settings: no AI tools module and none of its rows, not even in search.
assert.match(settings, /\.filter\(\(m\) => AI \|\| m\.id !== "ai"\)/);
assert.match(settings, /\]\.filter\(\(x\) => AI \|\| x\.module !== "ai"\);/);
// Rust: the File menu and the AI apps' ways in.
assert.match(main, /if !AI \{\n\s*file\.remove\(&image\)\?;\n\s*\}/);
assert.match(main, /if !AI && matches!\(mode, Ok\(Start::Relay \| Start::Headless\)\) \{/);
console.log(`features.check: AI is ${AI ? "on" : "off"}, the same in the page and in Rust ok`);
