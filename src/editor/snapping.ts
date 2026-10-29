import type { Point, Shape } from "../model/project";
import {
  anchors,
  shapeMatrix,
  applyMatrix,
  arcPoint,
  center,
  distance,
  worldPoints,
} from "../model/geometry";
export type SnapKind =
  "grid" | "vertex" | "midpoint" | "center" | "quadrant" | "edge";
export type SnapCandidate = { point: Point; kind: SnapKind; objectId?: string };
export function snapCandidates(shape: Shape): SnapCandidate[] {
  const c = center(shape),
    a = shape.points[0],
    b = shape.points[1];
  const vertices =
    shape.kind === "arc"
      ? [arcPoint(shape, 0), arcPoint(shape, 1)]
      : shape.kind === "rectangle" && shape.radius === 0
        ? [a, b, { x: a.x, y: b.y }, { x: b.x, y: a.y }].map((p) =>
            applyMatrix(shapeMatrix(shape), p),
          )
        : worldPoints(shape);
  return anchors(shape).map((point) => ({
    point,
    objectId: shape.id,
    kind:
      distance(point, c) < 1e-8
        ? "center"
        : ["circle", "ellipse"].includes(shape.kind)
          ? "quadrant"
          : vertices.some((v) => distance(v, point) < 1e-8)
            ? "vertex"
            : "midpoint",
  }));
}

export function snappedAxes(point: Point): string[] {
  const axes: string[] = [];
  if (Math.abs(point.y) < 1e-9) axes.push("X axis");
  if (Math.abs(point.x) < 1e-9) axes.push("Y axis");
  return axes;
}
