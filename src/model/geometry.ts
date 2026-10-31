import { measurementGeometry } from "./measurement";
import {
  isCurve,
  cubicSegments,
  cubicExtrema,
  cubicAt,
  flattenCubic,
  type Cubic,
} from "./curves";
import type { Point, Shape } from "./project.ts";
import type { Affine } from "../generated/Affine";
export const identity = (): Affine => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
export function applyMatrix(m: Affine, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}
export function multiply(l: Affine, r: Affine): Affine {
  return {
    a: l.a * r.a + l.c * r.b,
    b: l.b * r.a + l.d * r.b,
    c: l.a * r.c + l.c * r.d,
    d: l.b * r.c + l.d * r.d,
    e: l.a * r.e + l.c * r.f + l.e,
    f: l.b * r.e + l.d * r.f + l.f,
  };
}
export function inverse(m: Affine): Affine {
  const det = m.a * m.d - m.b * m.c;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}
export const transformShape = (s: Shape, m: Affine): Shape => ({
  ...s,
  transform: multiply(m, s.transform ?? identity()),
});
export const center = (s: Shape): Point =>
  applyMatrix(s.transform ?? identity(), localCenter(s));
// Primitive rotation is applied first; the stored affine matrix maps that result to world millimetres.
export function shapeMatrix(s: Shape): Affine {
  const c = localCenter(s),
    t = (s.rotation * Math.PI) / 180,
    a = Math.cos(t),
    b = Math.sin(t);
  return multiply(s.transform ?? identity(), {
    a,
    b,
    c: -b,
    d: a,
    e: c.x - a * c.x + b * c.y,
    f: c.y - b * c.x - a * c.y,
  });
}
export function stretchShape(
  s: Shape,
  x: number,
  y: number,
  pivot: Point,
  angle = 0,
): Shape {
  if (x === 1 && y === 1) return s;
  const t = (angle * Math.PI) / 180,
    c = Math.cos(t),
    b = Math.sin(t),
    a = x * c * c + y * b * b,
    d = x * b * b + y * c * c,
    k = (x - y) * b * c;
  return transformShape(s, {
    a,
    b: k,
    c: k,
    d,
    e: pivot.x - a * pivot.x - k * pivot.y,
    f: pivot.y - k * pivot.x - d * pivot.y,
  });
}
export type Bounds = { x: number; y: number; width: number; height: number };
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function localCenter(s: Shape): Point {
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
  return s.points.map((p) => applyMatrix(shapeMatrix(s), p));
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
export function isPolygon(s: Shape): boolean {
  return (
    s.kind === "polyline" &&
    s.points.length >= 4 &&
    distance(s.points[0], s.points.at(-1)!) < 1e-9
  );
}
export function cornerPoints(s: Shape): Point[] {
  if (s.kind !== "rectangle") return isPolygon(s) ? s.points.slice(0, -1) : [];
  const [a, b] = s.points;
  const l = Math.min(a.x, b.x),
    r = Math.max(a.x, b.x),
    t = Math.min(a.y, b.y),
    d = Math.max(a.y, b.y);
  return [
    { x: l, y: t },
    { x: r, y: t },
    { x: r, y: d },
    { x: l, y: d },
  ];
}
export function cornerRadii(s: Shape): number[] {
  return s.cornerRadii
    ? polygonFillets(s).corners.map((c) => c.radius)
    : cornerPoints(s).map(() => s.radius);
}
export function setCornerRadius(
  s: Shape,
  index: number,
  value: number,
  all = false,
): Shape {
  if (!Number.isFinite(value)) return s;
  const base = polygonFillets(s).corners.map((c) => c.radius),
    count = base.length;
  if (
    !count ||
    (!all && (!Number.isInteger(index) || index < 0 || index >= count))
  )
    return s;
  const probe = polygonFillets({ ...s, radius: 0, cornerRadii: undefined }).max;
  if (all)
    return {
      ...s,
      radius: Math.max(0, Math.min(value, probe)),
      cornerRadii: undefined,
    };
  const pts = cornerPoints(s);
  const k = (i: number) => {
    const p = pts[i],
      a = pts[(i + count - 1) % count],
      b = pts[(i + 1) % count];
    const u = distance(p, a),
      v = distance(p, b);
    const angle = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          ((a.x - p.x) * (b.x - p.x) + (a.y - p.y) * (b.y - p.y)) /
            (u * v || 1),
        ),
      ),
    );
    return u > 1e-9 && v > 1e-9 && angle > 1e-9 && Math.PI - angle > 1e-9
      ? 1 / Math.tan(angle / 2)
      : 0;
  };
  const factor = k(index);
  const max = factor
    ? Math.min(
        ...[-1, 1].map((d) => {
          const j = (index + d + count) % count;
          return (distance(pts[index], pts[j]) - base[j] * k(j)) / factor;
        }),
      )
    : 0;
  base[index] = Math.max(0, Math.min(value, max));
  return { ...s, cornerRadii: base };
}
export function polygonFillets(s: Shape) {
  const pts = cornerPoints(s);
  const corners = pts.map((p, i) => {
    const prev = pts[(i + pts.length - 1) % pts.length],
      next = pts[(i + 1) % pts.length];
    const l = distance(p, prev),
      n = distance(p, next);
    const u = { x: (prev.x - p.x) / (l || 1), y: (prev.y - p.y) / (l || 1) };
    const v = { x: (next.x - p.x) / (n || 1), y: (next.y - p.y) / (n || 1) };
    const angle = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)));
    const k =
      l > 1e-9 && n > 1e-9 && angle > 1e-9 && Math.PI - angle > 1e-9
        ? 1 / Math.tan(angle / 2)
        : 0;
    return { p, u, v, k, n };
  });
  let max = Infinity;
  corners.forEach((c, i) => {
    const k = c.k + corners[(i + 1) % corners.length].k;
    if (k > 0) max = Math.min(max, c.n / k);
  });
  const uniformRadius = Math.min(s.radius, Number.isFinite(max) ? max : 0);
  let scale = 1;
  corners.forEach((q, j) => {
    const used =
      (s.cornerRadii?.[j] ?? uniformRadius) * q.k +
      (s.cornerRadii?.[(j + 1) % corners.length] ?? uniformRadius) *
        corners[(j + 1) % corners.length].k;
    if (used > q.n) scale = Math.min(scale, q.n / used);
  });
  return {
    max: Number.isFinite(max) ? max : 0,
    corners: corners.map((c, i) => {
      const requested = s.cornerRadii?.[i] ?? uniformRadius;
      const radius = requested * scale;
      const d = radius * c.k;
      const start = { x: c.p.x + c.u.x * d, y: c.p.y + c.u.y * d };
      const end = { x: c.p.x + c.v.x * d, y: c.p.y + c.v.y * d };
      const cross = c.u.x * c.v.y - c.u.y * c.v.x;
      const center = {
        x: start.x - c.u.y * radius * Math.sign(cross),
        y: start.y + c.u.x * radius * Math.sign(cross),
      };
      const angle = Math.atan2(start.y - center.y, start.x - center.x);
      let span = Math.atan2(end.y - center.y, end.x - center.x) - angle;
      span = ((span + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      return { start, end, center, angle, span, radius: c.k ? radius : 0 };
    }),
  };
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
  if (s.kind === "measurement") {
    const g = measurementGeometry(s);
    const dx = point.x - g.middle.x, dy = point.y - g.middle.y;
    const x = dx * Math.cos(g.angle) + dy * Math.sin(g.angle);
    const y = -dx * Math.sin(g.angle) + dy * Math.cos(g.angle);
    return (
      (Math.abs(x) <= g.label.length * g.fontSize * 0.62 / 2 + tolerance &&
        Math.abs(y) <= g.fontSize / 2 + tolerance) ||
      g.lines.some(([a, b]) => distanceToSegment(point, a, b) <= tolerance)
    );
  }
  if (
    s.transform ||
    s.kind === "arc" ||
    isCurve(s) ||
    (isPolygon(s) && s.radius > 0) ||
    !!s.cornerRadii
  )
    return (
      distance(nearestOutline(s, point, tolerance / 32), point) <= tolerance
    );
  const p = rotatePoint(point, localCenter(s), -s.rotation),
    a = s.points[0],
    b = s.points[s.points.length - 1];
  if (s.kind === "circle")
    return Math.abs(distance(p, a) - distance(a, b)) <= tolerance;
  if (s.kind === "ellipse") {
    const rx = Math.abs(b.x - a.x) / 2,
      ry = Math.abs(b.y - a.y) / 2,
      c = localCenter(s);
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
    const c = localCenter(s),
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
export const moveShape = (s: Shape, dx: number, dy: number): Shape =>
  s.transform
    ? transformShape(s, { ...identity(), e: dx, f: dy })
    : {
        ...s,
        points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
export function rotateShape(
  s: Shape,
  degrees: number,
  pivot = center(s),
): Shape {
  if (degrees === 0) return s;
  if (s.transform) {
    const t = (degrees * Math.PI) / 180,
      a = Math.cos(t),
      b = Math.sin(t);
    return transformShape(s, {
      a,
      b,
      c: -b,
      d: a,
      e: pivot.x - a * pivot.x + b * pivot.y,
      f: pivot.y - b * pivot.x - a * pivot.y,
    });
  }
  const next = rotatePoint(localCenter(s), pivot, degrees),
    old = localCenter(s);
  return {
    ...moveShape(s, next.x - old.x, next.y - old.y),
    rotation: s.rotation + degrees,
  };
}
export function scaleShape(s: Shape, factor: number, pivot: Point): Shape {
  if (s.transform || s.kind === "measurement")
    return stretchShape(s, factor, factor, pivot);
  return {
    ...s,
    points: s.points.map((p) => ({
      x: pivot.x + (p.x - pivot.x) * factor,
      y: pivot.y + (p.y - pivot.y) * factor,
    })),
    ...(s.handles
      ? {
          handles: s.handles.map((h) => ({
            incoming: { x: h.incoming.x * factor, y: h.incoming.y * factor },
            outgoing: { x: h.outgoing.x * factor, y: h.outgoing.y * factor },
          })),
        }
      : {}),
    radius: s.radius * factor,
    ...(s.cornerRadii
      ? { cornerRadii: s.cornerRadii.map((r) => r * factor) }
      : {}),
  };
}
export function anchors(s: Shape): Point[] {
  if (s.transform)
    return anchors({ ...s, transform: undefined }).map((p) =>
      applyMatrix(s.transform!, p),
    );
  if (s.kind === "arc")
    return [localCenter(s), arcPoint(s, 0), arcPoint(s, 0.5), arcPoint(s, 1)];
  if ((isPolygon(s) && s.radius > 0) || s.cornerRadii)
    return [
      center(s),
      ...polygonFillets(s)
        .corners.flatMap((q) => [q.start, q.end])
        .map((p) => applyMatrix(shapeMatrix(s), p)),
    ];
  if (isCurve(s))
    return [...worldPoints(s), ...worldCubics(s).map((c) => cubicAt(c, 0.5))];
  const pts = worldPoints(s),
    a = s.points[0],
    b = s.points[s.points.length - 1],
    c = localCenter(s);
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
      ...boundary(s).lines.flat(),
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
  if (s.transform)
    return applyMatrix(
      s.transform,
      arcPoint({ ...s, transform: undefined }, t),
    );
  const c = s.points[0],
    start = worldPoints(s)[1],
    angle =
      Math.atan2(start.y - c.y, start.x - c.x) +
      (((s.sweep ?? 0) * Math.PI) / 180) * t,
    r = distance(c, start);
  return { x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) };
}
export function onArc(s: Shape, p: Point): boolean {
  if (s.transform)
    return onArc(
      { ...s, transform: undefined },
      applyMatrix(inverse(s.transform), p),
    );
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
  if (s.transform)
    return contains(
      { ...s, transform: undefined },
      applyMatrix(inverse(s.transform), p),
    );
  const q = rotatePoint(p, localCenter(s), -s.rotation),
    a = s.points[0],
    b = s.points[1],
    c = localCenter(s);
  if (s.kind === "circle") return distance(q, a) <= distance(a, b);
  if (s.kind === "ellipse")
    return (
      ((q.x - c.x) / (Math.abs(b.x - a.x) / 2)) ** 2 +
        ((q.y - c.y) / (Math.abs(b.y - a.y) / 2)) ** 2 <=
      1
    );
  if (s.kind === "rectangle" && !s.cornerRadii) {
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
    (s.kind === "rectangle" && !!s.cornerRadii) ||
    (s.kind === "polyline" && distance(a, s.points[s.points.length - 1]) < 1e-9)
  ) {
    const polygon =
      s.radius > 0 || s.cornerRadii
        ? polygonFillets(s).corners.flatMap((c) =>
            c.radius
              ? Array.from({ length: 65 }, (_, i) => ({
                  x:
                    c.center.x +
                    c.radius * Math.cos(c.angle + (c.span * i) / 64),
                  y:
                    c.center.y +
                    c.radius * Math.sin(c.angle + (c.span * i) / 64),
                }))
              : [c.start],
          )
        : s.points;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const u = polygon[i],
        v = polygon[j];
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
export function boundary(s: Shape): {
  lines: [Point, Point][];
  curves: Curve[];
} {
  if (s.kind === "measurement") return { lines: measurementGeometry(s).lines, curves: [] };
  if (s.transform) {
    const m = s.transform,
      q = boundary({ ...s, transform: undefined }),
      vector = (p: Point) => ({
        x: m.a * p.x + m.c * p.y,
        y: m.b * p.x + m.d * p.y,
      });
    return {
      lines: q.lines.map(([a, b]) => [applyMatrix(m, a), applyMatrix(m, b)]),
      curves: q.curves.map((c) => ({
        ...c,
        c: applyMatrix(m, c.c),
        u: vector(c.u),
        v: vector(c.v),
      })),
    };
  }
  const a = s.points[0],
    b = s.points[s.points.length - 1],
    c = localCenter(s),
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
  else if (s.kind === "rectangle" && !s.cornerRadii) {
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
  } else if ((isPolygon(s) && s.radius > 0) || s.cornerRadii) {
    const corners = polygonFillets(s).corners;
    corners.forEach((q, i) => {
      lines.push([
        world(corners[(i + corners.length - 1) % corners.length].end),
        world(q.start),
      ]);
      if (q.radius > 0) curve(q.center, q.radius, q.radius, q.angle, q.span);
    });
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
function curveBoundary(s: Shape, tolerance: number) {
  const lines: [Point, Point][] = [];
  for (const c of worldCubics(s)) {
    const pts = flattenCubic(c, tolerance);
    pts.slice(1).forEach((p, i) => lines.push([pts[i], p]));
  }
  return { lines, curves: [] as Curve[] };
}
export function worldCubics(s: Shape): Cubic[] {
  const m = shapeMatrix(s);
  return cubicSegments(s).map((c) => c.map((p) => applyMatrix(m, p)) as Cubic);
}
export function outlineBounds(s: Shape): Point[] {
  if (s.kind === "measurement") {
    const g = measurementGeometry(s);
    return [...g.lines.flat(), ...g.labelBounds];
  }
  if (isCurve(s)) return worldCubics(s).flatMap(cubicExtrema);
  const q = boundary(s);
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
export function nearestOutline(s: Shape, p: Point, tolerance = 0.001): Point {
  const q = isCurve(s) ? curveBoundary(s, tolerance) : boundary(s);
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
export function intersectsBox(s: Shape, b: Bounds, tolerance = 0.001): boolean {
  const inside = (p: Point) =>
    p.x >= b.x - 1e-9 &&
    p.x <= b.x + b.width + 1e-9 &&
    p.y >= b.y - 1e-9 &&
    p.y <= b.y + b.height + 1e-9;
  const q = isCurve(s) ? curveBoundary(s, tolerance) : boundary(s);
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
