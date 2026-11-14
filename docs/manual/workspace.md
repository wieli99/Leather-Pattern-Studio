# Workspace

Use **Model** to draw and edit your pattern. Optional print tabs arrange copies on physical paper; [create a print layout](#printing) when you are ready to export.

![Drawing workspace with tools, objects, properties and tool help](/manual/images/workspace.png)

## Find tools and their variants

The left toolbar selects drawing tools. Right-click or hold a grouped tool to open its variants. You can also focus its button and press Down. The button remembers the last variant. Repeat its shortcut letter to cycle forward; Shift+letter cycles backward.

Select an object to show its Properties. The editing toolbar below the canvas stays visible while drawing and is hidden during stitching. Select eligible objects before opening an editing operation. Its Select Objects button lists the target count; click it to reselect and **Confirm Selection** to finish before continuing. Tool help in the right panel describes the current operation. If a shortcut does nothing, click the canvas first and finish or cancel any active edit.

Switching windows preserves unfinished drawings, stitching operations, and transform previews. Active mouse drags stop when the window loses focus; return to continue or confirm the pending tool. Held modifier keys are cleared.

## Use Properties and Tool help

Properties groups settings under Object, Geometry, and Appearance. Select an object to see its available fields; expand Vertex coordinates for individual points. Enter or leaving a property field applies it. Esc restores the starting value. Each applied property edit can be undone.

Click section headers to collapse or expand them; Enter and Space work when a header has focus. Sections remember their state. The object list stays expanded. See [selection and groups](#selection) for organizing objects.

## Set units, grid and theme

Open **Settings** to choose millimetres, fractional inches, or decimal inches, plus grid spacing, grid style, theme, and Axis rulers. Switching units preserves physical dimensions. Unit preferences apply across projects and are remembered in this browser.

Type custom grid spacing or choose a preset from its dropdown arrow. Choosing a preset applies it immediately. Grid visibility and snapping are separate: use the footer's Grid snap and Object snap controls to decide what the pointer snaps to.

![Unit choices and grid spacing settings](/manual/images/inch-settings.png)

## Make more room

Use the edge tabs to hide or show tools, inspector, and status bar. Their visibility is shared across Model and print tabs and remembered in this browser.

![Print layout with controls to hide or show panels](/manual/images/print-panel-toggles.png)

## Navigate the canvas

Space+drag or middle-drag pans, preserving the selected objects and their selection tools. Scrolling pans; Ctrl/⌘+scroll zooms around the pointer. With canvas focus, **Ctrl/⌘+Shift+F** fits all objects and **Shift+F** fits the selection on Model. The Fit button below Redo also fits the view. On a print tab, Ctrl/⌘+Shift+F fits the pages.

The footer shows the application version. Include it when [reporting a problem](#troubleshooting/report-a-bug). Save before accepting an application update; see [offline use](#files).

## Share feedback

**Feedback** and **Help (?)** sit alongside the file actions in the header, vertically centered with the buttons.

Click **Feedback** in the header of either workspace to open the [GitHub Discussions page](https://github.com/wieli99/Leather-Pattern-Studio/discussions) in a new tab. This requires an internet connection. Use it for ideas and general feedback; use **Report a bug** for problems.

The bottom bar centers Grid snap, Object snap, and Settings together; on narrow windows these controls occupy a second row. Settings, Help, and Feedback highlight when hovered. Print layout settings and Export print layout use the same button appearance as the rest of the tool.

Properties contains editing fields only. Use Ctrl/⌘+D to duplicate and Delete or Backspace to delete a selection; these actions are no longer buttons in Properties. Reset styling is no longer offered in Properties.
