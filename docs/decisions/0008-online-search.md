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
