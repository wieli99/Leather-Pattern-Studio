# Stitch lines

## Toolbar and options

Choose **Stitch line** (the rounded edge with inset stitch marks that turn with the seam) above Text in the main toolbar, or press **I** with the canvas focused. The bottom-center row now contains stitching tools in place of Move, Rotate, and the other transform tools. Hover a tool for its name and instructions. Unavailable tools stay in place and explain what selection they need.

Select a tool to show its settings in the smaller options box beside the sidebar. **Apply** and **Cancel** stay in that box. Apply, Enter, or right-click commits the active operation in one undo step. Cancel discards its preview. Both return to selection within Stitch mode; click a line or choose **Place or edit stitching** to open line settings again.

**Switching tools discards unapplied changes**, matching Move/Rotate. Apply before switching if you want to keep the preview. Clicking the already-active tool preserves it. Escape first leaves individual-hole editing, then cancels the operation, then returns to Select when idle. Invalid settings or failed saves to the document keep the operation available for correction.

![Stitching toolbar with contextual Link options and Apply/Cancel](/manual/images/stitch-toolbar.png)

| Tool | Function and options |
| --- | --- |
| Place or edit stitching | Place lines and edit type, size, spacing, inset, alignment, clearances and count |
| Continue run | Continue the selected section; adjust gap, count, spacing and end clearance |
| Transfer stitching | Place selected stitching on receiving pieces with a hovering master |
| Link / Unlink | Preview adding or removing count-check relationships |
| Merge | Preview joining connected lines in selection order using the first line’s settings |
| Split | Preview separating all edges or splitting at a chosen junction |
| Convert to stitching line | Preview converting the selected unstitched path |

Preset management stays beside its presets. Detach and Remove transfer stay beside their individual transfer records.

## Place and select stitching

1. Activate Stitch and choose the line settings you want.
2. Hover an edge to preview stitching. On open paths, point at the desired side. Closed pieces stitch inside. Each edge, curve segment, and rounded corner is a separate target; circles and ellipses use their whole perimeter.
3. Click to place a preview. Shift while placing merges compatible neighboring stitching; differing neighbor settings are rejected.
4. Apply to keep the result, or Cancel to discard it.

Click the visible stitch path to select it; clicking the source edge is not necessary. In Select mode, clicking ordinary attached stitching opens Stitch settings. Shift-click adds or removes lines. Alt-click selects all visible, unlocked stitching belonging to a piece; Alt+Shift-click adds it. Snapping and selection tolerances follow zoom.

![Stitch-line settings and a stitched rounded rectangle](/manual/images/stitch-lines.png)

## Settings and alignment

Spacing defaults to **3.85 mm**, with suggestions **3.00, 3.38, 3.85, 4.00, 5.00**. Inset defaults to **3.00 mm**, with suggestions **2.50, 2.00, 3.00, 4.00, 5.00**. Type custom values or use the dropdown suggestions. Spacing must be at least 0.01 mm; inset and clearances can be zero.

French is a narrow angled slit; Japanese is an angled diamond; Round is circular; Flat is a slot aligned along the path. Round diameter defaults to 0.8 mm and Flat length to 1.4 mm. Their dimensional fields accept 0.1–5 mm. Flat thickness scales proportionally. Sizes do not change hole positions; large holes may overlap. **Reverse iron** mirrors the slant without moving holes or reversing numbering; round holes look unchanged.

Center shares the remaining length between the ends; Start leaves it at the end; End leaves it at the beginning. The arrow shows the path’s direction. Spacing follows the inset path in physical millimetres. Start/end clearances shorten its usable interval before alignment is applied.

Closed loops preserve spacing and leave a remainder gap. Their circle marker identifies the reference seam: Start puts the gap before it, End after it, and Center across it. The seam hole is not duplicated.

Settings and preset labels follow Settings → Units. Inch mode accepts fractions and decimals while preserving physical dimensions. See [Measurements and snapping](#measurements).

## Individual holes and presets

Ctrl-click a hole to show only its type, applicable diameter/length, and **Reset to line settings**. Ctrl+Shift-click adds or removes holes, including holes on different editable lines. Mixed selections show mixed values. Changes preview immediately; Apply commits them. Choose **Line settings** or click a line normally to return to run-level controls.

Spacing, inset, alignment, count and reverse iron belong to the line. Appearance overrides follow hole numbers when spacing changes; temporarily out-of-range overrides remain stored. Merge/split preserve compatible overrides and explain conflicts. Live transferred holes follow their source; detach them before independent editing.

The **Load preset** picker inside **Presets** applies a browser preset to the preview. Apply commits the line settings. The **Presets** section also offers Save as, Update, Rename and Delete. Presets save immediately in this browser, independently of document undo. Export presets downloads a backup; Import presets validates it and offers Merge or Replace. Legacy project presets remain readable and can be imported explicitly.

## Counted runs and intentional gaps

Choose **Hole count → Fixed count** and enter the number of holes. Two holes at 3.38 mm span exactly 3.38 mm rather than stretching to fill the edge. Alignment positions the run within the available length. Counts that do not fit are rejected.

Apply the first run, then select it and Shift-click a free position farther along the same edge. Enter a count and **Gap to next hole**, measured from the preceding run’s last hole. For example, place two holes at 3.38 mm and continue with a larger gap to clear a pocket edge. Upstream count/spacing edits move the continuation; deleting the preceding run preserves the following run’s position as an independent run.

Clicking a free position on a partially stitched edge starts an independent section. Its initial one-hole run can be extended by entering a count. Sections may use Auto or fixed count; overlapping spans and duplicate positions are rejected. Merge and Split operate on full-length lines rather than counted runs.

## Merge, split and links

Select two or more connected lines on the same piece, then choose **Merge**. Each next selected line must extend the connected chain; a disconnected intermediate step is refused. Review the continuous spacing preview and Apply. The first selected line supplies settings. Open paths require matching sides. Sharp corners use miter joins; invalid joins are rejected.

Select one multi-edge line and choose **Split**. Choose **All edges** or **At junction** and select a split location. A junction opens a closed loop at that location or divides an open chain. Changing the method rebuilds the preview from the original line. Results retain settings and align independently.

Choose **Link** (the connected chain icon) for independent lines with equal hole counts. The preview does not move holes or adjust spacing. Existing selected links combine. **Unlink** uses the matching chain icon with a broken center connection and previews removing selected members; relationships with fewer than two members disappear.

![Linked stitch lines with numbered chain indicators](/manual/images/stitch-links.png)

Healthy links show a chain and number while Stitch is active or Ctrl is held. Mismatched counts show red broken-chain indicators until repaired. Two-member selection information reports the count difference. Splitting and deleting remove affected link membership.

## Geometry and warnings

Stitching follows moves, rotations, resizing and edge edits while inset, spacing and sizes remain physical. Removing an edge removes its stitching; surviving runs retain settings. Invalid inset geometry shows a warning instead of silently altering the line.

Rounding a corner spanned by a merged group adds the new arc to that group and recalculates continuous spacing. If only one adjoining edge is stitched, or the edges belong to separate groups, the arc stays unstitched.

![Merged stitching adapting to rounded corners](/manual/images/rounded-stitching.png)

On sharp polygons, stitching ends at neighboring inset-edge intersections, keeping holes inset from adjoining sides even when those sides are unstitched. Clearances are measured from those intersections.

![Stitch lines inset from all three triangle sides](/manual/images/triangle-stitching.png)

## Convert and edit a path

Select one unstitched path and activate Stitch. Choose **Convert to stitching line** (the S-shaped curve of small stitch marks) in the bottom toolbar. It previews continuous stitching over the whole path with zero inset; Apply keeps it and Cancel restores the outline. Deleting its last stitch group removes the converted path.

Switch to **Select (V)** to edit stitching path geometry. Alt-click inserts anchors; drag anchors or curve handles to reshape it. Stitching remains continuous across inserted anchors. This navigation action does not apply an unconfirmed stitching preview.

![A converted path in the Stitch line tool](/manual/images/converted-stitching.png)

## Transfer stitching

Unlike ordinary count-check links, Transfer stitching preserves actual source hole positions rather than centering each receiving line independently.

1. Select the lines to transfer from one source piece.
2. Choose **Transfer stitching** (two stitched corners connected by an arrow) in the bottom toolbar. The hovering preview shows the master outline and only selected lines.
3. Move it over receiving pieces using normal grid/object snapping. Wheel rotates by 1°, Ctrl/⌘+wheel zooms, Shift gives 5°, and Alt allows free rotation and bypasses placement snapping. Hold Space for viewport navigation; Space+Ctrl+wheel zooms.
4. Review receiving-piece results. Left-click to place and freeze the preview. Further left-clicks reposition it. Apply, right-click, or Enter then commits all eligible receivers together. With no eligible receiver, the preview stays active with an explanation. Cancel discards it.

![Hovering master preview for transferring selected stitching](/manual/images/stitch-transfer.png)

Visible, unlocked closed pieces containing selected hole centers can receive stitching. Outside centers are excluded; red rings flag hole footprints touching or crossing an edge. The status message names successes and skipped pieces. Repeating the tool adds independent placements, including on the same receiver.

Master edits update live transfers; layout moves and rotations preserve assembly alignment. Numbered chain-and-equals badges distinguish transfers from count-check links. A placement uses the same number on its source and all receiving lines; multiple placements on one source list their numbers. Numbers persist through saving and deletion of other placements. Hover a badge or focus transfer controls to highlight related stitching. Select a transferred line to edit its source or manage its individual transfer records. Broken legacy transfers retain their data and show warnings.

**Detach** preserves currently included holes and creates independent, editable native guide paths; separate clipped runs retain their gaps. Spacing, inset, alignment, count and appearance become editable. Edit path changes the guide without changing the material outline. Guide objects follow their receiving piece’s layout moves/rotations.

Copying a receiver alone creates independent editable stitching; copying source and receiver together retains links. Removing a master removes its live transfers. Old detached records preserve initial positions on reconstructed guides; changing placement settings or geometry recalculates those holes.


## Updated section workflow and preset backups

Add run, Edit path and Delete are no longer toolbar tools. Continue run is available beside Stitch line. Click a free position on a partially stitched edge to create an independent section. Select a section and Shift-click a free position farther along the same edge to continue it; the clicked position sets the gap. Existing stitching remains selectable normally. Sections must not overlap. Auto count is available for continuations; reduce count or adjust end clearance if it conflicts with another section.

DEL immediately removes selected lines in one undo step. Use Select (V) to edit path geometry. Ctrl/⌘+wheel always zooms during transfer placement; ordinary wheel rotates, Shift uses 5° steps and Alt bypasses snapping. Ctrl rotation is removed.

Expand **Presets** to load or manage presets; it is collapsed initially. Presets are saved in this browser only. The Presets section contains Save as, Update, Rename, Delete, Export presets and Import presets. Export downloads all presets. Import previews the incoming library and offers safe Merge or explicit Replace all presets. Legacy project presets can be imported through that same review.

Continue run requires a fixed-count preceding section. Its new continuation can use Auto count. If an edited gap does not fit, its preview remains editable; reduce the gap or count before applying. Transfer hover shares one receiving-geometry snapshot between rendering and settings. Movement can snap compatible horizontal and vertical edges at the same time in Model, transfer placement and print layouts. Keyboard shortcuts are listed in the right-side Tool help rather than in the settings box. Standalone converted paths do not generate material-edge warnings.
