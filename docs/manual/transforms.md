# Move, rotate and resize

1. Select objects.
2. Choose Move (G), Rotate (E), or Resize (S).
3. Drag the gizmo or press Tab to enter numeric values.
4. Apply with Enter, right-click, or Apply. Esc cancels the preview.

## Axes and pivot
Move and Resize support X/Y axis constraints. For a single object, choose Local or World axes. V starts pivot placement; click to place it. Reset pivot restores the selection center. Alt bypasses pivot snapping.

## Rotation
Dragging rotates in 1° steps. Ctrl uses 10°, Shift uses 5°, and Alt allows free rotation. Numeric angles allow exact entry.

## Resize
Drag for proportional sizing, use an axis handle to resize one direction, or enter independent X/Y factors. A factor of 1 preserves that dimension.

Transforms remain previews until applied. Selection changes are restricted while a transform is active. Apply or cancel before editing Properties.

![Transforms](/manual/images/transforms.png)

## Individual corner radii

Select rectangles or closed straight-sided polygons, then choose Corner radius (B) beside Move, Rotate and Resize. Drag the dots inward to round a corner or outward to sharpen it. Click a dot to use the numeric corner-radius and all-corners fields in the tool panel. Displayed corner radii are rounded to two decimal places; saved geometry retains full precision. Values use local millimetres: default 1 mm steps, Shift 5 mm, Ctrl 10 mm (Ctrl takes precedence).

Alt applies the radius to every corner of the targeted shape and combines with Shift or Ctrl. Adjust several corners in one preview; Enter, right-click or Apply commits one undo step. Esc or Cancel discards the preview. Radii stop at available edge lengths. Ctrl shows measurements outside this tool. Open paths and curves have no radius dots.

![Individual corner radius, corner dots, edge measurements and exact numeric editing](/manual/images/corner-radii.png)

Tool settings open in a compact popup at the bottom right of the drawing canvas, beside the sidebar, with matching 12 px bottom and right margins. The tool icon bar stays centered along the bottom. Longer settings panels scroll internally.

## Trim

Choose the scissors icon to activate Trim. The icon stays highlighted while Trim is active; Escape clears the highlight. Hover over a straight outline to highlight the portion to remove with a thick rose stroke and a contrasting halo. Click to preview removing that portion between corners or crossings. Make multiple cuts, then Apply, Enter, or right-click to save them as one undo step. Cancel or Escape discards all cuts and exits Trim. Curved outlines are not yet supported.

## Mirror

Select objects and choose Mirror (M), next to Resize. Click an X, Y, +45° or −45° axis line on the canvas to reflect across it through the pivot. Hover highlights selectable axes and straight edges. Activation leaves geometry unchanged until you click a target. The popup retains the Local/World axes dropdown. X reflects across the X axis, reversing Y. Use World/Local axes and Set pivot as with other transforms.

Click a straight outline segment to use its infinite supporting line. Selected objects can supply the reference edge. Curves cannot supply an axis. Apply, Enter or right-click replaces the selection in one undo step; Cancel or Escape discards the preview.

Selection-tool popups show small, muted instructions below their titles.

## Merge

Merge is always visible beside the other selection tools. It stays disabled until at least two compatible objects are selected. Merge combines connected straight closed outlines or joins open straight paths at matching endpoints. The entire selection must form one outline or unbranched path. Rounded shapes, text, mixed open/closed selections, active stitches, disconnected results and holes are unsupported; the disabled button explains the requirement.

Choose Merge to preview, then Apply, Enter or right-click to save one undo step. Cancel or Escape restores the original objects. The resulting polyline keeps the first object's name and can be edited normally.

Merge also joins two or more Curve and Control point curve objects at matching endpoints. Select only curves forming one open, unbranched chain. The result is a Control point curve that preserves the existing segments and any corner at a join; it does not smooth them. Curves may be reversed automatically. Interior crossings are not connections. Closed loops, branches, curves mixed with straight objects, circles, ellipses and arcs are unsupported.

![Connected curves in the Merge preview, with only Merge highlighted and Apply/Cancel controls](/manual/images/merge.png)
