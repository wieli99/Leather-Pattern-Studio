import type { Shape } from "./project";
import { isClosedShape } from "./closedShape";
import { stitchEdges } from "./stitchGeometry";

const cache = new WeakMap<Shape, number>();
/** Integrate filled vertical intervals, respecting Canvas's nonzero winding rule.
 * Curved outlines use the shared adaptive stitch sampling (0.00005 mm).
 */
export function shapeArea(shape: Shape): number | null {
  if (!isClosedShape(shape)) return null;
  const cached = cache.get(shape);
  if (cached !== undefined) return cached;
  const segments = stitchEdges(shape).flatMap((edge) =>
    edge.points.slice(1).map((b, i) => ({ a: edge.points[i], b })),
  );
  const xs = segments.flatMap(({ a, b }) => [a.x, b.x]);
  for (let i = 0; i < segments.length; i++) {
    const { a, b } = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const { a: c, b: d } = segments[j];
      if (
        Math.max(a.x, b.x) <= Math.min(c.x, d.x) ||
        Math.max(c.x, d.x) <= Math.min(a.x, b.x)
      )
        continue;
      const ux = b.x - a.x,
        uy = b.y - a.y,
        vx = d.x - c.x,
        vy = d.y - c.y;
      const det = ux * vy - uy * vx;
      if (!det) continue;
      const t = ((c.x - a.x) * vy - (c.y - a.y) * vx) / det;
      const u = ((c.x - a.x) * uy - (c.y - a.y) * ux) / det;
      if (t > 0 && t < 1 && u > 0 && u < 1) xs.push(a.x + t * ux);
    }
  }
  const cuts = [...new Set(xs)].sort((a, b) => a - b);
  let area = 0;
  for (let i = 1; i < cuts.length; i++) {
    const x = (cuts[i - 1] + cuts[i]) / 2;
    const hits = segments
      .filter(({ a, b }) => x > Math.min(a.x, b.x) && x < Math.max(a.x, b.x))
      .map(({ a, b }) => ({
        y: a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x),
        winding: b.x > a.x ? 1 : -1,
      }))
      .sort((a, b) => a.y - b.y);
    let winding = 0;
    for (let j = 0; j + 1 < hits.length; j++) {
      winding += hits[j].winding;
      if (winding)
        area += (hits[j + 1].y - hits[j].y) * (cuts[i] - cuts[i - 1]);
    }
  }
  cache.set(shape, area);
  return area;
}
