# Measurements and snapping

Geometry is stored in millimetres. Zoom changes the view, not saved dimensions.

While constructing a shape, Tab enters available dimension fields. Type a value and press Enter to confirm; Esc returns to the canvas. Tab and Shift+Tab move between fields. Empty construction fields clear their locks. Invalid values remain uncommitted.

Hold Ctrl to display selected edge lengths. Click a measurement to edit it, or use Tab when the fields are visible. Enter applies the edit; Esc leaves the field.

Grid snap and Object snap are independent footer controls. Object snap defaults to enabled and remembers your preference. It snaps to exact object features such as corners, endpoints, midpoints, and centers, and also aligns points with other objects’ world-axis bounding edges and horizontal and vertical centers within eight screen pixels. The reference object is highlighted with a contrasting outline. Dashed guides stop at the reference object’s world-aligned bounds; center alignment displays the corresponding horizontal or vertical axis. Snapping to the object’s center point highlights both axes. Labels identify the alignment and reference object. Exact object features take priority over alignment, followed by Grid snap. Grid spacing is in Settings. Hold Alt to bypass positional snapping while drawing, moving, or placing a pivot.

Properties exposes positions, dimensions, circle and arc radii, rotation, and path vertices. Affine-transformed radii labelled local refer to the shape’s local dimensions. Edit corner radii with the [Corner radius tool](#transforms), using its corner-radius and all-corners fields. Corner radius fields are not shown in Properties.

Object snap also offers the average position of all polygon corners as a center point. The repeated closing corner is counted once; rounded polygons use their original corners. Center-point snapping shows both axes when Object snap is enabled.

![Both center axes highlighted on the reference rectangle](/manual/images/smart-snapping.png)

Shift constrains corner/center rectangles and bounding-box ellipses/polygons to equal width and height. It snaps center/diameter circle, center polygon, center ellipse first-radius, and three-point arc endpoint directions to 45°. Curves snap anchor directions and control-handle directions to 45°. Center arcs snap start direction and sweep to 45°. Entered measurements take priority. Shift+wheel still changes polygon sides.

For corner and center rectangles, holding Shift with one entered side sets both sides to that value. Two entered sides retain their values, even if unequal. Shift press/release updates the preview immediately. Center rectangle dimensions are full width and height.

Edge measurements follow the edge angle with a visible gap. Center rectangle width and height stay separated, including immediately after placing the center.

![Separate center rectangle dimensions](/manual/images/center-rectangle-measurements.png)

Enable X/Y rulers in Settings. Drag from the top ruler for a horizontal guideline or the left ruler for a vertical guideline. With Select, drag a guideline to move it; drop it onto a ruler to remove it. Guidelines are saved with the project and support undo/redo. Placement uses 1 mm steps, Ctrl 10 mm, and Shift 5 mm (Ctrl takes precedence). With Object snap enabled, exact object features take priority over alignment, followed by these increments. Alt bypasses both snapping and increments. Object snap makes guidelines available as alignment targets. Esc cancels a guideline drag.

The guideline coordinate appears beside the pointer while dragging and stays inside the drawing area.

While dragging a guideline, object snaps highlight the reference shape and show the alignment and object name beside the coordinate, for example “Horizontal center · Rectangle 1”. Alt clears this feedback while bypassing snapping.

![Guideline alignment feedback](/manual/images/guideline-snapping.png)

Guideline increments update when modifiers change without moving the pointer, including while a drawing tool is selected.

Select one closed shape to see its read-only **Area (mm²)** in Properties, displayed to two decimal places. The measurement follows rounded corners, curves, and transforms and updates after edits and undo/redo. Zoom does not affect area. Open paths, text, and multiple selections do not show an area.

Closed shapes also offer **Fill color** and **Fill opacity (%)** side by side in Properties. Opacity ranges from 0% (transparent) to 100%. These settings affect only the interior. **Reset fill** restores the subtle theme fill. A divider below this button separates fill controls from the other settings. The calculated area is shown as read-only text, not an editable field.

## Persistent measurements

Choose **Measurement** (the ruler icon) below Text in the toolbar, or press **D** with the canvas focused. Click point A, click point B, then move the pointer perpendicular to A–B and click a third time to place the indicator. The preview shows the direct A–B distance in millimetres, with closed arrowheads and extension lines reaching the measurement points. Place the indicator on either side of the endpoints. Short dimensions put arrowheads outside the endpoints and the label above the line to keep them readable.

After choosing B, press Tab to enter a signed **Offset** in millimetres. A positive value places the indicator to the left of the A-to-B direction; a negative value places it on the other side. Enter confirms placement, or click the canvas to place it with the entered offset. Clearing the field restores pointer control. Esc or changing tools cancels an unfinished measurement. The tool stays active after placement for another measurement.

With Select, select the annotation by its label or strokes. Properties provides **Offset (mm)**, read-only **Distance (mm)**, and endpoint positions under **Vertex coordinates**. Move, rotate, mirror, resize, duplicate, hide, lock, or delete it like other objects. Undo removes a completed measurement in one step. Measurements are saved with the project and recovered after reload. Their endpoints stay where placed even if the objects used for snapping change. Measurements do not support stitching or path editing.

![Persistent measurement with arrowheads and offset properties](/manual/images/persistent-measurement.png)
