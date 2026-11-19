# Octet drawings in LibreOffice: manual tests

Decision 0025, issue 48, release 1.1.3. For Sam: Windows 11 (UTM) and the Mac, with LibreOffice 24.x or later from
libreoffice.org and Octet 1.1.3 installed from its installer (the .oxt is in the installer, not in a dev build).

## Status (19 November 2026)

Linux ran in an Ubuntu 24.04 VM in 1.1.2. Windows and the Mac have not run with a real LibreOffice: LibreOffice is not
installed on the build Mac. They are proved with stand-ins (decision 0025, How it was proved). Each step below checks
one thing the stand-ins could not. Write what you see beside each step; a step that fails names what to change.

The paste from Octet on Windows, and into Calc on Windows and Linux (Copy's SVXB, added 19 November 2026), is proved
from LibreOffice's source only. Steps W3, W3a, W3b, L4 and L5 check it.

## Windows

1. Settings > General > Add to LibreOffice, first with LibreOffice closed, then with it open. The Extension Manager
   asks once. No console window shows. (Octet found unopkg.exe through `UNO\InstallPath`.)
2. In Writer, choose Insert > Octet Drawing. An empty Octet window opens, with the button Update in Writer. Draw a
   structure and press Ctrl+S: the structure goes in at the cursor. Right-click it: Edit in Octet Draw is first.
3. (W3) Copy a structure in Octet and paste it into Writer, Impress, Draw and Calc. In each, right-click the picture:
   Edit in Octet Draw is first. Double-click it: it opens in Octet, titled "Octet Drawing in <document>", with the
   button Update in Writer (Impress, Draw, Calc). Change it and press Ctrl+S: the picture changes. The picture is the
   drawing's true size and sharp at 400% zoom. If a paste gives nothing, write down the LibreOffice version (Help >
   About) and whether it reads a PDF from Insert > Image.
   (W3a) Settings > Import and export > Copy > Office object on, then off: step W3 in Writer and Calc each time. Then
   paste the same copy into Word, PowerPoint and Excel: each pastes as in 1.1.2 (an Octet Drawing object with the
   setting on; a sharp picture with it off).
   (W3b) Paste Special in Writer (Ctrl+Shift+V): write down the names it lists, and which one the plain paste matched.
   Then double-click the picture from step 2. Octet's window comes to the front, titled "Octet Drawing in
   <document>", with the button Update in Writer. Change the drawing and press Ctrl+S: the picture changes. Edit >
   Undo in Writer: the old picture. Edit > Redo: the new one.
4. Do steps 2 and 3 in Impress, Draw and Calc.
5. Press Ctrl+S 20 times fast. No "cannot update" message shows, and Writer ends with the last drawing.
6. Close Octet's window with a change not sent: the picture changes. Open it again, change it, and quit Octet: the
   same.
7. Close the document while Octet's window is open: the title says the document is closed, and Update stops.
8. Save as `.odt`, close, open it again, and edit the picture again. Save as `.docx` and open it in Word: write down
   what Word shows, and whether Word's double-click opens it. In Word, with Office object off (Settings > Import and
   export, under Copy), paste a structure from Octet (an EMF picture), save the `.docx`, open it in Writer and
   double-click the picture: it opens in Octet, and Update keeps it an EMF.
9. Copy the picture in Writer and paste it into Octet: the drawing pastes, not a bitmap.
10. Quit Octet. Double-click the picture: Octet starts and opens it (and Home).
11. Crop a picture in Writer (Format > Image > Crop), rotate one in Impress, and double-click and update each: the crop
    comes off and the rotation stays. Undo puts the crop back.
12. Open a document read-only (File > Open, Read-only). Double-click a structure: LibreOffice's own double-click.
    Insert > Octet Drawing says "This document is read-only."
13. Quit LibreOffice while Octet's window is open, then close Octet's window. Open LibreOffice and double-click a
    picture: the old `octet-libreoffice-*` folder in `%TEMP%` is gone.

## The Mac

1. In Terminal: `mdls -name kMDItemCFBundleIdentifier /Applications/LibreOffice.app`. It gives
   `org.libreoffice.script`.
2. Settings > General > Add to LibreOffice, with LibreOffice closed and then open.
3. Copy a structure in Octet and paste it into Writer, Impress and Draw. Edit in Octet Draw is in the context menu
   (LibreOffice pasted the PDF). In Calc, write down whether it is (LibreOffice's source says it is not: LibreOffice
   for the Mac reads no SVXB from another program, and Calc takes no PDF).
4. Double-click the picture with Octet open, then with Octet quit. Each time there is one Octet in the Dock, and the
   object window is in front, titled "Octet Drawing in <document>". Write down whether Writer stops answering while
   Octet starts (the extension waits for `open`, 10 s at most).
5. Do Windows steps 2, 4 to 9 and 11 to 13, with ⌘S.
6. Copy a picture in Writer, then in Terminal: `osascript -e 'clipboard info'`. Write down the exact name of the SVXB
   type (Octet reads `application/x-openoffice-svxb;…` and `application/x-openoffice-svbx;…`).
7. Paste a ChemDraw picture (ChemDraw 22.2, Edit > Copy) into Writer and double-click it: it opens in Octet.
8. Put a PDF named `drawing.pdf` and a text file named `object` (two lines: `Writer`, then `R`) in Downloads, and
   open the PDF with Octet: it opens as an ordinary drawing, not as an object.
9. Open the `.docx` from Windows step 8 (an EMF picture) on the Mac and double-click the picture: it opens in Octet,
   and Update keeps it an EMF (Windows can open it again).

## Linux (regression, the VM of 0025)

1. Writer, Impress, Draw and Calc: double-click, Update, Undo, Insert > Octet Drawing.
2. A read-only document, and a cropped picture (Windows steps 11 and 12).
3. A copy of Octet 1.1.2's extension already in LibreOffice: Add to LibreOffice replaces it.
4. (L4) Copy a structure in Octet and paste it into Calc: Edit in Octet Draw is first in its context menu, and a
   double-click opens it in Octet. Paste it into Writer, Impress and Draw: the same as in 1.1.2.
5. (L5) Copy a structure in Octet, then paste it into GIMP, Inkscape and a text editor: each pastes what it pasted in
   1.1.2 (GIMP the PNG, Inkscape the SVG, the editor nothing).
