# Files, recovery and offline use

Save opens a file dialog or downloads a project file, depending on your browser. A download notification does not guarantee that the file reached your disk. Open accepts saved project files. New and Open ask before replacing unsaved work.

Recovery does not transfer automatically between browsers, devices, or website addresses. Save projects to files before switching, then use Open in the new location.

Recovery is stored separately in browser storage and offered at startup. It is not a substitute for saved files: your browser may prevent storage or clear it later.

Projects from older versions are upgraded when opened. Save a new copy before sharing with someone using an older application version: older builds may not open newer files.

## Work offline

Open the app online first and wait for the editor and its offline files to finish loading. Before relying on it away from an internet connection, save your project and try reopening the app with the network disconnected. The manual and PDF, SVG, and PNG export are available offline too. If reopening fails, reconnect and allow the online load to finish before trying again.

Use the same browser and website address. Clearing website data can remove offline files and recovery. Keep saved project files outside browser storage.

When an application update offers **Reload**, save your project before accepting it.

## Save and reopen a project

Edit the filename directly at the top left. The .leather.json suffix is hidden from the editable field; saved filenames retain it. Enter or clicking outside commits; Escape cancels. Blank names are ignored. Names without a .json suffix receive .leather.json. Renaming marks the project unsaved and disconnects the previous disk file without changing it.

Choose **Save** (Ctrl/⌘+S). When Save opens a file dialog, choose a destination on the first save or after renaming; later saves overwrite that selected file. Other browsers download a copy using the current filename. The browser controls the destination and may rename duplicates.

“Download started” clears the change indicator for the exported revision but does not confirm a disk write. Keep the file and use **Open** to edit it again. Browser recovery remains separate.

![Editing the project filename](/manual/images/rename.png)

## Import an image

Choose **Import image** below Measurement, then select a PNG, JPEG, WebP or SVG. It is inserted at the view centre behind existing objects, preserving its aspect ratio. Use Select to move it and the transform controls to resize, rotate or mirror it. The inspector offers width, height and image opacity. Aspect ratio is locked by default; unlock it to edit width and height independently.

Use the object panel to reorder, hide or lock images. Images are embedded in saved projects and recovery, and remain available offline. The total project limit is 10 MB; individual imports larger than 7 MB are rejected. Use [Print layouts and export](#printing) to arrange linked copies or import an independent image directly onto a print tab, and export physically sized pages.

![Imported image selected with dimensions and opacity controls](/manual/images/image-import.png)

SVG files are imported as single image objects and remain sharp when resized. They are not converted to editable paths. Use self-contained SVG files; external images, fonts and other linked resources are unsupported for offline use.

![SVG imported as an image object](/manual/images/svg-import.png)

Print layouts and their links are included in saved JSON and recovery. The Model tab is the source of geometry; exporting a print layout does not save the project. PDF, SVG, and PNG export work offline after the production cache has finished installing.
