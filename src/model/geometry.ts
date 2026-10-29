import type { Point, Shape } from "./project.ts";
export type Bounds = { x: number; y: number; width: number; height: number };
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function center(s: Shape): Point {
  if (s.kind === "circle" || s.kind === "arc") return s.points[0];
  const xs = s.points.map((p) => p.x),
    ys = s.points.map((p) => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}
export function rotatePoint(p: Point, c: Point, degrees: number): Point {
  const a = (degrees * Math.PI) / 180,
    co = Math.cos(a),
    si = Math.sin(a);
  return {
    x: c.x + (p.x - c.x) * co - (p.y - c.y) * si,
    y: c.y + (p.x - c.x) * si + (p.y - c.y) * co,
  };
}
export function worldPoints(s: Shape): Point[] {
  return s.points.map((p) => rotatePoint(p, center(s), s.rotation));
}
export function bounds(shapes: Shape[]): Bounds {
  const points = shapes.flatMap(outlineBounds);
  if (!points.length) return { x: 0, y: 0, width: 100, height: 100 };
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function hitTest(s: Shape, point: Point, tolerance: number): boolean {
  if (s.kind === "arc")
    return distance(nearestOutline(s, point), point) <= tolerance;
  const p = rotatePoint(point, center(s), -s.rotation),
    a = s.points[0],
    b = s.points[s.points.length - 1];
  if (s.kind === "circle")
    return Math.abs(distance(p, a) - distance(a, b)) <= tolerance;
  if (s.kind === "ellipse") {
    const rx = Math.abs(b.x - a.x) / 2,
      ry = Math.abs(b.y - a.y) / 2,
      c = center(s);
    let best = Infinity;
    // Sample then refine the closest ellipse parameter; robust even for eccentric ellipses.
    let angle = 0;
    for (let i = 0; i < 64; i++) {
      const t = (i * Math.PI) / 32,
        d = distance(p, {
          x: c.x + rx * Math.cos(t),
          y: c.y + ry * Math.sin(t),
        });
      if (d < best) {
        best = d;
        angle = t;
      }
    }
    let step = Math.PI / 32;
    for (let i = 0; i < 18; i++) {
      for (const t of [angle - step, angle + step]) {
        const d = distance(p, {
          x: c.x + rx * Math.cos(t),
          y: c.y + ry * Math.sin(t),
        });
        if (d < best) {
          best = d;
          angle = t;
        }
      }
      step /= 2;
    }
    return best <= tolerance;
  }
  if (s.kind === "rectangle") {
    const c = center(s),
      r = s.radius,
      qx = Math.abs(p.x - c.x) - Math.abs(b.x - a.x) / 2 + r,
      qy = Math.abs(p.y - c.y) - Math.abs(b.y - a.y) / 2 + r;
    return (
      Math.abs(
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
          Math.min(Math.max(qx, qy), 0) -
          r,
      ) <= tolerance
    );
  }
  return s.points
    .slice(1)
    .some((b, i) => distanceToSegment(p, s.points[i], b) <= tolerance);
}
export const moveShape = (s: Shape, dx: number, dy: number): Shape => ({
  ...s,
  points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
});
export function rotateShape(
  s: Shape,
  degrees: number,
  pivot = center(s),
): Shape {
  const next = rotatePoint(center(s), pivot, degrees),
    old = center(s);
  return {
    ...moveShape(s, next.x - old.x, next.y - old.y),
    rotation: s.rotation + degrees,
  };
}
export function scaleShape(s: Shape, factor: number, pivot: Point): Shape {
  return {
    ...s,
    points: s.points.map((p) => ({
      x: pivot.x + (p.x - pivot.x) * factor,
      y: pivot.y + (p.y - pivot.y) * factor,
    })),
    radius: s.radius * factor,
  };
}
export function anchors(s: Shape): Point[] {
  if (s.kind === "arc")
    return [center(s), arcPoint(s, 0), arcPoint(s, 0.5), arcPoint(s, 1)];
  const pts = worldPoints(s),
    a = s.points[0],
    b = s.points[s.points.length - 1],
    c = center(s);
  if (s.kind === "circle") {
    const r = distance(a, b);
    return [
      c,
      { x: c.x + r, y: c.y },
      { x: c.x - r, y: c.y },
      { x: c.x, y: c.y + r },
      { x: c.x, y: c.y - r },
    ];
  }
  if (s.kind === "rectangle" && s.radius > 0)
    return [
      c,
      ...curves(s).lines.flat(),
      ...[
        { x: a.x, y: c.y },
        { x: b.x, y: c.y },
        { x: c.x, y: a.y },
        { x: c.x, y: b.y },
      ].map((p) => rotatePoint(p, c, s.rotation)),
    ];
  if (s.kind === "ellipse")
    return [
      c,
      ...[
        { x: a.x, y: c.y },
        { x: b.x, y: c.y },
        { x: c.x, y: a.y },
        { x: c.x, y: b.y },
      ].map((p) => rotatePoint(p, c, s.rotation)),
    ];
  if (s.kind === "rectangle")
    return [
      c,
      ...[
        a,
        b,
        { x: a.x, y: b.y },
        { x: b.x, y: a.y },
        { x: c.x, y: a.y },
        { x: c.x, y: b.y },
        { x: a.x, y: c.y },
        { x: b.x, y: c.y },
      ].map((p) => rotatePoint(p, c, s.rotation)),
    ];
  return [
    ...pts,
    c,
    ...pts
      .slice(1)
      .map((p, i) => ({ x: (p.x + pts[i].x) / 2, y: (p.y + pts[i].y) / 2 })),
  ];
}

export function arcPoint(s: Shape, t: number): Point {
  const c = s.points[0],
    start = worldPoints(s)[1],
    angle =
      Math.atan2(start.y - c.y, start.x - c.x) +
      (((s.sweep ?? 0) * Math.PI) / 180) * t,
    r = distance(c, start);
  return { x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) };
}
export function onArc(s: Shape, p: Point): boolean {
  const c = s.points[0],
    a = arcPoint(s, 0),
    span = s.sweep ?? 0;
  const delta =
    ((Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(a.y - c.y, a.x - c.x)) *
      180) /
    Math.PI;
  const directed = (((delta * Math.sign(span)) % 360) + 360) % 360;
  return directed <= Math.abs(span) + 1e-8;
}
export function contains(s: Shape, p: Point): boolean {
  const q = rotatePoint(p, center(s), -s.rotation),
    a = s.points[0],
    b = s.points[1],
    c = center(s);
  if (s.kind === "circle") return distance(q, a) <= distance(a, b);
  if (s.kind === "ellipse")
    return (
      ((q.x - c.x) / (Math.abs(b.x - a.x) / 2)) ** 2 +
        ((q.y - c.y) / (Math.abs(b.y - a.y) / 2)) ** 2 <=
      1
    );
  if (s.kind === "rectangle") {
    const r = s.radius,
      x = Math.abs(q.x - c.x) - Math.abs(b.x - a.x) / 2 + r,
      y = Math.abs(q.y - c.y) - Math.abs(b.y - a.y) / 2 + r;
    return (
      Math.hypot(Math.max(x, 0), Math.max(y, 0)) +
        Math.min(Math.max(x, y), 0) <=
      r
    );
  }
  if (
    s.kind === "polyline" &&
    distance(a, s.points[s.points.length - 1]) < 1e-9
  ) {
    let inside = false;
    for (let i = 0, j = s.points.length - 1; i < s.points.length; j = i++) {
      const u = s.points[i],
        v = s.points[j];
      if (
        u.y > q.y !== v.y > q.y &&
        q.x < ((v.x - u.x) * (q.y - u.y)) / (v.y - u.y) + u.x
      )
        inside = !inside;
    }
    return inside;
  }
  return false;
}
// Parametric boundary pieces retain exact circular and elliptical geometry.
type Curve = { c: Point; u: Point; v: Point; start: number; span: number };
function curves(s: Shape): { lines: [Point, Point][]; curves: Curve[] } {
  const a = s.points[0],
    b = s.points[s.points.length - 1],
    c = center(s),
    r = s.radius,
    lines: [Point, Point][] = [],
    curves: Curve[] = [];
  const world = (p: Point) => rotatePoint(p, c, s.rotation);
  const curve = (
    o: Point,
    rx: number,
    ry: number,
    start: number,
    span: number,
  ) => {
    const t = (s.rotation * Math.PI) / 180;
    curves.push({
      c: world(o),
      u: { x: rx * Math.cos(t), y: rx * Math.sin(t) },
      v: { x: -ry * Math.sin(t), y: ry * Math.cos(t) },
      start,
      span,
    });
  };
  if (s.kind === "circle" || s.kind === "arc") {
    const start = Math.atan2(b.y - a.y, b.x - a.x);
    curve(
      a,
      distance(a, b),
      distance(a, b),
      s.kind === "arc" ? start : 0,
      s.kind === "arc" ? ((s.sweep ?? 0) * Math.PI) / 180 : Math.PI * 2,
    );
  } else if (s.kind === "ellipse")
    curve(c, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, Math.PI * 2);
  else if (s.kind === "rectangle") {
    const l = Math.min(a.x, b.x),
      t = Math.min(a.y, b.y),
      right = Math.max(a.x, b.x),
      bottom = Math.max(a.y, b.y);
    const corners = [
      { x: right - r, y: bottom - r },
      { x: l + r, y: bottom - r },
      { x: l + r, y: t + r },
      { x: right - r, y: t + r },
    ];
    for (let i = 0; i < 4; i++) {
      const o = corners[i],
        angle = (i * Math.PI) / 2;
      curve(o, r, r, angle, Math.PI / 2);
      const next = corners[(i + 1) % 4],
        end = angle + Math.PI / 2;
      lines.push([
        world({ x: o.x + r * Math.cos(end), y: o.y + r * Math.sin(end) }),
        world({ x: next.x + r * Math.cos(end), y: next.y + r * Math.sin(end) }),
      ]);
    }
  } else
    worldPoints(s)
      .slice(1)
      .forEach((p, i) => lines.push([worldPoints(s)[i], p]));
  return { lines, curves };
}
const curveAt = (q: Curve, t: number): Point => ({
  x: q.c.x + q.u.x * Math.cos(t) + q.v.x * Math.sin(t),
  y: q.c.y + q.u.y * Math.cos(t) + q.v.y * Math.sin(t),
});
const within = (q: Curve, t: number) =>
  ((((t - q.start) * Math.sign(q.span)) % (Math.PI * 2)) + Math.PI * 2) %
    (Math.PI * 2) <=
  Math.abs(q.span) + 1e-9;
export function outlineBounds(s: Shape): Point[] {
  const q = curves(s);
  return [
    ...q.lines.flat(),
    ...q.curves.flatMap((c) =>
      [
        c.start,
        c.start + c.span,
        ...[Math.atan2(c.v.x, c.u.x), Math.atan2(c.v.y, c.u.y)]
          .flatMap((t) => [t, t + Math.PI])
          .filter((t) => within(c, t)),
      ].map((t) => curveAt(c, t)),
    ),
  ];
}
export function nearestOutline(s: Shape, p: Point): Point {
  const q = curves(s);
  let best: Point = s.points[0],
    d = Infinity;
  const consider = (v: Point) => {
    const n = distance(v, p);
    if (n < d) {
      d = n;
      best = v;
    }
  };
  for (const [a, b] of q.lines) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      t = Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
    consider({ x: a.x + t * dx, y: a.y + t * dy });
  }
  for (const c of q.curves) {
    let index = 0,
      local = Infinity;
    const count = 128;
    for (let i = 0; i <= count; i++) {
      const t = c.start + (c.span * i) / count,
        v = curveAt(c, t),
        n = distance(v, p);
      if (n < local) {
        local = n;
        index = i;
      }
    }
    let lo = Math.max(0, (index - 1) / count),
      hi = Math.min(1, (index + 1) / count);
    for (let i = 0; i < 45; i++) {
      const l = lo + (hi - lo) / 3,
        h = hi - (hi - lo) / 3;
      if (
        distance(curveAt(c, c.start + c.span * l), p) <
        distance(curveAt(c, c.start + c.span * h), p)
      )
        hi = h;
      else lo = l;
    }
    consider(curveAt(c, c.start + (c.span * (lo + hi)) / 2));
    consider(curveAt(c, c.start));
    consider(curveAt(c, c.start + c.span));
  }
  return best;
}
export function intersectsBox(s: Shape, b: Bounds): boolean {
  const inside = (p: Point) =>
    p.x >= b.x - 1e-9 &&
    p.x <= b.x + b.width + 1e-9 &&
    p.y >= b.y - 1e-9 &&
    p.y <= b.y + b.height + 1e-9;
  const q = curves(s);
  for (const [a, c] of q.lines) {
    if (inside(a) || inside(c)) return true;
    for (const [axis, value] of [
      ["x", b.x],
      ["x", b.x + b.width],
      ["y", b.y],
      ["y", b.y + b.height],
    ] as const) {
      const delta = c[axis] - a[axis];
      if (!delta) continue;
      const t = (value - a[axis]) / delta;
      if (
        t >= 0 &&
        t <= 1 &&
        inside({ x: a.x + t * (c.x - a.x), y: a.y + t * (c.y - a.y) })
      )
        return true;
    }
  }
  for (const c of q.curves) {
    if (inside(curveAt(c, c.start)) || inside(curveAt(c, c.start + c.span)))
      return true;
    for (const [axis, value] of [
      ["x", b.x],
      ["x", b.x + b.width],
      ["y", b.y],
      ["y", b.y + b.height],
    ] as const) {
      const magnitude = Math.hypot(c.u[axis], c.v[axis]);
      if (!magnitude) continue;
      const v = (value - c.c[axis]) / magnitude;
      if (Math.abs(v) > 1) continue;
      const phase = Math.atan2(c.v[axis], c.u[axis]);
      for (const t of [phase + Math.acos(v), phase - Math.acos(v)])
        if (within(c, t) && inside(curveAt(c, t))) return true;
    }
  }
  return false;
}
