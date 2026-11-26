# Workspace

Use **Model** to draw and edit your pattern. Optional print tabs arrange copies on physical paper; select the **A4** tab or [create a print layout](#printing) when you are ready to export.

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

Settings closes when you click elsewhere or press Esc. Use the pin button at its top to keep it open while you work; click **Settings** again to close it. The pin is remembered in this browser. [Variables](#measurements/reuse-values-with-variables), next to Settings, works the same way.

Type custom grid spacing or choose a preset from its dropdown arrow. Choosing a preset applies it immediately. Grid visibility and snapping are separate: use the footer's Grid snap and Object snap controls to decide what the pointer snaps to.

![Unit choices and grid spacing settings](/manual/images/inch-settings.png)

## Make more room

Use the edge tabs to hide or show tools, inspector, and status bar. Their visibility is shared across Model and print tabs and remembered in this browser.

![Print layout with controls to hide or show panels](/manual/images/print-panel-toggles.png)

## Navigate the canvas

Space+drag or middle-drag pans, preserving the selected objects and their selection tools. Scrolling pans; Ctrl/⌘+scroll zooms around the pointer. With canvas focus, **Ctrl/⌘+Shift+F** fits all objects and **Shift+F** fits the selection on Model. The Fit button below Redo also fits the view. On a print tab, Ctrl/⌘+Shift+F fits the pages.

The footer shows the application version. Include it when [reporting a problem](#troubleshooting/report-a-bug). Save before accepting an application update; see [offline use](#files).

## Phones and tablets

The editor also runs in a phone's web browser. On a narrow screen the tools move to a scrolling bar below the canvas, and the header keeps **Save** with the other project actions in the **⋯** menu. The panel button at the top right of the canvas opens Model objects, Properties and Tool help in a sheet below the canvas; tap it again to close the sheet. Tool settings open full width above the tools and close the sheet to keep the canvas visible; reopen the sheet at any time while the tool stays open. Tap the arrow at the top right of tool settings to collapse them to their heading, **Apply** and **Cancel**, for example to tap edges while stitching; the choice applies to every tool until you expand them again. Turning a phone sideways keeps the tools at the left edge.

![Phone layout with the object sheet open](/manual/images/phone-layout.png)

On touch screens:

| Gesture | Action |
| --- | --- |
| Tap | Select, place a point, or press a button |
| Drag with one finger | Draw, move or marquee-select, as a mouse drag does |
| Drag or pinch with two fingers | Pan and zoom the canvas or print sheet |
| Double-tap | Edit text, switch a vertex between sharp and smooth, or close a path |
| Press and hold a tool | Open its variants |
| Press and hold a row, then drag | Reorder objects, print tabs or favorites; a quick swipe scrolls instead |

While drawing a path or curve, **Remove last point**, **Close** and **Finish** appear above the tools; they replace Backspace, Enter, and right-click. Fingers get larger hit areas than the mouse, so editing tiny details is easier after zooming in. Keyboard shortcuts and features that need Shift, Alt or Ctrl, such as adding to a selection with Shift, constraining angles, temporarily disabling snapping and inserting anchors with Alt, are unavailable without a keyboard; turn snapping off with **Grid snap** and **Object snap** instead. Dragging model objects from the print source list onto a sheet needs a mouse.

## Search and favorites

Press **F** or click Search in the bottom toolbar to find editing tools by name or related words. Select a result to open it. Tools that require a selection remain unavailable until compatible objects are selected.

Use a result’s **…** menu or right-click it to open its documentation or add it to favorites. Up to ten favorites are remembered across projects. Drag favorites to reorder them; right-click one to remove it.

![Tool search and favorites menu](/manual/images/tool-search.png)

## Feedback and bug reports

Use **Feedback** in the header for ideas and discussion. Use **Report a bug** for problems; see [reporting a bug](#troubleshooting/report-a-bug). Both require an internet connection.
