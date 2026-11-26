import { applyMatrix, distance, inverse, shapeMatrix, stretchShape } from "./geometry";
import type { Point, Shape } from "./project";

/** Two picked points closer than this cannot define a scale. */
export const minCalibrationSpan = 1e-6;

/** Whether a world point lies on the image, including its border; handles rotation, flips and transforms. */
export function pointInImage(s: Shape, p: Point): boolean {
  if (s.kind !== "image" || s.points.length !== 2) return false;
  const local = applyMatrix(inverse(shapeMatrix(s)), p),
    [a, b] = s.points,
    tolerance = 1e-9 * Math.max(1, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return (
    local.x >= Math.min(a.x, b.x) - tolerance &&
    local.x <= Math.max(a.x, b.x) + tolerance &&
    local.y >= Math.min(a.y, b.y) - tolerance &&
    local.y <= Math.max(a.y, b.y) + tolerance
  );
}

/** Calibration moves and resizes the image, which would break position or size links on commit. */
export const hasGeometryBinding = (s: Shape) =>
  !!s.bindings?.some((b) => ["x", "y", "width", "height"].includes(b.property));

/**
 * Scale an image uniformly about `p1` so the picked points end up `known` millimetres apart.
 * Returns an error message when the points or the distance cannot define a scale.
 */
export function calibrateImage(s: Shape, p1: Point, p2: Point, known: number): Shape | string {
  const measured = distance(p1, p2);
  if (measured < minCalibrationSpan) return "Pick two different points.";
  if (!Number.isFinite(known) || known <= 0) return "Enter a known distance greater than zero.";
  return stretchShape(s, known / measured, known / measured, p1);
}
