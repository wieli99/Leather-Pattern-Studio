# Measurements and snapping

Geometry is stored in millimetres. Zoom changes the view, not saved dimensions.

While constructing a shape, Tab enters available dimension fields. Type a value and press Enter to confirm; Esc returns to the canvas. Tab and Shift+Tab move between fields. Empty construction fields clear their locks. Invalid values remain uncommitted.

Hold Ctrl to display selected edge lengths. Click a measurement to edit it, or use Tab when the fields are visible. Enter applies the edit; Esc leaves the field.

Grid snap, Object snap, and Smart snapping are independent footer controls. Smart snapping defaults to enabled and remembers your preference. It aligns points with other objects’ world-axis bounding edges and horizontal and vertical centers within eight screen pixels. The reference object is highlighted with a contrasting outline. Dashed guides stop at the reference object’s world-aligned bounds; center alignment displays the corresponding horizontal or vertical axis. Snapping to the object’s center point highlights both axes. Labels identify the alignment and reference object. Object snap takes priority, followed by Smart snapping and Grid snap. Grid spacing is in Settings. Hold Alt to bypass positional snapping while drawing, moving, or placing a pivot.

Properties exposes positions, dimensions, radii, rotation, and path vertices. Affine-transformed radii labelled local refer to the shape’s local dimensions.

Object snap also offers the average position of all polygon corners as a center point. The repeated closing corner is counted once; rounded polygons use their original corners. Center-point snapping shows both axes when Smart snapping is enabled.

![Both center axes highlighted on the reference rectangle](/manual/images/smart-snapping.png)
