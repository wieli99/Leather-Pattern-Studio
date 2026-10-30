# Files, recovery and offline use

Save uses native file pickers where supported. Other browsers download a JSON copy; a download notification does not guarantee a disk write. Open accepts saved project files. New and Open ask before replacing unsaved work.

Recovery is stored separately in browser storage and offered at startup. It is not a substitute for saved files: storage may be denied, cleared, or evicted.

Current files use version 11, including attached stitch groups. Versions 1–10 migrate on opening. Older application builds cannot open version-11 files. Inactive legacy stitch metadata is preserved.

Offline use requires a successful online load and completed cache installation in a production build. Development mode does not enable offline caching. The manual is bundled and precached too. Save before accepting an application update.

## Save and reopen a project

Edit the filename directly at the top left. A subtle background with rounded corners marks the editable field; a gold accent outline appears while focused. Enter or clicking outside commits; Escape cancels. Blank names are ignored. Names without a .json suffix receive .leather.json. Renaming marks the project unsaved and disconnects the previous disk file without changing it.

Choose **Save** (Ctrl/⌘+S). With native file access, choose a destination on the first save or after renaming; later saves overwrite that selected file. Other browsers download a copy using the current filename. The browser controls the destination and may rename duplicates.

“Download started” clears the change indicator for the exported revision but does not confirm a disk write. Keep the file and use **Open** to edit it again. Browser recovery remains separate.

![Editing the project filename](/manual/images/rename.png)
