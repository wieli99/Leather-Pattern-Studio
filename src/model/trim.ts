import type { Point, Shape } from "./project";
import { boundary, distanceToSegment } from "./geometry";

/** Straight-outline trim. Parameters are measured along visible world-space edges. */
export function trimAt(
  shapes: Shape[],
  point: Point,
  tolerance: number,
  preview?: (span: [Point, Point]) => void,
): Shape[] | null {
  const eligible = (s: Shape) =>
    ["line", "polyline", "rectangle"].includes(s.kind) &&
    !s.radius &&
    !s.cornerRadii;
  const edges = shapes
    .filter(eligible)
    .flatMap((s) =>
      boundary(s).lines.map((line, index) => ({ s, line, index })),
    );
  const hit = [...edges]
    .reverse()
    .filter((e) => distanceToSegment(point, ...e.line) <= tolerance)
    .sort(
      (a, b) =>
        distanceToSegment(point, ...a.line) -
        distanceToSegment(point, ...b.line),
    )[0];
  if (!hit) return null;
  const [a, b] = hit.line,
    dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy;
  if (!length) return null;
  const cuts = [0, 1];
  for (const e of edges) {
    if (e === hit) continue;
    const [c, d] = e.line,
      ex = d.x - c.x,
      ey = d.y - c.y,
      den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / den;
    const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
    if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) cuts.push(t);
  }
  cuts.sort((a, b) => a - b);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length),
  );
  const end = cuts.findIndex((v) => v > t + 1e-9),
    j = end < 0 ? cuts.length - 1 : end;
  const at = (v: number): Point => ({ x: a.x + v * dx, y: a.y + v * dy });
  if (preview) {
    preview([at(cuts[j - 1]), at(cuts[j])]);
    return null;
  }
  const pieces = boundary(hit.s).lines.flatMap((line, index) =>
    index !== hit.index
      ? [line]
      : [
          ...(cuts[j - 1] > 1e-9
            ? [[a, at(cuts[j - 1])] as [Point, Point]]
            : []),
          ...(cuts[j] < 1 - 1e-9 ? [[at(cuts[j]), b] as [Point, Point]] : []),
        ],
  );
  return shapes.flatMap((s) =>
    s.id !== hit.s.id
      ? [s]
      : pieces.map((points, i) => ({
          ...s,
          id: i ? crypto.randomUUID() : s.id,
          kind: "line" as const,
          points,
          rotation: 0,
          transform: undefined,
          radius: 0,
          cornerRadii: undefined,
        })),
  );
}
