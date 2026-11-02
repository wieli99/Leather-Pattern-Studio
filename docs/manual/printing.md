# Print layouts and export

Print tabs arrange linked copies of Grid objects on physical sheets. They start empty, and new projects have only **Grid**. Editing a source on Grid updates its linked print copies without changing their print position or rotation.

## Create and configure a layout

1. Press **+** beside the workspace tabs.
2. Choose A5–A0, Letter, Legal, Tabloid, or **Custom**. Custom width, height, and margin entries use the selected units.
3. Choose millimetres, decimal inches, or fractional inches. Choose one of the right-aligned portrait/landscape paper icons; hover for labels.
4. Press **Create**. Duplicate paper formats are allowed; automatic names receive a numeric suffix. The name follows format changes until you edit it; an edited name is preserved.

Right-click a print tab and choose **Layout settings** to rename a tab or change its paper, margin, and units. Switching units converts the existing dimensions; it never scales artwork. The initial margin is 10 mm. Dimensions must leave a positive printable area and cannot exceed 5,000 mm. Each layout supports up to 500 pages. **Delete layout** in the same tab menu removes that layout after confirmation; undo restores it.

![Portrait and landscape icon-only orientation choices](/manual/images/print-orientation.png)

Drag print tabs left or right to reorder them. An empty dashed outline reserves the destination while the surrounding tabs move aside. A floating tab follows the pointer. Escape cancels; dropping outside the tab strip leaves the order unchanged. Grid stays first. The order is saved with the project and supports undo/redo.

![Print tab destination outline](/manual/images/reorder-tabs.png)

## Import and arrange objects

The **Grid objects** panel shows the source object and folder hierarchy. Press **Import** beside an object or folder. Repeated imports create independent linked placements. Imported folders retain their nesting and source membership: future additions appear, and removed source members disappear.

Hover an object or folder in either Grid objects panel to preview its source artwork. Drag selected source rows onto paper to place linked copies together, preserving their relative arrangement. A placement preview follows the pointer over a sheet; release to import it. Sheet margins place the artwork at the nearest printable position. Dropping outside paper does nothing; Escape or right-click cancels.

![Dragging source artwork onto a sheet before release](/manual/images/print-drag-preview.png)

![Source folder hover preview](/manual/images/object-hover-preview.png)

![Moving selected print objects to the bottom of the list](/manual/images/reorder-print-objects.png)

The **Print objects** panel controls this layout only. Select a row or click an object on paper. Shift-click selects the visible range from the selection anchor. Ctrl/⌘-click toggles individual rows; Ctrl/⌘+Shift-click adds a range. Drag a selection box on empty paper to select several placements; Shift adds to the selection. Drag to move; drag the rotation ring in Select to rotate, or choose **Move**/**Rotate** for axis handles, pivot controls, numeric settings, and **Apply**/**Cancel**. Selection gestures commit on release; dedicated tool previews commit with Apply, Enter, or right-click. Escape or Cancel discards the preview. With Move or Rotate active and nothing selected, the first click selects an object without changing tools. Move arrow shafts and tips both support dragging, with the same cursor feedback as Grid. V or Set pivot enters crosshair placement; snapping and Alt bypass also apply to pivots. Mirror axes pass through the pivot on screen, including near page gutters. Changing the Mirror pivot or axes refreshes its preview without accumulating reflections. Move values are relative distances in the layout units; rotation uses degrees. Select a folder to transform its descendants together. Children can also be arranged independently. The small center circle marks the pivot in Rotate and Mirror. During a rotation drag, a degree readout follows the pointer, matching Grid. The rotation ring matches Grid: hovering highlights it, and a translucent sector shows the preview angle. Rotation uses Grid’s modifiers: 1° normally, Shift 5°, Ctrl 10°, Alt free rotation.

- **Hide** and **Lock** affect only print instances. Grid visibility and locking are independent.
- The **chain** button after Hide and Lock unlinks an imported object from Grid immediately, preserving its current geometry, dimensions, text, images, styles, and stitching. Unlinking an imported folder freezes its entire current subtree and stops membership updates. Individual children can also be unlinked while their folder stays linked. Detached artwork survives changes to or deletion of its Grid source.
- An unlinked entry shows a disabled **broken chain** button. Its hint reads “Unlinked. Cannot be re-linked; use Undo to restore the link.” There is no re-link action; normal Undo restores the link and Redo detaches it again. Unlinking is one undo step. Locally created folders have no chain button.
- Ctrl/⌘+C copies selected print placements; Ctrl/⌘+V pastes copies at the pointer, preserving their offsets from the pointer at copy time, just like Grid. Keep the pointer over the print canvas and finish active edits first. Copies can be pasted into another print tab in the same project.
- Right-click a Print objects entry for **Duplicate**, **Group**, and **Delete**. Right-clicking a selected entry preserves the selection; right-clicking another entry selects it. **Duplicate** preserves the original’s linked or unlinked status, as does copy/paste. **Group** groups selected siblings.
- Double-click a row name to rename it locally.
- Drag rows to reorder them. An empty dashed outline shows the destination, and surrounding rows move aside. Use the upper or lower half of an object row to place items before or after it; use the middle of a folder row to append inside it. Dragging a selected row moves the selected movable items together in tree order. A floating preview shows the number of moved items. Drop on the outlined area below the last row to append a free item at the top level. Linked children remain within their imported-folder boundary; a selection that crosses those boundaries cannot move together. Escape cancels. Each completed move is one undo step.
- **Delete** removes print placements. Removing a child from an imported folder suppresses it for that import, so future source edits do not immediately restore it. Import again to obtain another copy.

![Linked and unlinked print object controls](/manual/images/print-unlink.png)

Choose **Mirror (M)** to reflect selected placements. Hovering either side of a mirror axis highlights the full line through the pivot, using the same orange stroke and theme-colored outline as Grid. Choose X, Y, or a diagonal axis in the tool panel, or click a straight artwork edge. Local/world axes and pivot controls work as in Grid. Apply, Enter, or right-click commits; Escape or Cancel discards the preview. Mirroring affects linked print placements, including text and images, and survives saving and export.

![Mirror tool with axis choices and linked artwork preview](/manual/images/print-mirror.png)

![Print object context menu](/manual/images/print-object-menu.png)

Source geometry, dimensions, text, images, styles, and stitching remain linked until you unlink a print copy. Moving or rotating a source on Grid does not move or rotate existing print placements. Deleting a source removes its linked print copies in the same undo step. Undo/redo is shared across Grid and all print tabs.

Geometry edits, new drawing tools, scaling, and styling paste are unavailable in print views. Return to Grid to edit sources.

![Print layout with linked source and print object panels, inch rulers, dimensions, stitching, and images](/manual/images/print-layout.png)

![Select-mode rotation ring](/manual/images/print-gizmo.png)

![Rotation preview with degree readout](/manual/images/print-rotation-readout.png)

## Pages and assembly

White sheets show the physical paper; dashed inset lines show printable areas. Grey gutters separate sheets on screen and do not add distance to the artwork. Hold **Ctrl** to reveal **+** controls at exposed edges, then click one to add a blank neighbouring sheet.

Artwork crossing a printable boundary is clipped onto adjacent sheets, which are added automatically after placement or source edits. Paired `|<` marks and matching edge identifiers show where to join the sheets. Trim away the blank margins along adjoining edges and align the matching marks. The Pages section is a read-only list of sheets and the objects they contain. An object spanning sheets appears under each of them.

Hold **Ctrl** to show add-page + icons, page delete buttons and page numbers (top-left to bottom-right, skipping empty cells). Ctrl-click exposed paper to toggle page selection; objects in front take priority. Delete/Backspace deletes selected pages and their objects, but refuses if an affected object also appears on an unselected page. Select every page containing that object to delete it. Deleting all sheets leaves one empty sheet.

The delete button removes its page and artwork using the same spanning-artwork restrictions as Delete/Backspace.

Ctrl-drag exposed paper to move one page and its contents. A page containing a spanning object cannot move. Drop on an insertion edge: horizontal insertion pushes that contiguous row right, vertical insertion pushes that contiguous column down. Small drags retain the original slot. The source gap closes within its contiguous row or column; existing gaps and unrelated sheets stay in place. Insertion also refuses if it would split shared artwork. The destination sheet appears as an empty dashed outline, displaced sheets preview their new positions, and a floating page thumbnail follows the pointer. Hold Ctrl and start on blank paper on the canvas, rather than the read-only Pages list. The proposed arrangement is previewed before release; Escape or right-click cancels.

![Page destination outline during a Ctrl-drag](/manual/images/reorder-pages.png)

![Ctrl page selection and temporary numbering](/manual/images/print-page-selection.png)

New print tabs fit and center all sheets. Returning to a tab restores its view. Tool settings open at the top-left beside the tools. Grid snap also aligns artwork centers with page centers and displays alignment guides; Alt bypasses snapping. Alt+right-click flips the clicked placement left/right along its local axes; add Ctrl to flip top/bottom.

The wheel pans vertically; horizontal trackpad scrolling pans horizontally. Ctrl/⌘+wheel zooms around the pointer, and Space-drag pans. **Fit** shows all sheets. Movement snapping can be switched off below the canvas; Alt temporarily bypasses snapping. Print dimensions, measurements, and size-guide labels use the layout's units, including when Grid uses different units. Arbitrary text is unchanged.

## Preview and export

1. Activate the print tab and press **Export** in the header.
2. Choose **PDF**, **SVG**, or **PNG (300 DPI)**.
3. Inspect the generated, non-editable preview. Use Previous/Next page and Preview zoom.
4. Press **Export** to download the generated artifact.

PDF contains all sheets as vector pages, with images embedded. SVG and PNG produce one file for one sheet; multiple sheets are packaged as numbered files in a ZIP. Pages run left-to-right, then top-to-bottom, including deliberately added blank pages. SVG includes physical millimetre dimensions and an embedded print font; PNG includes 300-DPI resolution metadata.

![Generated PDF preview with format selection and page navigation](/manual/images/print-preview.png)

Print PDF at **Actual size / 100%** and disable “Fit to page.” Check a printed size guide with a ruler before cutting material. Browser preview zoom does not change exported dimensions. Very large paper may exceed raster memory limits; choose PDF or SVG if PNG generation reports this.

The export libraries, PDF preview worker, and print font are bundled for offline use. See [Files, recovery and offline use](#files). Software browser checks do not replace verification on your physical printer.
