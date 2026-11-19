// Nicknames: a word typed as a label that stands for a group (Morph, TBDPS, 2-Py). Octet's built-in ones
// (nicknamedata.ts) are read only where Octet's own label reading reads nothing (labels.ts labelSmiles). The user's own
// (Structure > Define Nickname…) are read first, and kept in the settings as monomers are (monomers.ts, issue 27).
// Ported from PR #146 by Prof. Dr. Stefan Schramm.
import { NICKNAME_DATA } from "./nicknamedata.ts";

// A nickname of the user's own: its label and its group as SMILES from the atom that bonds to the drawing.
export type OwnNickname = { label: string; smiles: string };
export type Nickname = { label: string; smiles: string; name?: string; own?: true };
export const MOST_OWN_NICKNAMES = 500, NICKNAME_MOST = 32, OWN_NICKNAME_SMILES = 2000;

// Octet's nicknames by every spelling (label and other spellings), and in the order the = list shows them.
const builtIn = new Map<string, Nickname>();
export const BUILT_IN: readonly Nickname[] = NICKNAME_DATA.map(([label, smiles, name, ...more]) => {
  const n: Nickname = { label, smiles, ...(name ? { name } : {}) };
  for (const s of [label, ...more]) if (!builtIn.has(s)) builtIn.set(s, n);
  return n;
});
export const builtInNickname = (spelling: string): Nickname | undefined => builtIn.get(spelling);

// The user's own, by label. Code that keeps what a label reads (labels.ts, chem.ts, check.ts) forgets it when they
// change.
let own = new Map<string, Nickname>(), ownList: readonly OwnNickname[] = [];
const listeners: (() => void)[] = [];
export const onNicknamesChange = (f: () => void) => { listeners.push(f); };
export function setOwnNicknames(list: readonly OwnNickname[]) {
  if (list === ownList) return;
  ownList = list;
  own = new Map(list.map((n) => [n.label, { ...n, own: true as const }]));
  for (const f of listeners) f();
}
export const ownNickname = (label: string): Nickname | undefined => own.get(label);
export const ownNicknames = (): Nickname[] => [...own.values()];

// A nickname added, or put in place of the user's one with the same label. The list back unchanged when it is full.
export function withNickname(list: readonly OwnNickname[], n: OwnNickname): OwnNickname[] {
  const at = list.findIndex((x) => x.label === n.label);
  return at >= 0 ? list.map((x, i) => (i === at ? n : x)) : list.length < MOST_OWN_NICKNAMES ? [...list, n] : [...list];
}
export const withoutNickname = (list: readonly OwnNickname[], label: string) => list.filter((x) => x.label !== label);

// The user's nicknames as the settings keep them: each a label of 1 to 32 characters with no spaces and a SMILES with
// no "*" or ".", each label once, at most 500.
export function readNicknames(x: unknown): OwnNickname[] {
  if (!Array.isArray(x)) return [];
  const seen = new Set<string>();
  return x.flatMap((n): OwnNickname[] => {
    const { label, smiles } = (n ?? {}) as { label?: unknown; smiles?: unknown };
    if (typeof label !== "string" || typeof smiles !== "string" || !label || [...label].length > NICKNAME_MOST || /[\s\u0000-\u001f\u007f-\u009f]/.test(label)
      || !smiles || smiles.length > OWN_NICKNAME_SMILES || /[*.\s]/.test(smiles) || seen.has(label)) return [];
    seen.add(label);
    return [{ label, smiles }];
  }).slice(0, MOST_OWN_NICKNAMES);
}
