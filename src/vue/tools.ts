import type { Mode } from "../editor/construction";
export const tools: { id: Mode; key: string; label: string }[] = [
  { id: "select", key: "V", label: "Select" },
  { id: "polyline", key: "P", label: "Polyline" },
  { id: "curve", key: "", label: "Curve" },
  { id: "rectangle", key: "R", label: "Rectangle" },
  { id: "circle", key: "C", label: "Circle" },
];
