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

## Drawing and exact dimensions

| Shortcut | Action |
| --- | --- |
| V | Select |
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
| V during transform | Place or reposition a Custom pivot |
| Enter / right-click | Apply active transform or tool session |
| Esc | Cancel active preview |
| Shift+click / Shift+drag | Toggle selection / add enclosed objects |
| Ctrl+click / Ctrl+drag | Select by interior / include crossing outlines |
| Shift while dragging an anchor | Constrain movement to 45° from its original position |
| Alt+click edge | Insert anchor where supported |
| Double-click anchor | Toggle sharp/smooth where supported |
| Alt+drag curve handle | Move handle independently |

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

In Stitch mode, select operations from the bottom-center toolbar. Apply and Cancel stay in the contextual options box. Switching tools discards the unapplied preview. Escape leaves hole editing, then cancels the operation, then returns to Select when idle. During transfer placement the wheel rotates (Ctrl/⌘+wheel: zoom, Shift: 5° rotation, Alt: free rotation and no placement snapping); Space keeps viewport navigation available. Clicking or Enter applies eligible transfers. Form buttons and text entry retain normal keyboard behavior.

In Stitch line, click a free part of a partially stitched edge for an independent section; Shift-click it to continue the selected section. Alt-click selects all stitching of a piece, and Alt+Shift-click adds it.

Continue run is available in the stitching toolbar as an alternative to Shift-click continuation. Stitching shortcut instructions are shown in Tool help. Simultaneous X/Y alignment follows the same snapping policy in Model, transfer placement and print layouts.

For Transfer stitching, left-click places the hovering preview without committing. Further left-clicks reposition it. Apply, right-click or Enter confirms only after placement; Escape cancels. Rotation after placement keeps its center fixed. Continue run requires a fixed-count preceding section with space remaining.

In the attached stitching Presets panel, Escape cancels an open naming or import form first. Otherwise it closes the panel and returns focus to Presets, leaving the stitching preview active.

Hover over an editable numeric field and use **Alt+wheel** to increase (up) or decrease (down) its value by 1. Add **Shift** for steps of 5 or **Ctrl** for steps of 10 (Ctrl takes precedence). Length fields use the displayed unit, including inches. The field receives focus and respects its limits. Empty, mixed, invalid, disabled and read-only fields are skipped. Existing Apply, Cancel and property-edit undo behavior still applies.

Wheel adjustments stop at minimum and maximum values even when a larger step overshoots. Stitch hole counts stop at the count that fits the current path, spacing and clearances.

Shift-add the next side of a rounded outline to include the intervening unstitched corner. Transfer accepts lines from multiple objects and keeps their current spacing and relative angles under a shared move and rotation.

Numeric fields accept arithmetic (`+`, `-`, `*`, `/`, parentheses) in the current unit. Alt+wheel evaluates a valid formula before adjusting its result. See [numeric formulas](#measurements) for entry and validation behavior.

For Join and the boolean tools, use Tab / Shift+Tab to navigate controls and Enter / Space to activate a focused button. Enter on the canvas or right-click applies a valid preview; Escape cancels. Apply stays available whenever the current Boolean operands form a valid preview. See [boolean tools](#transforms/subtract-intersect-and-exclude).

In Copy along path, Enter on the canvas or right-click applies the preview; Escape cancels. Picker buttons retain native Enter/Space activation.

Selection-dependent editing tools require an initial selection. Click Select Objects to reselect, then click **Confirm Selection**; gizmos and Apply wait while selection is active. Canvas clicks replace selection and Shift-click toggles objects. Object panels keep Shift-click ranges. Trim only changes confirmed targets.
