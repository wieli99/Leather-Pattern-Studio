// French-iron slits turn with the seam tangent through the rounded corner.
export const stitchLineIcon = "M3 20V10a7 7 0 0 1 7-7h10M6.15 18.85l1.7-1.7M6.15 13.85l1.7-1.7M6.45 8.3l2.4-.3M11.44 6.15l1.7 1.7M16.44 6.15l1.7 1.7";

// Matching stitched corners and an arrow show the source-to-receiver placement.
export const transferStitchIcon = "M2 12V5a3 3 0 0 1 3-3h7M5 10l1.5-1.5M6 5l1.5 1.5M12 22v-7a3 3 0 0 1 3-3h7M15 20l1.5-1.5M16 15l1.5 1.5M12 5h4a3 3 0 0 1 3 3v1.5M16.5 7 19 9.5 21.5 7";

// A shared pair of rounded chain ends; Unlink breaks the center connection.
const stitchLinkOutline = "M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 0 10h-2";
export const linkStitchIcon = `${stitchLinkOutline}M8 12h8`;
export const unlinkStitchIcon = `${stitchLinkOutline}M8 12h2m4 0h2M11 4l1 2m0 12 1 2`;

// Small, evenly spaced slits trace the S-curve at tangent-relative angles.
export const convertStitchIcon = "M3.04 18.46l0.92 -0.92M3.14 14.68l0.99 -0.84M3.67 10.91l1.13 -0.64M5.76 7.36l1.12 0.66M9.59 8.50l0.03 1.30M12.11 11.36l-0.21 1.28M14.38 14.20l0.03 1.30M17.12 15.98l1.12 0.66M19.20 13.73l1.13 -0.64M19.87 10.16l0.99 -0.84M20.04 6.46l0.92 -0.92";

export type StitchTool = "line" | "add" | "continue" | "transfer" | "link" | "unlink" | "merge" | "split" | "convert" | "path" | "delete";

export const stitchTools: { id: StitchTool; label: string; hint: string; icon: string; separator?: boolean; strokeWidth?: number }[] = [
  { id:"line", label:"Stitch line", hint:"Place stitching or edit selected lines.", icon:stitchLineIcon },
  { id:"continue", label:"Continue run", hint:"Continue the selected section with an adjustable gap.", icon:"M3 15l2-2m3 2 2-2m3 2 2-2M17 8l4 4-4 4m-4-4h8" },
  { id:"transfer", label:"Transfer stitching", hint:"Place selected stitching on receiving pieces.", icon:transferStitchIcon, separator:true },
  { id:"link", label:"Link", hint:"Link independent lines with equal hole counts.", icon:linkStitchIcon },
  { id:"unlink", label:"Unlink", hint:"Remove selected lines from count-check links.", icon:unlinkStitchIcon },
  { id:"merge", label:"Merge", hint:"Join connected lines in selection order.", icon:"M3 5h6l4 7h8M3 19h6l4-7m4-4 4 4-4 4", separator:true },
  { id:"split", label:"Split", hint:"Separate all edges or split at a chosen junction.", icon:"M3 12h7l5-7h6M10 12l5 7h6m-4-18 4 4-4 4m0 6 4 4-4 4" },
  { id:"convert", label:"Convert to stitching line", hint:"Convert the selected path into editable stitching.", icon:convertStitchIcon, strokeWidth:1.2, separator:true },
];
