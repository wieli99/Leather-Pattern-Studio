import type { Point, Shape } from "./project";
import type { CurveHandles } from "../generated/CurveHandles";
export type Cubic = [Point, Point, Point, Point];
export const isCurve = (s: Shape) =>
  s.kind === "curve" || s.kind === "control-curve";
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Point, n: number): Point => ({ x: a.x * n, y: a.y * n });
const lerp = (a: Point, b: Point, t: number) => add(mul(a, 1 - t), mul(b, t));
const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const mirroredHandles = (outgoing: Point): CurveHandles => ({
  incoming: { x: -outgoing.x, y: -outgoing.y },
  outgoing: { ...outgoing },
});
export const zeroHandles = () => mirroredHandles({ x: 0, y: 0 });
export function cubicSegments(s: Shape): Cubic[] {
  const pts = s.points;
  if (s.kind === "control-curve")
    return pts
      .slice(1)
      .map((p, i) => [
        pts[i],
        add(pts[i], s.handles![i].outgoing),
        add(p, s.handles![i + 1].incoming),
        p,
      ]);
  // Ignore consecutive duplicate interpolation points; keep the stored anchors editable.
  const p = pts.filter((v, i) => !i || length(v, pts[i - 1]) > 1e-9);
  return p.slice(1).map((b, i) => {
    const a = p[i],
      prev = p[i - 1] ?? sub(mul(a, 2), b),
      next = p[i + 2] ?? sub(mul(b, 2), a);
    const d0 = Math.sqrt(length(prev, a)),
      d1 = Math.sqrt(length(a, b)),
      d2 = Math.sqrt(length(b, next));
    const tangent = (u: Point, v: Point, w: Point, x: number, y: number) =>
      mul(
        add(
          sub(mul(sub(v, u), 1 / x), mul(sub(w, u), 1 / (x + y))),
          mul(sub(w, v), 1 / y),
        ),
        d1 / 3,
      );
    return [
      a,
      add(a, tangent(prev, a, b, d0, d1)),
      sub(b, tangent(a, b, next, d1, d2)),
      b,
    ];
  });
}
export function cubicAt(c: Cubic, t: number): Point {
  const a = lerp(c[0], c[1], t),
    b = lerp(c[1], c[2], t),
    d = lerp(c[2], c[3], t);
  return lerp(lerp(a, b, t), lerp(b, d, t), t);
}
export function cubicExtrema(c: Cubic): Point[] {
  const ts = [0, 1];
  for (const axis of ["x", "y"] as const) {
    const [p, q, r, s] = c.map((v) => v[axis]);
    const a = -p + 3 * q - 3 * r + s,
      b = 2 * (p - 2 * q + r),
      d = q - p;
    if (Math.abs(a) < 1e-14) {
      if (Math.abs(b) > 1e-14) ts.push(-d / b);
    } else {
      const disc = b * b - 4 * a * d;
      if (disc >= 0)
        ts.push(
          (-b + Math.sqrt(disc)) / (2 * a),
          (-b - Math.sqrt(disc)) / (2 * a),
        );
    }
  }
  return ts.filter((t) => t >= 0 && t <= 1).map((t) => cubicAt(c, t));
}
export function flattenCubic(c: Cubic, tolerance: number): Point[] {
  const out = [c[0]];
  function visit(q: Cubic, depth: number) {
    // Distance to the chord segment also handles collinear overshoot and loops.
    const dist = (p: Point) => {
      const v = sub(q[3], q[0]),
        w = sub(p, q[0]);
      const t = Math.max(
        0,
        Math.min(1, (v.x * w.x + v.y * w.y) / (v.x * v.x + v.y * v.y || 1)),
      );
      return length(p, add(q[0], mul(v, t)));
    };
    if (depth >= 24 || Math.max(dist(q[1]), dist(q[2])) <= tolerance) {
      out.push(q[3]);
      return;
    }
    const a = lerp(q[0], q[1], 0.5),
      b = lerp(q[1], q[2], 0.5),
      d = lerp(q[2], q[3], 0.5);
    const e = lerp(a, b, 0.5),
      f = lerp(b, d, 0.5),
      m = lerp(e, f, 0.5);
    visit([q[0], a, e, m], depth + 1);
    visit([m, f, d, q[3]], depth + 1);
  }
  visit(c, 0);
  return out;
}
