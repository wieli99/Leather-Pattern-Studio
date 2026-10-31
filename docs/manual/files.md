# Files, recovery and offline use

Save uses native file pickers where supported. Other browsers download a JSON copy; a download notification does not guarantee a disk write. Open accepts saved project files. New and Open ask before replacing unsaved work.

Recovery is stored separately in browser storage and offered at startup. It is not a substitute for saved files: storage may be denied, cleared, or evicted.

Current files use version 16, including indicators, persistent measurements, object groups, visibility, locking, and attached stitch groups. Versions 1–15 migrate on opening without changing canvas stacking. Older application builds cannot open version-16 files. Inactive legacy stitch metadata is preserved.

Offline use requires a successful online load and completed cache installation in a production build. Development mode does not enable offline caching. The manual is bundled and precached too. Save before accepting an application update.

## Save and reopen a project

Edit the filename directly at the top left. A subtle background with rounded corners marks the editable field; a gold accent outline appears while focused. Enter or clicking outside commits; Escape cancels. Blank names are ignored. Names without a .json suffix receive .leather.json. Renaming marks the project unsaved and disconnects the previous disk file without changing it.

Choose **Save** (Ctrl/⌘+S). With native file access, choose a destination on the first save or after renaming; later saves overwrite that selected file. Other browsers download a copy using the current filename. The browser controls the destination and may rename duplicates.

“Download started” clears the change indicator for the exported revision but does not confirm a disk write. Keep the file and use **Open** to edit it again. Browser recovery remains separate.

![Editing the project filename](/manual/images/rename.png)

## Import an image

Choose **Import image** below Measurement, then select a PNG, JPEG or WebP. It is inserted at the view centre behind existing objects, preserving its aspect ratio. Use Select to move it and the transform controls to resize, rotate or mirror it. The inspector offers width, height and image opacity. Aspect ratio is locked by default; unlock it to edit width and height independently.

Use the object panel to reorder, hide or lock images. Images are embedded in saved projects and recovery, and remain available offline. The total project limit is 10 MB; individual imports larger than 7 MB are rejected. Printing and artwork export are not yet available.

![Imported image selected with dimensions and opacity controls](/manual/images/image-import.png)
