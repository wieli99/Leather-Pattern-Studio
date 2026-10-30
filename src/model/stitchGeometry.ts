import type { StitchGroup as CoreStitchGroup } from "../generated/StitchGroup";
import {
  applyMatrix,
  shapeMatrix,
  polygonFillets,
  isPolygon,
  boundary,
  worldCubics,
  worldPoints,
  distance,
  distanceToSegment,
} from "./geometry";
import { cubicAt, isCurve } from "./curves";
import type { Point, Shape, Doc } from "./project";
import {
  validateStitchSettings,
  stitchDistances,
  type StitchSettings,
} from "./stitch";
export type StitchGroup = Omit<CoreStitchGroup, "side" | "settings"> & {
  side: 1 | -1;
  settings: StitchSettings;
};
export type StitchEdge = { key: string; points: Point[] };
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export function stitchClosed(s: Shape) {
  return (
    ["rectangle", "circle", "ellipse"].includes(s.kind) ||
    (["polyline", "curve", "control-curve"].includes(s.kind) &&
      distance(s.points[0], s.points.at(-1)!) < 1e-9) ||
    (s.kind === "arc" && Math.abs(s.sweep ?? 0) === 360)
  );
}
function sample(at: (t: number) => Point): Point[] {
  const result: Point[] = [at(0)];
  function visit(t: number, u: number, a: Point, b: Point, depth: number) {
    const mid = (t + u) / 2,
      p = at(mid),
      q = at((3 * t + u) / 4),
      r = at((t + 3 * u) / 4);
    if (
      depth < 20 &&
      (distance(p, lerp(a, b, 0.5)) > 0.00005 ||
        distance(q, lerp(a, b, 0.25)) > 0.00005 ||
        distance(r, lerp(a, b, 0.75)) > 0.00005)
    ) {
      visit(t, mid, a, p, depth + 1);
      visit(mid, u, p, b, depth + 1);
    } else result.push(b);
    if (result.length > 200000) throw Error("Stitch geometry is too complex.");
  }
  for (let i = 0; i < 16; i++)
    visit(i / 16, (i + 1) / 16, at(i / 16), at((i + 1) / 16), 0);
  return result;
}
const edgeCache = new WeakMap<Shape, StitchEdge[]>();
export function stitchEdges(s: Shape): StitchEdge[] {
  const cached = edgeCache.get(s);
  if (cached) return cached;
  if (s.kind === "text") return [];
  const prefix = `${s.kind}:${s.points.length}:`;
  const edges: StitchEdge[] = [];
  const add = (key: string, points: Point[]) => {
    if (points.some((p) => distance(p, points[0]) > 1e-9))
      edges.push({ key: prefix + key, points });
  };
  if (isCurve(s))
    worldCubics(s).forEach((c, i) =>
      add(
        `edge:${i}`,
        sample((t) => cubicAt(c, t)),
      ),
    );
  else if (s.kind === "rectangle" || isPolygon(s)) {
    const corners = polygonFillets(s).corners,
      m = shapeMatrix(s);
    corners.forEach((c, i) => {
      add(`edge:${i}`, [
        applyMatrix(m, corners[(i + corners.length - 1) % corners.length].end),
        applyMatrix(m, c.start),
      ]);
      if (c.radius > 0)
        add(
          `corner:${i}`,
          sample((t) =>
            applyMatrix(m, {
              x: c.center.x + c.radius * Math.cos(c.angle + c.span * t),
              y: c.center.y + c.radius * Math.sin(c.angle + c.span * t),
            }),
          ),
        );
    });
  } else if (["circle", "ellipse", "arc"].includes(s.kind)) {
    const q = boundary(s).curves[0];
    if (q)
      add(
        "edge:0",
        sample((t) => {
          const a = q.start + q.span * t;
          return {
            x: q.c.x + q.u.x * Math.cos(a) + q.v.x * Math.sin(a),
            y: q.c.y + q.u.y * Math.cos(a) + q.v.y * Math.sin(a),
          };
        }),
      );
  } else {
    const pts = worldPoints(s);
    pts.slice(1).forEach((p, i) => add(`edge:${i}`, [pts[i], p]));
  }
  edgeCache.set(s, edges);
  return edges;
}
function signedArea(edges: StitchEdge[]) {
  return (
    edges.reduce(
      (sum, e) =>
        sum +
        e.points.slice(1).reduce((v, p, i) => v + cross(e.points[i], p), 0),
      0,
    ) / 2
  );
}
/** Convert a source-relative side to world space (and vice versa under reflection). */
export function worldStitchSide(shape: Shape, side: 1 | -1): 1 | -1 {
  const m = shapeMatrix(shape);
  return m.a * m.d - m.b * m.c < 0 ? (side === 1 ? -1 : 1) : side;
}
export function insideStitchSide(s: Shape): 1 | -1 {
  return signedArea(stitchEdges(s)) >= 0 ? 1 : -1;
}
export function orderStitchEdges(
  s: Shape,
  keys: string[],
  seam?: string,
): string[] {
  const all = stitchEdges(s).map((e) => e.key),
    set = new Set(keys);
  if (set.size !== keys.length || keys.some((k) => !all.includes(k)))
    throw Error("Stitch source edge no longer exists.");
  if (keys.length === all.length && stitchClosed(s)) {
    const i = all.indexOf(seam ?? keys[0]);
    return [...all.slice(i), ...all.slice(0, i)];
  }
  const start = all.findIndex(
    (k, i) =>
      set.has(k) &&
      (!set.has(all[(i + all.length - 1) % all.length]) ||
        (!stitchClosed(s) && i === 0)),
  );
  if (start < 0) throw Error("Select connected stitch lines.");
  const ordered: string[] = [];
  for (let j = 0; j < all.length; j++) {
    const i = (start + j) % all.length;
    if (!set.has(all[i])) break;
    ordered.push(all[i]);
    if (!stitchClosed(s) && i === all.length - 1) break;
  }
  if (ordered.length !== keys.length)
    throw Error("Select connected stitch lines on the same shape.");
  return ordered;
}
function offset(points: Point[], inset: number, side: number): Point[] {
  const dirs = points.slice(1).map((p, i) => {
    const d = sub(p, points[i]),
      l = Math.hypot(d.x, d.y);
    return { x: d.x / l, y: d.y / l };
  });
  return points.map((p, i) => {
    let a = dirs[Math.max(0, i - 1)],
      b = dirs[Math.min(i, dirs.length - 1)];
    if (dirs.length > 1 && (i === 0 || i === points.length - 1)) {
      const first = i === 0,
        j = first ? 0 : dirs.length - 1,
        k = first ? 1 : dirs.length - 2;
      const l = distance(points[j], points[j + 1]),
        m = distance(points[k], points[k + 1]),
        t = l / (l + m);
      const x = dirs[j].x + (dirs[j].x - dirs[k].x) * t,
        y = dirs[j].y + (dirs[j].y - dirs[k].y) * t,
        n = Math.hypot(x, y);
      a = b = { x: x / n, y: y / n };
    }
    const nx = -(a.y + b.y) * side,
      ny = (a.x + b.x) * side,
      den = 1 + a.x * b.x + a.y * b.y;
    if (den < 1e-8) throw Error("Inset folds back at a cusp.");
    const delta = { x: (nx * inset) / den, y: (ny * inset) / den };
    if (Math.hypot(delta.x, delta.y) > 4 * inset + 1e-7)
      throw Error("Inset produces an excessive miter.");
    return { x: p.x + delta.x, y: p.y + delta.y };
  });
}
function intersect(a: Point, b: Point, c: Point, d: Point): Point | undefined {
  const u = sub(b, a),
    v = sub(d, c),
    den = cross(u, v);
  if (Math.abs(den) < 1e-12) return;
  const t = cross(sub(c, a), v) / den;
  return { x: a.x + t * u.x, y: a.y + t * u.y };
}
function crossing(paths: Point[][]): boolean {
  type Segment = {
    a: Point;
    b: Point;
    path: number;
    index: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  const segments: Segment[] = paths.flatMap((pts, path) =>
    pts.slice(1).map((b, index) => {
      const a = pts[index];
      return {
        a,
        b,
        path,
        index,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y),
      };
    }),
  );
  segments.sort((a, b) => a.minX - b.minX);
  let active: Segment[] = [];
  for (const seg of segments) {
    active = active.filter((other) => other.maxX >= seg.minX - 1e-9);
    for (const other of active) {
      if (paths.length > 1 && seg.path === other.path) continue;
      if (
        seg.path === other.path &&
        (Math.abs(seg.index - other.index) <= 1 ||
          (Math.abs(seg.index - other.index) === paths[seg.path].length - 2 &&
            distance(paths[seg.path][0], paths[seg.path].at(-1)!) < 1e-7))
      )
        continue;
      if (other.maxY < seg.minY - 1e-9 || other.minY > seg.maxY + 1e-9)
        continue;
      const u = sub(seg.b, seg.a),
        v = sub(other.b, other.a),
        den = cross(u, v);
      if (Math.abs(den) < 1e-12) continue;
      const w = sub(other.a, seg.a),
        t = cross(w, v) / den,
        q = cross(w, u) / den;
      // An unmerged edge offset can end on a neighboring boundary edge.
      // Only the overall path endpoints may touch; interior crossings remain invalid.
      if (paths.length > 1) {
        const stitch = seg.path === 0 ? seg : other,
          parameter = seg.path === 0 ? t : q;
        if (
          (stitch.index === 0 && Math.abs(parameter) < 1e-8) ||
          (stitch.index === paths[0].length - 2 &&
            Math.abs(parameter - 1) < 1e-8)
        )
          continue;
      }
      if (t >= -1e-8 && t <= 1 + 1e-8 && q >= -1e-8 && q <= 1 + 1e-8)
        return true;
    }
    active.push(seg);
  }
  return false;
}
function pointInside(points: Point[], p: Point): boolean {
  if (
    points.some(
      (a, i) => i > 0 && distanceToSegment(p, points[i - 1], a) < 1e-7,
    )
  )
    return true;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

type Geometry = ReturnType<typeof computeStitchGeometry>;
const geometryCache = new WeakMap<Shape, Map<string, Geometry | Error>>();
export function stitchGeometry(s: Shape, g: StitchGroup): Geometry {
  let cache = geometryCache.get(s);
  if (!cache) {
    cache = new Map();
    geometryCache.set(s, cache);
  }
  const key = JSON.stringify([g.edges, g.side, g.settings, g.closed]);
  const cached = cache.get(key);
  if (cached instanceof Error) throw cached;
  if (cached) return cached;
  try {
    const result = computeStitchGeometry(s, g);
    if (cache.size >= 128) cache.clear();
    cache.set(key, result);
    return result;
  } catch (error) {
    if (error instanceof Error) cache.set(key, error);
    throw error;
  }
}
function computeStitchGeometry(s: Shape, g: StitchGroup) {
  validateStitchSettings(g.settings);
  const all = stitchEdges(s),
    keys = orderStitchEdges(s, g.edges, g.edges[0]);
  if (keys.some((k, i) => k !== g.edges[i]))
    throw Error("Invalid stitch edge order.");
  const side = stitchClosed(s)
    ? insideStitchSide(s)
    : worldStitchSide(s, g.side);
  const parts = keys.map((key) => {
    const e = all.find((e) => e.key === key)!;
    return {
      original: e.points,
      points: offset(e.points, g.settings.inset, side),
    };
  });
  // Terminal sharp corners use the same inset intersection as a merged join.
  // Neighbor offsets are construction geometry, not new stitch attachments.
  if (stitchClosed(s)) {
    const trim = (first: boolean) => {
      const part = first ? parts[0] : parts.at(-1)!;
      const index = all.findIndex(
        (e) => e.key === (first ? keys[0] : keys.at(-1)!),
      );
      const neighbor =
        all[(index + (first ? -1 : 1) + all.length) % all.length];
      if (part.original.length !== 2 || neighbor.points.length !== 2) return;
      const adjacent = offset(neighbor.points, g.settings.inset, side);
      const a = part.points[0],
        b = part.points.at(-1)!;
      const joined = intersect(a, b, adjacent[0], adjacent.at(-1)!);
      if (joined) part.points[first ? 0 : part.points.length - 1] = joined;
    };
    trim(true);
    trim(false);
  }
  const closed = g.closed;
  const joinClosed = closed || (stitchClosed(s) && keys.length === all.length);
  for (let i = 1; i < parts.length + (joinClosed ? 1 : 0); i++) {
    const a = parts[(i - 1) % parts.length].points,
      b = parts[i % parts.length].points;
    if (distance(a.at(-1)!, b[0]) < 0.0002) {
      const p = lerp(a.at(-1)!, b[0], 0.5);
      a[a.length - 1] = p;
      b[0] = p;
      continue;
    }
    const p = intersect(a.at(-2)!, a.at(-1)!, b[0], b[1]);
    const source = parts[i % parts.length].original[0];
    if (
      !p ||
      (!stitchClosed(s) && distance(p, source) > 4 * g.settings.inset + 0.001)
    )
      throw Error("Stitch paths cannot form a valid miter join.");
    a[a.length - 1] = p;
    b[0] = p;
  }
  // Inward offsets must retain forward travel; collapse reverses the path.
  for (const part of parts)
    for (let i = 1; i < part.points.length; i++) {
      const a = sub(part.points[i], part.points[i - 1]),
        b = sub(part.original[i], part.original[i - 1]);
      if (a.x * b.x + a.y * b.y <= 0)
        throw Error("Inset collapses this edge. Reduce the inset.");
    }
  const points = parts.flatMap((p, i) => (i ? p.points.slice(1) : p.points));
  if (crossing([points])) throw Error("Inset stitch path intersects itself.");
  if (stitchClosed(s) && g.settings.inset > 0) {
    const outline = all.flatMap((e, i) => (i ? e.points.slice(1) : e.points));
    if (!pointInside(outline, points[0]) || crossing([points, outline]))
      throw Error("Inset leaves the inside of the source shape.");
  }
  const cumulative = [0];
  points
    .slice(1)
    .forEach((p, i) => cumulative.push(cumulative[i] + distance(p, points[i])));
  const length = cumulative.at(-1)!;
  const distances = stitchDistances(length, g.settings, closed);
  let cursor = 1;
  const holes = distances.map((d) => {
    while (cursor > 1 && cumulative[cursor - 1] > d) cursor--;
    while (cursor < cumulative.length - 1 && cumulative[cursor] < d) cursor++;
    const a = points[cursor - 1],
      b = points[cursor],
      span = cumulative[cursor] - cumulative[cursor - 1];
    return {
      point: lerp(a, b, span ? (d - cumulative[cursor - 1]) / span : 0),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  });
  if (holes.length > 1 && distance(holes[0].point, holes.at(-1)!.point) < 1e-7)
    holes.pop();
  const start = g.settings.startClearance ?? 0,
    end = g.settings.endClearance ?? 0;
  const at = (d: number) => {
    let i = 1;
    while (i < cumulative.length - 1 && cumulative[i] < d) i++;
    return lerp(
      points[i - 1],
      points[i],
      (d - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1]),
    );
  };
  const visible =
    start || end
      ? [
          at(start),
          ...points.filter(
            (_, i) => cumulative[i] > start && cumulative[i] < length - end,
          ),
          at(length - end),
        ]
      : points;
  return { points: visible, holes, length, closed: closed && !start && !end };
}
export function validateStitchGroups(
  input: unknown,
  shapes: Shape[],
): StitchGroup[] {
  if (!Array.isArray(input) || input.length > 10000)
    throw Error("Invalid stitch groups.");
  const ids = new Set<string>(),
    owned = new Set<string>();
  return input.map((g) => {
    if (
      !g ||
      typeof g.id !== "string" ||
      !g.id ||
      ids.has(g.id) ||
      typeof g.shapeId !== "string" ||
      !Array.isArray(g.edges) ||
      !g.edges.length ||
      g.edges.length > 20000 ||
      ![1, -1].includes(g.side) ||
      typeof g.closed !== "boolean" ||
      !g.settings
    )
      throw Error("Invalid stitch group.");
    ids.add(g.id);
    validateStitchSettings(g.settings);
    const s = shapes.find((s) => s.id === g.shapeId);
    if (!s || s.kind === "text") throw Error("Missing stitch parent.");
    const keys = orderStitchEdges(s, g.edges, g.edges[0]);
    if (
      keys.some((k, i) => k !== g.edges[i]) ||
      (g.closed && (!stitchClosed(s) || keys.length !== stitchEdges(s).length))
    )
      throw Error("Invalid stitch topology.");
    for (const key of keys) {
      const id = JSON.stringify([g.shapeId, key]);
      if (owned.has(id)) throw Error("An edge can only have one stitch line.");
      owned.add(id);
    }
    return {
      id: g.id,
      shapeId: g.shapeId,
      edges: [...keys],
      side: g.side,
      closed: g.closed,
      settings: {
        ...(g.settings.roundDiameter !== undefined
          ? { roundDiameter: g.settings.roundDiameter }
          : {}),
        ...(g.settings.flatLength !== undefined
          ? { flatLength: g.settings.flatLength }
          : {}),
        startClearance: g.settings.startClearance ?? 0,
        endClearance: g.settings.endClearance ?? 0,
        style: g.settings.style,
        spacing: g.settings.spacing,
        inset: g.settings.inset,
        alignment: g.settings.alignment,
      },
    };
  });
}
export const anchorReplacements = new WeakMap<Shape, Map<string, string[]>>();

export function reconcileStitches(doc: Doc, previous?: Doc): Doc {
  const stitchGroups: StitchGroup[] = [];
  for (const original of doc.stitchGroups ?? []) {
    let g = original;
    const s = doc.shapes.find((s) => s.id === g.shapeId);
    if (!s) continue;
    const old = previous?.shapes.find((shape) => shape.id === s.id);
    const replacements =
      s.stitchOnly &&
      old &&
      (old.kind !== s.kind || old.points.length !== s.points.length)
        ? anchorReplacements.get(s)
        : undefined;
    if (replacements) {
      g = {
        ...g,
        edges: g.edges.flatMap((key) => replacements.get(key) ?? [key]),
      };
    } else if (
      old &&
      (old.kind !== s.kind || old.points.length !== s.points.length)
    ) {
      const before = stitchEdges(old),
        after = stitchEdges(s);
      const mapped = new Map(
        before.map((edge) => [
          edge.key,
          after.find(
            (e) =>
              distance(e.points[0], edge.points[0]) < 1e-7 &&
              distance(e.points.at(-1)!, edge.points.at(-1)!) < 1e-7,
          )?.key,
        ]),
      );
      g = {
        ...g,
        edges: g.edges.map((key) => mapped.get(key) ?? `removed:${key}`),
      };
    }
    // A new fillet replaces a junction already spanned by this group.
    // Never claim an arc that existed before the edit or join separate groups.
    if (old && old.kind === s.kind && old.points.length === s.points.length) {
      const before = stitchEdges(old).map((e) => e.key),
        after = stitchEdges(s).map((e) => e.key);
      const expanded: string[] = [];
      g.edges.forEach((key, i) => {
        expanded.push(key);
        const next = g.edges[(i + 1) % g.edges.length];
        if (i === g.edges.length - 1 && !g.closed) return;
        const a = before.indexOf(key),
          b = before.indexOf(next),
          current = after.indexOf(key);
        if (
          a < 0 ||
          b < 0 ||
          current < 0 ||
          !after.includes(next) ||
          before[(a + 1) % before.length] !== next
        )
          return;
        const arc = after[(current + 1) % after.length];
        if (
          arc?.includes(":corner:") &&
          !before.includes(arc) &&
          after[(current + 2) % after.length] === next
        )
          expanded.push(arc);
      });
      g = { ...g, edges: expanded };
    }
    const all = stitchEdges(s).map((e) => e.key),
      alive = new Set(g.edges.filter((k) => all.includes(k)));
    const runs: string[][] = [];
    let run: string[] = [];
    for (const key of g.edges) {
      if (!alive.has(key)) {
        if (run.length) runs.push(run);
        run = [];
        continue;
      }
      if (run.length) {
        const prev = all.indexOf(run.at(-1)!);
        const next = all.indexOf(key);
        if (
          next !== prev + 1 &&
          !(stitchClosed(s) && prev === all.length - 1 && next === 0)
        ) {
          runs.push(run);
          run = [];
        }
      }
      run.push(key);
    }
    if (run.length) runs.push(run);
    if (g.closed && runs.length > 1) {
      const first = all.indexOf(runs[0][0]),
        last = all.indexOf(runs.at(-1)!.at(-1)!);
      if (first === (last + 1) % all.length)
        runs[0] = [...runs.pop()!, ...runs[0]];
    }
    runs.forEach((edges, i) =>
      stitchGroups.push({
        ...g,
        id: i ? crypto.randomUUID() : g.id,
        edges,
        closed: g.closed && edges.length === all.length && stitchClosed(s),
      }),
    );
  }
  return { ...doc, stitchGroups };
}
