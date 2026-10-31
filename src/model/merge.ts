import { cubicSegments, isCurve, type Cubic } from "./curves";
import { boundary, distance, shapeMatrix, applyMatrix } from "./geometry";
import type { Shape, Point } from "./project";
const eps = 1e-7;
const same = (a: Point, b: Point) => distance(a, b) < eps;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
export function mergeShapes(shapes: Shape[]): Shape | null {
  if (shapes.length >= 2 && shapes.every(isCurve)) return mergeCurves(shapes);
  if (
    shapes.length < 2 ||
    shapes.some(
      (s) =>
        !["line", "polyline", "rectangle"].includes(s.kind) ||
        s.radius ||
        s.cornerRadii?.some(Boolean) ||
        s.stitchOnly,
    )
  )
    return null;
  const paths = shapes.map((s) => boundary(s).lines);
  if (paths.some((p) => !p.length)) return null;
  const closed = paths.map((p) => same(p[0][0], p.at(-1)![1]));
  if (closed.some(Boolean) && !closed.every(Boolean)) return null;
  let edges = paths.flat();
  if (closed.every(Boolean)) {
    const inside = (p: Point, polygon: [Point, Point][]) => {
      let hit = false;
      for (const [a, b] of polygon)
        if (
          a.y > p.y !== b.y > p.y &&
          p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
        )
          hit = !hit;
      return hit;
    };
    edges = edges.flatMap(([a, b]) => {
      const v = sub(b, a),
        cuts = [0, 1];
      for (const [c, d] of edges) {
        const w = sub(d, c),
          den = cross(v, w),
          q = sub(c, a);
        if (Math.abs(den) > eps) {
          const t = cross(q, w) / den,
            u = cross(q, v) / den;
          if (t > eps && t < 1 - eps && u >= -eps && u <= 1 + eps) cuts.push(t);
        } else
          for (const p of [c, d]) {
            const t =
              ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / (v.x * v.x + v.y * v.y);
            if (Math.abs(cross(sub(p, a), v)) < eps && t > eps && t < 1 - eps)
              cuts.push(t);
          }
      }
      cuts.sort((x, y) => x - y);
      const at = (t: number) => ({ x: a.x + t * v.x, y: a.y + t * v.y });
      return cuts.slice(1).flatMap((t, i): [Point, Point][] => {
        const start = at(cuts[i]),
          end = at(t),
          len = distance(start, end);
        if (len < eps) return [];
        const mid = at((cuts[i] + t) / 2),
          offset = eps * 4;
        const left = {
          x: mid.x - (v.y / Math.hypot(v.x, v.y)) * offset,
          y: mid.y + (v.x / Math.hypot(v.x, v.y)) * offset,
        };
        const right = { x: 2 * mid.x - left.x, y: 2 * mid.y - left.y };
        const l = paths.some((p) => inside(left, p)),
          r = paths.some((p) => inside(right, p));
        return l === r ? [] : [l ? [start, end] : [end, start]];
      });
    });
    edges = edges.filter(
      ([a, b], i) =>
        !edges.slice(0, i).some(([c, d]) => same(a, c) && same(b, d)),
    );
  }
  if (!edges.length) return null;
  const remaining = [...edges];
  const endpoints = remaining.flat();
  if (endpoints.some((p) => endpoints.filter((q) => same(p, q)).length > 2))
    return null;
  const loose = endpoints.find(
    (p) => endpoints.filter((q) => same(p, q)).length === 1,
  );
  const points = [loose ?? remaining[0][0]];
  while (remaining.length) {
    const p = points.at(-1)!,
      i = remaining.findIndex(([a, b]) => same(a, p) || same(b, p));
    if (i < 0) return null;
    const [a, b] = remaining.splice(i, 1)[0];
    points.push(same(a, p) ? b : a);
  }
  if (closed.every(Boolean) && !same(points[0], points.at(-1)!)) return null;
  for (let i = 0; i < points.length - 1; i++)
    for (let j = i + 2; j < points.length - 1; j++) {
      const a = points[i],
        b = points[i + 1],
        c = points[j],
        d = points[j + 1];
      const v = sub(b, a),
        w = sub(d, c),
        den = cross(v, w);
      if (Math.abs(den) > eps) {
        const t = cross(sub(c, a), w) / den,
          u = cross(sub(c, a), v) / den;
        if (t > eps && t < 1 - eps && u > eps && u < 1 - eps) return null;
      }
    }
  return {
    ...shapes[0],
    kind: "polyline",
    points,
    rotation: 0,
    radius: 0,
    transform: undefined,
    cornerRadii: undefined,
  };
}

function mergeCurves(shapes: Shape[]): Shape | null {
  if (shapes.some((s) => s.stitchOnly)) return null;
  const paths = shapes.map((s) =>
    cubicSegments(s).map(
      (c) => c.map((p) => applyMatrix(shapeMatrix(s), p)) as Cubic,
    ),
  );
  if (paths.some((p) => !p.length || same(p[0][0], p.at(-1)![3]))) return null;
  const endpoints = paths.flatMap((p) => [p[0][0], p.at(-1)![3]]);
  if (endpoints.some((p) => endpoints.filter((q) => same(p, q)).length > 2))
    return null;
  const loose = endpoints.filter(
    (p) => endpoints.filter((q) => same(p, q)).length === 1,
  );
  if (loose.length !== 2) return null;
  const remaining = [...paths],
    joined: Cubic[] = [];
  let end = loose[0];
  while (remaining.length) {
    const i = remaining.findIndex(
      (p) => same(p[0][0], end) || same(p.at(-1)![3], end),
    );
    if (i < 0) return null;
    let path = remaining.splice(i, 1)[0];
    if (!same(path[0][0], end))
      path = [...path].reverse().map((c) => [c[3], c[2], c[1], c[0]]);
    if (joined.length) {
      const old = path[0][0];
      const canonical = endpoints.find((p) => same(p, old))!;
      const previous = joined.at(-1)!;
      previous[2] = {
        x: previous[2].x + canonical.x - previous[3].x,
        y: previous[2].y + canonical.y - previous[3].y,
      };
      previous[3] = canonical;
      path[0][1] = {
        x: path[0][1].x + canonical.x - old.x,
        y: path[0][1].y + canonical.y - old.y,
      };
      path[0][0] = canonical;
    }
    joined.push(...path);
    end = path.at(-1)![3];
  }
  const points = [joined[0][0], ...joined.map((c) => c[3])];
  const handles = points.map((p, i) => ({
    incoming: i ? sub(joined[i - 1][2], p) : { x: 0, y: 0 },
    outgoing: i < joined.length ? sub(joined[i][1], p) : { x: 0, y: 0 },
  }));
  return {
    ...shapes[0],
    kind: "control-curve",
    points,
    handles,
    rotation: 0,
    radius: 0,
    transform: undefined,
    cornerRadii: undefined,
  };
}
