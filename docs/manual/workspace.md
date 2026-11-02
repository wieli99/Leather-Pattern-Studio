# Workspace

The leather-and-tool icon identifies Leather Pattern Studio in the header, with the three words stacked beside it. The editor and manual browser tabs use the same gold outline icon with a transparent background.

The left toolbar selects drawing modes. Right-click or hold a grouped tool to open variants. Its icon remembers the last variant. Repeat its key to cycle; Shift reverses.

The drawing and print-layout canvases accept keyboard focus without showing an outline around the canvas.

Objects lists your shapes. Click to select; Shift+click toggles selection. Double-click an object name or press F2 while its row is focused to rename it. Enter applies; Esc cancels.

The right panel stacks Objects, Properties, and Tool help. Click the Properties, Tool help, Object, Geometry, or Appearance header to collapse or expand it. Each section remembers its state across visits. Objects always remains expanded. Headers also work with Enter or Space when focused. Properties groups fields under Object, Geometry, and Appearance; expandable Vertex coordinates follow where applicable. Geometry fields use the selected measurement units unless a field indicates otherwise. Duplicate and Delete appear below the properties.

Properties appears when objects are selected and hides when nothing is selected. Enter or leaving a field applies one undo step; Esc restores its starting value. Inline hints in the sidebar explain the current operation, including when nothing is selected.

Edge tabs on both Grid and print-layout tabs hide or show tools, the inspector, and the status bar. Each edge tab joins the bar it controls, with a flat edge against the bar. Panel visibility is shared across tabs and remembered in this browser. Settings controls units, rulers, grid style, spacing, and theme. Choose Millimetres, Inches (fractional), or Inches (decimal). This preference applies across projects and is remembered in this browser. Switching units preserves physical dimensions and grid spacing. Grid spacing combines a custom value input with a preset dropdown arrow. Millimetre presets are 0.5, 1, 5, 10, 50, and 100 mm; inch presets offer 1/64 through 1 inch. Choosing a preset updates and saves the spacing immediately.

![Inch units and grid settings](/manual/images/inch-settings.png)

![Workspace](/manual/images/workspace.png)

If the application reports incompatible geometry worker versions, save existing work before reloading. In a browser, Ctrl+Shift+R requests a fresh page. Offline updates offer a Reload button; save your project before activating an update.

If engine startup fails, the loading panel shows the worker error. An unresponsive engine reports a timeout after 15 seconds. Reload to retry; this does not clear saved projects or browser recovery.

Development startup removes this app’s production offline worker before loading the editor and may reload once. Recovery data and preferences are preserved. If the offline worker still controls the page, close the app’s tabs and reopen it.

## Print layouts

![Print layout with panel edge tabs](/manual/images/print-panel-toggles.png)

Use **+** beside **Grid** to create an optional print-layout tab. Choose a paper format, orientation, margins, and units. See [Print layouts and export](#printing) for placement, linked folders, page assembly, and export.
