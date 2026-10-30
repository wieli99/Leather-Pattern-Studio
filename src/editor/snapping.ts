import type { Point, Shape } from "../model/project";
import {
  bounds,
  isPolygon,
  anchors,
  shapeMatrix,
  applyMatrix,
  arcPoint,
  center,
  distance,
  worldPoints,
} from "../model/geometry";
export type SnapKind =
  | "grid"
  | "vertex"
  | "midpoint"
  | "center"
  | "quadrant"
  | "edge"
  | "alignment";
export type SnapCandidate = { point: Point; kind: SnapKind; objectId?: string };
export function snapCandidates(shape: Shape): SnapCandidate[] {
  const c = center(shape),
    a = shape.points[0],
    b = shape.points[1];
  const vertices =
    shape.kind === "arc"
      ? [arcPoint(shape, 0), arcPoint(shape, 1)]
      : shape.kind === "rectangle" && shape.radius === 0 && !shape.cornerRadii
        ? [a, b, { x: a.x, y: b.y }, { x: b.x, y: a.y }].map((p) =>
            applyMatrix(shapeMatrix(shape), p),
          )
        : worldPoints(shape);
  const candidates: SnapCandidate[] = anchors(shape).map((point) => ({
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
  if (isPolygon(shape)) {
    // The closing point repeats the first corner and must not bias the average.
    const corners = worldPoints(shape).slice(0, -1);
    const point = corners.reduce(
      (sum, p) => ({
        x: sum.x + p.x,
        y: sum.y + p.y,
      }),
      { x: 0, y: 0 },
    );
    point.x /= corners.length;
    point.y /= corners.length;
    if (
      !candidates.some((candidate) => distance(candidate.point, point) < 1e-8)
    )
      candidates.push({ point, kind: "center", objectId: shape.id });
  }
  return candidates;
}

export function snappedAxes(point: Point): string[] {
  const axes: string[] = [];
  if (Math.abs(point.y) < 1e-9) axes.push("X axis");
  if (Math.abs(point.x) < 1e-9) axes.push("Y axis");
  return axes;
}

export type SmartGuide = {
  axis: "x" | "y";
  coordinate: number;
  objectId: string;
  bounds: ReturnType<typeof bounds>;
  alignment: string;
};
export function smartSnap(point: Point, shapes: Shape[], tolerance: number) {
  const result = { ...point };
  const guides: SmartGuide[] = [];
  for (const axis of ["x", "y"] as const) {
    let best = tolerance;
    let guide: SmartGuide | undefined;
    for (const shape of shapes) {
      const box = bounds([shape]);
      const start = axis === "x" ? box.x : box.y;
      const size = axis === "x" ? box.width : box.height;
      for (const coordinate of [start + size / 2, start, start + size]) {
        const delta = Math.abs(point[axis] - coordinate);
        if (delta < best) {
          best = delta;
          const alignment =
            coordinate === start + size / 2
              ? axis === "x"
                ? "Vertical center"
                : "Horizontal center"
              : axis === "x"
                ? coordinate === start
                  ? "Left edge"
                  : "Right edge"
                : coordinate === start
                  ? "Top edge"
                  : "Bottom edge";
          guide = {
            axis,
            coordinate,
            objectId: shape.id,
            bounds: box,
            alignment,
          };
        }
      }
    }
    if (guide) {
      result[axis] = guide.coordinate;
      guides.push(guide);
    }
  }
  return { point: result, guides };
}
