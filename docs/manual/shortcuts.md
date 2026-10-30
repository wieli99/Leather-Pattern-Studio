# Keyboard and navigation

Single-letter editor shortcuts require canvas focus. Click the canvas first. Inputs retain their text-editing shortcuts. Ctrl/⌘ means Ctrl on Windows/Linux and Command on macOS. Pointer controls explicitly labelled Ctrl use Control.

| Key | Action |
|---|---|
| V | Select; in Move, Rotate or Resize, place pivot |
| P / R / C / H | Path / rectangle / circle / polygon group |
| Shift+group key | Previous variant |
| T | Text |
| G / E / S / B | Move / Rotate / Resize / Corner radius selection tools |
| X / Y | Move or Resize axis constraint |
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

While dragging a [guideline](#measurements), the shortcut list in the right inspector shows its controls: default 1 mm steps, Ctrl for 10 mm steps, Shift for 5 mm steps, and Alt for free placement. Esc cancels the drag; dropping on a ruler removes the guideline.

Shift constrains corner/center rectangles and bounding-box ellipses/polygons to equal width and height. It snaps center/diameter circle, center polygon, center ellipse first-radius, and three-point arc endpoint directions to 45°. Curves snap anchor directions and control-handle directions to 45°. Center arcs snap start direction and sweep to 45°. Entered measurements take priority. Shift+wheel still changes polygon sides.

Choose Corner radius (B) for selected rectangles and closed polygons. Drag in 1 mm steps; Shift uses 5 mm, Ctrl 10 mm, and Alt applies to all corners of the targeted shape. Enter/right-click applies; Esc cancels. See [corner radii](#transforms).

In [Stitch line](#stitching), Shift-click selects a second line for merging; the first selection is master. Enter/right-click commits the session and exits; Esc discards the session and exits, and Delete removes selected stitching when the canvas is focused. The tool button is beside Corner radius and has no dedicated letter shortcut.
