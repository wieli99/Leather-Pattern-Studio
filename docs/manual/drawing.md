# Drawing tools

Choose a tool, place its defining points, then enter dimensions with **Tab** when you need an exact size. Two-point shapes also support click-and-drag. Press **Esc** to cancel unfinished construction.

## Choose a tool variant

Right-click or hold a grouped toolbar button to choose a variant. Repeat P/R/C/H to cycle forward; Shift+letter cycles backward.

After placing a shape, the drawing tool stays active so you can place another. While drawing is idle, the bottom selection toolbar and its shortcuts (such as G for Move and I for Stitch line) are available for the selection. Selection modifiers switch to Select mode; Apply or Cancel keeps Select active. Stitch line opens its own toolbar mode and Apply keeps it active. Shortcuts require canvas focus and are unavailable while constructing a shape or typing in a field. Escape also returns to Select mode.

## Paths (P)
The variants are Polyline, Curve, and Control point curve. Polyline joins straight segments; Curve passes through clicked points; Control point curve uses anchors and handles. Click creates sharp anchors; drag creates smooth handles.

Enter or right-click finishes paths. Double-click closes polylines and both curve variants with at least three placed anchors; the double-click position is not added. Shift constrains polyline segments to 45°. Backspace removes the last pending anchor. Esc cancels.

## Rectangles (R)
- Corner rectangle: first corner, opposite corner; dragging also works.
- Center rectangle: center, corner defining half-width and half-height.
- Three-point rectangle: first corner, width and direction, then height. A baseline follows the pointer while choosing the second point and stays visible while setting the height.

![Three-point rectangle baseline while choosing the second point](/manual/images/three-point-rectangle-guide.png)

## Circles, ellipses and arcs (C)
- Center circle: center, radius point.
- Diameter circle: two diameter endpoints.
- Three-point circle: three non-collinear points on the circumference. While choosing point 2, a temporary circle shows points 1–2 as diameter endpoints. While choosing point 3, the preview circle passes through all three points.
- Bounding-box ellipse: opposite bounding-box corners.
- Center ellipse: center, first radius/direction, then perpendicular radius.
- Center arc: center, start, then sweep endpoint. Move around the center to set sweep.
- Three-point arc: start, end, then a point shaping the arc.

![Temporary diameter circle while choosing the second point](/manual/images/three-point-circle-guide.png)

## Polygons (H)
Center polygon uses a center followed by radius/rotation. Bounding-box polygon uses opposite corners. Up/Down or Shift+wheel changes the side count.

Two-point shapes can be dragged in one gesture. Use [numeric measurements](#measurements) for precision. Repeat P/R/C/H for the next variant; Shift+key selects the previous variant.

![Polyline menu with straight and curved path variants](/manual/images/tool-variants.png)

## Constrain proportions and directions

Shift constrains corner/center rectangles and bounding-box ellipses/polygons to equal width and height. It snaps center/diameter circle, center polygon, center ellipse first-radius, and three-point arc endpoint directions to 45°. Curves snap anchor directions and control-handle directions to 45°. Center arcs snap start direction and sweep to 45°. Entered measurements take priority. Shift+wheel still changes polygon sides.

Every closed object has a subtle interior fill, including closed polylines and curves and full-circle arcs. Separate objects that together enclose a region are not filled as a single shape.

Choose the **Measurement (D)** submenu below Text for [arrows, crosshairs and size guides](#indicators).
