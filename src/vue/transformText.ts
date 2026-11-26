/** Headings and help shared by the Model and Print transform popovers. */
export const transformHeading = { move: "Move", rotate: "Rotate", scale: "Resize", mirror: "Mirror", corner: "Corners" } as const;
export const transformHelp = {
  move: "Drag the gizmo or enter X/Y distances to move the selection.",
  rotate: "Drag the rotation ring or enter an angle to rotate the selection.",
  scale: "Drag the gizmo or enter X/Y factors to resize the selection.",
  mirror: "Click an axis or straight outline edge on the canvas to mirror.",
  corner: "Drag inward to round; drag outward through zero to chamfer. Click a corner for exact values.",
} as const;
