# Troubleshooting and limitations

## A shortcut does nothing
Click the canvas. Single-letter commands are suppressed in fields and menus. Transforms require a selection.

## A shape cannot be created
Check for zero dimensions, collinear circle points, or invalid numeric fields. Esc cancels the construction without adding it to history.

## The wrong variant opens
Grouped tools remember their last variant. Open the menu to choose explicitly, or cycle with the group key.

## Recovery is unavailable
Save project files regularly. Browser storage access and persistence depend on browser settings.

## Offline loading fails
First load a production build online and allow caching to finish. Keep saved files independent of the browser cache.

## The manual opens as a blank page during development
If the console reports an outdated optimized dependency or a module MIME-type error, restart the development server and reload the manual tab. The development server prepares the manual's Markdown dependency at startup. Offline use requires a production build.

## Current limits
The editor is a 2D drawing workspace. Printing, export to manufacturing formats, booleans, and general-purpose offsets are not available. Attached stitch lines are described in [Stitch lines](#stitching). Browser-engine tests do not establish physical device or operating-system compatibility.
