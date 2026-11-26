# Files, recovery and offline use

Save opens a file dialog or downloads a project file, depending on your browser. A download notification does not guarantee that the file reached your disk. Open accepts saved project files. New and Open ask before replacing unsaved work.

Recovery does not transfer automatically between browsers, devices, or website addresses. Save projects to files before switching, then use Open in the new location.

Recovery is stored separately in browser storage and offered at startup. It is not a substitute for saved files: your browser may prevent storage or clear it later.

Projects from older versions are upgraded when opened. Save a new copy before sharing with someone using an older application version: older builds may not open newer files.

## Work offline

Open the app online first and wait for the editor and its offline files to finish loading. Before relying on it away from an internet connection, save your project and try reopening the app with the network disconnected. The manual and PDF, SVG, and PNG export are available offline too. If reopening fails, reconnect and allow the online load to finish before trying again.

Open the manual with **Help (?)** or the **?** shortcut on the canvas. You can reload its tab and open article links while offline after the offline files finish loading.

Use the same browser and website address. Clearing website data can remove offline files and recovery. Keep saved project files outside browser storage.

When an application update offers **Reload**, save your project before accepting it.

## Save and reopen a project

Edit the filename directly at the top left. The .leather suffix (and legacy .leather.json suffix) is hidden from the editable field; saved filenames retain it. Enter commits the name and saves the project immediately. Clicking outside commits the name without saving; Escape cancels. Blank names are ignored. Names without a .leather or .json suffix receive .leather. Renaming marks the project unsaved and disconnects the previous disk file without changing it.

Choose **Save** (Ctrl/⌘+S). When Save opens a file dialog, choose a destination on the first save or after renaming; later saves overwrite that selected file. Other browsers download a copy using the current filename. The browser controls the destination and may rename duplicates. In Firefox, enable **Always ask you where to save files** in the browser’s download settings, then select the existing file and confirm replacement to avoid accumulating copies. The app cannot request replacement for ordinary downloads.

“Download started” clears the change indicator for the exported revision but does not confirm a disk write. Keep the file and use **Open** to edit it again. Browser recovery remains separate.

![Editing the project filename](/manual/images/rename.png)

## Import an image

Choose **Import image**, then select a PNG, JPEG, WebP or SVG. For an SVG in the Model workspace, choose **Import as image** in the dialog and click **Import**. The image is inserted at the view centre behind existing objects, preserving its aspect ratio. Use Select to move it and the transform controls to resize, rotate or mirror it. The inspector offers width, height and image opacity. The link icon between Width and Height in Geometry keeps both dimensions proportional by default. Click it to unlink them and edit either dimension independently; click again to restore proportional editing.

Use the object panel to reorder, hide or lock images. Images are embedded in saved projects and recovery, and remain available offline. The total project limit is 10 MB; individual imports larger than 7 MB are rejected. Use [Print layouts and export](#printing) to arrange linked copies or import an independent image directly onto a print tab, and export physically sized pages.

![Imported image selected with dimensions and opacity controls](/manual/images/image-import.png)

An SVG imported as an image remains sharp when resized and is selected as a single object. Use self-contained SVG files; external images, fonts and other linked resources are unsupported for offline use.

![SVG imported as an image object](/manual/images/svg-import.png)

## Calibrate an imported image

An imported scan or photo starts at an arbitrary size. To trace it at real scale, select the image and open **Calibrate image** through **F** tool search. Click two points on the image whose real distance you know, such as the ends of a ruler in the photo. Points beside the image are refused, and Shift keeps the second point at a multiple of 45° from the first. Escape while picking the second point returns to the first.

Enter the real distance in **Known distance**; the field receives focus once both points are picked. The preview scales the image uniformly about the first point, so whatever is lined up there stays in place. **Measured** shows the distance on the image before scaling, and **Scale** shows the resulting change. Use **Pick point 1** or **Pick point 2** to place a point again; Escape returns to the previous point. Press Enter or right-click to apply as one undo step, or choose **Cancel** (Escape) to leave the image unchanged.

Calibration needs one visible, unlocked image. If the image's position or size is linked to a variable, unlink it first. For a precise scale, zoom in before picking and choose points far apart.

![Calibrating an image from two points and a known distance](/manual/images/image-calibration.png)

Print layouts and their links are included in saved projects and recovery. The Model tab is the source of geometry; exporting a print layout does not save the project. PDF, SVG, and PNG export work offline after the production cache has finished installing.

## Editable SVG import

Choose **Import image** in the Model workspace and select an SVG. Leave **Convert to editable geometry** selected and review the geometry preview, artwork dimensions, SVG page dimensions and warnings. Choose **Import** to add a group named after the file at the view centre at actual size, or **Cancel** (Escape) to leave the project unchanged. One Undo removes the entire import. Existing objects remain in the project.

**Detect stitching lines** starts checked for each SVG. Highlighted marks become standalone editable stitching. DXF export skips native stitching. Turn detection off to keep the original marks as DXF cut outlines. Stitch detection matches within each source group and leaves uncertain marks available for editing.

![Editable SVG import review](/manual/images/editable-svg-import.png)

Paths, lines, polylines, polygons, rectangles (including rounded corners), circles and ellipses become editable outlines. Groups, names, relative placement and transforms are preserved. Stroked open paths retain their open center lines. A single unstroked open path with painted fill becomes an open outline. For paths with multiple subpaths, the importer computes the painted boundary using the SVG fill rule, including subpaths the fill closes implicitly. Unstroked paths with no painted area are omitted. Open subpaths with coincident endpoints are omitted with a warning because the LPS document model treats coincident endpoints as closed. Select an outline in the object list to edit it, use Resize to change its dimensions, and add LPS stitching using the normal stitch tools. Cubic and quadratic curves retain their geometry; elliptical arcs are converted to cubic curves with less than 0.01 mm geometric error. SVG exports do not restore LPS stitching or project metadata. Clipped print-page SVGs can omit their artwork; use the original drawing SVG, or open the original .leather project to retain all LPS information.

Physical units (mm, cm, inches, points and picas), viewBox and aspect-ratio mapping determine the scale. Pixel and unitless dimensions use 96 pixels per inch. A missing page dimension is inferred from the viewBox aspect ratio when the other dimension is specified; otherwise viewBox dimensions or the default viewport are used. Percentage lengths are unsupported. Check a known dimension before producing a pattern. The artwork dimensions describe the imported geometry; the SVG page can be larger. Stroke widths follow path centre lines and are not expanded into cutting outlines. Solid fills, solid strokes and opacity are supported; line caps, joins, dashes and nonuniformly transformed stroke appearance may differ.

Presentation attributes, inline paint styles, and embedded rules with simple class selectors are supported. For effective CSS values that use escapes, variables, or revert-layer, simplify the stylesheet or choose **Import as image**. Write opacity as a number or percentage. For CSS opacity expressions such as `calc()`, use **Import as image** or replace the expression with its value. Editable import requires SVG attributes for geometry, dimensions and transforms. If inline or embedded CSS sets those properties, use **Import as image** or convert those styles to SVG attributes before importing. For a custom transform origin, bake the transform into the artwork or choose **Import as image**. The importer recognizes Adobe namespace aliases and can use the fallback artwork in Illustrator exports. External stylesheets, text, images, use instances, markers, gradients, patterns, scripts and nested SVG viewports are unsupported. Warnings identify omitted content. Editable import omits objects affected by clipping, masking or filters. If an embedded stylesheet sets those effects, visibility, or paint in a rule the importer cannot interpret, choose **Import as image** or simplify the stylesheet. Outlines with no visible paint are omitted from the editable project. The SVG page boundary does not clip geometry. Fill-only paths and polygons are normalized into their painted boundaries. Unstroked contours without a painted area are omitted. If editable conversion reports a shared contour edge, combine those boundaries in the source artwork or choose **Import as image**. Visible nonzero compound fills and fills that rely on implicitly closed stroked paths are also normalized. When a path also has visible strokes, its fill and original stroke contours are grouped as separate editable objects. DXF export uses the original stroke contours and skips the generated visual fill. Ordinary fill-only objects still export as cut outlines. A missing or external paint server uses its declared fallback, or contributes no paint when no fallback is specified. Unsupported paint can become an unfilled outline when the source has a painted area or a visible stroke. Import image remains available for reference artwork.

Editable import reads UTF-8, UTF-16, ISO-8859-1 and Windows-1252 SVG files. Unsupported encodings and invalid byte sequences prevent editable import. Files are limited to 10 MiB, 100 levels of SVG traversal, 10,000 imported objects and 100,000 total converted segments. An editable import can retain up to 61 nested groups because the saved project adds a filename group. If the conversion exceeds this depth, reduce the group nesting or choose **Import as image**. Each outline is limited to 10,000 points or segments. Fill-boundary normalization is limited to 5,000 input segments per normalized outline. Invalid geometry or a project change during import prevents insertion. If no supported geometry remains, Import is disabled.

Saved projects use format 25 to preserve [project variables](#measurements/reuse-values-with-variables) and linked fields. Format 24 and earlier projects can still be opened. Use a build that supports format 25 to reopen projects saved in this version.

## Desktop application

The desktop editor uses the same controls as the website. New projects use `.leather`, containing JSON; existing `.leather.json` and `.json` projects remain readable. Open and Save use operating-system dialogs. Renaming disconnects the previous file; the next Save requests a destination. Export uses a save dialog for the generated PDF, SVG, PNG, DXF or ZIP. The manual is bundled and opens in a separate application window without a network connection.

The desktop application checks GitHub automatically once each time it starts. A newer compatible release produces a notification; offline or failed background checks do not interrupt editing. Open **Settings → Check for updates** to check again manually. When an update is available, **Open GitHub release** opens your browser. Save your project, close the application and install the package for your system and CPU. Linux Flatpak bundles must be installed again to update; they do not provide an automatic update repository. Browser recovery and desktop recovery are separate.

Closing the desktop editor or choosing the operating system’s Quit action (including ⌘+Q on macOS) with unsaved changes asks whether to discard them. **OK** discards the changes and closes the editor; **Cancel** keeps the editor open. Save first to keep your changes. Closing is blocked while a file operation is running.

![Desktop update controls in Settings, shown with the High Contrast theme](/manual/images/desktop-updates.png)
