# Files, recovery and offline use

Save uses native file pickers where supported. Other browsers download a JSON copy; a download notification does not guarantee a disk write. Open accepts saved project files. New and Open ask before replacing unsaved work.

Recovery is stored separately in browser storage and offered at startup. It is not a substitute for saved files: storage may be denied, cleared, or evicted.

Current files use version 18, including linked print layouts, paper settings, and placements alongside indicators, persistent measurements, object groups, visibility, locking, and attached stitch groups. Versions 1–17 migrate on opening without changing canvas stacking. Older application builds cannot open version-18 files. Inactive legacy stitch metadata is preserved.

Offline use requires a successful online load and completed cache installation in a production build. Development mode does not enable offline caching. The manual is bundled and precached too. Save before accepting an application update.

## Save and reopen a project

Edit the filename directly at the top left. A subtle background with rounded corners marks the editable field; a gold accent outline appears while focused. Enter or clicking outside commits; Escape cancels. Blank names are ignored. Names without a .json suffix receive .leather.json. Renaming marks the project unsaved and disconnects the previous disk file without changing it.

Choose **Save** (Ctrl/⌘+S). With native file access, choose a destination on the first save or after renaming; later saves overwrite that selected file. Other browsers download a copy using the current filename. The browser controls the destination and may rename duplicates.

“Download started” clears the change indicator for the exported revision but does not confirm a disk write. Keep the file and use **Open** to edit it again. Browser recovery remains separate.

![Editing the project filename](/manual/images/rename.png)

## Import an image

Choose **Import image** below Measurement, then select a PNG, JPEG, WebP or SVG. It is inserted at the view centre behind existing objects, preserving its aspect ratio. Use Select to move it and the transform controls to resize, rotate or mirror it. The inspector offers width, height and image opacity. Aspect ratio is locked by default; unlock it to edit width and height independently.

Use the object panel to reorder, hide or lock images. Images are embedded in saved projects and recovery, and remain available offline. The total project limit is 10 MB; individual imports larger than 7 MB are rejected. Use [Print layouts and export](#printing) to arrange linked copies or import an independent image directly onto a print tab, and export physically sized pages.

![Imported image selected with dimensions and opacity controls](/manual/images/image-import.png)

SVG files are imported as single image objects and remain sharp when resized. They are not converted to editable paths. Use self-contained SVG files; external images, fonts and other linked resources are unsupported for offline use.

![SVG imported as an image object](/manual/images/svg-import.png)

Print layouts and their links are included in saved JSON and recovery. The Grid is the source of geometry; exporting a print layout does not save the project. PDF, SVG, and PNG export work offline after the production cache has finished installing.
