# Selection and curve editing

Click an edge or drag an empty area to select fully enclosed outlines. Shift+click toggles selection; Shift+drag adds. Ctrl+click includes interiors; Ctrl+drag includes crossing outlines. Ctrl/⌘+A selects all.

## Edit anchors and curves

Alt+click a non-text edge inserts an anchor where supported. Select a single path to drag its anchors. You can keep Alt held while clicking or dragging visible anchors and curve handles. On control point curves, drag handles to shape the curve; double-click an anchor toggles sharp/smooth. Sharp and Smooth buttons are also available in Vertex coordinates.

Delete or Backspace removes the selection, including after clicking an object in the Model objects panel. Shift-click object rows to select an inclusive range, or Ctrl/⌘-click to toggle individual rows for deletion. While renaming an object, these keys edit its name. Ctrl/⌘+D duplicates the selection. See [transforms](#transforms) to move, rotate, or resize.

Converted stitching paths can be selected in Select mode to edit their geometry. Alt+click inserts an anchor; drag anchors or curve handles to reshape the line. Stitching follows these edits and remains continuous across inserted anchors. Open **Stitch line** to change stitch settings.

Double-click a polyline anchor to make it smooth with handles; double-click again to make it sharp. Hold Alt while dragging a curve handle to move it independently. Drag without Alt to mirror both handles again.

Selected rectangles expose four corner anchors. Dragging one freely converts the rectangle to a closed polygon; double-clicking makes that corner smooth. Other rounded corners retain their rounding. Clicking alone leaves the rectangle unchanged.

## Duplicate, copy and paste

Ctrl/⌘+D duplicates the selection. Ctrl/⌘+C copies selected objects to the system clipboard; Ctrl/⌘+V pastes them, including stitching. Keep the pointer inside the canvas for both commands. Each object keeps its offset from the cursor at copying, measured in millimetres. Paste works across tabs and sessions and creates one undo step. Finish active edits before copying or pasting.

## Copy appearance

Right-click an object in the Model objects panel for **Duplicate**, **Copy Styling**, **Paste Styling**, and **Rename**. Right-clicking a selected row keeps the multiple selection; otherwise it selects that row. Duplicate and Paste Styling affect the selection, while Copy Styling and Rename use the clicked object.

Copy Styling copies the base fill color, opacity, fill mode, and outline styling to the system clipboard. Ctrl/⌘+V on the canvas or an object row, or Paste Styling in the menu, applies it to selected objects with a fillable area in one undo step. Open paths and text are skipped. Default styling copies the current theme color and 5% opacity, excluding selection highlighting. Paste Styling appears only after Copy Styling has stored styling in this editor. Menu paste uses that stored copy without clipboard-read permission. If system clipboard writing is blocked, copying and Ctrl/⌘+V still work inside this editor. Copying objects again restores normal object paste.

![Object context menu](/manual/images/object-context-menu.png)

## Hide and lock objects

Use the eye and lock buttons at the right of any object row to hide/show or lock/unlock it without selecting it first. A solid gray lock marks a locally locked object or group; an unlocked padlock is outlined. Toggling another object preserves your selection. These buttons are disabled during unfinished drawings, property edits, and modifier previews; Apply or Cancel the edit to enable them again. Hidden objects remain in the panel but disappear from the canvas, snapping, and fit bounds. Hiding clears that object's selection. When any selected object is locked, all modifier tools (Move, Rotate, Resize, Mirror, Corner radius, Merge, Trim, and Stitch line) are disabled. Locked objects can be selected, copied, and duplicated, but cannot be edited or deleted until unlocked. Duplicates start unlocked. Visibility can be changed while locked. Both states are saved with the project and toggles support undo/redo.

![Object visibility and lock controls](/manual/images/object-states.png)

## Object groups

The Model objects panel lists the frontmost object first. The folder-plus button (**New Group**) creates a group containing all currently selected objects and groups. With nothing selected, it creates an empty group. **Group Selection** in the context menu or Ctrl/⌘+G also groups the selection. Groups may contain objects and other groups. Each item has only one parent. Click a group name to select its contents; Ctrl/⌘-click toggles the group; Shift-click selects a visible row range. Canvas clicks still select individual objects.

New groups open with the default name selected, so typing immediately replaces it. Press Enter to confirm. Use the arrow to collapse or expand a group. Collapse affects only the panel and is remembered in saved projects and recovery, without adding undo steps. Double-click or F2 renames a group, with its current name selected for replacement. **Ungroup** keeps its contents in place. Delete on a selected group removes its contents too; locked contents prevent deletion.

A group's eye and lock controls apply to all descendants. Showing or unlocking a group preserves each child's own state. Child eye and lock icons always show their own local state. Child controls still change their local state while an ancestor hides or locks them. An inherited state remains effective until the ancestor is shown or unlocked. Locked items may still be reorganized in the panel.

## Reorder and nest objects

Drag an object or group row to reorder it. An empty dashed outline reserves the destination space while the other rows move aside. A floating preview follows the pointer and shows a count when moving several items. For folders, the middle of the row targets insertion inside it, even when collapsed; the outline is indented to show the destination level. Expanded groups expose their child rows for insertion; empty groups provide an unlabeled drop area. An unlabeled drop area appears below the scrolling object list while dragging; drop there to move items to the top level, even when every object is grouped. You can also drag a nested row into its left indentation gutter to move it to the top level. Dragging a selected row moves the selected items together. Escape cancels a drag. Each completed move is one undo step. Moving a group moves all its contents; a group cannot contain itself.

![Object reorder destination outline](/manual/images/reorder-objects.png)

For keyboard organization, focus a row and use Alt+Shift+Up/Down to reorder, Alt+Shift+Right to move into the preceding group, or Alt+Shift+Left to move out to the parent level.

![Nested object groups](/manual/images/object-groups.png)

Hover an object or folder row to see a medium-sized preview of its current source artwork. The preview is read-only and closes when you leave the row or begin dragging.
