import type { Shape } from "../generated/Shape";
import { isIndicator } from "./indicators";

export const outlineStyles = ["solid", "dashed", "dotted"] as const;
export type OutlineStyle = (typeof outlineStyles)[number];

export function isOutlineStyle(value: unknown): value is OutlineStyle {
  return typeof value === "string" && (outlineStyles as readonly string[]).includes(value);
}

/** Shapes whose outline is a stroked path rather than text, an image, or annotation marks. */
export function hasStyledOutline(kind: Shape["kind"]): boolean {
  return kind !== "text" && kind !== "image" && kind !== "measurement" && !isIndicator(kind);
}

/**
 * Dash pattern in millimetres for a shape outline. Dots are zero-length dashes
 * drawn with round caps, so their diameter equals the outline width.
 * Patterns grow with thick outlines so dashes and dots stay distinguishable.
 */
export function outlineDash(shape: Pick<Shape, "kind" | "strokeStyle" | "strokeWidth">): number[] {
  if (!hasStyledOutline(shape.kind)) return [];
  const scale = Math.max(1, (shape.strokeWidth ?? 0.35) / 0.35);
  if (shape.strokeStyle === "dashed") return [3 * scale, 1.5 * scale];
  if (shape.strokeStyle === "dotted") return [0, 1 * scale];
  return [];
}
