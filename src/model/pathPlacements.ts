import { flattenOutline } from './flattenOutline';
import type { Point, Shape } from './project';

/** Translate along the path and rotate around the source's world-space center. */
export function pathPlacements(path: Shape, mode: 'spacing' | 'count', value: number, rotate: boolean, pivot: Point = { x: 0, y: 0 }) {
  if (path.kind === 'compound') throw Error('Choose a single continuous outline.');
  if (!Number.isFinite(value) || value <= 0 || (mode === 'count' && !Number.isInteger(value))) throw Error('Enter a positive spacing or whole copy count.');
  const { points, closed } = flattenOutline(path, 0.001);
  if (closed && points.length) points.push(points[0]);
  const segments = points.slice(1).map((p, i) => ({ a: points[i], b: p, length: Math.hypot(p.x-points[i].x, p.y-points[i].y) })).filter(s => s.length > 1e-9);
  const length = segments.reduce((sum, s) => sum+s.length, 0);
  if (!segments.length) throw Error('Choose a path with nonzero length.');
  const count = mode === 'count' ? value : Math.max(0, Math.floor((length + (closed ? -1e-8 : 1e-8))/value));
  if (count > 1000) throw Error('Limit exceeded: choose at most 1,000 new copies.');
  if (!count) throw Error('Spacing exceeds the path length.');
  const start = segments[0].a;
  const initial = Math.atan2(segments[0].b.y-start.y, segments[0].b.x-start.x);
  return Array.from({ length: count }, (_, i) => {
    let d = mode === 'count' ? (i+1)*length/(count+(closed ? 1 : 0)) : (i+1)*value;
    let s = segments[0];
    for (const candidate of segments) {
      s = candidate;
      if (d < s.length) break;
      if (s === segments.at(-1)) break;
      d -= s.length;
    }
    const t = Math.min(1, d/s.length), x = s.a.x+(s.b.x-s.a.x)*t, y = s.a.y+(s.b.y-s.a.y)*t;
    const angle = rotate ? Math.atan2(s.b.y-s.a.y,s.b.x-s.a.x)-initial : 0;
    const a = Math.cos(angle), b = Math.sin(angle), c = -b;
    return { a, b, c, d: a, e: x-start.x+pivot.x-a*pivot.x-c*pivot.y, f: y-start.y+pivot.y-b*pivot.x-a*pivot.y };
  });
}
