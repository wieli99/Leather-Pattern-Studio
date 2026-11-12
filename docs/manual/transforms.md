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
Drag for proportional sizing, use an axis handle to resize one direction, or enter independent X/Y factors. A factor of 1 preserves that dimension. This also stretches imported SVG artwork: use X with Y set to 1 to change only width, or Y with X set to 1 to change only height. The Properties aspect-ratio checkbox controls Width/Height fields separately.

Transforms remain previews until applied. Selection changes are restricted while a transform is active. Apply or cancel before editing Properties.

## Offset

Select one or more outlines and choose **Offset (O)** in the bottom selection toolbar. Enter a signed distance or drag the preview outline to set it. Dragging one preview updates every selected object's offset by the same distance; releasing leaves the preview for review. Choose **Sharp** or **Rounded** corners; Sharp is the default. Apply, Enter, or right-click creates separate, unfilled outline copies in one undo step. Esc or Cancel discards the preview. The original objects and their stitching remain unchanged; new offsets are selected after applying.

Positive distances expand closed outlines and negative distances inset them. On an open line or path, positive places the offset to the left while travelling from its start to end; negative places it to the right. Distances use the selected units. Lines, paths, curves, rectangles, circles, ellipses, and arcs are supported. Circles, circular arcs, and simple rectangles retain their exact editable shape when the transform permits it. Ellipses, stretched arcs, and curves become editable control point curves with a compact set of Bézier segments; other curved offsets become editable polylines. If a curve offset folds, develops a cusp, or needs too many segments for 0.01 mm accuracy, the preview reports an error and Apply stays disabled.

Offset is unavailable when the selection contains text, images, indicators, hidden or locked objects, or stitching-only guides. If an inset collapses or another selected outline cannot be offset, the panel names the failing object and Apply stays disabled. Change the distance or corner style to continue.

Alt+wheel or the arrow keys on the distance field skip zero when stepping between positive and negative values. A typed zero remains invalid.

Dragging follows Grid snap and Object snap when enabled. Hold Alt while dragging to bypass snapping.

![Inset offset preview and distance settings](/manual/images/offset.png)

![Resize preview with numeric scale factors and pivot controls](/manual/images/transforms.png)

![SVG artwork resized independently along X and Y](/manual/images/svg-resize.png)

## Individual corner radii

Select rectangles or closed straight-sided polygons, then choose Corner radius (B) beside Move, Rotate and Resize. Drag the dots inward to round a corner or outward to sharpen it. Click a dot to use the numeric corner-radius and all-corners fields in the tool panel. Displayed corner radii follow the selected units; saved geometry retains full precision. Values use local lengths. In millimetre mode, default steps are 1 mm, Shift 5 mm, Ctrl 10 mm (Ctrl takes precedence).

Alt applies the radius to every corner of the targeted shape and combines with Shift or Ctrl. Adjust several corners in one preview; Enter, right-click or Apply commits one undo step. Esc or Cancel discards the preview. Radii stop at available edge lengths. Ctrl shows measurements outside this tool. Open paths and curves have no radius dots.

![Individual corner radius, corner dots, edge measurements and exact numeric editing](/manual/images/corner-radii.png)

Tool settings appear beside the sidebar. Scroll within long panels to reach additional controls.

## Trim

Choose the scissors icon to activate Trim, or press **K** with a selection in Select mode and the canvas focused. The icon stays highlighted while Trim is active; Escape clears the highlight. Hover over an outline to highlight the portion to remove with a thick rose stroke and a contrasting halo. Click to preview removing that portion between corners or crossings. Make multiple cuts, then Apply, Enter, or right-click to save them as one undo step. Cancel or Escape discards all cuts and exits Trim. Curves, circles, ellipses, arcs, and rounded corners can also be trimmed. Cuts stop at crossings, open endpoints, or sharp corners; Curve and Control Curve anchors also stop cuts, including smooth anchors. For other outlines, smooth joins and closed seams do not stop a cut. Clicking an isolated circle or ellipse removes it entirely. Trim switches to Select; Apply and Cancel leave Select active. Retained curves remain editable; interpolated curves become control curves after trimming.

![Curved portion highlighted for trimming between crossings](/manual/images/trim.png)

## Mirror

Select objects and choose Mirror (M), next to Resize. Click an X, Y, +45° or −45° axis line on the canvas to reflect across it through the pivot. Hover highlights selectable axes and straight edges. Activation leaves geometry unchanged until you click a target. The popup retains the Local/World axes dropdown. X reflects across the X axis, reversing Y. Use World/Local axes and Set pivot as with other transforms.

Click a straight outline segment to use its infinite supporting line. Selected objects can supply the reference edge. Curves cannot supply an axis. Apply, Enter or right-click replaces the selection in one undo step; Cancel or Escape discards the preview.

## Merge

Merge is always visible beside the other selection tools. It stays disabled until at least two compatible objects are selected. Merge combines connected straight closed outlines or joins open straight paths at matching endpoints. The entire selection must form one outline or unbranched path. Rounded shapes, text, mixed open/closed selections, active stitches, disconnected results and holes are unsupported; the disabled button explains the requirement.

Choose Merge or press **J** with the canvas focused in Select mode to preview, then Apply, Enter or right-click to save one undo step. Cancel or Escape restores the original objects. The resulting polyline keeps the first object's name and can be edited normally.

Merge also joins two or more Curve and Control point curve objects at matching endpoints. Select only curves forming one open, unbranched chain. The result is a Control point curve that preserves the existing segments and any corner at a join; it does not smooth them. Curves may be reversed automatically. Interior crossings are not connections. Closed loops, branches, curves mixed with straight objects, circles, ellipses and arcs are unsupported.

![Connected curves in the Merge preview, with only Merge highlighted and Apply/Cancel controls](/manual/images/merge.png)

Trim and Stitch line are disabled when only text is selected, including their keyboard shortcuts. With a mixed selection, these tools remain available for compatible outlines. Locked selections keep these tools disabled.

In inch mode, guide and corner distance steps are 1/16 inch normally, 1/4 inch with Shift, and 1 inch with Ctrl. See [Measurements and snapping](#measurements) for fractional entry. Rotation steps remain in degrees.
