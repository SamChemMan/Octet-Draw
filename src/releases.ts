// What's new: each release's notes, newest first, in ASD-STE100 Simplified Technical English (brand/CLAUDE.md). The
// app shows the notes for its own version once after an update (Editor.tsx, seenNotes) and from About Octet Draw.
// docs/release-notes/<version>.md is the same text for GitHub; releases.check.ts keeps the two the same.

// highlights: the few big changes, each a short name and one line. summary: the plain lines older versions have instead.
export type Release = { version: string; date: string; intro: string; highlights?: { title: string; text: string }[]; summary?: string[]; sections: { title: string; items: string[] }[]; thanks: string };

export const RELEASES: Release[] = [
  {
    version: "1.1.2",
    date: "November 2026",
    intro: "This update fixes problems you reported and adds features you asked for.",
    highlights: [
      { title: "Spectra minimise to a pill", text: "When you minimise a spectrum, it shows as a pill beside its structure. Click the pill to open the spectrum again." },
      { title: "¹⁹F and ³¹P NMR", text: "To predict a ¹⁹F or ³¹P spectrum, choose Structure > Predict ¹⁹F-NMR Shifts or Predict ³¹P-NMR Shifts." },
      { title: "251 new templates", text: "The template library has 15 new sets, such as Lab equipment, Cells, Peptides and Photochemistry." },
      { title: "Gels and plasmid maps", text: "To draw a gel or a plasmid map, hold the last tool on the toolbar. Then choose Gel or Plasmid map." },
      { title: "Stoichiometry for each step", text: "Octet makes one table for each step of a scheme. You can set a column as a catalyst or a solvent." },
      { title: "Edit drawings from Word", text: "On Windows, double-click a drawing in Word to open it in Octet. On the Mac, choose File > Edit Picture from Word." },
    ],
    sections: [
      {
        title: "Spectra and NMR",
        items: ["The spectrum panel and the Mass spec panel have three controls at the top right: Minimise, Full screen and Close.", "When you open a spectrum, Octet minimises the Actions panel. When you open the Actions panel, Octet minimises the spectrum.", "To minimise the spectrum or to open it again, you can also choose View > Show or Hide Spectrum.", "Each structure has its own spectra, as tabs in one panel. To add a spectrum, click +. To close one, point at its tab and click the X.", "If you close a spectrum by mistake, choose Undo before you change the drawing. The spectrum comes back as it was.", "To change the height of a spectrum, drag its top edge.", "To open the Mass spec panel, choose Structure > Show Mass Spec Analysis, or click Mass spec analysis in the Actions panel.", "To move from peak to peak, press Tab until a peak has the focus. Then press the arrow keys. A screen reader reads each peak.", "¹H and ¹³C spectra show the splitting from fluorine and phosphorus.", "To show or hide the ¹H couplings in a ¹⁹F or ³¹P spectrum, click Decouple ¹H. ¹⁹F spectra show them at first. ³¹P spectra do not.", "Octet opens files of measured ¹⁹F and ³¹P spectra. If a file does not give the nucleus, Octet finds it from the frequency.", "Predicted ¹H and ¹³C shifts are more accurate near sulfonyl groups, in heteroaromatic rings and in bridged bicyclic rings.", "When you click Details in a ¹H spectrum, the Quality column shows Rough for OH, NH and SH shifts. The solvent changes these shifts."],
      },
      {
        title: "Templates",
        items: ["Eight new sets are clip art: Lab equipment, Biomolecules, Cells, BioArt, Anatomy, Organisms, Bugs and Symbols.", "Seven new sets are structures: Side chains, Peptides, DNA and RNA, Supramolecules, Polyhedra, Carbon and Photochemistry.", "The Photochemistry set has a Jablonski diagram, a light arrow (hν), singlet oxygen and a sensitiser. To change one part of the Jablonski diagram, double-click that part.", "The Polyhedra set has 14 coordination polyhedra, from the trigonal bipyramid to the icosahedron. Each corner is a position for a ligand.", "The Carbon set has C60 and C70.", "The Lab set has 31 more items, such as a three-neck flask, a Dean-Stark trap, a Schlenk line and a photoreactor.", "In the template library, click Structures or Clip art to show only the sets of that kind. Your own sets show in both.", "When you search the template library, the results are in two groups: Structures and Clip art."],
      },
      {
        title: "Gels, plasmid maps and membranes",
        items: ["When you click the page with the Gel tool, Octet draws a gel of five lanes. The first lane, M, has a protein ladder.", "To add a band, click a lane with the Gel tool. To change the size of a band, drag the band.", "To type the sizes of the bands for a lane, click the lane and choose Add bands… in the Actions panel.", "To change the largest and the smallest size of the gel, choose Set the range… in the Actions panel. Each band keeps its size.", "For a DNA gel, choose Use a DNA ladder. Octet puts a 1 kb ladder in the first lane and shows the sizes in bp.", "When you click the page with the Plasmid map tool, Octet draws a ring of 5000 bp. Base pair 1 is at the top.", "To add a region or a marker to a map, choose Add a region… or Add a marker… in the Actions panel.", "To change a lane name, a region or a marker, double-click it. To give a region or a marker its own colour, right-click it.", "To draw a membrane, hold the Shape tool and choose Membrane. Then drag on the page.", "To change a line, an arc or a pen curve into a membrane, select it. Then choose Membrane from Line in the Actions panel.", "When you drag the end of a membrane, Octet adds lipids. The lipids stay the same size.", "ChemDraw shows a gel, a plasmid map or a membrane from Octet as lines and curves."],
      },
      {
        title: "Stoichiometry table",
        items: ["When a scheme has two or more arrows, Structure > Analyse Stoichiometry makes one table for each step.", "When you type the Measured mass of a product, Octet sets the amount of that compound in the next step.", "Each reactant column has a role: Reactant, Catalyst or Solvent. To change it, click a cell in the column and choose a role in the Actions panel.", "In a new table, Octet gives the Solvent role to each common solvent above or below the arrow, such as THF.", "For a catalyst, the Equivalents row shows mol%. Type 5 or 5% to set 5 mol%.", "For a solvent, the Concentration row shows the concentration of the limiting reactant. For 1 mmol in 5 mL of THF, it shows 0.20 M.", "When you type a concentration for a solvent, such as 0.1 M, Octet calculates the volume of that solvent.", "Reactants have Density and Volume rows. Octet knows the density of 41 common liquids, such as THF, DCM and triethylamine.", "When you type a volume for one of these liquids, Octet calculates the mass and the moles.", "When you type the Expected mass of a product, Octet calculates the amounts of the starting materials.", "When you type a Mass or a Volume for a reactant, Octet marks it as measured in red. To remove the mark, choose Clear measured mark.", "To add the temperature, the time and the atmosphere, click a cell and choose Conditions… in the Actions panel.", "The table includes more reagents from above and below the arrow, such as cat. H2SO4, K2CO3 (2 eq.), H+ and water.", "A coefficient in a scheme, such as the 2 in 2 A + B → C, sets the equivalents. A fraction, such as ½ O2, does the same.", "The table calculates the molar mass of formulae with 27 more elements, such as Mo, Ba, Ce and Bi.", "When you type a mass with no unit, Octet uses grams. To use milligrams, change Mass without a unit in Settings > Keyboard shortcuts.", "To copy the table as text for a spreadsheet, click a cell and choose Copy table in the Actions panel.", "To hide each row that has no value, choose Hide empty rows. To show them again, choose Show all rows and columns.", "To move between cells, press an arrow key or Tab. To edit a cell, press Return. To replace its value, type.", "When you press Delete in a cell, Octet removes the value that you typed. It does not remove the table."],
      },
      {
        title: "Experiment pages",
        items: ["On an experiment page, click a box at the top of the page to type that detail. Press Tab to go to the next detail.", "The details at the top of an experiment page are text. You can move, change or delete each name and each value.", "When you type the name of a detail, such as Pressure, Octet shows a box after it for the value.", "To start each new experiment page with your own layout, choose Use for new documents in Settings > Document.", "When you open an experiment page in ChemDraw, ChemDraw shows the details."],
      },
      {
        title: "Drawing",
        items: ["To remove one hydrogen from an atom, point at the atom and press the key of its element. For example, press O on OH to get O.", "To open the periodic table, hold the Text tool. Click an element, then click an atom to change it to that element.", "In the periodic table, point at an element to see its atomic weight and its isotopes.", "When you select one bond, such as ethane, the Actions panel shows the structure actions and the formula. One labelled atom, such as H₂O, does the same.", "Octet draws each small fishhook arrow and each small curved arrow as one smooth curve. The arrowhead follows the curve.", "When you set the Line of an orbital to Dashed or Bold, Octet draws the outline of each lobe dashed or bold.", "When you choose Structure > Clean Up Reaction, Octet turns each product to the orientation of its starting material. To keep the products as you drew them, choose Edit > Undo.", "Augmented Clean Up Reaction is removed. Clean Up Reaction does the same work.", "When you change a structure, Octet also changes the values that you added from the Properties panel. To keep a value, type new text in its caption.", "In Settings > Keyboard shortcuts, you can set a key for each circled charge, positive and negative.", "On the Mac, pinch on the trackpad to zoom the drawing.", "In a table from the Table tool, press Shift+Return to move up one cell.", "When you point at a folded section in the Actions panel, it opens. To close it, click its title.", "When you drag a box over drawings on Home, Octet selects them. Click Remove to remove them from Home or from the open folder."],
      },
      {
        title: "Colour",
        items: ["Each colour menu in Octet is the same. It has recent colours, presets, your colours, Pick from screen and Add colour….", "To change the order of your colours, drag them. To rename or remove a colour, right-click it.", "To give part of a chemical label its own colour, select the characters. Then choose a colour.", "When you choose Colour > By Element a second time, Octet removes the element colours."],
      },
      {
        title: "3D",
        items: ["The Actions panel has a new section, 3D tools, with 3D clean up, depth shading and Flatten.", "3D clean up is in the Actions panel for each selection that has atoms, and for the whole drawing.", "3D Clean Up gives a ring of benzene rings, such as [8]cycloparaphenylene, its hoop shape. The benzene rings of biphenyl twist.", "When you choose 3D Clean Up, an allene, a ketene, an isocyanate and an azide stay straight. A second 3D Clean Up keeps the size.", "3D Clean Up gives bridged rings their correct shape, such as sparteine and quinuclidine. Porphine and phthalocyanine stay flat.", "When you choose 3D Clean Up on a flat drawing that you turned in 3D, the structure gets its 3D shape.", "When you choose 3D Clean Up or Flatten, or turn a structure in 3D, each stereocentre keeps its configuration. A wedge can become a hash.", "To fade atoms in a 3D structure that has depth shading, select the atoms. Then move the Opacity slider in the Actions panel."],
      },
      {
        title: "Chemistry and search",
        items: ["Convert Structure to Name names more ring systems, such as galantamine, brefeldin A, cefotaxime and the calixarenes.", "The Sequence tool draws peptides, RNA and DNA with a straight backbone. To straighten a chain that you drew, choose Structure > Clean Up Structure.", "When you paste HELM or FASTA text, Octet puts the sequence in the field of the Sequence tool. Press Return to draw it.", "To copy a peptide, RNA or DNA chain as text, choose Edit > Copy As > HELM or FASTA.", "To save each structure that a generic structure stands for, choose Structure > Expand Generic Structure to SDF….", "The Properties panel has a CAS number row. If Online search is on, Octet gets the numbers that it does not have from PubChem.", "When you type a CAS number in Name to Structure and PubChem finds it, Octet keeps the number. The next time, Octet draws it offline.", "When you type [8]cycloparaphenylene or [8]CPP, Name to Structure draws eight benzene rings in one ring. Before, it drew twelve.", "When you type [7]helicene, [7]circulene, [3]radialene, [6]cyclacene, [10]cyclophenacene or [2.2]metacyclophane, Name to Structure draws the structure.", "The Search menu has Search SciFinder, Search Google Scholar and Search Google Patents.", "Search SciFinder opens SciFinder and copies the SMILES of the structure. Paste the SMILES into SciFinder.", "To see the GHS hazards of each structure from PubChem, click Find hazards in the Properties panel. Online search must be on."],
      },
      {
        title: "Files",
        items: ["In Settings > Document > Properties, you can set the title, the author and the keywords. Octet saves them in the file and in PDFs.", "To add a saved drawing or a picture to the open drawing, choose File > Insert…. You can also drop the file on the drawing.", "To use a ChemDraw style sheet (.cds), choose File > Apply Settings From File…. To save one, choose Settings > Document > Save to file….", "To show File > More Formats, set Settings > Pro > More formats to on. Pro is a new part of Settings.", "From File > More Formats, you can export CML, BMP and 3MF files. You can also open CIF and mmCIF files, and open and save .ct files.", "Export 3MF… makes a ball-and-stick model of your structures for a 3D printer.", "Export LaTeX (chemfig)… saves the structures as chemfig code in a .tex file.", "In a picture that you copy or export, each line of a bond and each arrow is a separate path, as in ChemDraw. In Inkscape, you can move each one.", "To set the bond length, the line widths and the fonts of some objects only, select them. Then change the values in Settings > Pro > Selection."],
      },
      {
        title: "Word, Windows and Linux",
        items: ["On Windows, a drawing that you paste into Word, PowerPoint or Excel is an Octet Drawing object. Double-click it to open it in Octet.", "To paste a picture only, set Settings > Import and export > Copy > Office object to off.", "On the Mac, select a picture of a structure in Word and choose File > Edit Picture from Word. Octet opens the drawing.", "When you click Update in Word, Octet puts your changes into the Word document. One Undo in Word gets the old picture back.", "The first time, macOS asks if Octet Draw can control Microsoft Word. Click Allow.", "To open a structure in Word with a double-click on the Mac, turn on Settings > General > Word.", "On Linux, click Add to LibreOffice in Settings > General. Then double-click a structure in Writer, Impress or Draw to open it in Octet.", "On Windows and Linux, the Window menu lists the open drawings. A tick shows the drawing that is in front.", "On Linux, File > Print… and File > Print Selection… show the pages first, so you can see where the pages break."],
      },
      {
        title: "Fixes",
        items: ["When you paste a drawing into Word on the Mac, the picture is sharp in Word for Windows. To fix an older document, paste the drawing again.", "On Windows, a drawing that you paste into Word is its true size at 100% scale. In 1.1.1, drawings with labels were 7.5 times too large.", "3D Clean Up keeps the configuration of stereocentres in six-membered rings. In 1.1.1, many got the opposite configuration.", "After 3D Clean Up, the SMILES, the InChI and the name of a structure have the correct configuration at each stereocentre.", "When you make many edits in a large drawing, Octet no longer stops.", "A 3D structure with many identical groups, such as triisopropylsilyl groups, no longer stops Octet for minutes.", "When you zoom in, pen curves and clip art no longer show thin gaps along their lines.", "Each colour menu shows its colours at full strength, so Black no longer looks grey.", "When a sulfuric or phosphoric amide has four or more identical groups, Convert Structure to Name uses tetrakis. In 1.1.1, the name contained \"undefined\".", "When you place a Newman projection template, the structure has its back carbon. In 1.1.1, the two carbons became one.", "When you set a text size such as 7.5 pt, Edit > Repeat applies that size again.", "When you press Escape in the Other size… field, the size does not change.", "When a button such as Cancel has the focus in a dialog, Return presses that button.", "When you turn brackets with their structure, Octet counts the bonds that each bracket crosses in the turned position.", "Octet reads negative charges correctly in big-endian CDX files, which old Mac versions of ChemDraw saved.", "When you export a drawing as CDX and open it again in Octet, each compound number stays with its structure. Tables and catalytic cycles stay as Octet objects.", "When you open a CDX file that has a TLC plate, the spots have their correct size. In 1.1.1, the spots were too small to see.", "If Octet cannot calculate a formula, the Actions panel shows a dash.", "If Octet cannot load its chemistry engine, a notice tells you to restart Octet."],
      },
    ],
    thanks: "Thank you to Prof. Stefan Schramm, swaldvoge-eth, konokonekonoko, ghutchis, SquiddyEye and BAWE-beep for your reports and ideas on GitHub. To report a problem, choose Help > Report a Problem.",
  },
  {
    version: "1.1.1",
    date: "November 2026",
    intro: "This update fixes problems you reported and adds features you asked for.",
    summary: ["The Sequence tool draws peptides, RNA and DNA.", "Octet draws ferrocene and other metallocenes, and predicts their NMR shifts.", "Name to Structure reads 88,000 more names and starts faster.", "On a chair, new bonds are axial or equatorial.", "ChemDraw files open with their Greek letters, pictures and labels.", "On Windows and Linux, Ctrl-click and Ctrl-drag do the same as in ChemDraw."],
    sections: [
      {
        title: "New",
        items: ["Sequence tool: click on the page, then type the one-letter codes.", "Choose the ends below the codes, or type them, as in Ac-ACD-NH2 or pACGU.", "Choose Residue labels to show each residue as a label, as in H–Ala–Cys–OH.", "Structure > Expand Label and Contract Label change a residue between atoms and a label.", "Type \\delta to write δ, as in LaTeX. Text > Character Map has more symbols. The idea is from Prof. Stefan Schramm.", "Superscript (⌘= or Ctrl+=) and Subscript (⌘- or Ctrl+-) work in atom labels, for example Fe(III).", "Draw a bond from a metal to the centre of a ring, as in ferrocene.", "On a chair, the first new bond on an atom is axial. The second is equatorial.", "New templates: a stereocentre with wedge and hash bonds, and a Fischer projection.", "Convert Structure to Name reads the stereochemistry of a chair.", "Clean Up moves labels off bonds and other labels.", "Align and Distribute line up the atoms you select.", "No-go, dipole and equilibrium arrows have more head styles.", "Right-click an arrow, a catalytic cycle or an atom label to change it.", "Scroll bars, middle-button drag and Shift-scroll move the view.", "Centre in Window (⌥⌘/ or Alt+Ctrl+/) is in the View menu and the Actions panel.", "Experiment pages have Reaction scheme and Procedure boxes, roman numerals and one reagent on each row.", "On Home, select many drawings to discard them or move them to a folder."],
      },
      {
        title: "NMR",
        items: ["Octet predicts ¹H and ¹³C shifts for ferrocene, (benzene)Cr(CO)₃ and similar complexes.", "Octet predicts a shift for every atom. It marks less accurate shifts as Rough.", "Spectra on the page have the same splitting as the Spectrum panel.", "Choose Labels > Auto, Horizontal or Vertical. Label lines do not cross.", "You can edit all the text of a spectrum. Drag a handle to change its size.", "Shift numbers beside atoms do not touch bonds or labels.", "Shift numbers in ChemDraw files open."],
      },
      {
        title: "Name to Structure",
        items: ["It reads 88,000 more names and CAS numbers from the FDA UNII list. Try 129-64-6.", "It starts faster and uses less memory.", "It reads endo, exo, syn and anti.", "It draws crowded natural products, such as aconitine, with no warnings."],
      },
      {
        title: "ChemDraw and Word",
        items: ["Greek letters in ChemDraw files, such as hν, open correctly.", "Pictures in ChemDraw files from Windows open.", "Accented letters and ° are correct in other programs.", "Copy and Export send ChemDraw only what you select.", "Octet saves subscripts in conditions, such as Pd(PPh₃)₄.", "Labels in MOL files, such as OMe, open as labels.", "On Windows, labels in pictures you paste into Word are text.", "Copied pictures have less empty space around the drawing.", "Octet shows a message when it cannot read the clipboard.", "Octet shows a message when ChemDraw removed Octet data from a file."],
      },
      {
        title: "Windows and Linux",
        items: ["Ctrl-click adds to the selection. Ctrl-drag copies it, as in ChemDraw.", "Home opens again when you close a drawing.", "On Windows, the menu bar stays when you close another window.", "On Linux, structures paste into Inkscape at the correct size.", "On Linux, tips use less graphics power."],
      },
      {
        title: "Fixes",
        items: ["The 1.0 selection colour is back. Change it in Settings > General > Selection.", "The Properties panel marks predicted values, such as boiling point and logP. So do Copy and Add to drawing.", "File > New always opens a new drawing.", "On the Mac, Octet opens again after an update.", "Labels such as N(CH3)2, CH2N3, SO2Me and CONHMe give the correct structure.", "ODMT changes to DMTO when its bond is on the right.", "Azide, diazo, isocyanate and sulfone templates have the correct bonds.", "Bold and wedge bonds on chair and Haworth rings do not cause stereo warnings.", "Catalytic cycle names do not overlap. Long names wrap.", "In conditions, Pd(0)L₂ shows its subscript.", "The reagent table does not include N₂, Ar and air.", "In a wide reaction, the starting materials stay beside their arrow.", "Clean Up gives the same result each time.", "All nucleobase templates face the same way.", "Add to drawing puts items in an empty area.", "Settings > Document > Page edges has All sizes, Page only and None.", "All sections of the Actions panel open and close in the same way.", "On experiment pages, the pointer is a text cursor over the details.", "The Template button shows a books icon for large templates.", "In ChemDraw files, Ac and Pr labels open as acetyl and propyl.", "Expand Label works on a contracted label after you open the .oct file again.", "A drawing with a shadowed box exports, copies and prints at the correct size."],
      },
    ],
    thanks: "Thank you to Prof. Stefan Schramm, michemistry, Raggi-X, SquiddyEye and BAWE-beep for your reports and ideas on GitHub. To report a problem, choose Help > Report a Problem.",
  },
  {
    version: "1.1.0",
    date: "4 November 2026",
    intro: "Thank you to everyone who reported a problem or sent an idea. Your feedback made this release.",
    sections: [
      {
        title: "New",
        items: [
          "Experiment page. Go to File > New For > Experiment. It has the experiment details, a reagent table and a procedure.",
          "The reagent table calculates the mass, moles, equivalents and yield from your reaction.",
          "In a procedure, type *italic* or **bold**. LaTeX such as \\textit{}, $^2$ and $_2$ also works.",
          "Home has an Experiments list. You can search it, sort it and export it as CSV.",
          "Catalytic cycles: choose Side arrow in the cycle tool and click a step. Then choose Reagent or Product.",
          "Catalytic cycles: one side arrow can bring a reagent in and take a product out. A step can be reversible.",
          "Catalytic cycles: drag the end of an arc to set the space before or after an intermediate.",
          "Drag a charge, radical or lone pair to move it round its atom.",
          "A lone pair on a carbon with two bonds makes a carbene. Click a radical again to make a triplet.",
          "To hide a chemical warning, right-click its red circle and choose Hide this warning.",
          "Settings > General: choose the colour of the cursor and of the selection.",
          "Settings > Document > Page edges: show the page with its guides (such as journal columns), the page only, or none.",
          "Export: type a resolution up to 2400 dpi, or a size in pixels. You can also set the page colour as the background and the JPEG quality.",
          "Pictures from Octet (PDF, PNG and EMF) keep the drawing. Paste or drop one back into Octet to edit it.",
          "You can set a key for the hollow wedge and the dative bond in Settings > Keyboard shortcuts.",
        ],
      },
      {
        title: "Drawing windows",
        items: [
          "Your first drawing opens in the first window. Each drawing after that opens in a new window.",
          "A menu command now changes only the window in front. Before, it also changed the other open windows.",
        ],
      },
      {
        title: "Fixes",
        items: [
          "Copy into Word copies only the selection (#13). Export also exports only the selection (#8).",
          "Atom labels show when you paste into Word on Windows (#16).",
          "Press W over a wedge, or H over a hashed wedge, to turn it round, as in ChemDraw (#10).",
          "Clean Up keeps cycloalkynes as regular rings (#11).",
          "Name to Structure draws large molecules such as Taxol and strychnine with no warnings (#9).",
          "Delete removes only what you select. Text that belongs to an arrow or a structure stays (#12).",
          "The cursor shows on all backgrounds (#14).",
          "Chairs have the same angles as in ChemDraw. Two joined chairs keep all their atoms (#3).",
          "On Linux, the menu bar shows in each new window (#4).",
          "The cyclopentadienyl ligand (J key) shows its front and back edges correctly, also after you move it (#6).",
          "Hashed wedges have the same spacing as in ChemDraw. They have no extra line where they meet another bond (#7).",
          "Colour by element now colours B and Si. Br and I have colours of their own.",
          "The bead of a polymer bracket shows in front of its bond.",
          "A stacked NH label has the same space between N and H as in ChemDraw.",
          "Save, recent drawings, recovery and undo are more reliable. Octet asks before it saves over a file that another app changed (#2).",
        ],
      },
    ],
    thanks:
      "Special thanks to Prof-Dr-Stefan-Schramm, thewizardblizzard, mthaynes, Ciolkon, TomsLabYT, michemistry, jogisv23-cloud, Ameyanagi, FlamingLasrSwrd and kevinweil, and to all who wrote to us by email and on Reddit. To tell us more, use Help > Report a Problem.",
  },
];

export const notesFor = (version: string) => RELEASES.find((r) => r.version === version);
