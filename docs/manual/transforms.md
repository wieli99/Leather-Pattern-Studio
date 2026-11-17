# Transforms and outline tools

1. Select one or more eligible objects on the canvas or in Model objects. Editing operations stay disabled until an initial selection exists.
2. Choose Move (G), Rotate (E), or Resize (S).
3. Drag the gizmo or press Tab to enter numeric values.
4. Apply with Enter, right-click, or Apply. Esc cancels the preview.

## Axes and pivot
Move and Resize support X/Y axis constraints. For a single object, choose Local or World axes. The **Pivot** icon row offers **Bounding box** (the combined bounds center), **Median** (the average of object centers, equally weighted), and **Custom**. Automatic pivots follow the current preview selection. Click Custom or press V, then click to place a custom pivot; clicking Custom again or pressing V repositions it. Hover over the icons to see their names. Escape cancels placement and restores the previous pivot mode. Custom pivots stay fixed across selection changes. Choose Bounding box or Median to return to automatic positioning. Changing the pivot preserves pending geometry. New tool sessions start with Bounding box. Alt bypasses pivot snapping.

## Rotation
Dragging rotates in 1° steps. Ctrl uses 10°, Shift uses 5°, and Alt allows free rotation. Numeric angles allow exact entry.

## Resize
Drag for proportional sizing, use an axis handle to resize one direction, or enter independent X/Y factors. A factor of 1 preserves that dimension. This also stretches imported SVG artwork: use X with Y set to 1 to change only width, or Y with X set to 1 to change only height. The Properties aspect-ratio checkbox controls Width/Height fields separately.

Transforms remain previews until applied. Tools open with their initial targets confirmed. Click the **Select Objects** button to reselect targets, then click **Confirm Selection**. While choosing, gizmos, pivot placement and Apply are disabled; the preview remains visible. On the canvas, plain click selects only that object and Shift-click adds or removes it. A reminder appears below Confirm Selection while choosing multiple targets. Object panels retain Shift-click ranges and Ctrl/⌘-click toggling. Removing a target discards its unapplied edits while retaining pending edits on the remaining targets. Newly selected objects use the current transform settings; Corners and Trim start without edits on newly selected objects. Cancel restores the selection from before the tool opened. Apply or cancel before editing Properties.

## Offset

Select one or more outlines and press **O** or find **Offset** through Search (**F**). Enter a signed distance or drag the preview outline to set it. Dragging one preview updates every selected object's offset by the same distance; releasing leaves the preview for review. Choose **Sharp** or **Rounded** corners; Sharp is the default. Apply, Enter, or right-click creates separate, unfilled outline copies in one undo step. Esc or Cancel discards the preview. The original objects and their stitching remain unchanged; new offsets are selected after applying.

Positive distances expand closed outlines and negative distances inset them. On an open line or path, positive places the offset to the left while travelling from its start to end; negative places it to the right. Distances use the selected units. Lines, paths, curves, rectangles, circles, ellipses, and arcs are supported. The preview must remain a valid outline. If the distance produces a collapsed or overlapping result, reduce it or change the corner style before applying.

Offset is unavailable when the selection contains text, images, indicators, hidden or locked objects, or stitching-only guides. If an inset collapses or another selected outline cannot be offset, the panel names the failing object and Apply stays disabled. Change the distance or corner style to continue.

Alt+wheel or the arrow keys on the distance field skip zero when stepping between positive and negative values. A typed zero remains invalid.

Dragging follows Grid snap and Object snap when enabled. Hold Alt while dragging to bypass snapping.

![Inset offset preview and distance settings](/manual/images/offset.png)

![Resize preview with numeric scale factors and pivot controls](/manual/images/transforms.png)

![SVG artwork resized independently along X and Y](/manual/images/svg-resize.png)

## Individual corner radii

Select rectangles or closed straight-sided polygons, then choose Corners (B) beside Move, Rotate and Resize. Drag the dots inward to round a corner. Drag outward to reduce the radius to zero, then continue outward to grow a straight chamfer. Drag inward to reverse the transition. Click a dot to choose Round or Chamfer and enter an exact radius or setback. Chamfer setback measures equal distances along both adjoining edges. Switching styles preserves the cut endpoints. The All corners style and All corners measurement controls are available as soon as Corners opens and affect every selected object. Mixed styles require choosing Round or Chamfer before entering a measurement. Clicking a dot adds individual-corner controls below the bulk controls. Displayed corner radii follow the selected units; saved geometry retains full precision. Values use local lengths. In millimetre mode, default steps are 1 mm, Shift 5 mm, Ctrl 10 mm (Ctrl takes precedence).

Alt applies the current treatment and measurement to every corner of the targeted shape and combines with Shift or Ctrl. Adjust several corners in one preview; Enter, right-click or Apply commits one undo step. Esc or Cancel discards the preview. Corner measurements stop at available edge lengths. Ctrl shows measurements outside this tool. Open paths and curves have no radius dots.

![Chamfer setback and corner controls](/manual/images/corner-chamfer.png)

![Individual corner radius, corner dots, edge measurements and exact numeric editing](/manual/images/corner-radii.png)

Tool settings appear beside the sidebar. Scroll within long panels to reach additional controls.

## Trim

Trim changes only selected objects; visible unselected outlines still provide crossing boundaries. Choose the scissors icon to activate Trim, or press **K** with the canvas focused. Choose targets using Select Objects if needed. The icon stays highlighted while Trim is active; Escape clears the highlight. Hover over an outline to highlight the portion to remove with a thick rose stroke and a contrasting halo. Click to preview removing that portion between corners or crossings. Make multiple cuts, then Apply, Enter, or right-click to save them as one undo step. Cancel or Escape discards all cuts and exits Trim. Curves, circles, ellipses, arcs, and rounded corners can also be trimmed. Cuts stop at crossings, open endpoints, or sharp corners; Curve and Control Curve anchors also stop cuts, including smooth anchors. For other outlines, smooth joins and closed seams do not stop a cut. Clicking an isolated circle or ellipse removes it entirely. Trim switches to Select; Apply and Cancel leave Select active. Retained curves remain editable; interpolated curves become control curves after trimming.

![Curved portion highlighted for trimming between crossings](/manual/images/trim.png)

## Mirror

Select objects and choose Mirror (M), next to Resize. Click an X, Y, +45° or −45° axis line on the canvas to reflect across it through the pivot. Hover highlights selectable axes and straight edges. Activation leaves geometry unchanged until you click a target. The popup retains the Local/World axes dropdown. X reflects across the X axis, reversing Y. Use World/Local axes and the Pivot selector as with other transforms.

Click a straight outline segment to use its infinite supporting line. Selected objects can supply the reference edge. Curves cannot supply an axis. Apply, Enter or right-click replaces the selection in one undo step; Cancel or Escape discards the preview.

## Join

Join is always visible beside the other selection tools. Select one compatible object to start, then choose other objects on the canvas or in Model objects. Join unions closed outlines, including rounded shapes, circles, ellipses and closed curves. Results may contain holes and separate pieces within one compound object. For open straight paths, the entire selection must form one unbranched path with matching endpoints. Text, mixed open/closed selections, self-intersecting outlines, locked or hidden objects, and objects with active stitching or stitch transfers are unsupported.

Choose Join or press **J** with the canvas focused in Select mode to open its pickers. Pick other objects to preview the result, then use Apply, Enter on the canvas or right-click to save one undo step. Cancel or Escape restores the original objects. The bottommost selected object is the initial target; the result keeps the target's name and appearance. Closed-outline results are compound paths with editable anchors and curve handles; open straight paths remain polylines.

Join can also connect two or more Curve and Control point curve objects at matching endpoints. Select only curves forming one open, unbranched chain. The result is a Control point curve that preserves the existing segments and any corner at a join; it does not smooth them. Curves may be reversed automatically. Interior crossings are not connections. For open-path joining, closed loops, branches and curves mixed with straight objects are unsupported. Closed curves, circles, ellipses and full-circle arcs can instead participate in closed-outline union.

![Connected curves in the Join preview, with only Join highlighted and Apply/Cancel controls](/manual/images/merge.png)

## Subtract, Intersect and Exclude

These tools appear beside Join and operate on closed outlines. They support curves, rounded corners, holes and disconnected pieces. Open paths and self-intersecting outlines cannot participate. Remove active stitching and stitch transfers before using a source object.

- **Subtract** removes all other selected objects from the bottommost selected object in drawing order.
- **Intersect** keeps the area shared by every operand.
- **Exclude** keeps areas covered by an odd number of operands (exclusive-or).

With a single selected object, choose Subtract, then use **Select subtract objects** to pick cutters by clicking their outlines or interiors in the canvas, or their names in the objects panel. Cutters appear in red in Model objects. Selection buttons show counts; use the canvas or right-hand object panel to change the selected objects. Click a picked cutter again while its picker is active to exclude it. **Select Target** lets you choose a different base; the previous base becomes another operand. The active picker uses an accent background and border. Join, Subtract, Intersect and Exclude show the Shift-click reminder while their multi-object picker is active; it is hidden while choosing the single Target. Ordinary clicks also toggle Boolean operands. Click it again to stop picking. The preview remains visible and Apply stays available whenever the current operands are valid. Choosing a target activates the other-object picker. Picking other objects keeps the live preview visible. The same pickers are available for Join (including open paths), Intersect and Exclude.

Review the preview before using Apply, Enter or right-click. A valid empty result is labelled explicitly: applying it removes all input objects. Errors disable Apply. Cancel or Escape restores the original objects and selection. Applying consumes the operands and creates one undo step; Undo and Redo restore the complete operation.

Tab and Shift+Tab move between controls. Enter or Space activates the focused button, including selection buttons; Enter on the canvas or right-click applies a valid preview. Escape cancels from the canvas, options or objects panel. Apply and Cancel return focus to the canvas. No new global shortcuts are added; Join keeps J.

Results remain editable: drag their contour anchors and handles, use transforms, trim, offset, or attach stitching to an individual contour. Separate contours never form a continuous stitching run. Saved projects and print exports preserve holes.

![Subtract preview with a red cutter and operand controls](/manual/images/boolean-subtract.png)

Trim requires every target to be a compatible outline; text, indicators and measurements cannot be targets. Stitch line is disabled when only text is selected and remains available for compatible outlines in a mixed selection. Locked selections keep these tools disabled.

In inch mode, guide and corner distance steps are 1/16 inch normally, 1/4 inch with Shift, and 1 inch with Ctrl. See [Measurements and snapping](#measurements) for fractional entry. Rotation steps remain in degrees.


## Copy along path

Select one object and choose **Copy along path**. Use **Select Source** and **Select Path** to pick objects on the canvas or in Model objects. The path may be an open path or a single closed outline. Its stored start and direction determine placement; position the source relative to that start before invoking the tool.

Choose **Spacing** for fixed distances or **Count** for a number of new copies. Count excludes the original and accepts whole numbers from 1 to 1,000; spacing must be at least 0.01 mm. Arrow keys and Alt+scroll respect these limits. Open paths include the endpoint in Count mode; closed outlines distribute copies around the loop without duplicating the seam. **Rotate with path** rotates each copy around its own center as the path bends. Copy centers stay in the same positions with this option on or off; the source’s offset from the path start is preserved. Disable it to preserve the original orientation.

Review the preview and choose **Apply**, press Enter on the canvas, or right-click. Escape or **Cancel** discards the preview. Apply creates one undo step and preserves the source and path. Up to 1,000 copies are supported. Copies preserve source styling and associated stitching.

![Copy along path preview and settings](/manual/images/copy-along-path.png)

## Rectangular array

Choose **Rectangular Array** in toolbar search (**F**). Move the pointer to preview the first direction,
then click to confirm **endpoint 1**. X/Y constrain that direction. The array starts with eight items
and one repetition. Counts include the original.

**Extent** measures from the original to the last item; **Spacing** measures between corresponding
points of adjacent items. Changing Number preserves the chosen extent or spacing; changing modes
preserves the arrangement. Use **Select endpoint 1** to reposition it.

For a second direction, choose **Select endpoint 2**, move the pointer, and click. This enables a
second repetition. The default direction is perpendicular; choosing another endpoint allows angled grids.
Edit **Distance 2** and **Repeat** for exact values. Escape while repositioning restores the confirmed array.

![Rectangular array controls and preview](/manual/images/rectangular-array.png)

## Radial array

Choose **Radial Array**, then hover to preview copies around a snapped candidate **center point**.
Click to confirm the center. The initial pattern contains eight items over 360°. Moving the pointer
afterward leaves the array stable. **Select center point** or **V** reopens placement; Escape restores
the previous center.

**Total** divides Degrees by Number, including partial sweeps. For example, 180° with four items places
them at 0°, 45°, 90°, and 135°. **Spacing** sets the angle between items. Switching modes preserves the
arrangement. Positive angles run clockwise on the canvas; negative angles reverse direction.
**Rotate copies** controls whether their orientation rotates with their position. Only one ring is created.

![Radial array controls and preview](/manual/images/radial-array.png)

In both tools, **Shift+wheel over the canvas** changes Number, or Repeat while choosing endpoint 2.
Alt+scroll over numeric inputs retains the usual numeric adjustment. Space/middle-drag pans and
Ctrl/⌘+scroll zooms. Enter/right-click confirms an active point picker; a separate Enter/right-click
in review, or **Apply**, creates independent copies in one undo step. **Cancel** discards the session.
The object picker changes sources. At most 1,000 new placements are allowed.

During either array's point placement, **Shift** snaps direction from the selection center to 45° increments.
**X/Y** constrains an axis (press the same key again to release); **Alt** bypasses object/grid snapping
while retaining those direction constraints. Modifier changes update the preview without moving the mouse.
Tool help lists the shortcuts for the active stage.

Enter on a focused button activates that button, including **Cancel** and the point-selection controls.
Enter in a numeric field confirms a pending point or applies the reviewed array.
