# Your first pattern

Make a small rectangular pattern, add stitching, and prepare an actual-size print. You can undo completed changes with Ctrl/⌘+Z. Press Esc to cancel an unfinished operation.

This example uses millimetres. Choose **Millimetres** in Settings before starting.

## Draw an exact rectangle

1. Choose **Rectangle (R)** and click the first corner on the canvas.
2. Move the pointer to preview the opposite corner. Press **Tab** to edit a dimension; enter **60** for Width. Use Tab or Shift+Tab to reach Height and enter **40**. Press Enter after the second value to finish the rectangle.
3. Press **Esc** to return to Select, then click the rectangle outline. Check Width and Height in Properties. You can edit either value and press Enter to apply it.

![A new project ready for drawing](/manual/images/empty-canvas.png)

Choose units in Settings before entering dimensions. In inch mode you can enter fractions such as `3/8` or `1 3/8`. Zoom changes only your view, never the pattern's physical size.

## Round corners and add stitching

1. With the rectangle selected, choose **Corner radius (B)**. Click a corner dot to reveal the numeric fields, then enter **4** in **All corners (mm)**. Choose Apply; Esc discards the preview.
2. Choose **Stitch line (I)**. For this example, use **3.85 mm** spacing and **3 mm** inset from the cut edge. For real work, match spacing to your stitching iron.
3. Hover an edge to check the preview, then click to place stitching. Repeat on the other edges and rounded corners. Choose Apply to keep the complete session.

For continuous spacing around corners, see [merging stitch lines](#stitching/merge-and-split). For now, independent edge lines are enough to learn placement.

## Save your editable project

Choose **Save (Ctrl/⌘+S)** and keep the `.leather.json` file. Depending on your browser, Save opens a file picker or downloads a copy. Use Open to resume from that file. Browser recovery is a convenience, not a backup.

## Prepare a print

1. Press **+** beside Model and create a print layout matching your paper size and orientation.
2. In the **Model objects** panel, press **Import** beside your rectangle. Move the imported placement onto the paper; see [import and arrange objects](#printing/import-and-arrange-objects).
3. Place a **Square size guide** or **Ruler size guide** from the Measurement submenu on the print tab. Set the square side or ruler length to **20 mm**, so you can check it with a physical ruler.
4. Choose Export, select PDF, inspect the preview, then Export to download it.
5. In your PDF print dialog, select **Actual size / 100%**, disable Fit to page, and measure the printed guide before cutting material.

Save the project again to preserve the layout. Exporting a PDF does not save the editable project.

## Work faster

- **Tab** enters numeric construction or transform fields; Shift+Tab moves backward.
- **Space+drag** pans; Ctrl/⌘+scroll zooms at the pointer; **F** fits your artwork.
- Repeat a tool's letter to cycle its variants; right-click its button to choose explicitly.
- Hold **Alt** to bypass positional snapping.
- Watch Tool help for the current operation's controls.

Keep the [shortcut reference](#shortcuts) handy, or continue with [drawing tools](#drawing), [precise measurements](#measurements), and [print layouts](#printing).
