# Octet drawings in LibreOffice: manual tests

Decision 0025, issue 48, release 1.2. For Sam: Windows 11 (UTM) and the Mac, with LibreOffice 24.x or later from
libreoffice.org and Octet 1.2 installed from its installer (the .oxt is in the installer, not in a dev build).

## Status (17 November 2026)

Linux ran in an Ubuntu 24.04 VM in 1.1.2. Windows and the Mac have not run with a real LibreOffice: LibreOffice is not
installed on the build Mac. They are proved with stand-ins (decision 0025, How it was proved). Each step below checks
one thing the stand-ins could not. Write what you see beside each step; a step that fails names what to change.

## Windows

1. Settings > General > Add to LibreOffice, first with LibreOffice closed, then with it open. The Extension Manager
   asks once. No console window shows. (Octet found unopkg.exe through `UNO\InstallPath`.)
2. Copy a structure in Octet. Paste it into Writer. Right-click the picture: Edit in Octet Draw is first. (LibreOffice
   pasted the EMF and kept its bytes, and its type is `image/x-emf`.)
3. Double-click the picture. Octet's window comes to the front, titled "Octet Drawing in <document>", with the button
   Update in Writer. Change the drawing and press Ctrl+S: the picture changes. Edit > Undo in Writer: the old picture.
   Edit > Redo: the new one.
4. Do step 3 in Impress, Draw and Calc. Do Insert > Octet Drawing in each: an empty window opens, and the first
   Update puts the drawing in.
5. Press Ctrl+S 20 times fast. No "cannot update" message shows, and Writer ends with the last drawing.
6. Close Octet's window with a change not sent: the picture changes. Open it again, change it, and quit Octet: the
   same.
7. Close the document while Octet's window is open: the title says the document is closed, and Update stops.
8. Save as `.odt`, close, open it again, and edit the picture again. Save as `.docx` and open it in Word: write down
   what Word shows, and whether Word's double-click opens it.
9. Copy the picture in Writer and paste it into Octet: the drawing pastes, not a bitmap.
10. Quit Octet. Double-click the picture: Octet starts and opens it (and Home).
11. Crop a picture in Writer (Format > Image > Crop), rotate one in Impress, and double-click and update each: the crop
    comes off and the rotation stays. Undo puts the crop back.
12. Open a document read-only (File > Open, Read-only). Double-click a structure: LibreOffice's own double-click.
    Insert > Octet Drawing says "This document is read-only."

## The Mac

1. In Terminal: `mdls -name kMDItemCFBundleIdentifier /Applications/LibreOffice.app`. It gives
   `org.libreoffice.script`.
2. Settings > General > Add to LibreOffice, with LibreOffice closed and then open.
3. Copy a structure in Octet and paste it into Writer. Edit in Octet Draw is in the context menu (LibreOffice pasted
   the PDF).
4. Double-click the picture with Octet open, then with Octet quit. Each time there is one Octet in the Dock, and the
   object window is in front, titled "Octet Drawing in <document>".
5. Do Windows steps 3 to 9, 11 and 12, with ⌘S.
6. Copy a picture in Writer, then in Terminal: `osascript -e 'clipboard info'`. Write down the exact name of the SVXB
   type (Octet reads `application/x-openoffice-svxb;…` and `application/x-openoffice-svbx;…`).
7. Paste a ChemDraw picture (ChemDraw 22.2, Edit > Copy) into Writer and double-click it: it opens in Octet.
8. Open any PDF named `drawing.pdf` from a Downloads folder with Octet: it opens as an ordinary drawing, not as an
   object.

## Linux (regression, the VM of 0025)

1. Writer, Impress, Draw and now Calc: double-click, Update, Undo, Insert > Octet Drawing.
2. A read-only document, and a cropped picture (Windows steps 11 and 12).
3. A copy of Octet 1.1.2's extension already in LibreOffice: Add to LibreOffice replaces it.
