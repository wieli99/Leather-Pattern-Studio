import type { Mode } from "../editor/construction";
export const tools: { id: Mode; key: string; label: string }[] = [
  { id: "select", key: "V", label: "Select" },
  { id: "polyline", key: "P", label: "Polyline" },
  { id: "rectangle", key: "R", label: "Rectangle" },
  { id: "circle", key: "C", label: "Circle" },
  { id: "polygon", key: "H", label: "Shapes" },
  { id: "text", key: "T", label: "Text" },
  { id: "measurement", key: "D", label: "Measurements" },
  { id: "arrow", key: "A", label: "Drawing tools" },
];

export const groupKeys: Record<
  string,
  "rectangle" | "circle" | "polyline" | "polygon" | "measurement" | "drawing"
> = { r: "rectangle", c: "circle", p: "polyline", h: "polygon", d: "measurement", a: "drawing" };
export const transformShortcuts = [
  ["rotate", "Rotate", "E"],
  ["move", "Move", "G"],
  ["scale", "Resize", "S"],
  ["mirror", "Mirror", "M"],
  ["corner", "Corners", "B"],
] as const;
