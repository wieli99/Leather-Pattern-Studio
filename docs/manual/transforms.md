# Move, rotate and resize

1. Select objects.
2. Choose Move (G), Rotate (E), or Resize (S).
3. Drag the gizmo or press Tab to enter numeric values.
4. Apply with Enter, right-click, or Apply. Esc cancels the preview.

## Axes and pivot
Move and Resize support X/Y axis constraints. For a single object, choose Local or World axes. V starts pivot placement; click to place it. Reset center restores the selection center. Alt bypasses pivot snapping.

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
