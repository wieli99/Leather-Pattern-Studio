# Troubleshooting and limitations

## A shortcut does nothing
Click the canvas. Single-letter commands are suppressed in fields and menus. Transforms require a selection.

## A shape cannot be created
Check for zero dimensions, collinear circle points, or invalid numeric fields. Esc cancels the construction without adding it to history.

## The wrong variant opens
Grouped tools remember their last variant. Open the menu to choose explicitly, or cycle with the group key.

## The app does not start
Save any accessible work before reloading. If startup reports an error or times out, reload and retry online. If it keeps failing, report the error and application version. Reloading does not intentionally clear recovery, but keep saved project files independent of browser storage.

## A tool or property is disabled
Check whether the selection is locked or incompatible with the tool. Finish or cancel active drawings, transforms, or stitch sessions before changing properties. Use Model to edit source geometry.

## Recovery is unavailable
Save project files regularly. Browser storage access and persistence depend on browser settings.

## Offline loading fails
First load a production build online and allow caching to finish. Keep saved files independent of the browser cache.

## Printing at the wrong size
Export a PDF from a print layout, print at Actual size / 100%, and disable Fit to page. Measure a printed size guide before cutting. Preview zoom does not change exported dimensions.

## Current limits
The editor is a 2D pattern workspace. SVG imports are images, not editable paths. Merge supports specific connected outlines; it is not a general boolean operation. See [Merge](#transforms/merge) for supported selections.

## Report a bug
Click **Report a bug** beside Help in either workspace, or the bug icon to the right of the version number in the drawing footer. Project JSON and system information are enabled by default; turn either off to exclude it. The project snapshot includes committed unsaved changes, but not unfinished gestures. Reporting does not save or modify your project.

Click **Open GitHub issue**, fill in reproduction steps, expected and actual behavior, frequency, and any screenshots, then submit on GitHub. A GitHub account and internet connection are required. Submitted reports are public, including any project text or embedded images you include.

Large projects cannot fit in the issue link. Use **Download project JSON**, then attach the downloaded file to the issue manually. Opening GitHub requires an internet connection. System information includes browser/platform, language, viewport, pixel ratio, and online status; app version, workspace, and active tool are always included.

![Bug report dialog with optional project and system information](/manual/images/bug-report.png)
