# Workspace

The left toolbar selects drawing modes. Right-click or hold a grouped tool to open variants. Its icon remembers the last variant. Repeat its key to cycle; Shift reverses.

Objects lists your shapes. Click to select; Shift+click toggles selection. Double-click an object name or press F2 while its row is focused to rename it. Enter applies; Esc cancels.

Properties edits the selection. Enter or leaving a field applies one undo step; Esc restores its starting value. Inline hints below Properties explain the current operation.

Edge tabs hide or show tools, Properties, and the status bar. Settings controls rulers, grid style, spacing, and theme.

![Workspace](/manual/images/workspace.png)

If the application reports incompatible geometry worker versions, save existing work before reloading. In a browser, Ctrl+Shift+R requests a fresh page. Offline updates offer a Reload button; save your project before activating an update.

If engine startup fails, the loading panel shows the worker error. An unresponsive engine reports a timeout after 15 seconds. Reload to retry; this does not clear saved projects or browser recovery.

Development startup removes this app’s production offline worker before loading the editor and may reload once. Recovery data and preferences are preserved. If the offline worker still controls the page, close the app’s tabs and reopen it.
