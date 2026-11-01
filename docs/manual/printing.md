# Print layouts and export

Print tabs arrange linked copies of Grid objects on physical sheets. They start empty, and new projects have only **Grid**. Editing a source on Grid updates all its print copies without changing their print position or rotation.

## Create and configure a layout

1. Press **+** beside the workspace tabs.
2. Choose A5–A0, Letter, Legal, Tabloid, or **Custom**. Custom width, height, and margin entries use the selected units.
3. Choose millimetres, decimal inches, or fractional inches. Choose one of the adjacent portrait/landscape paper icons; hover for labels.
4. Press **Create**. Duplicate paper formats are allowed; automatic names receive a numeric suffix. The name follows format changes until you edit it; an edited name is preserved.

Use **Layout settings** to rename a tab or change its paper, margin, and units. Switching units converts the existing dimensions; it never scales artwork. The initial margin is 10 mm. Dimensions must leave a positive printable area and cannot exceed 5,000 mm. Each layout supports up to 500 pages. **Delete layout** removes that layout after confirmation; undo restores it.

![Portrait and landscape icon-only orientation choices](/manual/images/print-orientation.png)

## Import and arrange objects

The **Grid objects** panel shows the source object and folder hierarchy. Press **Import** beside an object or folder. Repeated imports create independent linked placements. Imported folders retain their nesting and source membership: future additions appear, and removed source members disappear.

Hover an object or folder in either Grid objects panel to preview its source artwork. Drag selected source rows onto paper to place linked copies together, preserving their relative arrangement. Dropping outside paper does nothing.

![Source folder hover preview](/manual/images/object-hover-preview.png)

The **Print objects** panel controls this layout only. Select a row or click an object on paper. Shift-click selects the visible range from the selection anchor. Ctrl/⌘-click toggles individual rows; Ctrl/⌘+Shift-click adds a range. Drag a selection box on empty paper to select several placements; Shift adds to the selection. Drag to move; drag the rotation ring in Select to rotate, or choose **Move**/**Rotate** for axis handles, pivot controls, numeric settings, and **Apply**/**Cancel**. Selection gestures commit on release; dedicated tool previews commit with Apply or Enter. Move values are relative distances in the layout units; rotation uses degrees. Select a folder to transform its descendants together. Children can also be arranged independently. Rotation uses Grid’s modifiers: 1° normally, Shift 5°, Ctrl 10°, Alt free rotation.

- **Hide** and **Lock** affect only print instances. Grid visibility and locking are independent.
- **Duplicate** creates another linked copy. **Group** groups selected siblings.
- Double-click a row name to rename it locally.
- Drag rows onto a folder to put them inside it, or onto an object to place them before it. Drop on the empty panel area to move a free item to the top level. Linked children remain within their imported-folder boundary.
- **Delete** removes print placements. Removing a child from an imported folder suppresses it for that import, so future source edits do not immediately restore it. Import again to obtain another copy.

Source geometry, dimensions, text, images, styles, and stitching remain linked. Moving or rotating a source on Grid does not move or rotate existing print placements. Deleting a source removes its print copies in the same undo step. Undo/redo is shared across Grid and all print tabs.

Geometry edits, new drawing tools, scaling, mirroring, and styling paste are unavailable in print views. Return to Grid to edit sources.

![Print layout with linked source and print object panels, inch rulers, dimensions, stitching, and images](/manual/images/print-layout.png)

![Select-mode rotation ring](/manual/images/print-gizmo.png)

## Pages and assembly

White sheets show the physical paper; dashed inset lines show printable areas. Grey gutters separate sheets on screen and do not add distance to the artwork. **+** controls at exposed edges add blank neighbouring sheets in any direction.

Artwork crossing a printable boundary is clipped onto adjacent sheets, which are added automatically after placement or source edits. Paired `|<` marks and matching edge identifiers show where to join the sheets. Trim away the blank margins along adjoining edges and align the matching marks. The Pages section is a read-only list of sheets and the objects they contain. An object spanning sheets appears under each of them.

Hold **Ctrl** to show page numbers (top-left to bottom-right, skipping empty cells). Ctrl-click exposed paper to toggle page selection; objects in front take priority. Delete/Backspace deletes selected pages and their objects, but refuses if an affected object also appears on an unselected page. Select every page containing that object to delete it. Deleting all sheets leaves one empty sheet.

Ctrl-drag exposed paper to move one page and its contents. A page containing a spanning object cannot move. Drop on an insertion edge: horizontal insertion pushes that contiguous row right, vertical insertion pushes that contiguous column down. The source gap stays empty. Insertion also refuses if it would split shared artwork. The proposed arrangement is previewed before release; Escape or right-click cancels.

![Ctrl page selection and temporary numbering](/manual/images/print-page-selection.png)

The wheel zooms and Space-drag pans. **Fit** shows all sheets. Movement snapping can be switched off below the canvas; Alt temporarily bypasses snapping. Print dimensions, measurements, and size-guide labels use the layout's units, including when Grid uses different units. Arbitrary text is unchanged.

## Preview and export

1. Activate the print tab and press **Export** in the header.
2. Choose **PDF**, **SVG**, or **PNG (300 DPI)**.
3. Inspect the generated, non-editable preview. Use Previous/Next page and Preview zoom.
4. Press **Export** to download the generated artifact.

PDF contains all sheets as vector pages, with images embedded. SVG and PNG produce one file for one sheet; multiple sheets are packaged as numbered files in a ZIP. Pages run left-to-right, then top-to-bottom, including deliberately added blank pages. SVG includes physical millimetre dimensions and an embedded print font; PNG includes 300-DPI resolution metadata.

![Generated PDF preview with format selection and page navigation](/manual/images/print-preview.png)

Print PDF at **Actual size / 100%** and disable “Fit to page.” Check a printed size guide with a ruler before cutting material. Browser preview zoom does not change exported dimensions. Very large paper may exceed raster memory limits; choose PDF or SVG if PNG generation reports this.

The export libraries, PDF preview worker, and print font are bundled for offline use. See [Files, recovery and offline use](#files). Software browser checks do not replace verification on your physical printer.
