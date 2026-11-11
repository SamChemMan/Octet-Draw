# 0008: Online search (Search Reaxys, Search PubChem)

Status: approved by Sam in the version 1 plan (IDEA-RX-1 to RX-10), 17 October 2026. This is the first
feature that sends drawing data off the computer. It does not change the offline-first rule: every other
feature works with no network, and a search runs only when the user asks for one.

## Rules

- A search runs only when the user presses Search Reaxys or Search PubChem: in the Actions panel, the Search
  menu (with its keys) or the command palette. Octet never searches on a selection change, for every structure
  in a document, in a loop or in the background. The Elsevier terms forbid automated searches. Octet runs at
  most one search a second, because a held key repeats its menu command.
- Settings > Import and export > Online search turns the searches on or off. It is on by default. Off removes the
  Search menu, the panel's Search set and the palette's search commands, and the app refuses a search.
- The searches use a magnifier icon and a text label. Octet shows no Reaxys or PubChem logo. "Reaxys" is an
  Elsevier trademark, used here only to name the site.
- Octet itself makes no network connection. It opens one address in the user's browser, and the browser does
  the rest. Reaxys signs the user in (by institution IP range, institution login or personal login). Results
  need the user's own Reaxys subscription.
- The address is built in the app (src-tauri/src/search.rs), from fixed hosts. The page gives only the
  structure, exact or not, and the reaction role, so the page cannot open any other site.

## What is sent, and to whom

- Search Reaxys: the selection (or the whole drawing when nothing is selected) as SMILES, or as a molfile when it
  has generic labels (A, Q, M, X and their H forms), to Elsevier, in a Reaxys Link-In address
  (`hopinto.do`). With it go the search type and ChemDraw 26.1's options, and `origin=Octet<version>`, which
  names the app, not the user.
- Search PubChem: the same SMILES, to the US National Library of Medicine (NIH), in PubChem's structure search
  address. The structure goes after the `#`, and PubChem's page sends it on.
- The structure is in the address, so it stays in the browser's history and in any browser sync. Users who may
  not send unpublished structures to third parties can turn Online search off.

## How it works

- Search Reaxys looks for substructures, as ChemDraw's Search Reaxys does by default; Search Reaxys for Exact
  Structure is in the Search menu. Search PubChem looks for the same structure; Search PubChem for Substructures
  is in the Search menu. A query with generic labels always looks for substructures. Its molfile writes them as
  ChemDraw 26.1 does: A, Q and X as the atom symbol, and AH, QH, M, MH and XH as a carbon with the label as its alias.
- A structure on one side of a reaction searches Reaxys's reactions for it in that part, as ChemDraw's Reactant
  and Reaction product searches do: before the first arrow `starting_material`, after the last `product`,
  between two arrows `all_reactions`.
- A whole reaction cannot go in a Link-In address (a reaction SMILES runs a substance search). ChemDraw uploads
  an RD file instead; in Octet's tests the upload did not finish loading results. Until that works, a selection
  with both sides of a reaction asks the user to select one side.
- Every byte of the structure that is not a letter or a digit is percent-encoded. An address longer than 2000
  characters (the Link-In guide's limit) is refused with a message.
- Octet opens every web address and file through the open crate. On Windows it calls ShellExecuteExW and never
  cmd.exe, which reads each `&` in an address as a new command.
- PubChem does not document its `#query=` address. Check it before each release. If it breaks, use PUG REST
  to get the compound's CID and open `https://pubchem.ncbi.nlm.nih.gov/compound/<CID>`.

## Open questions

- The RD file upload for whole-reaction searches (IDEA-RX-3 step 2): it needs a live Reaxys test and an HTTPS
  client in the app.
- Reagent, catalyst and solvent searches need structures above and below an arrow to have a role.

## Update, 18 October 2026: Search Reaxys opens in Octet's Reaxys window

Reaxys's website keeps its Query Builder form in the browser and, on a link, searches that old form before it loads the new structure. So in any browser that had run a Reaxys structure search, each search showed the one before it. Every link form goes through the same code; ChemDraw's link should hit it too (not run). Sam chose a Reaxys window in Octet: one window, reused, with a script that clears the old form before Reaxys's own scripts run on a load from a link. Reaxys pages get no Octet commands, links that open a new window go to the user's browser, and downloads go to Downloads. Off-campus users sign in to Reaxys once in that window. Search PubChem still opens the user's browser, because PubChem has no such fault.

## Update, 27 October 2026: Name to Structure asks PubChem

Decision 0015: with Online search on, Name to Structure asks PubChem's PUG REST service for a name or InChIKey that
nothing offline reads, when the user presses Return. Octet makes that connection itself (`src-tauri/src/pubchem.rs`),
with the updater's HTTPS client, to a fixed address. Only the typed text goes. Off, Octet asks nothing.

## Update, 11 November 2026: Search SciFinder, Search Google Scholar and Search Google Patents

Issues 113 and 115. The same rules apply: a press only, one search a second, Online search off hides them and the
app refuses them, no logos, fixed hosts in `src-tauri/src/search.rs`. Each opens in the user's browser. A query with
generic labels goes only to Reaxys.

- Search SciFinder (the Search menu, the Actions panel and the palette): CAS publishes no address that carries a
  structure. Its Structure Search API needs a client ID that CAS gives to partners. So Octet opens
  `https://scifinder-n.cas.org/` and puts the selection's SMILES on the clipboard. CAS Draw's Add to Editor reads
  SMILES, so the user pastes it there and chooses the search type in SciFinder. Nothing goes to CAS until the user
  pastes. A one-press search needs a CAS client ID.
- Search Google Scholar: Google Scholar has no structure search. Octet sends each structure's checked name as a
  phrase in quotes, or its InChIKey when Octet has no name for it, to Google in `scholar.google.com/scholar?q=`.
- Search Google Patents: Octet sends the selection's InChIKey to Google in `patents.google.com/?q=`. Google's
  chemistry search reads an InChIKey as that structure, so this finds the same structure in patents. Google Patents
  is free, needs no account, covers patents from many offices and documents its chemistry search syntax. SureChEMBL
  documents no address that carries a structure. Substructure (`SSS=`) and similarity (`~`) searches are not in
  Octet yet, because their link forms are not tested.
- "Google Scholar", "Google Patents" and "SciFinder" are trademarks of Google and CAS, used here only to name the
  sites.

## Update, 11 November 2026: the Properties panel asks PubChem for CAS numbers

Issue #121: the Properties panel has a CAS number row. Octet looks each structure up by its standard InChIKey in its
dictionary (data/names, offline). For a structure the dictionary does not have, with Online search on, Octet asks
PubChem's PUG REST service for the compound's synonyms and shows the first CAS number in them, which is PubChem's
main one (`src-tauri/src/pubchem.rs`, `pubchem_cas`).

This is the first PubChem request the user does not start with a key or a button. It runs only while the Properties
panel is open, after the drawing has been still for a second, one structure at a time and at most one request a
second, and once for each structure in a session. Only the InChIKey goes, to a fixed address, and Octet reads only
a CAS number with a right check digit from the answer (at most 64 KB). With no network, or Online search off, the
row shows only the dictionary's numbers and no message. An InChIKey cannot be turned back into a structure, but
PubChem sees which compounds the user draws, so users who may not send unpublished structures to third parties
can turn Online search off. Open for Sam: keep this automatic, or ask PubChem only when the user clicks the row.

## Update, 11 November 2026: Find hazards in the Properties panel

Issue 116. With Online search on, the Properties panel has Find hazards. It shows each structure's GHS pictograms,
signal word, hazard statements, precautionary statement codes, their source and the PubChem CID, which opens the
compound's Safety and Hazards page in the browser. Octet shows the first source PubChem lists, as PubChem's own page
does. ChemDraw's PubChem GHS LCSS add-in shows the whole LCSS page and can copy from one source or all of them.

- Octet asks only when the user presses Find hazards, never on a selection change. A compound's answer is kept while
  its window is open, so a structure found before shows its hazards again with no new request.
- Only each structure's standard InChIKey goes to PubChem (NIH), from `src-tauri/src/pubchem.rs`, to fixed addresses:
  PUG REST for the CID, then PUG View for the GHS Classification section. One key at a time.
- The answer is hostile: at most 1 MB of UTF-8, read with `JSON.parse` and each value's type checked (`src/ghs.ts`).
  No answer, or no network, shows nothing.
