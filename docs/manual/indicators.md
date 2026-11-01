# Indicators

Choose **Measurement (D)** below Text in the left toolbar. Right-click the button, hold it, or focus it and press Down to choose Arrow, Bodyless arrow, Crosshair, Square size guide, or Ruler size guide. The button remembers your last variant. D and Shift+D cycle the submenu. Measurement and the two size guides appear first.

![Indicator examples and variant menu](/manual/images/indicators.png)

All variants support two clicks or click-and-drag. Snapping works as for other drawing tools; hold Alt to bypass it. Escape or choosing another mode cancels unfinished placement. Each completed indicator is one undo step, and the tool stays active for another placement.

- **Arrow:** click the tip, then the tail. The open head has a default length of 3 mm. Properties edits Length and Head size (local mm).
- **Bodyless arrow:** click the tip, then set the pointing direction. Pointer distance does not resize the head; new heads are 3 mm. Change Head size (mm) in Properties afterward.
- **Crosshair:** click the center, then a point whose distance from the center sets the arm radius. A drag starts at the center. The second point also sets orientation. Properties edits overall end-to-end size and rotation.
- **Square size guide:** click a corner, then its opposite corner. Grid and object snapping use the same Cartesian coordinates as rectangles. The larger horizontal or vertical pointer distance sets both sides. Properties edits Side length in the selected units. Resizing a selection containing a square guide always scales uniformly.
- **Ruler size guide:** click zero, then the end. It follows that direction, with millimetre ticks (longer at 5 mm and numbered every 10 mm) or 1/16-inch ticks (longer at half inches and numbered every inch), and a total length label. Properties edits Length in the selected units.

Square guides display dimensions outside two adjacent edges. Size guides always display dimensions calculated from their current geometry in the selected units. Moving, rotating, mirroring, and resizing update the display. Ruler ticks and lettering retain their physical sizes when the guide is resized. Millimetre labels show up to two decimal places; ≈ means the displayed value was rounded. For exceptionally long rulers above 10,000 mm, tick spacing increases to keep the editor responsive.

Indicators support ordinary selection, grouping, duplication, visibility, locking, and outline styling. They do not support stitching, trimming, corner radii, or area measurement. Saved projects preserve their editable indicator types and dimensions.

Import size guides into a [print layout](#printing) to check physical scale. Their generated labels use the layout’s units. Export PDF and print at Actual size / 100%, then measure a guide with a ruler before cutting.

Outline width (mm) in Appearance applies to all outlined shapes. The default is 0.35 mm; resizing preserves physical width. Reset styling restores this default.

Hold Shift while placing arrows, bodyless arrows, ruler size guides, or measurement endpoints to constrain direction to 45° increments. Alt bypasses grid/object snapping while retaining this angle constraint. The third measurement click still sets the dimension-line offset.

For crosshairs, click the center, then an arm endpoint: distance sets radius and direction sets rotation. Hold Shift for 45° increments. Both two-click placement and dragging support this behavior. Square-guide placement retains its rectangle-style Shift behavior.

Measurement labels and ruler divisions follow Settings → Units. Fractional inches use 1/16-inch ruler ticks and labels rounded to 1/64 inch with ≈ for approximate values. Changing units preserves the physical guide dimensions.
