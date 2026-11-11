# MCP evals in agent mode: results and what misled the AI app

Each case is done by an agent that stands in for the AI app: it has only `tools/list`, the server's instructions and
the replies (`scripts/mcp-evals/run.mjs tools | prep | call | check`), against the MCP Beta dev build. After the job
it lists every place the tools misled it or cost it a call. Those lists are what the tool wording is tuned from.

## 11 November 2026: v1 tool names with wave A (lenient arguments, short replies, layout), 21 train cases

21 of 21 pass. 50 calls, 0 refused, 8715 characters of arguments.
Eight agents ran at once against one Octet, so the seconds are not a measure of Octet: a call to a window behind
others took up to 114 s, and `new_drawing` timed out three times in the set-up (test plan R6: to look into).

| Case | Pass | Calls | Refused | Characters |
|---|---|---|---|---|
| cycle-suzuki | yes | 4 | 0 | 900 |
| experiment-boc | yes | 2 | 0 | 701 |
| experiment-suzuki | yes | 5 | 0 | 2118 |
| fix-numbers | yes | 2 | 0 | 150 |
| fix-product | yes | 2 | 0 | 88 |
| fix-valence | yes | 4 | 0 | 55 |
| grid-amides | yes | 9 | 0 | 1386 |
| picture-caffeine | yes | 1 | 0 | 51 |
| picture-ibuprofen | yes | 3 | 0 | 147 |
| picture-scheme | yes | 6 | 0 | 804 |
| read-identify | yes | 1 | 0 | 17 |
| read-smiles | yes | 1 | 0 | 15 |
| scheme-boc | yes | 1 | 0 | 208 |
| scheme-fischer | yes | 1 | 0 | 263 |
| scheme-grignard | yes | 1 | 0 | 279 |
| scheme-reductive-amination | yes | 1 | 0 | 265 |
| scheme-suzuki | yes | 1 | 0 | 351 |
| scheme-three-steps | yes | 1 | 0 | 517 |
| scheme-wittig | yes | 1 | 0 | 256 |
| style-jacs | yes | 2 | 0 | 91 |
| style-rsc | yes | 1 | 0 | 53 |

### What misled the AI app

**cycle-suzuki**

- draw_cycle: the result gives made [s1,s2,s3,c2] and boxes only. It gives no ids for the cycle's texts (caption, in, out, name), so fixing a caption or a side text needed a read_drawing detail:full call first.
- draw_cycle: the description does not say whether steps[].in and steps[].out are drawn as plain text or as structures. 'bromobenzene' and 'biphenyl' came out as words. I could not tell from the schema how to get a structure on a side arrow.
- draw_cycle / compound caption: the description of add_text says 'plain text gets chemistry formatting (H2SO4)', but the caption 'Pd(0)L2' was drawn with no subscript, and the side texts '[PhB(OH)3]−' and 'Br−' kept the charge on the line (the 3 in B(OH)3 was subscripted). That cost a batch of three edits with runs.
- draw_cycle: the description's own example '*[Pd]*' with labels ['L','L'] draws PdL2 bent (L-Pd-L at an angle, L labels at different heights). No geometry value is linear, so I left it bent and told the user.
- draw_cycle: the step name 'transmetalation' at the bottom was placed outside the circle under the out text 'B(OH)3 + Br−', while the other two names sit inside the circle. It reads as a caption of the by-product. Nothing in the description says where names go or how to move one ('a cycle's text moves only with its cycle').
- draw_cycle picture:true: the description says 'Add a PNG of what changed'. Good, it worked, but after the batch of edits I needed a second read_drawing with picture to see the result, because I did not know whether batch takes picture (batch's schema was not in what I looked at closely; its description does not mention it).
- Instructions say 'check: clean ... does not mean the drawing reads well, so for a figure look at it'. For a cycle it is unclear if a look is expected. I looked twice (one picture in the draw call, one read after edits).
- geometry square_planar puts ligands in SMILES order up, right, down, left, so getting cis or trans means reordering the SMILES by hand. That is workable but easy to get wrong. I drew the diaryl Pd complex trans and noted it for the user.

**experiment-boc**

- fill_experiment: 'Octet works out the rest of the grid (moles, equivalents, expected mass): tables, in the data.' The batch reply held no table data (only made, boxes, warnings, check), so I spent a read_drawing call to see the numbers.
- read_drawing detail: full: reagentTables gives only the typed values (mass 1.07, volume 20), not the worked-out moles, equivalents, expected mass or yield. I could only confirm those (97.1%, 1.10 eq) from the picture.
- fill_experiment: 'A volume needs a density or a molarity' does not say whether Octet knows the density of common liquids (Et3N, CH2Cl2) or whether a solvent's volume needs one at all. I supplied both densities from memory, which puts numbers on the page the user did not give.
- fill_experiment: 'one with no amount counts as 1.00 eq' reads oddly for a solvent column; unclear whether a solvent should get an amount, so I gave CH2Cl2 a volume and a density and it now shows as 31.37 equivalents in the table.
- fill_experiment details has no field for the procedure text, and the page has an empty 'Procedure' box (b3 under caption t2). No tool description says how to fill it (add_text at the box?), so I left it empty and told the user.
- fill_experiment 'of': the read-back keys the columns by formula (r:C7H9N, p:C12H17NO2) or quoted reagent text (r:"Boc2O"). Names worked, but the description does not say what happens when a name does not match a column, so I could not tell from the reply 'typed amounts for 5 compounds' alone that each went to the right column.
- Instructions say write results need 'no read in between', but for an experiment page the write result does not show what Octet calculated, so a read (or picture) is needed before reporting yield and equivalents to the user.
- read_drawing detail: full lists the Et3N column's formula as 'Et3N' (not C6H15N) while Boc2O is expanded to C10H18O5; the mw is right, but the inconsistency made me check the picture.

**experiment-suzuki**

- draw_reaction with yield '88%' on an experiment page: Octet put the yield line under the arrow straight onto the reagent table it made (check: overlaps t10/g5). The tool's own layout produced the overlap; nothing in draw_reaction or fill_experiment says the table sits right under the conditions or that yield should be left off the arrow on an experiment page. Cost one fix.
- move: 'Moves the ids together, with what belongs to them (numbers, conditions)'. Moving s1, s2, s3 and a5 up left the reaction's '+' (t4) behind and carried the reagent table with the arrow, so the overlap stayed and a new one appeared (t4/g5). The description does not say the '+' is separate text that needs its own id, nor that the reagent table is fixed to the arrow and cannot be moved away from the conditions. Cost one extra call.
- check named 'g5' (overlaps [["t10","g5"]]). g5 was never in 'made' or 'boxes' and no description explains a g id. I guessed it was the reagent table; only read_drawing's warning text ('overlaps the reagent table of a5') confirmed it.
- batch result 'boxes' gave a5 as [-19.8,-4.7,19.8,13.5], which is the arrow plus its reagent table, with no word that the table is included. The table's own box only shows in read_drawing detail: full (reagentTables.box).
- add_text: 'plain text gets chemistry formatting (H2SO4)'. The procedure paragraph with Pd(PPh3)4, K2CO3, H2O and N2 came out with no subscripts. I had to resend the whole paragraph as runs (about 600 extra argument characters). The description does not say the formatting only applies to short formula-like text, if that is the rule.
- read_drawing summary on the blank experiment page showed 'experiment', the texts 'Reaction scheme' and 'Procedure' and two boxes, but did not say where a reaction goes on that page or where the reagent table will appear. I needed a detail: full read after drawing to get the box coordinates for placing the procedure text. new_drawing and fill_experiment do not describe the page's layout either.
- fill_experiment: 'Each compound the conditions name (solvents and the atmosphere's gas too) has a column, and one with no amount counts as 1.00 eq.' N2 got no column in the result, which was the better outcome, but the description made me expect one and worry about a bogus 1.00 eq N2 column.
- fill_experiment: 'A volume needs a density or a molarity.' For solvents this forced me to supply densities from memory for toluene, EtOH and water just to enter 20/5/5 mL. Nothing says whether Octet knows common solvent densities or whether a solvent can take a volume alone.
- The reagent table (8 columns, box x -19.8 to 19.8) is wider than the page's 'Reaction scheme' box (x -17.7 to 17.7), so row labels and the product column cross the box's edges in the picture. check reported 'clean' although the instructions say clean means nothing lies 'across a shape's edge'. I could find no documented way to narrow the table (run_command lists grid.layout and grid.hide.col with no explanation), so I left it and told the user.
- batch with picture: true returns a picture 'of what changed', which cropped the page (title and details header were never visible, the product column was cut off in the last picture). I could not confirm the title visually and relied on read_drawing's experiment.title. The picture option does not say how to get the whole page in a batch.
- The table's column headers show formulas (C7H7BrO, C6H7BO2, C13H12O) for drawn compounds and text for reagents. fill_experiment's 'of names a compound (its name, SMILES, number or the reagent's text)' worked with names, but the reply ('typed amounts for 8 compounds') did not echo which column each 'of' matched, so I needed the full read to be sure each amount landed in the right column.

**fix-numbers**

- run_command lists 'number' and 'numbers.roman' with no words on what they do (number the selection in order? renumber all from 1?). It may be the one-call way to do this job, but I could not tell, so I used set_number twice in a batch.
- set_number's schema gives 'structure' and 'number' no descriptions. The tool description does not say whether 'structure' takes an id, a current number, or both; with two structures numbered 1 a number would be ambiguous, so I guessed ids.
- set_number takes one structure per call, so renumbering several needs batch. Nothing in set_number points to batch or to a many-at-once form; I only got there from the server instructions.
- read_drawing's summary gives no positions or order for structures, so 'starting at 1' in reading order (left to right) is not checkable without detail: 'full'. I assumed id order matched the order on the page.
- batch with picture: true returned a PNG cropped tight to the two changed numbers (the ring tops cut off, compound 1 not shown), so it could not confirm the whole row 1, 2, 3. 'Add a PNG of what changed' is accurate but the crop was too tight to be useful as a check.

**fix-product**

- replace_structure reply: 'Replaced s3, which keeps its number 3' reads as if s3 still exists; the new id s4 is only in the JSON below. It also does not say the new structure is still the arrow's product, so I had to trust that (a line like 'still the product of a2' would remove the urge to re-read).
- replace_structure vs edit: edit's description also offers 'structure (a name or SMILES, in place)' for a structure id. Two tools do the same job and neither says how they differ (does edit keep the id?). I picked replace_structure by its name only.
- read_drawing: the description says the summary gives 'formula' and the route, which would have been enough here, but it is not clear whether the summary gives a structure's name. I asked for detail: 'full' to be sure of getting name and SMILES, which returned InChI, boxes and fields I did not need.
- read_drawing full reply: the reaction's step lists 'before' but the products sit at the reaction level ('products': ['s3']), not on the step. Fine for one step, but unclear which step a product belongs to in a longer scheme.
- read_drawing with picture: I asked for a picture on the first read out of habit from the instructions ('look at it before you say it is done'); the text alone answered the question. The instructions do not say a picture is unnecessary for a chemistry check as opposed to a layout check.
- replace_structure picture: 'Add a PNG of what changed' gave a tight crop of the product only, cutting the arrow off at its head. Good enough to confirm the structure and number, but it cannot show that the product still sits right against the arrow.

**fix-valence**

- run.mjs tools: the first run printed nothing for over 2 minutes; run alone a moment later it returned at once. No message said it was waiting on the app.
- read_drawing: the warning says 'C2 has 6 bonds ... Remove a bond', which names one bond when two must go. The count is right so it did not cost a call, but 'Remove 2 bonds' would be exact.
- read_drawing: the summary read gives the warning's atom as 'at': 's1.2', the full read gives 'structure' and 'atom'. Two shapes for the same thing.
- read_drawing with detail full: 'source': {'given': 'CC(C)(C)(C)(C)O', 'named': false} is not described anywhere in the tool list. I guessed it was the text the structure was made from.
- delete: the description says atoms go 'with their bonds' but not that the neighbour's implicit hydrogens are recounted or that the rest is left where it was drawn. The reply ('warnings': [], 'check': 'clean') settled it, and I asked for a picture to be sure the remaining methyls still sat at sensible angles (they did; no clean_up needed).
- batch: I wrapped a single delete in batch only to get picture_size (delete takes picture but not picture_size). batch's schema says the default is 800 px while read_drawing's says 1000 (medium): the two descriptions disagree on the default size.
- No write reply gives the structure's new formula or SMILES after an atom delete, so confirming 'this is now tert-butanol' needs a picture or a second read_drawing. A one-line formula in the delete reply would save that call.

**grid-amides**

- draw_structures: the first call (names only, columns 3) was correct and 'clean', but 5a and 5c came out a different way round from the other four (C=O down / HN label, different amide conformation). A homologous series from one call is not laid out alike, and nothing in the description says to ask for that. All 7 later calls were spent on this.
- draw_structures 'like' ('Drawn the same way round as this structure (an id such as s3), by the atoms they share'): like:'s2' on N-benzylacetamide and N-benzylpropanamide did not give 5b's orientation. Both came out tilted about 30 degrees with a different conformation at N, and the reply gave no sign that 'like' had not matched.
- replace_structure / changes swap: {swap:{Ph:'CH3'}} and {swap:{Ph:'CH2CH3'}} drew the new groups as text labels (CH3, CH2CH3) on a skeletal drawing. The description says 'A group is a label (OTBS, CH2OH, =O)' but does not say a plain alkyl group stays a contracted label; I expected a methyl and ethyl drawn as bonds. Cost an expand_label call.
- run_command expand_label: expanding CH2CH3 drew the ethyl in a straight line (warning 'C77 has two bonds in a straight line'), so the propanamide looked like acetamide with a long bond. The warning names 'C77', an atom number that matches no id I had (read_drawing gave it as s10.10 only in a later full read).
- run_command clean_up on one structure (s10) rotated the whole structure about 30 degrees as well as bending the ethyl, undoing the orientation I had just set. The description does not say clean_up can turn a structure. Cost an edit rotate.
- edit flip:'vertical' on s1 and s3: I misread the first picture (5c already had C=O up), so this call was my error, but the picture on an edit shows only what changed (cropped to the two structures' row), so I could not compare with the rest of the grid in that reply.
- replace_structure and move leave the grid uneven (the new boxes differ from the old), and no tool re-lays an existing set of structures as a grid. I placed 5a and 5c by hand with move above s4/s6. 'arrange' only aligns or distributes on one axis. A 'lay these out as a grid again' option would have saved a call.
- run_command is not allowed inside batch, so expand_label and clean_up each cost a call of their own, and run_command's reply gives no boxes, so I needed a read_drawing after expand_label.
- Instructions say 'check: clean ... does not mean the drawing reads well, so for a figure look at it'. True here: every reply said clean while orientations, text labels and a straight ethyl were wrong. Only the pictures showed it.

**picture-caffeine**

- draw_structures: nothing says which way round a named compound is drawn by default, so I could not know before the call whether up/left/rotate hints were needed to match the picture; I added picture:true to find out (it matched, no extra call, but it was luck).
- Instructions say 'To match a picture, add hints to the SMILES instead of writing coordinates', which reads as if a picture should be drawn from SMILES; draw_structures says 'Give the name when you know it'. It is unclear whether the orientation hints (up, left, rotate, flip) also apply to a name. I used the name and it worked.

**picture-ibuprofen**

- draw_structures: the name '(S)-ibuprofen' came out rotated 180 degrees from the picture (CO2H left, methyl wedge up). The orientation hints (up/down/left/right take 'a label, an element, or #n for the n-th atom of the SMILES') cannot be used reliably with a name, because I do not know Octet's atom order or which 'O'/'C' it would pick, so I drew first and fixed it with a second call (edit rotate 180).
- draw_structures description: it does not say whether left/right hints work when text is a name and not a SMILES, or what happens when the element given (e.g. right: 'O') matches several atoms. I avoided the hints for that reason.
- edit rotate / instructions: nothing says rotate keeps wedges and stereocentres (flip says 'keeping stereocentres', rotate does not), so I spent a read_drawing call to confirm the centre was still S after the rotation.
- draw_structures result: the reply gives Octet's name for what it read ('(2S)-...'), which was useful, but the edit reply gives only 'Changed s2: rotate' with no name or stereo descriptor, so the write result alone could not confirm the stereochemistry after the change.
- The prep text says 'Redraw this' and the case id says ibuprofen, but the picture holds caffeine and ibuprofen. I drew both. Not a tool problem, but the scope was ambiguous.
- draw_structures 'columns': 'one row for 6 or fewer, unless columns is set' made it clear enough that columns: 1 stacks them, but the picture option's result is cropped to what changed, so after the edit I could not see both structures together without another read; I relied on check: clean and the boxes.

**picture-scheme**

- draw_reaction product hint left:'O' on 4-methoxybiphenyl put O leftmost but left the biaryl axis tilted about 15 degrees; the description of up/down/left/right ('an atom that points that way') gave no way to say 'lie flat', so I needed edit rotate calls afterwards.
- draw_reaction keep_orientation ('Turn each product to lie as its starting material ... true unless set false') did not make the product lie horizontal like 4-bromoanisole, which did lie flat; unclear whether my left hint overrode it. Nothing in the reply said which won.
- No tool or reply gives a structure's current angle (the write result gives only boxes), so I had to judge the product's tilt from the PNG, guessed 30 degrees instead of 15, and spent two extra edit calls correcting it.
- batch with picture:true shows only 'what changed', and the batch reply gave no boxes for the edited structures (made: [] and no boxes after edit rotate/flip), so I could not tell from the reply how the product ended up and needed a picture each time.
- draw_structures has no hint to match a drawn stereo wedge direction or whole-molecule orientation of (S)-ibuprofen from a name; it came out turned 180 degrees from the picture and needed an edit rotate. A single right:/left: hint might have done it but the description does not say how hints pick atoms for a name (labels like 'OH' or 'COOH' on a name are not explained, only SMILES #n).
- prep printed 'sets the case up in a new drawing' but the attached picture also held caffeine and ibuprofen above the scheme while the user text said only 'a scheme'; I spent a read_drawing call to check they were not already in the drawing.
- The instructions say 'for a figure look at it before you say it is done: read_drawing with picture and the ids of each part'; for a small scheme one whole-page picture was enough, so that advice would have cost extra calls if followed literally.
- edit description says rotate is 'degrees, anticlockwise, about its middle' but does not say whether rotate and flip given in one edit call apply in a fixed order, so I split them into separate batch steps.

**read-identify**

- read_drawing description: the summary is said to give 'id, number, caption, formula' and only 'detail: full' is said to add the name, so I could not tell whether the default summary would be enough to identify a compound. I asked for detail: full to be safe; it cost no extra call but returned boxes, InChI and page data I did not need.
- read_drawing reply: 'name' is the systematic name only (2-(acetyloxy)benzoic acid, 2-[4-(2-methylpropyl)phenyl]propanoic acid). The common names aspirin and ibuprofen came from my own knowledge. No tool or field gives a common or trade name for a drawn structure, though the instructions say Octet accepts those names as input.
- read_drawing reply: the 'source' field ({given: SMILES, named: false}) is not explained in the description. I guessed it means the structure was drawn from SMILES and not from a name.
- read_drawing reply: nothing says whether a stereocentre is undefined. For compound 2 I inferred 'no stereochemistry drawn' from the SMILES having no @ and the InChI having no /t layer.

**read-smiles**

- read_drawing with smiles: true returns Kekule SMILES with lower-priority ring closures (COC1C=CC(Br)=CC=1), not the aromatic form chemists expect (COc1ccc(Br)cc1); I converted them by hand for the user and the description does not say which form it gives.
- read_drawing summary gives formula and SMILES but no name; names are only under detail: 'full', so I named the three compounds from my own knowledge instead of spending a second call.
- read_drawing: the reply lists the arrow's conditions (K2CO3, Pd(PPh3)4, toluene/EtOH/H2O) as one text string, and nothing says whether those count as compounds with SMILES available. 'Every compound in this drawing' was ambiguous, so I listed them as text and offered SMILES on request.
- read_drawing schema: the smiles property has no description of its own (picture, ids and atoms do); the only explanation is the four words 'smiles adds each SMILES' in the tool description.
- Server instructions say 'you seldom need to read' and are written entirely about drawing; nothing points a read-only request at read_drawing versus get_file (format SMILES), which looks like it would also answer this. I picked read_drawing because it gives ids and numbers alongside.

**scheme-boc**

- draw_reaction and the instructions say nothing about amounts in a procedure sentence (1.07 g, 10.0 mmol, 20 mL): fill_experiment says it needs 'an experiment page' and 'a reaction already drawn', so it was unclear whether 'draw this' from an experimental write-up should become a plain scheme or new_drawing for: 'experiment' plus fill_experiment. I left the amounts out and offered the experiment page in the answer.
- draw_reaction: 'reagents, then catalysts, go over the arrow' does not say whether a stoichiometric reagent that gives atoms to the product (Boc2O) belongs in start with a '+' or in reagents. I guessed reagents; the description's only example puts both reactants in start.
- draw_reaction: the picture flag's description 'Add a PNG of what changed' reads as optional, while the instructions say 'for a figure look at it before you say it is done' through read_drawing. It was unclear whether picture: true on the write call counts as that look for a one-step scheme; I assumed yes and saved a read.

**scheme-fischer**

- draw_reaction: the description does not say where a compound that is both reagent and solvent (methanol here) should go, or whether an amount such as '50 mL' belongs in reagents; I guessed reagents: ['MeOH (50 mL)'] and it drew fine.
- draw_reaction: nothing says where to put a starting material's or product's amounts (12.2 g, 100 mmol; 12.0 g). I used caption, which draw_structures describes as 'text under the number'; it worked with no number, but that is not stated.
- draw_reaction: the picture it returned cuts the product's methyl bond at the right edge (the O-CH3 line runs to the image border), so I could not tell from the picture alone whether the structure is whole; check: 'clean' was what I relied on.
- draw_reaction result: 'made' lists s1, s2 and a2 but no ids for the two captions or the conditions text, so a later edit of a caption would need a read_drawing with detail: full first.

**scheme-grignard**

- draw_reaction: the description gives two ways to write conditions (fields such as reagents/solvents/temperature/time, or free lines in above/below) and does not say how to write a numbered two-operation step (1. add ketone, 2. quench). I guessed above/below lines with '1.' and '2.' and left the fields empty except yield; it does not say whether fields and above/below can be mixed or in what order they then stack.
- draw_reaction: 'keep lines short' gives no length, so I split '1. Ph2CO, THF / 0 °C to rt, 2 h' into two above lines by guess. The description says above and below 'add one line each' while the schema takes an array, so it was unclear whether two entries in above were allowed (they were).
- draw_reaction: no word on whether a reagent that is a real compound in the reaction (benzophenone) should be a structure over the arrow ('structure:' prefix), a second starting material of that step, or text. A step has no field for a co-reactant added at that step, so I wrote Ph2CO as text.
- draw_reaction reply: 'Octet read the names as: phenylmagnesium bromide (C6H5BrMg ...)' reports only one of the three names. It was not clear whether the other two were left out because they were unambiguous or whether the list is partial.
- draw_reaction result: the Grignard reagent is drawn with a bent Br-Mg-C angle (Br below left of Mg) where a chemist would expect a straight PhMgBr or a PhMgBr label. check said 'clean' and nothing in the reply flags it. I only saw it in the picture and left it.
- draw_reaction result: made lists a1 and a4 for the two arrows with no word on what a2/a3 are (probably the conditions text), and the conditions text ids are not returned, so editing a conditions line later would need a read_drawing.

**scheme-reductive-amination**

- draw_reaction reply: "Octet read the names as: benzylamine (C7H9N; Octet's name: phenylmethanamine)" lists only one of the three names I gave. It does not say why cyclohexanone and N-benzylcyclohexanamine are left out (presumably because Octet's name matched mine), so I could not tell from the text alone that the other two were read correctly. I relied on the picture.
- draw_reaction description: conditions are fields (reagents, solvents, temperature, time, yield) with no field or guidance for amounts or equivalents. The user gave masses, mmol and volumes; I had to guess that putting "(1.5 equiv)" inside the reagent string is the way, and that masses belong off the scheme (fill_experiment takes amounts but only "on an experiment page").
- draw_reaction description says solvents, temperature and time go under the arrow, but not that each gets its own line. The result was three lines under the arrow plus the yield (1,2-dichloroethane / rt, overnight / 90%). No way stated to get "DCE, rt, overnight" on one line other than the free `below` lines.
- Result ids: made lists "a2" for the arrow and "t1" for the plus sign with no id for the conditions text. The instructions say conditions move with what they belong to, but nothing in the reply says t1 is the plus, so I had to infer it from its box.

**scheme-suzuki**

- draw_reaction: the description says 'reagents, then catalysts, go over the arrow' but gives no field for amounts or equivalents, so I put them inside the strings ('K2CO3 (2.0 equiv)', 'Pd(PPh3)4 (3 mol%)'). It worked, but nothing says that is the intended way or whether masses from an experimental belong in caption, conditions or fill_experiment.
- draw_reaction reply: 'Octet read the names as' lists 4-bromoanisole and 4-methoxybiphenyl but not phenylboronic acid, with no word on why one is left out (presumably because Octet's name matched). I had to look at the picture to be sure s2 was right.
- draw_reaction reply: made lists 't2' with a tiny box [-11.7,23.9,-11.3,24.7] and no word on what it is (it is the '+' sign). The conditions text and the numbers 1, 2, 3 have no ids in the reply, which fits the instructions ('a number, conditions ... move with what they belong to') but makes t2 look like a stray text.
- Instructions: 'for a figure look at it before you say it is done' does not say whether a one-step scheme counts as a figure. I asked for picture: true on the draw call to be safe; check: 'clean' alone would probably have been enough.

**scheme-three-steps**

- draw_reaction: no field for an ordered addition ('then Et3N'). The description says 'reagents, then catalysts, go over the arrow' and offers above/below as free lines, but does not say whether above replaces or adds to the reagents line, so I put 'then Et3N' in reagents as a workaround and could not tell if that is the intended way.
- draw_reaction: 'structure:' before a name draws it over the arrow is only described for above/below lines. It is unclear whether a reagent in reagents (the Wittig ylide) can be drawn as a structure, so I gave it as the formula text Ph3P=CHCO2Me.
- draw_reaction reply: the scheme wrapped after step 1, so the step 2 arrow starts row 2 with no starting material beside it (compound 2 is at the end of row 1). The reply says only 'check: clean' and does not mention the wrap; I only saw it in the picture. No argument is described for choosing where it wraps.
- draw_reaction reply: 'Octet read the names as' lists only 2 of the 4 compounds (the ones whose name Octet changed). It does not say that, so on first read it looks like octanal and methyl decanoate were not confirmed.
- draw_reaction reply: made lists a2, a7, a12 but no ids for the conditions text or the numbers, so a later edit to one conditions line would need a read_drawing with detail full first.
- run.mjs harness, not Octet: the tools command and prep run in one shell call went past the 120 s timeout and moved to the background, and the tools dump (82 kB of pretty-printed JSON with the compound schema repeated in each draw tool) was too large to show in one piece.

**scheme-wittig**

- draw_reaction: the description gives fields for reagents, catalysts, solvents, temperature, time, atmosphere and yield but nothing for a selectivity ratio (E/Z > 20:1, dr, ee). I guessed a `below` line. It landed between the solvent line and the yield, which is fine, but the description does not say where a `below` line sits relative to the yield ('then the yield' reads as if yield is last, which it was).
- draw_reaction / add_text: 'plain text gets chemistry formatting' did not italicise E/Z in 'E/Z > 20:1'. The draw_reaction `below` lines take only strings, so there is no way to give runs (italic E/Z) in the same call; it would need a second call (edit with runs on the conditions text), and the result does not give that conditions text an id (made lists s1, s2, s3, t1, a2 only, where t1 is the plus sign). I left it plain.
- draw_reaction reply: 'made' lists t1 with no hint of what it is. From its box it is the '+' between the starting materials. The conditions text has no id in the reply ('conditions move with what they belong to'), so editing it would need a read_drawing with detail: full first.

**style-jacs**

- set_style: 'a page (ACS1: JACS one column, 3.25 in; ACS2: two columns, 7 in)' gives no way to tell which page the drawing will fit. I had to work it out from read_drawing boxes (bond lengths) and my own knowledge that an ACS bond is 0.2 in. The description or the reply could say how wide the drawing is in the new style, or which page it fits without wrapping.
- set_style: the brackets '(... New Slide (ChemDraw); it keeps the page)' are ambiguous. 'it keeps the page' reads as if it belongs to the New Slide preset only. I could not tell whether a preset alone changes the page, so I sent page as well.
- set_style: nothing says that ACS Document 1996 is the style for J. Am. Chem. Soc. Only the page ACS1 mentions JACS. A model without that knowledge could pick the page and miss the preset.
- Instructions say 'Write results already give boxes and a layout check, so you seldom need to read', but a style job on an existing drawing needs one read_drawing first to know what is there (the current style and page are only in that reply). That read took most of the Octet time; a summary read with no picture would have been enough, and nothing says which is cheaper.
- set_style reply: 'made: []' with no boxes for what moved, so the picture (picture: true) was the only way to confirm the new layout without a second read. detail: 'full' is said to work on any write call but set_style's schema has no detail property (additionalProperties: false), so the instructions and the schema disagree.
- read_drawing detail: full returned the SMILES in Kekule form with lower-priority atom order ('COC1C=CC(Br)=CC=1') beside source.given; harmless here but two forms of the same thing in one reply.

**style-rsc**

- set_style: the only column-width pages are 'ACS1: JACS one column, 3.25 in; ACS2: two columns, 7 in'. For 'RSC, two-column width' there is no RSC page, so I had to know from memory that RSC double column is 171 mm and pass page_size [171, 233]; a model without that would pick ACS2 (178 mm), which is wrong for RSC. The description does not say whether ACS2 is the right answer for other journals.
- set_style: 'page_size in mm' does not say the order (width, height) or whether height is needed or can be left out for a width-only request. I guessed [width, height] and made up the height (233 mm, the RSC maximum).
- set_style: 'a preset (...; it keeps the page)' reads as if it applies to the last preset in the list (New Slide) rather than to all presets. It is unclear whether a preset alone changes the page.
- set_style reply: 'The drawing now uses RSC on a 171 x 233 mm page' confirms the page but not what the drawing was on before, so I could not tell the user what changed without a read first.
- set_style with picture: true returned a picture of the reaction cropped to its contents, with no page edge, so the picture could not show that the scheme fits the 171 mm width. I relied on check: 'clean' for that.
- The single set_style call took about 114 s in Octet (octetSeconds 114.3). Nothing in the reply said why; the instructions say 'each call costs the user a wait' but this was far beyond what I expected for a style change.

## 11 November 2026: the five tools (draw, change, read, drawings, advanced), 21 train cases, agents on Opus 5.5

21 of 21 pass. 41 calls (50 on the v1 names), 3 refused (0), 7696 characters of arguments (8,715).
The agents were on Opus 5.5 where the run above was on Fable 5.2, so the two runs differ in the model as well as in
the tools. What an agent reads before its first call fell from about 82,000 characters to about 19,600.

| Case | Pass | Calls (v1 names) | Refused | Characters (v1 names) |
|---|---|---|---|---|
| cycle-suzuki | yes | 1 (4) | 0 | 463 (900) |
| experiment-boc | yes | 3 (2) | 0 | 767 (701) |
| experiment-suzuki | yes | 5 (5) | 1 | 978 (2118) |
| fix-numbers | yes | 2 (2) | 0 | 138 (150) |
| fix-product | yes | 3 (2) | 0 | 103 (88) |
| fix-valence | yes | 2 (4) | 0 | 97 (55) |
| grid-amides | yes | 1 (9) | 0 | 363 (1386) |
| picture-caffeine | yes | 1 (1) | 0 | 71 (51) |
| picture-ibuprofen | yes | 1 (3) | 0 | 125 (147) |
| picture-scheme | yes | 9 (6) | 2 | 1823 (804) |
| read-identify | yes | 1 (1) | 0 | 17 (17) |
| read-smiles | yes | 1 (1) | 0 | 15 (15) |
| scheme-boc | yes | 1 (1) | 0 | 304 (208) |
| scheme-fischer | yes | 1 (1) | 0 | 232 (263) |
| scheme-grignard | yes | 1 (1) | 0 | 313 (279) |
| scheme-reductive-amination | yes | 1 (1) | 0 | 368 (265) |
| scheme-suzuki | yes | 1 (1) | 0 | 393 (351) |
| scheme-three-steps | yes | 1 (1) | 0 | 544 (517) |
| scheme-wittig | yes | 1 (1) | 0 | 274 (256) |
| style-jacs | yes | 2 (2) | 0 | 201 (91) |
| style-rsc | yes | 2 (1) | 0 | 107 (53) |

### What misled the AI app

**cycle-suzuki**

- draw (kind cycle): no description says whether a step's in/out or a caption takes formula markup. My caption 'Pd(0)L2' drew the 2 on the line, and 'Br−' drew the minus on the line, while 'B(OH)3' got a subscript. I couldn't tell how to get L2 subscripted or a superscript charge.
- draw (kind cycle): the schema doesn't say if step names should be short ('OA, TM, RE') or can be full words. I used full words and they fit, but long in/out text like 'PhB(OH)3− (PhB(OH)2 + base)' made a wide label at the bottom right. Nothing says how long side-arrow text can be before it crowds the layout.

**experiment-boc**

- advanced fill_experiment: its arguments are only in 'advanced help', and the top-level description gives just '{details, amounts}'. I spent a help call to learn the field names (measured, limiting, density).
- advanced help of fill_experiment: 'A volume needs a density or a molarity' does not say whether Octet knows densities for common liquids (Et3N, CH2Cl2). I supplied 0.726 and 1.33 myself and could not tell if that was needed.
- fill_experiment details: there is no field for the page's Procedure box, so the procedure text could not go on the page. No tool description says how to fill it.
- draw result for the reaction: a5's box [-17.7,-4.9,14.4,12.7] reaches far below the arrow (it seems to include the reagent table g5). That is not explained, and it made me unsure whether the layout was right until I looked at the picture.
- fill_experiment details.solvent: 'CH2Cl2' shows as plain text in the details header, not subscripted as it is in the scheme. The help does not say whether formulas are formatted there.

**experiment-suzuki**

- advanced help of fill_experiment says 'of names a compound (its name, SMILES, number or the reagent's text)', but of: 'Pd(PPh3)4' and of: 'K2CO3' failed with "is not in the reaction" because I had written the amounts into the conditions ('Pd(PPh3)4 (3 mol%)', 'K2CO3 (2.0 equiv)'), as the server instructions tell you to. Only the full text worked. This cost one extra change call. The match should accept the compound's name without the bracketed amount.
- Same fill_experiment reply: the wording "cannot read \"Pd(PPh3)4\" is not in the reaction; ..." is garbled. It reads as partial success, with no clear list of which amounts were dropped.
- draw (kind reaction) on an experiment page put the yield line ('88%', t10) on top of the reagent table g5, and check reported overlap [t10, g5]. The draw description does not say a yield clashes with the table on an experiment page. I deleted the yield. It cost no call because I did it in the same change as the fill.
- drawings list does not say which drawing is an experiment page (every entry is 'Untitled' with no purpose). I could only tell the open drawing was an experiment page from the draw picture. I spent one call on the list and on fill_experiment help together.

**fix-numbers**

- read summary: structures came back without boxes or positions, so I had no way to tell which compound sits first on the page. I numbered them in id order (s1, s2, s3) and didn't spend a read with detail 'full' to check reading order. The summary could give each structure's x position, or say that ids follow page order.
- change picture: true crops to 'only what changed'. Here that was just the number labels, and the picture cut off the bottom of each ring, so it couldn't show the numbers sat under the right compounds. A picture of the numbered structures and their labels would have done that.
- change's number op: the description says 'a number names the first structure that has it'. That made me use s ids, because '1' was ambiguous (s1 and s2 both had it). It was clear, but read's warning 'Compound number 1 is on more than one structure.' doesn't say which ids share the number. I had to work that out from the structure list.

**fix-product**

- change replace: the reply ('Replaced s3, which keeps its number 3' plus made s4 and a box) gave no formula, SMILES or name for the new structure, so I spent a second read call to confirm the replacement was ethyl acetate and still number 3.
- read (summary): structures carry only formula, and SMILES only with smiles: true; no names, so I had to work out acetic acid / ethanol / propyl acetate from SMILES. The tool description says names come only with detail: full, which is a heavier read than this job needed.
- read: the route 's1 + s2 -> 3' mixes ids and compound numbers, which is readable but meant matching ids to SMILES by hand to see which was the product.

**fix-valence**

- change delete: the result 'Deleted s1.5, s1.6' with made: [] gives no ids, boxes or new formula of the edited structure s1, so confirming the fix needed picture: true (or another read). With detail summary it could give the structure's new formula or SMILES.
- change delete on atoms: nothing says whether deleting an atom also deletes its bonds, or whether s1's remaining atom ids are renumbered afterwards. I had to assume both from the clean result.

**grid-amides**

- draw kind structures: the grid lays each amide out its own way. 5a and 5c have the C=O pointing down and the NH above it, while 5b, 5d, 5e and 5f have the C=O up. Nothing in the draw description or the instructions says how to make a series lie the same way (for example by drawing 5b to 5f with from on 5a). So I left it as it was.

**picture-caffeine**

- draw description: it says advanced help gives 'hints that turn a compound as a picture shows it', but it doesn't say whether a name-drawn compound already takes the textbook orientation. I couldn't tell beforehand if I would need those hints, so I asked for picture: true to check. Here the default orientation matched the user's picture, so it cost no extra call.

**picture-ibuprofen**

- draw reply: 'Octet read the names as: caffeine (...)' echoes only the compounds given by name. For the one given as a SMILES it says nothing (no formula, no name, no R/S), so the reply alone could not confirm the stereocentre came out (S). I checked it by eye from the picture.
- draw description: 'hints that turn a compound as a picture shows it' are only in advanced help. Matching the picture's CO2H orientation (OH up, C=O right) would have cost an extra help call and a redraw, so I left the CO2H flipped and told the user.

**picture-scheme**

- draw tool list: the compound schema ($defs/compound) has no up/down/left/right/rotate/flip/like fields. The description only says 'hints that turn a compound as a picture shows it' are in advanced help, so I needed an extra help call to learn them.
- change replace: its description says 'text, or changes as a compound's', which reads as if it takes any compound field. It refused up ('up is not an argument of this tool'), so I could not re-orient a structure in place. I had to delete and redraw it with draw at a box corner, and that cost a refused call.
- structures help, orientation hints: 'an atom that points that way ... a second one sets which way round' does not say the hints set the whole molecule's direction from its centre. I expected a local direction from the neighbouring atom. up:'#14' (the carboxyl OH) turned all of ibuprofen vertical, and that cost a call plus a delete-and-redraw.
- structures help: 'a second one sets which way round' does not say the second hint must lie across the first. up+down was refused ('up and down are one line'). Putting the keys in a different order (left then up) gave the same result as up then left, which also cost a call.
- There is no hint or documented way to choose a carboxylic acid's rotamer (which O is drawn up). I matched the picture by swapping bond orders with edit bond on s8.13-14 and s8.13-15, and found that by guessing. The 1-based atom numbering for 'sN.k' is only implied by 's3.2 (the second atom as you gave it)'.
- The reaction draw (keep_orientation default) laid 4-bromoanisole, phenylboronic acid and the product out mirrored from the picture. Every compound needed a horizontal flip afterwards. The instruction 'Trust Octet's layout' made me draw first and fix second rather than set orientation hints up front.

**read-identify**

- read with detail: full gives each structure's name only as the IUPAC name ('2-(acetyloxy)benzoic acid', '2-[4-(2-methylpropyl)phenyl]propanoic acid'). It has no common name such as aspirin or ibuprofen, so the model has to know the common names itself. It cost no extra call here.

**read-smiles**

- read with smiles: true gives SMILES in an unusual Kekule form with ring closure on a double bond ('COC1C=CC(Br)=CC=1') rather than canonical aromatic SMILES; nothing in the read description says which SMILES form it returns, so I converted to aromatic form by hand for the user.
- read reply gives no name for the unnumbered structures s1 and s2 (only formula), so naming them in the answer relied on my own chemistry; detail: 'full' would add names but the description of smiles: true does not say names are left out.

**scheme-boc**

- Instructions: 'put a co-reactant in start (Octet draws the +) or over the arrow, as the source does' left it unclear whether a reagent like Boc2O ('treated with Boc2O') should be drawn as a structure ('structure: Boc2O' in above) or written as text in reagents. I picked text in reagents. No extra call was needed.
- draw schema: the compound 'caption' field says only 'caption under the number'. It does not say whether a starting material's amount (1.07 g, 10.0 mmol) belongs there or somewhere else. I put it there and it rendered fine.
- draw reply: the product's caption sits lower than the start's because the product is taller, so the captions are not on one baseline. This was visible only in the picture, and the check still said 'clean'.

**scheme-fischer**

- Instructions say a co-reactant goes 'in start (Octet draws the +) or over the arrow' but give no rule for a reactant that is also the solvent in excess (methanol here). I had to choose between start and reagents myself. I put MeOH over the arrow.
- Instructions say amounts go 'in that text or a caption', but they do not say whether a scheme should carry them by default. I left them out and offered to add them. It did not cost a call.

**scheme-grignard**

- draw: the instructions say a co-reactant goes 'in start (Octet draws the +) or over the arrow, as the source does', but nothing says how to write a two-part sequence on one arrow (1. reagent, conditions; 2. quench). I put both lines in above/below by hand, which leaves the step's temperature and time fields unused. Not sure that is what the tools expect.
- draw: the reply's 'made' list gives arrows a1 and a4 with no a2/a3 and no t ids for the arrow text. It is unclear whether hand-written above/below lines can be edited later as conditions or only as free text.
- draw: phenylmagnesium bromide comes out with Br on Mg at an odd angle (Br below-left of Mg). The check still says clean, so only the picture shows it. I left it as it is.

**scheme-reductive-amination**

- Instructions: 'Amounts go in that text ... or a caption' left it unclear where starting-material masses/mmol belong (caption under each start compound was my guess) and whether a solvent volume (DCE 30 mL) should go in solvents text; I dropped the 30 mL.
- draw reply: 'Octet read the names as: benzylamine' reported the name read for benzylamine only, not cyclohexanone or the product, so it was unclear whether the others were checked or simply matched exactly.

**scheme-suzuki**

- draw result: the reply says 'Octet read the names as' for 4-bromoanisole and 4-methoxybiphenyl only. Phenylboronic acid is left out, so I had to check the picture to confirm it was read correctly (I looked at the picture anyway, so it cost no extra call).
- draw result: 'made' lists t2 with a tiny box [-11.7,23.9,-11.3,24.7] and nothing says what it is. It is the '+' (the instructions say t covers each +), but the caption '(1.2 equiv)' and the numbers get no id, so it is unclear how I would address that caption to change it later.
- draw description: it does not say whether a starting material's caption ('(1.2 equiv)') goes under its number. I guessed it from 'caption under the number' in the compound schema, and the picture confirmed it.

**scheme-three-steps**

- draw steps description: it says 'solvents, temperature, time and atmosphere under it, then the yield; above and below add one free line'. It doesn't say whether a below line goes before or after the yield, so I couldn't tell where 'then Et3N' would land. It came out before the yield, which is right for Swern, but I only knew that from the picture.
- draw steps: there is no field for a sequential addition ('then Et3N'). I put it in below as a guess, without knowing whether a reagent there would be read as a compound and drawn as a structure ('one free line or compound each').

**scheme-wittig**

- draw steps description: 'solvents, temperature, time and atmosphere under it, then the yield; above and below add one free line or compound each' does not say where a below line goes relative to the yield. My 'E/Z > 20:1' landed between the conditions and '92%', so a selectivity line can't sit after the yield without a caption or a move.
- draw tool: nothing says whether a free text line such as 'E/Z > 20:1' can be italic (the usual convention for E/Z). I left it plain so I wouldn't spend an extra change call.

**style-jacs**

- change: the set_style op is only listed by name under 'Also ops: draw (with kind), set_style, ...' with no arguments; I had to guess it takes preset and page like advanced set_style (it worked, but nothing in change's schema says so).
- Instructions and advanced set_style list presets but never say which one a journal like JACS uses (ACS Document 1996), nor which page (ACS1 single column vs ACS2 double column) suits a figure; I picked ACS2 on my own judgement.
- read: check reported off_page ids s3, t7 and a2, but t7 never appears in the summary (no free text listed), so it was unclear what t7 was (presumably the conditions text).

**style-rsc**

- advanced set_style: the tool list offers ACS1/ACS2 column pages but no RSC column pages, so 'two-column width' for RSC needed my own outside knowledge (171 mm) and a page_size; I spent one help call to confirm there was no RSC column page or width option.
- advanced set_style help: page_size needs [w, h] but nothing says what height to use for a journal column page (or whether height can be left as it was), so 233 mm was a guess; the help also says the preset 'keeps the page' without saying whether RSC has a column width of its own.

## 11 November 2026: what a job costs the model, and the lean harness

`scripts/mcp-evals/cost.mjs` reads the agents' logs of the run above (five tools, Opus 5.5). A job's model turns are its
requests to the model; one reply is often logged as two lines with the same usage, and the first count (aicost.py)
counted both, so its turns, calls and output tokens were too high (8 to 10 turns and about 3,000 tokens a one-reaction
job). The corrected numbers for the 21 cases: 146 model turns, 40 Octet calls, 109 other tool uses, 51,464 output
tokens (9,209 of them thinking), 684 s. A one-reaction scheme (scheme-fischer, scheme-boc and the like) is 5 or 6 turns,
about 2,100 output tokens and 25 to 30 s, and 5 of its tool uses are the harness's own (the tool list, prep, writing the
answer, the check), with 1 Octet call.

The lean harness (`brief.mjs`, `call.mjs`, `judge.mjs`, with `speed.mjs` for the jobs and `headless.ts` for a server
with no window) gives the model the instructions and the tools in its first message, as an AI app does, and does the
set-up and the check itself, so the turns counted are the job's own.
