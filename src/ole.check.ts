// Run: node src/ole.check.ts. Fails if an Octet that Windows starts for Word can end before Word's first object comes
// (issue 24: Home's hidden page said it was empty as it loaded, Octet ended, and Word's insert never finished). The COM
// server builds on Windows only, so this reads its source. The Windows CI job runs the real thing
// (src-tauri/tests/ole_container.rs, started_for_word_waits_for_the_first_object).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rs = readFileSync(new URL("../src-tauri/src/ole_windows.rs", import.meta.url), "utf8");
const body = (start: string) => { const i = rs.indexOf(start); assert.ok(i >= 0, `found ${start}; update this check`); return rs.slice(i, rs.indexOf("\n}", i)); };

// Nothing ends Octet while it waits: not Home's page, not a window that closes.
assert.match(body("pub fn maybe_exit("), /if !EMBEDDING\.load\(SeqCst\) \|\| WAITING\.load\(SeqCst\) \|\|[^{]*\{\n\s*return;/, "maybe_exit waits for the first object");
// It waits only when COM started it, and only once its class object is up, as only the watchdog that start() makes
// after that can end the wait.
const start = body("pub fn start(");
assert.ok(start.indexOf("WAITING.store(embedding, SeqCst);") > start.indexOf("CoRegisterClassObject("), "the wait starts once the class object is up");
// The wait ends with the first object, or after a minute with none.
assert.match(body("    fn new() -> Self {"), /LIVE\.fetch_add\(1, SeqCst\);\n\s*WAITING\.store\(false, SeqCst\);/, "an object ends the wait");
assert.match(start, /if first \{\n\s*WAITING\.store\(false, SeqCst\);\n\s*maybe_exit\(&a\);/, "a minute with no object ends the wait");

console.log("ole: ok");
