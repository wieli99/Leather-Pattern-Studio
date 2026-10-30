# Stitch lines

## Place a line

1. Select the source shape, then choose **Stitch line** beside **Corner radius**.
2. In the bottom-right popup beside the sidebar, choose the iron style, spacing, inset, and alignment. Spacing and inset are editable fields with preset suggestions; type over the value directly or open its arrow dropdown and choose a preset. Presets open beside the field, with a pointer cursor and a highlight on the option under the mouse. Arrow keys also highlight options; Enter selects one.
3. Hover a source edge to preview the entire stitch line. On an open path, hover on the side you want. Closed shapes always stitch inside.
4. Click to preview placement. Each straight edge, curve segment, and rounded corner is a separate target. Circles and ellipses use their whole perimeter.

5. Choose **Apply**, Enter, or right-click to commit the session; **Cancel** or Esc discards it.

Only one line is allowed per edge. Click an already stitched edge to select its line or merged group. Directly picking custom start/end points is not available; use the numeric start/end clearances.

![Stitch-line settings and a stitched rounded rectangle](/manual/images/stitch-lines.png)

## Settings and alignment

Spacing defaults to **3.85 mm**, with presets **3.00, 3.38, 3.85, 4.00, 5.00**. Inset defaults to **3.00 mm**, with presets **2.50, 2.00, 3.00, 4.00, 5.00**. Enter custom values with up to two decimals. Spacing must be at least 0.01 mm; inset can be zero.

French is a narrow angled slit; Japanese is an angled diamond; Round is circular; Flat is a slot aligned along the path. Marks use fixed illustrative sizes, not manufacturer-specific dimensions.

Center shares the unused length between both ends; Start puts it at the end; End puts it at the beginning. The arrow shows the source traversal direction. Spacing is measured along the inset path, not along the source edge. A short path receives one hole.

Closed loops keep the exact spacing and leave a remainder gap. The circle marker identifies the reference seam: Start places the gap before it, End after it, and Center across it. There is no duplicate seam hole.

Editing a selected line previews its settings. Apply commits the entire session and exits; Cancel discards it and exits. New lines use the last valid applied settings in the current session.

## Merge and split

Hold Shift while placing a new line to merge it with adjacent stitch groups in one undo step. The selected neighbor is master, otherwise the first neighbor in edge order supplies settings. If two neighbors have different settings, placement is refused. With no compatible neighbor, placement creates a standalone line.

Click the first line, then Shift-click an adjacent line or group on the same shape. The first selection is the **master**. **Merge** uses its settings and spaces holes continuously across the joined path. Straight edges can merge with their rounded corners. Sharp corners use miter joins; excessive or invalid joins are rejected.

**Split all** makes each source edge independent again. To divide at one original edge junction, choose the junction and click **Split at junction**. On a closed loop this opens the chain at that junction. All results keep the current master settings and align independently. You can merge them again.

## Editing and warnings

Stitching follows source moves, rotations, resizing, and edge edits. Inset, spacing, and hole sizes stay in physical millimetres. Duplicating a shape also copies its stitching.

Removing an edge or rounded corner deletes its attached stitching in the same undo step. Surviving connected runs retain their settings. Replacing an edge, including splitting it with a new anchor, does not transfer its stitching to the replacement edges.

An inset that collapses a corner, leaves the shape, or intersects itself is rejected when placing or editing stitching. If a later shape edit invalidates existing stitching, its data remains saved, its holes are hidden, and a warning appears. Select the warned line to reduce the inset, restore the source geometry, or delete the stitching. Undo restores geometry and stitching together.

## Preview sessions and clearances

Placement, settings, merge, split, and deletion stay in preview until Apply, Enter, or right-click commits the complete session and closes the tool. Cancel or Esc discards the session and closes it.

Start clearance and End clearance default to 0.00 mm. They shorten the usable inset path at its two ends; alignment applies within the remaining interval. Their sum must be less than the path length. On a closed loop they leave a gap around the reference seam. Merged groups use the master’s clearances; split groups inherit them.

## Rounding stitched corners

Rounding a sharp corner already spanned by a merged stitch group adds the new arc to that group and recalculates continuous spacing. A stitched perimeter stays continuous. Group settings and clearances are preserved. If only one adjoining edge is stitched, or the two edges belong to separate groups, the new arc stays unstitched. A radius too small for the inset keeps the existing invalid-inset warning behavior. Cancel restores both the original corner and stitching; Apply records both together.

![Merged stitching adapting to rounded corners](/manual/images/rounded-stitching.png)

## Sharp polygon corners

On triangles, rectangles, and other sharp polygons, stitch lines stop where the neighboring inset edges intersect, even if those neighbors are not stitched. This keeps their ends inset from both adjoining sides. Start/end clearances are measured from these inset intersections. Insets that collapse the available path or leave the shape are still rejected.

![Stitch lines inset from all three triangle sides](/manual/images/triangle-stitching.png)

Selected stitch groups show a broad translucent highlight with a dashed centerline, plus their direction and endpoint markers. This highlight follows the entire selected group and keeps the same screen thickness when zooming.

Click a visible stitch path in Select mode to open its stitch settings and highlight its group. Within the Stitch line tool, click the visible path to select it, or Shift-click to add/remove groups from the selection. Selection uses a fixed screen-space tolerance at every zoom; you do not need to click the source edge.

Stitch placement previews and clicks snap to the nearest source edge within 24 screen pixels, at any zoom. On open paths, the side of the edge you point at still chooses the stitch side.

## Convert a path

Select one polyline or curve and open **Stitch line**, then choose **Convert to stitching line**. The entire path becomes continuous stitching with zero initial inset, using the current style and spacing. Remove any existing stitching before converting. Apply commits the conversion; Cancel restores the path. Geometry editing remains available. Deleting the last stitch group removes the converted path.

Converted stitching paths can be selected in Select mode to edit their geometry. Alt+click inserts an anchor; drag anchors or curve handles to reshape the line. Stitching follows these edits and remains continuous across inserted anchors. Open **Stitch line** to change stitch settings.

![A converted path in the Stitch line tool](/manual/images/converted-stitching.png)
