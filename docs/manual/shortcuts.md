# Keyboard and navigation

Click the canvas before using single-letter shortcuts. While typing in a field, keys edit its text. Finish or cancel active drawings and previews before starting another operation. **Ctrl/⌘** means Control on Windows/Linux and Command on macOS; pointer gestures explicitly marked **Ctrl** use Control.

## Everyday commands

| Shortcut | Action |
| --- | --- |
| Ctrl/⌘+S | Save editable project |
| Ctrl/⌘+Z / Ctrl/⌘+Shift+Z | Undo / redo |
| Ctrl+Y | Additional redo binding |
| Ctrl/⌘+A | Select all available objects |
| Ctrl/⌘+D | Duplicate selection |
| Ctrl/⌘+C / Ctrl/⌘+V | Copy / paste objects at pointer (last canvas position in Model); keep pointer over canvas in print tabs |
| Delete / Backspace | Delete selected unlocked objects |
| F2 on an object row | Rename |
| Ctrl/⌘+G | Group selection |
| ? | Open manual |
| ⌘+Q (macOS desktop) | Quit the application; asks before discarding unsaved changes |

Copy/paste works between Model and print tabs and across browser tabs. Pasted objects are independent, including copies of linked print objects. After **Copy Styling**, Ctrl/⌘+V applies styling instead; copy objects again to return to object paste. See [selection](#selection).

## View navigation

| Control | Action |
| --- | --- |
| Space+drag / middle-drag | Pan |
| Scroll | Pan |
| Ctrl/⌘+scroll | Zoom at pointer |
| F | Search Model transform and outline tools |
| Ctrl/⌘+Shift+F / Fit button | Fit Model objects or print pages |
| Shift+F | Fit Model selection |
| Shift+M | Hide or show all Model measurements (view only; see [persistent measurements](#measurements/persistent-measurements)) |

## Drawing and exact dimensions

| Shortcut | Action |
| --- | --- |
| V / Shift+V | Select tool group: Select objects / Select segments |
| 1 / 2 | Select objects / Select segments |
| P / R / C / H | Path / rectangle / circle / polygon tool group |
| Repeat group letter / Shift+letter | Next / previous variant |
| T | Text |
| D / Shift+D | Measurements group, next / previous variant |
| A / Shift+A | Drawing tools group, next / previous variant |
| Tab / Shift+Tab | Enter or cycle numeric construction fields |
| Enter | Confirm entered dimensions or finish a path |
| Esc | Leave numeric entry, or cancel drawing and return to Select |
| Backspace while drawing a path | Remove last pending anchor |
| Up / Down or Shift+wheel | Change polygon sides or measurement sections |
| Shift while drawing | Constrain proportions or direction; see [drawing](#drawing) |
| Alt | Bypass positional snapping |
| Ctrl | Show selected edge lengths; click a label to edit |

For text, Enter inserts a line, Ctrl/⌘+Enter applies, and Esc cancels. See [numeric entry](#measurements/enter-exact-dimensions) for dimension locks and fractions.

## Selection and transforms

Selection tools require compatible selected, unlocked objects. Shortcuts also work when a drawing tool is idle after completing a shape.

| Control | Action |
| --- | --- |
| G / E / S / M / B | Move / Rotate / Resize / Mirror / Corners |
| O | Offset selected outlines |
| I | Stitch mode (also without a selection) |
| K / J | Trim / Join |
| Tab / Shift+Tab | Enter or cycle transform fields |
| X / Y | Constrain Move or Resize axis |
| V during transform or Radial Array | Place or reposition a Custom pivot |
| Enter / right-click | Apply active transform or tool session |
| Esc | Cancel center placement first, otherwise cancel active preview |
| Shift+click / Shift+drag | Toggle selection / add enclosed objects |
| Ctrl+click / Ctrl+drag | Select by interior / include crossing outlines |
| Shift while dragging an anchor | Constrain movement to 45° from its original position |
| Alt+click edge | Insert anchor where supported |
| Double-click anchor | Toggle sharp/smooth where supported |
| Alt+drag curve handle | Move handle independently |

In [Select segments](#selection/select-segments), selection and editing apply to segments:

| Control | Action |
| --- | --- |
| Click / Shift+click | Select a segment / add or remove one |
| Drag / Shift+drag / Ctrl+drag | Select enclosed segments / add them / include crossing segments |
| Ctrl/⌘+A | Select all segments |
| G / E / S / M | Move / rotate / resize / mirror segments; they detach from their shapes |
| Alt+click outline | Insert an anchor, splitting the segment |
| Delete / Backspace | Delete segments |
| Ctrl/⌘+Shift+D | Separate segments into their own objects |
| Ctrl/⌘+D / Ctrl/⌘+C | Duplicate / copy segments as new objects |
| Hold Ctrl | Show segment lengths |
| Esc | Clear segments, then return to Select objects |

Rotation steps: 1° normally, Shift 5°, Ctrl 10°, Alt free. Guide and corner measurement steps: 1 mm normally, Shift 5 mm, Ctrl 10 mm; in inches, 1/16 inch normally, Shift 1/4 inch, Ctrl 1 inch. In Corners, Alt affects all corners of the targeted shape instead of bypassing snapping.

## Object list organization

| Control | Action |
| --- | --- |
| Shift+click row | Select visible range |
| Ctrl/⌘+click row | Toggle individual row |
| Ctrl/⌘+Shift+click row | Add visible range |
| Alt+Shift+Up / Down | Move focused row before / after sibling |
| Alt+Shift+Right / Left | Move into preceding group / out of parent |

## Stitch sessions

| Control | Action |
| --- | --- |
| Click stitch path | Select its group; from Select, open stitch settings |
| Shift+click stitch path | Add/remove groups for merging or linking |
| Ctrl+click hole | Select a hole and show its appearance settings |
| Ctrl+Shift+click hole | Add/remove individual holes |
| Alt+click object | Select all stitching belonging to that object |
| Alt+Shift+click object | Add all its stitching to the selection |
| Shift while placing a new line | Merge compatible neighboring stitching |
| Enter / right-click | Apply active operation; keep Stitch active |
| Esc | Leave hole editing, then cancel operation; return to Select when idle |
| Delete with canvas focus | Delete selected stitching immediately (Undo available) |
| Hold Ctrl | Show healthy stitch-link indicators |

See [stitch lines](#stitching) for master settings, clearances and equal hole counts.

## Print layouts

Everyday save, history, copy/paste, duplication, grouping and deletion shortcuts also work in print layouts. Text (T), Measurements (D/Shift+D), Drawing tools (A/Shift+A), Select (V), Move (G), Rotate (E), and Mirror (M) are available. Use Model for source geometry edits and resizing.

| Control | Action |
| --- | --- |
| Arrow keys / Shift+arrow keys | Move by one / ten steps (1 mm or 1/16 inch per step) |
| X / Y in Move | Constrain movement axis |
| Alt+move drag | Bypass snapping |
| Alt+right-click placement | Flip locally left/right |
| Ctrl+Alt+right-click placement | Flip locally top/bottom |
| Ctrl on exposed paper | Reveal page controls and numbers |
| Ctrl+click exposed paper | Toggle page selection |
| Ctrl+drag exposed paper | Move a self-contained page |
| Esc / right-click during page move | Cancel page move |

Delete removes selected pages only when every sheet touched by their artwork is selected. See [pages and assembly](#printing/pages-and-assembly).

## Numeric adjustments

Hover over an editable numeric field and use **Alt+wheel** to increase (up) or decrease (down) its value by 1. Add **Shift** for steps of 5 or **Ctrl** for steps of 10 (Ctrl takes precedence). Length fields use the displayed unit, including inches. The field receives focus and respects its limits. Empty, mixed, invalid, disabled and read-only fields are skipped. Existing Apply, Cancel and property-edit undo behavior still applies.

Wheel adjustments stop at minimum and maximum values even when a larger step overshoots. Stitch hole counts stop at the count that fits the current path, spacing and clearances.

See [numeric formulas](#measurements/calculate-values-in-numeric-fields), [stitch sessions](#stitching), and [tool selection and previews](#transforms) for operation-specific behavior.

## Arrays

Open Rectangular Array or Radial Array through **F** tool search. Choose endpoints or a center on the canvas,
then review the stable preview. Shift+wheel changes the active count. See [arrays](#transforms/rectangular-array).

During point placement: **Shift** constrains direction to 45°, **X/Y** constrains an axis (repeat to release),
and **Alt** bypasses object/grid snapping. **V** repositions a radial center. Center previews follow the
pointer until confirmation; the confirmed array remains stable.

Enter/right-click confirms a pending point; a separate confirmation in review applies copies.
Focused buttons retain native Enter/Space activation, including Cancel and point-selection actions.

## Contextual Tool help

Tool help lists controls for the active operation and stage. Focus a numeric field to see its confirmation, cancellation, and adjustment controls. Enter or Space activates a focused button; Enter on the canvas confirms the current operation. During point or object selection, confirmation finishes that stage before applying the tool.
