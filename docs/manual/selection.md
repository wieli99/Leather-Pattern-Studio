# Selection and curve editing

Click an edge or drag an empty area to select fully enclosed outlines. Shift+click toggles selection; Shift+drag adds. Ctrl+click includes interiors; Ctrl+drag includes crossing outlines. Ctrl/⌘+A selects all.

Alt+click a non-text edge inserts an anchor where supported. Select a single path to drag its anchors. You can keep Alt held while clicking or dragging visible anchors and curve handles. On control point curves, drag handles to shape the curve; double-click an anchor toggles sharp/smooth. Sharp and Smooth buttons are also available in Vertex coordinates.

Delete or Backspace removes the selection; Ctrl/⌘+D duplicates it. See [transforms](#transforms) to move, rotate, or resize.

Converted stitching paths can be selected in Select mode to edit their geometry. Alt+click inserts an anchor; drag anchors or curve handles to reshape the line. Stitching follows these edits and remains continuous across inserted anchors. Open **Stitch line** to change stitch settings.

Double-click a polyline anchor to make it smooth with handles; double-click again to make it sharp. Hold Alt while dragging a curve handle to move it independently. Drag without Alt to mirror both handles again.

Selected rectangles expose four corner anchors. Dragging one freely converts the rectangle to a closed polygon; double-clicking makes that corner smooth. Other rounded corners retain their rounding. Clicking alone leaves the rectangle unchanged.
