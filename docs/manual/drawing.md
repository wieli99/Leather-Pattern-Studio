# Drawing tools

## Polyline (P)
The variants are Polyline, Curve, and Control point curve. Polyline joins straight segments; Curve passes through clicked points; Control point curve uses anchors and handles. Click creates sharp anchors; drag creates smooth handles.

Enter or right-click finishes paths. Double-click closes polylines and both curve variants with at least three placed anchors; the double-click position is not added. Shift constrains polyline segments to 45°. Backspace removes the last pending anchor. Esc cancels.

## Rectangles (R)
- Corner rectangle: first corner, opposite corner; dragging also works.
- Center rectangle: center, corner defining half-width and half-height.
- Three-point rectangle: first corner, width and direction, then height.

## Circles, ellipses and arcs (C)
- Center circle: center, radius point.
- Diameter circle: two diameter endpoints.
- Three-point circle: three non-collinear points on the circumference.
- Bounding-box ellipse: opposite bounding-box corners.
- Center ellipse: center, first radius/direction, then perpendicular radius.
- Center arc: center, start, then sweep endpoint. Move around the center to set sweep.
- Three-point arc: start, end, then a point shaping the arc.

## Polygons (H)
Center polygon uses a center followed by radius/rotation. Bounding-box polygon uses opposite corners. Up/Down or Shift+wheel changes the side count.

Two-point shapes can be dragged in one gesture. Use [numeric measurements](#measurements) for precision. Repeat P/R/C/H for the next variant; Shift+key selects the previous variant.

![Tool variants](/manual/images/tool-variants.png)

Shift constrains corner/center rectangles and bounding-box ellipses/polygons to equal width and height. It snaps center/diameter circle, center polygon, center ellipse first-radius, and three-point arc endpoint directions to 45°. Curves snap anchor directions and control-handle directions to 45°. Center arcs snap start direction and sweep to 45°. Entered measurements take priority. Shift+wheel still changes polygon sides.
