# Keyboard and navigation

Single-letter editor shortcuts require canvas focus. Click the canvas first. Inputs retain their text-editing shortcuts. Ctrl/⌘ means Ctrl on Windows/Linux and Command on macOS. Pointer controls explicitly labelled Ctrl use Control.

| Key | Action |
|---|---|
| V | Select; during transforms, place pivot |
| P / R / C / H | Path / rectangle / circle / polygon group |
| Shift+group key | Previous variant |
| T | Text |
| G / E / S | Move / Rotate / Resize selection |
| X / Y | Transform axis constraint |
| Enter | Finish path or apply transform |
| Esc | Cancel and return to Select |
| Backspace | Remove pending anchor; otherwise delete selection |
| Delete | Delete selection |
| Ctrl/⌘+A | Select all |
| Ctrl/⌘+D | Duplicate |
| Ctrl/⌘+Z | Undo |
| Ctrl/⌘+Shift+Z | Redo |
| Ctrl+Y | Additional redo binding |
| Ctrl/⌘+S | Save |
| Ctrl/⌘+Shift+S | Save as |
| ? | Open this manual |

## View navigation
Space+drag or middle-drag pans. Scrolling pans; Ctrl/⌘+scroll zooms at the pointer. With the canvas focused, F fits all objects; Shift+F fits the selection. These commands are available through keyboard shortcuts; there are no fit buttons in the viewport.

See [selection](#selection), [drawing](#drawing), and [transforms](#transforms) for modifier gestures.

Shift constrains corner/center rectangles and bounding-box ellipses/polygons to equal width and height. It snaps center/diameter circle, center polygon, center ellipse first-radius, and three-point arc endpoint directions to 45°. Curves snap anchor directions and control-handle directions to 45°. Center arcs snap start direction and sweep to 45°. Entered measurements take priority. Shift+wheel still changes polygon sides.
