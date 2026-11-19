# Tool keys and the Ring tool's key (PR #58)

Prof. Stefan Schramm's PR #58, ported by hand onto 1.1.3 (9ca16e2). His branch is cut from v1.1.1 and conflicts with
main. Sam: do it, get it to work.

ChemDraw: any tool can take a generic hotkey (TOOLMODE in Hotkeys.xml), and a tool's tooltip shows its key in square
brackets (notes/chemdraw-hotkeys.md section 4). ChemDraw 22.2's default tool keys are the ones Octet already has. The
G17-only keys (u, Shift+u, l, Shift+l, k, Shift+k) are low confidence and are not set, as before. No new default key.

## What it must do

1. Every tool in the Tool union has a `tool.<id>` action in Settings > Keyboard shortcuts > Tools, with no key by
   default. New since v1.1.1: Sequence, Catalytic cycle, Gel, Plasmid map, Table, Mass fragmentation, Mass spec
   analysis, Synthesis, Retrosynthesis, Atom map. Test: keys.check reads the Tool union from tools.tsx and fails if a
   tool has no action or no DEFAULT_KEYS entry, so a tool added later has to come with one.
2. A key set for one of them picks that tool. Test: keys.check, actionFor finds `tool.gel` for its key over nothing
   and over an atom that has no action for that key; Editor's tool branch calls setTool for any id.
3. A key picked for a specialist tool (Gel, Table...) leaves it in the specialist slot, as choosing it from the slot's
   menu does. Test: keys.check reads that Editor's tool branch sets `variants.more` for a specialist tool.
4. Clashes and Reset to ChemDraw keys work for the new actions. Test: keys.check, giving `tool.gel` the key g names
   `tool.tlc` as the clash; keymap({}) gives every new action an empty list.
5. The Ring slot's tooltip names the key of the ring it holds: J for benzene, Shift+J for cyclopentadiene, the key
   the user set for cyclohexane or cyclopentane, none for a ring with no key. A key set for `tool.ring` itself wins.
   Test: keys.check on optionCommand and the slot's data-key; checked in the dev build.
6. Consistency: every place that offers a ring or a specialist tool names its key the same way. The Ring menu and the
   More tools menu show each option's key (MenuItem hint), a toolbar shortcut (pin) shows its key, and the command
   palette's rings and Eraser show theirs. Test: keys.check on optionCommand and the hint and data-key wiring; npm run look.

## Design

- keys.ts: ten `any("tool.<id>", "<name> tool", "Tools")` entries after tool.orbital, names as the palette uses them
  (SPECIAL_TOOLS, Sequence tool, Catalytic cycle tool), and empty DEFAULT_KEYS entries.
- keys.ts: `RING_TOOLS` (the ring each ring command picks) moves here from a literal in Editor.tsx, so the check
  files can test it. `optionCommand(tool, kind)` gives the command that reaches a strip option: `tool.<kind>` for a
  specialist tool, the ring command for a ring.
- tools.tsx: `optionKey(tool, kind)` turns that into the key. The Ring slot's data-key is its own key, else the held
  ring's. The pins' data-key and the Ring and More tools menus' hint use it too.
- Editor.tsx: the tool branch reads RING_TOOLS and sets `variants.more` for a specialist tool. The command palette's
  ring rows and Eraser row get `keys`.
- No MCP change. Picking a tool is UI only. Nothing on the pointer-move or render hot path changes; actionFor scans ten
  more entries, timed against 9ca16e2.
