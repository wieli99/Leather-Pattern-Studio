import type { Point, Shape } from "./project";
import { boundary, distance, worldCubics, worldPoints } from "./geometry";
import { cubicAt, isCurve, type Cubic } from "./curves";

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export function insertAnchor(
  shape: Shape,
  point: Point,
  tolerance: number,
  onPoint?: (point: Point) => void,
): Shape | null {
  let segments: Cubic[];
  if (isCurve(shape)) segments = worldCubics(shape);
  else {
    const b = boundary(shape);
    segments = b.lines
      .filter(([a, z]) => distance(a, z) > 1e-9)
      .map(([a, z]) => [a, lerp(a, z, 1 / 3), lerp(a, z, 2 / 3), z]);
    for (const q of b.curves) {
      const radius = Math.hypot(q.u.x, q.u.y) + Math.hypot(q.v.x, q.v.y);
      if (radius < 1e-9 || Math.abs(q.span) < 1e-9) continue;
      const n = Math.max(
        1,
        Math.ceil(
          Math.abs(q.span) /
            Math.min(Math.PI / 8, Math.pow(0.001 / Math.max(radius, 1), 1 / 6)),
        ),
      );
      const at = (t: number): Point => ({
        x: q.c.x + q.u.x * Math.cos(t) + q.v.x * Math.sin(t),
        y: q.c.y + q.u.y * Math.cos(t) + q.v.y * Math.sin(t),
      });
      const tangent = (t: number): Point => ({
        x: -q.u.x * Math.sin(t) + q.v.x * Math.cos(t),
        y: -q.u.y * Math.sin(t) + q.v.y * Math.cos(t),
      });
      for (let i = 0; i < n; i++) {
        const a = q.start + (q.span * i) / n,
          z = q.start + (q.span * (i + 1)) / n,
          k = (4 / 3) * Math.tan((z - a) / 4),
          p = at(a),
          r = at(z),
          u = tangent(a),
          v = tangent(z);
        segments.push([
          p,
          { x: p.x + k * u.x, y: p.y + k * u.y },
          { x: r.x - k * v.x, y: r.y - k * v.y },
          r,
        ]);
      }
    }
    // Boundary pieces may be emitted by type; restore their connected order.
    const ordered: Cubic[] = [];
    while (segments.length) {
      const i = ordered.length
        ? segments.findIndex(
            (c) => distance(c[0], ordered[ordered.length - 1][3]) < 1e-7,
          )
        : 0;
      if (i < 0) return null;
      ordered.push(segments.splice(i, 1)[0]);
    }
    segments = ordered;
  }
  // Generated approximation joins are not user anchors.
  const existingAnchors =
    isCurve(shape) || shape.kind === "line" || shape.kind === "polyline"
      ? worldPoints(shape)
      : boundary(shape).lines.flat();
  if (
    !segments.length ||
    existingAnchors.some((p) => distance(p, point) < tolerance)
  )
    return null;
  let best = Infinity,
    index = 0,
    t = 0;
  segments.forEach((c, i) => {
    for (let j = 0; j < 100; j++) {
      let lo = j / 100,
        hi = (j + 1) / 100;
      for (let k = 0; k < 24; k++) {
        const a = lo + (hi - lo) / 3,
          b = hi - (hi - lo) / 3;
        if (distance(cubicAt(c, a), point) < distance(cubicAt(c, b), point))
          hi = b;
        else lo = a;
      }
      const u = (lo + hi) / 2,
        d = distance(cubicAt(c, u), point);
      if (d < best) {
        best = d;
        index = i;
        t = u;
      }
    }
  });
  if (best > tolerance) return null;
  const c = segments[index],
    a = lerp(c[0], c[1], t),
    b = lerp(c[1], c[2], t),
    d = lerp(c[2], c[3], t),
    e = lerp(a, b, t),
    f = lerp(b, d, t),
    p = lerp(e, f, t);
  onPoint?.(p);
  segments.splice(index, 1, [c[0], a, e, p], [p, f, d, c[3]]);
  const points = [segments[0][0], ...segments.map((c) => c[3])];
  if (distance(points[0], points[points.length - 1]) < 1e-9)
    points[points.length - 1] = { ...points[0] };
  const handles = points.map((p, i) => ({
    incoming: i ? sub(segments[i - 1][2], p) : { x: 0, y: 0 },
    outgoing: i < segments.length ? sub(segments[i][1], p) : { x: 0, y: 0 },
  }));
  return {
    ...shape,
    kind: "control-curve",
    points,
    handles,
    rotation: 0,
    transform: undefined,
    radius: 0,
    sweep: undefined,
  };
}
