# Selection and curve editing

Click an edge or drag an empty area to select fully enclosed outlines. Shift+click toggles selection; Shift+drag adds. Ctrl+click includes interiors; Ctrl+drag includes crossing outlines. Ctrl/⌘+A selects all.

Alt+click a non-text edge inserts an anchor where supported. Select a single path to drag its anchors. You can keep Alt held while clicking or dragging visible anchors and curve handles. On control point curves, drag handles to shape the curve; double-click an anchor toggles sharp/smooth. Sharp and Smooth buttons are also available in Vertex coordinates.

Delete or Backspace removes the selection, including after clicking an object in the Objects panel. Shift+click object rows to select multiple objects for deletion. While renaming an object, these keys edit its name. Ctrl/⌘+D duplicates the selection. See [transforms](#transforms) to move, rotate, or resize.

Converted stitching paths can be selected in Select mode to edit their geometry. Alt+click inserts an anchor; drag anchors or curve handles to reshape the line. Stitching follows these edits and remains continuous across inserted anchors. Open **Stitch line** to change stitch settings.

Double-click a polyline anchor to make it smooth with handles; double-click again to make it sharp. Hold Alt while dragging a curve handle to move it independently. Drag without Alt to mirror both handles again.

Selected rectangles expose four corner anchors. Dragging one freely converts the rectangle to a closed polygon; double-clicking makes that corner smooth. Other rounded corners retain their rounding. Clicking alone leaves the rectangle unchanged.

Ctrl/⌘+C copies selected objects to the system clipboard; Ctrl/⌘+V pastes them, including stitching. Keep the pointer inside the canvas for both commands. Each object keeps its offset from the cursor at copying, measured in millimetres. Paste works across tabs and sessions and creates one undo step. Finish active edits before copying or pasting.

Right-click an object in the Objects panel for **Duplicate**, **Copy Styling**, **Paste Styling**, and **Rename**. Right-clicking a selected row keeps the multiple selection; otherwise it selects that row. Duplicate and Paste Styling affect the selection, while Copy Styling and Rename use the clicked object.

Copy Styling copies the base fill color and opacity to the system clipboard. Ctrl/⌘+V on the canvas or an object row, or Paste Styling in the menu, applies it to selected objects with a fillable area in one undo step. Open paths and text are skipped. Default styling copies the current theme color and 5% opacity, excluding selection highlighting. Paste Styling appears only after Copy Styling has stored styling in this editor. Menu paste uses that stored copy without clipboard-read permission. If system clipboard writing is blocked, copying and Ctrl/⌘+V still work inside this editor. Copying objects again restores normal object paste.

![Object context menu](/manual/images/object-context-menu.png)
