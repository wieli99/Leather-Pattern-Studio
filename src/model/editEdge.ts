import type { Shape } from "./project";
import {
  applyMatrix,
  inverse,
  shapeMatrix,
  cornerPoints,
  boundary,
  distance,
} from "./geometry";
import { edgeMeasurements } from "./edgeMeasurements";

/** Resize one visible straight edge about its midpoint, preserving other corners. */
export function editEdge(
  shape: Shape,
  measurementIndex: number,
  length: number,
): Shape | undefined {
  if (!(length > 0) || !Number.isFinite(length))
    throw Error("Enter a positive finite length");
  if (
    shape.kind !== "rectangle" &&
    shape.kind !== "polyline" &&
    shape.kind !== "line"
  )
    return undefined;
  const originalLines = boundary(shape).lines;
  const visible = originalLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => distance(...line) > 1e-9);
  const selected = visible[measurementIndex];
  if (!selected) return undefined; // Curved measurements retain proportional resizing.
  const m = shapeMatrix(shape),
    inv = inverse(m);
  let points = shape.points.map((p) => ({ ...p }));
  if (shape.kind === "rectangle") {
    const a = shape.points[0],
      b = shape.points[1];
    const l = Math.min(a.x, b.x),
      r = Math.max(a.x, b.x),
      t = Math.min(a.y, b.y),
      bottom = Math.max(a.y, b.y);
    points = [
      { x: r, y: bottom },
      { x: l, y: bottom },
      { x: l, y: t },
      { x: r, y: t },
      { x: r, y: bottom },
    ];
    if (shape.radius > 0) {
      // Rounded polygon boundaries begin at the edge entering the first corner.
      points = [...points.slice(1, 4), points[0], points[1]];
    }
  }
  if (shape.cornerRadii) {
    const corners = cornerPoints(shape);
    points = [...corners, corners[0]];
  }
  const closed = distance(points[0], points.at(-1)!) < 1e-9;
  const count = closed ? points.length - 1 : points.length;
  const end =
    shape.radius > 0 || shape.cornerRadii
      ? selected.index
      : (selected.index + 1) % count;
  const start =
    shape.radius > 0 || shape.cornerRadii
      ? (end + count - 1) % count
      : selected.index;
  const [a, b] = selected.line,
    current = distance(a, b);
  const ux = (b.x - a.x) / current,
    uy = (b.y - a.y) / current;
  function candidate(delta: number): Shape {
    const next = points.map((p) => ({ ...p }));
    for (const [index, sign] of [
      [start, -1],
      [end, 1],
    ]) {
      const world = applyMatrix(m, points[index]);
      next[index] = applyMatrix(inv, {
        x: world.x + (sign * delta * ux) / 2,
        y: world.y + (sign * delta * uy) / 2,
      });
    }
    if (closed) next[next.length - 1] = { ...next[0] };
    return {
      ...shape,
      kind: shape.kind === "line" ? "line" : "polyline",
      points: next,
      rotation: 0,
      transform: m,
    };
  }
  let delta = length - current;
  for (let i = 0; i < 60; i++) {
    const next = candidate(delta);
    const measured = edgeMeasurements(next)[measurementIndex]?.length;
    if (!Number.isFinite(measured)) break;
    if (Math.abs(measured - length) < 0.001) return next;
    const step = Math.max(0.0001, Math.abs(delta) * 0.00001);
    const shifted = edgeMeasurements(candidate(delta + step))[measurementIndex]
      ?.length;
    const slope = (shifted - measured) / step;
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-8) break;
    delta += (length - measured) / slope;
  }
  throw Error(
    "This edge length cannot be reached while preserving the corner radius",
  );
}
