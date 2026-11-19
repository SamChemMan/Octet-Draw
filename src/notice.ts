// Notices: the short message at the bottom of the window. Its kind sets its icon, how long it stays, and what it
// says when something fails.

// error: something did not happen (Warning icon, read out at once). info: a hint or a wait (Info icon). done: a
// thing finished, such as an export (Check icon).
export type NoticeKind = "error" | "info" | "done";

// A notice stays 4 s and 50 ms more for each character, so a long one stays long enough to read.
export const noticeTime = (text: string) => 4000 + 50 * text.length;

// Why something failed, as a plain sentence, or "" when there is nothing useful to say. Octet's own messages (from
// the file readers and the app's Rust side) are sentences already, so they go as they are. Common system errors are
// put in words. A raw exception is never shown.
export function reason(e: unknown): string {
  const s = (e instanceof Error ? e.message : String(e ?? "")).trim();
  const sentence = /^[A-Z][^\n]{0,200}\.$/.test(s) && !/error|exception|undefined|null|panick/i.test(s) ? s : "";
  // A damaged file's reason can quote the file, so it is never read as a system error.
  if (e instanceof DamagedFile) return sentence;
  if (/permission denied|access is denied|operation not permitted/i.test(s)) return "Octet does not have permission to use this file or folder.";
  if (/no space left|disk is full|not enough space/i.test(s)) return "The disk is full.";
  if (/read-only file system/i.test(s)) return "The disk is read-only.";
  if (/no such file|cannot find the (file|path)/i.test(s)) return "The file or folder is not there.";
  if (/used by another process|sharing violation/i.test(s)) return "Another app is using the file.";
  return sentence;
}

// A file that Octet's own reader refuses as damaged (cif.ts). Its message says why.
export class DamagedFile extends Error {}
// Why a reader refused text, to show as it is: over one of Octet's limits (a RangeError that says "It has" or "It
// takes", chem.ts and cif.ts) or damaged (DamagedFile). undefined for any other error (Indigo's own words, the engine's
// own RangeErrors such as a stack overflow, a fault), which keeps the general words.
export const refusal = (e: unknown) => (((e instanceof RangeError && /^It (has|takes) /.test(e.message)) || e instanceof DamagedFile) && reason(e)) || undefined;

// A failure's notice: what Octet could not do, then why. A reason that says what Octet cannot do goes alone. The raw
// error goes to the console.
export function failure(what: string, e: unknown): string {
  console.error(e);
  const why = reason(e);
  return !why ? what : why.startsWith("Octet cannot") ? why : `${what} ${why}`;
}

// What Octet says when it cuts text typed or pasted at a limit (docs/plans/long-text.md): what: "A text", "A label".
export const cutNotice = (what: string, most: number) => `${what} holds up to ${most.toLocaleString("en-GB")} characters. Octet left out the rest.`;

// A saved file's name, from its path on any system.
export const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
