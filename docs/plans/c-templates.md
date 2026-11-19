# Own templates in the Ring menu (1.1.3)

Mickaël: his own templates show in the Ring menu beside benzene and cyclohexane, and he wants to choose which go
there. Sam's decision: the place you save from shows intent, and an update never moves what a user already has.

ChemDraw: own templates live in template palettes (File > Open Templates > New Templates) and are used with the
Template tool. They never go into its ring tools (notes help26/text/Templates.txt). Octet keeps its Ring strip as a
place the user builds, so the pin decides.

## What it must do, and how each is tested

1. Every own template has "Keep in the Ring menu" in its right-click menu in the Ring tool's template library and in a
   floating palette opened from the Ring tool, ticked when it is in the Ring menu, as built-in templates have.
   Test: templates.check.ts reads TemplateMenu and asserts the keep item is in the own-template groups; npm run look
   for the menu.
2. One pin for both kinds: own templates are kept in settings.libraryRings as "custom:<id>". The Ring strip lists
   the rings, then libraryRings in order (built-in, named and own kinds that still exist). Dragging an own template
   from the library onto the strip keeps it there. The × on an own template in the strip takes it out of the strip,
   as it does for a built-in one; the template stays in the library and the Template tool.
   Test: ringStrip (pure) in templates.ts, asserted in templates.check.ts: no own template unless kept, kept ones in
   order, removed ones dropped. Source asserts for keepable and the strip ×.
3. A template saved from the Ring tool (its strip: Add by name, Add selection; its library: Add, a pick, a drop, Add
   to templates on a built-in, Save of an edited copy), or from anywhere while the Ring tool is in hand, goes into the
   Ring menu. One saved anywhere else (Template tool, Actions panel or Edit menu Add to templates with another tool in
   hand, a ChemDraw template file opened as a set, Duplicate) goes to the library only.
   Test: source asserts in templates.check.ts on addOwnTemplate, addPart and the template.add commands.
4. One-time migration in loadSettings: when the flag ringOwnKept is missing, every own template the user has goes
   into libraryRings, before the built-in ones, so the strip shows what it showed in 1.1.2, in the same order. The
   flag is then set, so a template unpinned later stays unpinned.
   Test: keepOwnRings (pure) in templates.ts, asserted in templates.check.ts: order, no duplicates, bad entries
   skipped; a source assert that loadSettings calls it only when the flag is missing.
5. Removing a template (library ×, menu Remove, palette Remove) also takes it out of libraryRings.
   Test: source assert on removeRingTemplate.
6. The pin is reached by keyboard and screen reader as for built-in ones: the tile in the Ring library has a pin
   button (aria-pressed, "Keep <name> in the Ring menu") above its ×, and the menu (Shift+F10 or the menu key) has the
   checked item. Test: source assert on the tile; npm run look for the tile.

## Design

- templates.ts: `keepOwnRings(kept, templates)` and `ringStrip(kept, exists)`; both pure, both tested.
- settings.ts: `ringOwnKept: boolean` (default true for a new user, who has nothing to move). loadSettings runs
  keepOwnRings when `saved.ringOwnKept !== true`.
- tools.tsx: the strip's ring list is RINGS plus ringStrip(libraryRings). keepable accepts "ring:custom:". The strip
  × unkeeps an own template.
- TemplateLibrary.tsx: TemplateMenu adds the keep item to the own groups when onKeep is given; the tile shows the pin
  for own templates too, stacked above the ×.
- Editor.tsx: addOwnTemplate takes `ring` (default: saved from the Ring tool), addPart passes it, the template.add
  commands pass `tool === "ring"`. saveTemplateEdit keeps a new copy when it was edited from the Ring tool.
  removeRingTemplate filters libraryRings.
- No MCP change in 1.1.3. For 1.2 parity the MCP needs a way to keep a template in the Ring menu (see report).
