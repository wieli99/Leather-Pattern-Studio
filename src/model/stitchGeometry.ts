import type { Cubic } from "./curves";
import { contains } from "./geometry";
import { contourShape } from "./compound";
import { isIndicator } from "./indicators";
import { isClosedShape as stitchClosed } from "./closedShape";
export { stitchClosed };
import type { StitchGroup as CoreStitchGroup } from "../generated/StitchGroup";
import {
  cornerPoints,
  localCenter,
  inverse,
  multiply,
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
/** The shortcut must preserve loops, backtracking, and collinear overshoot. */
function straightCubic(c: Cubic) {
  const v = sub(c[3],c[0]), lengthSquared = v.x*v.x+v.y*v.y;
  const length = Math.sqrt(lengthSquared);
  if (length <= 1e-9) return false;
  return [c[1],c[2]].every(p => {
    const q = sub(p,c[0]), along = q.x*v.x+q.y*v.y;
    return Math.abs(cross(q,v))/length < 1e-9 && along >= 0 && along <= lengthSquared;
  });
}
const edgeCache = new WeakMap<Shape, StitchEdge[]>();
export function stitchEdges(s: Shape): StitchEdge[] {
  const cached = edgeCache.get(s);
  if (cached) return cached;
  if (isIndicator(s.kind) || s.kind === "text" || s.kind === "image" || s.kind === "measurement") return [];
  const prefix = `${s.kind}:${s.kind === "compound" ? s.contours!.flat().length : s.points.length}:`;
  const edges: StitchEdge[] = [];
  const add = (key: string, points: Point[]) => {
    if (points.some((p) => distance(p, points[0]) > 1e-9))
      edges.push({ key: prefix + key, points });
  };
  if (isCurve(s) || s.kind === "compound")
    worldCubics(s).forEach((c, i) =>
      add(
        `edge:${i}`,
        straightCubic(c) ? [c[0],c[3]] : sample((t) => cubicAt(c, t)),
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
/** Extract a defining edge without turning curves into stored sample points. */
export function extractStitchEdge(source: Shape, key: string): Shape {
  const edge = stitchEdges(source).find(e => e.key === key);
  if (!edge) throw Error("Choose an existing source edge.");
  const base = { id: crypto.randomUUID(), name: `${source.name} stitching`, radius: 0, rotation: 0, stitchOnly: true };
  if (stitchEdges(source).length === 1) return { ...source, ...base, radius: source.radius, rotation: source.rotation };
  const index = Number(key.split(":").at(-1));
  if (isCurve(source) || source.kind === "compound") {
    const [a,b,c,d] = worldCubics(source)[index];
    return { ...base, kind: "control-curve", points: [a,d], handles: [{ incoming: {x:0,y:0}, outgoing: sub(b,a) }, { incoming: sub(c,d), outgoing: {x:0,y:0} }] };
  }
  if (key.includes(":corner:")) {
    const corner = polygonFillets(source).corners[index];
    return { ...base, kind: "arc", points: [corner.center,corner.start], sweep: corner.span * 180 / Math.PI, transform: shapeMatrix(source) };
  }
  return { ...base, kind: "line", points: [edge.points[0],edge.points.at(-1)!] };
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
export function stitchRunClosed(s: Shape, keys: string[]) {
  if (!stitchClosed(s)) return false;
  if (s.kind !== "compound") return keys.length === stitchEdges(s).length;
  try { return keys.length === compoundStitchSource(s,keys).shape.points.length - 1; }
  catch { return false; }
}
function compoundStitchSource(s: Shape, keys: string[]) {
  const edges = stitchEdges(s);
  const indexes = keys.map(key => edges.findIndex(e => e.key === key));
  let offset = 0;
  for (const contour of s.contours!) {
    if (indexes.length && indexes.every(i => i >= offset && i < offset + contour.length)) {
      const shape = {...contourShape(s,contour), rotation:0, transform:shapeMatrix(s)};
      return { shape, offset, keys: indexes.map(i => `control-curve:${shape.points.length}:edge:${i-offset}`) };
    }
    offset += contour.length;
  }
  throw Error("Select connected stitch lines on one contour.");
}
export function orderStitchEdges(
  s: Shape,
  keys: string[],
  seam?: string,
): string[] {
  if (s.kind === "compound") {
    const part = compoundStitchSource(s,keys);
    const seamIndex = keys.indexOf(seam ?? keys[0]);
    const ordered = orderStitchEdges(part.shape,part.keys,part.keys[seamIndex]);
    return ordered.map(key => stitchEdges(s)[part.offset + Number(key.split(":").at(-1))].key);
  }
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
export function resolveStitchRun(s: Shape, g: StitchGroup, groups: StitchGroup[], seen = new Set<string>()): StitchGroup {
  if (!g.continuation) return g;
  if (seen.has(g.id)) throw Error("Stitch continuations cannot form a cycle.");
  seen.add(g.id);
  const previous = groups.find(p => p.id === g.continuation!.previousId);
  if (!previous || previous.shapeId !== g.shapeId || previous.side !== g.side || JSON.stringify(previous.edges) !== JSON.stringify(g.edges)) throw Error("Continuation requires sections on the same path and side.");
  const resolved = resolveStitchRun(s, previous, groups, seen);
  const geometry = stitchGeometry(s, resolved);
  const start = geometry.distances.at(-1)! + g.continuation.gap;
  return { ...g, continuation: undefined, settings: { ...g.settings, alignment: "start", startClearance: start } };
}
export function stitchGeometry(s: Shape, g: StitchGroup, groups?: StitchGroup[]): Geometry {
  if (groups && g.continuation) g = resolveStitchRun(s, g, groups);
  if (g.holes) {
    const m = shapeMatrix(s), center=localCenter(s);
    const holes = g.holes.map(h => ({ point: applyMatrix(m, {x:h.point.x+center.x,y:h.point.y+center.y}), angle: Math.atan2(m.b * Math.cos(h.angle) + m.d * Math.sin(h.angle), m.a * Math.cos(h.angle) + m.c * Math.sin(h.angle)) }));
    const points = holes.map(h => h.point);
    if (points.length === 1) points.push(points[0]);
    const path=s.stitchParentId ? stitchEdges(s).flatMap((edge,index)=>index ? edge.points.slice(1) : edge.points) : points;
    const cumulative=[0];path.slice(1).forEach((p,index)=>cumulative.push(cumulative[index]+distance(path[index],p)));
    const distances=holes.map((h,index)=>{if(!s.stitchParentId)return cumulative[index];let nearest=Infinity,at=0;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],span=distance(a,b),t=Math.max(0,Math.min(1,((h.point.x-a.x)*(b.x-a.x)+(h.point.y-a.y)*(b.y-a.y))/(span*span || 1))),p={x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)},d=distance(p,h.point);if(d<nearest){nearest=d;at=cumulative[i-1]+t*span;}}return at;});
    return { points,holes,length:cumulative.at(-1) ?? 0,closed:false,distances };
  }
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
function computeStitchGeometry(s: Shape, g: StitchGroup, materialSide = 1) {
  if (s.kind === "compound") {
    const part = compoundStitchSource(s,g.edges);
    // Hole contours reverse material-side inset relative to an isolated outline.
    const edge = stitchEdges(s).find(e => e.key === g.edges[0])!;
    const a = edge.points[0], b = edge.points[1], length = distance(a,b);
    const probe = {x:(a.x+b.x)/2-(b.y-a.y)/length*0.001,y:(a.y+b.y)/2+(b.x-a.x)/length*0.001};
    const leftMaterial = contains(s,probe);
    const partLeft = contains(part.shape,probe);
    return computeStitchGeometry(part.shape,{...g,edges:part.keys},leftMaterial === partLeft ? 1 : -1);
  }
  validateStitchSettings(g.settings);
  const all = stitchEdges(s),
    keys = orderStitchEdges(s, g.edges, g.edges[0]);
  if (keys.some((k, i) => k !== g.edges[i]))
    throw Error("Invalid stitch edge order.");
  const side = stitchClosed(s)
    ? (insideStitchSide(s)*materialSide) as 1 | -1
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
  if (stitchClosed(s) && g.settings.inset > 0 && materialSide > 0) {
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
  const start = g.settings.holeCount != null ? distances[0] : (g.settings.startClearance ?? 0),
    end = g.settings.holeCount != null ? length - distances.at(-1)! : (g.settings.endClearance ?? 0);
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
  return { points: visible, holes, length, distances: distances.slice(0, holes.length), closed: closed && !start && !end && g.settings.holeCount == null };
}
export function validateStitchGroups(
  input: unknown,
  shapes: Shape[],
): StitchGroup[] {
  if (!Array.isArray(input) || input.length > 10000)
    throw Error("Invalid stitch groups.");
  const ids = new Set<string>(),
    owned = new Set<string>();
  const groups: StitchGroup[] = input.map((g) => {
    if (
      !g ||
      typeof g.id !== "string" ||
      !g.id ||
      ids.has(g.id) ||
      typeof g.shapeId !== "string" ||
      !Array.isArray(g.edges) ||
      (!g.edges.length && !g.holes) ||
      g.edges.length > 20000 ||
      ![1, -1].includes(g.side) ||
      typeof g.closed !== "boolean" ||
      !g.settings
    )
      throw Error("Invalid stitch group.");
    ids.add(g.id);
    validateStitchSettings(g.settings);
    if (g.holeOverrides !== undefined) {
      if (!g.holeOverrides || typeof g.holeOverrides !== "object" || Array.isArray(g.holeOverrides)) throw Error("Invalid hole overrides");
      for (const [index, settings] of Object.entries(g.holeOverrides)) {
        if (!/^[1-9][0-9]*$/.test(index) || Number(index) > 100000) throw Error("Invalid hole number");
        validateStitchSettings(settings as StitchSettings);
      }
    }
    const s = shapes.find((s) => s.id === g.shapeId);
    if (!s || isIndicator(s.kind) || s.kind === "text" || s.kind === "image" || s.kind === "measurement") throw Error("Missing stitch parent.");
    const keys = g.holes && !s.stitchParentId ? [] : orderStitchEdges(s, g.edges, g.edges[0]);
    if (
      keys.some((k, i) => k !== g.edges[i]) ||
      (g.closed && (!stitchClosed(s) || keys.length !== (s.kind === "compound" ? compoundStitchSource(s,keys).shape.points.length - 1 : stitchEdges(s).length)))
    )
      throw Error("Invalid stitch topology.");
    for (const key of keys) {
      const id = JSON.stringify([g.shapeId, key]);
      owned.add(id);
    }
    return {
      ...(g.holes ? { holes: g.holes } : {}),
      ...(g.continuation ? { continuation: g.continuation } : {}),
      ...(g.holeOverrides ? { holeOverrides: g.holeOverrides } : {}),
      id: g.id,
      shapeId: g.shapeId,
      edges: [...keys],
      side: g.side,
      closed: g.closed,
      settings: {
        ...(g.settings.holeCount != null ? { holeCount: g.settings.holeCount } : {}),
        ...(g.settings.reversed != null ? { reversed: g.settings.reversed } : {}),
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
  for (const g of groups) {
    if (g.holes && (!Array.isArray(g.holes) || !g.holes.length || g.holes.length > 100000 || g.holes.some(h => !h || !Number.isFinite(h.point?.x) || !Number.isFinite(h.point?.y) || !Number.isFinite(h.angle)))) throw Error("Invalid detached holes");
    const seen = new Set<string>();
    let current = g;
    while (current.continuation) {
      if (seen.has(current.id) || !Number.isFinite(current.continuation.gap) || current.continuation.gap <= 0) throw Error("Invalid stitch continuation");
      seen.add(current.id);
      const previous = groups.find(p => p.id === current.continuation!.previousId);
      if (!previous || previous.shapeId !== current.shapeId || previous.side !== current.side || JSON.stringify(previous.edges) !== JSON.stringify(current.edges)) throw Error("Incompatible stitch continuation");
      current = previous;
    }
  }
  validateRunPositions(groups, shapes, true);
  return groups;
}
/** Invalidated source geometry remains loadable; valid runs must not duplicate holes. */
export function validateRunPositions(groups: StitchGroup[], shapes: Shape[], retainInvalid = false) {
  for (const shape of shapes) {
    const spans:{edges:string[];start:number;end:number}[]=[];
    const positions = new Map<string, { group: StitchGroup; point: Point }[]>();
    for (const run of groups.filter(g => g.shapeId === shape.id && !g.holes)) {
      let geometry: Geometry;
      try { geometry=stitchGeometry(shape,run,groups); }
      catch (error) { if (retainInvalid) continue; throw error; }
      const start=geometry.distances[0],end=geometry.distances.at(-1)!;
      if(!retainInvalid && spans.some(p=>p.edges.some(e=>run.edges.includes(e)) && Math.max(start,p.start)<=Math.min(end,p.end)+1e-6))throw Error("Stitch sections overlap. Reduce the count or adjust their start/gap and end clearance.");
      spans.push({edges:run.edges,start,end});
      for (const hole of geometry.holes) {
        const x=Math.round(hole.point.x*1e6),y=Math.round(hole.point.y*1e6);
        for (let dx=-1;dx<=1;dx++) for (let dy=-1;dy<=1;dy++) {
          const others=positions.get(`${x+dx},${y+dy}`) ?? [];
          if (others.some(p => p.group.id!==run.id && p.group.edges.some(e => run.edges.includes(e)) && distance(p.point,hole.point)<1e-6)) throw Error("Two runs would place a hole at the same position. Adjust the start or continuation gap.");
        }
        const key=`${x},${y}`;
        positions.set(key,[...(positions.get(key) ?? []),{group:run,point:hole.point}]);
      }
    }
  }
}
/** Successors wrap at each contour seam, never into another contour. */
function stitchSuccessors(s: Shape) {
  const keys = stitchEdges(s).map(e => e.key);
  let chains: string[][];
  if (s.kind === "compound") {
    const byIndex = new Map(keys.map(key => [Number(key.split(":").at(-1)),key]));
    let offset = 0;
    chains = s.contours!.map(contour => {
      const chain = contour.flatMap((_,i) => byIndex.has(offset+i) ? [byIndex.get(offset+i)!] : []);
      offset += contour.length;
      return chain;
    });
  } else chains = [keys];
  const successors = new Map<string,string>();
  for (const chain of chains) chain.forEach((key,i) => {
    if (i+1 < chain.length) successors.set(key,chain[i+1]);
    else if (stitchClosed(s)) successors.set(key,chain[0]);
  });
  return successors;
}

export const anchorReplacements = new WeakMap<Shape, Map<string, string[]>>();

export function reconcileStitches(doc: Doc, previous?: Doc): Doc {
  const frame=(s:Shape)=>{
    const m=shapeMatrix(s),center=applyMatrix(m,localCenter(s)),angle=Math.atan2(m.b,m.a),c=Math.cos(angle),sn=Math.sin(angle);
    return {a:c,b:sn,c:-sn,d:c,e:center.x,f:center.y};
  };
  doc={...doc,shapes:doc.shapes.filter(s=>!s.stitchParentId || doc.shapes.some(p=>p.id===s.stitchParentId)).map(shape=>{
    if(!shape.stitchParentId || !previous) return shape;
    const old=previous.shapes.find(s=>s.id===shape.id),before=previous.shapes.find(s=>s.id===shape.stitchParentId),after=doc.shapes.find(s=>s.id===shape.stitchParentId);
    if(!old || !before || !after || JSON.stringify(old)!==JSON.stringify(shape)) return shape;
    const delta=multiply(frame(after),inverse(frame(before)));
    if(Math.abs(delta.a-1)+Math.abs(delta.b)+Math.abs(delta.c)+Math.abs(delta.d-1)+Math.abs(delta.e)+Math.abs(delta.f)<1e-9) return shape;
    return {...shape,rotation:0,transform:multiply(delta,shapeMatrix(shape))};
  })};
  const stitchGroups: StitchGroup[] = [];
  const splitIds = new Set<string>();
  const successors = new Map<Shape,Map<string,string>>();
  for (const original of doc.stitchGroups ?? []) {
    let g = original;
    const s = doc.shapes.find((s) => s.id === g.shapeId);
    if (!s) continue;
    if (g.holes) {
      const old=previous?.shapes.find(p=>p.id===s.id);
      const moved=old && old.points.length===s.points.length && old.points.every((p,index)=>Math.abs((s.points[index].x-p.x)-(s.points[0].x-old.points[0].x))<1e-9 && Math.abs((s.points[index].y-p.y)-(s.points[0].y-old.points[0].y))<1e-9);
      if(s.stitchParentId && old && (!moved || JSON.stringify(old.handles)!==JSON.stringify(s.handles))) g={...g,holes:undefined};
      else { stitchGroups.push(g); continue; }
    }
    const old = previous?.shapes.find((shape) => shape.id === s.id);
    if(old?.kind==="rectangle" && s.kind==="polyline" && s.points.length===5) {
      const corners=cornerPoints(old),base={...old,kind:"polyline" as const,points:[...corners,corners[0]]};
      const before=stitchEdges(old),expanded=stitchEdges(base),after=stitchEdges(s);
      const mapping=new Map(before.map(edge=>{const index=expanded.findIndex(e=>distance(e.points[0],edge.points[0])<1e-6 && distance(e.points.at(-1)!,edge.points.at(-1)!)<1e-6);return [edge.key,index<0 ? [] : [after[index].key]] as const;}));
      anchorReplacements.set(s,mapping);
    }
    const currentKeys = stitchEdges(s).map(e => e.key);
    const topologyChanged = old && (old.kind !== s.kind || old.points.length !== s.points.length ||
      (old.kind === "compound" && s.kind === "compound" &&
        old.contours!.map(c=>c.length).join(",") !== s.contours!.map(c=>c.length).join(",")));
    const replacements = old ? anchorReplacements.get(s) : undefined;
    const alreadyMapped = g.edges.every(key => currentKeys.includes(key));
    if (replacements && !alreadyMapped) {
      g = {
        ...g,
        edges: g.edges.flatMap((key) => replacements.get(key) ?? [key]),
      };
    } else if (old && topologyChanged && !alreadyMapped) {
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
    if (!successors.has(s)) successors.set(s,stitchSuccessors(s));
    const follows = (a: string, b: string) => successors.get(s)!.get(a) === b;
    const runs: string[][] = [];
    let run: string[] = [];
    for (const key of g.edges) {
      if (!alive.has(key)) {
        if (run.length) runs.push(run);
        run = [];
        continue;
      }
      if (run.length && !follows(run.at(-1)!,key)) {
        runs.push(run);
        run = [];
      }
      run.push(key);
    }
    if (run.length) runs.push(run);
    if (g.closed && runs.length > 1 && follows(runs.at(-1)!.at(-1)!,runs[0][0]))
      runs[0] = [...runs.pop()!, ...runs[0]];
    if (runs.length > 1) splitIds.add(g.id);
    runs.forEach((edges, i) =>
      stitchGroups.push({
        ...g,
        id: i ? crypto.randomUUID() : g.id,
        edges,
        closed: g.closed && stitchRunClosed(s,edges),
      }),
    );
  }
  const stitchLinks = (doc.stitchLinks ?? []).map(link => ({
    ...link, members: link.members.filter(id => !splitIds.has(id) && stitchGroups.some(g => g.id === id)),
  })).filter(link => link.members.length >= 2);
  const surviving = stitchGroups.map(g => {
    if (!g.continuation || stitchGroups.some(p => p.id === g.continuation!.previousId)) return g;
    const source = previous?.shapes.find(s => s.id === g.shapeId) ?? doc.shapes.find(s => s.id === g.shapeId)!;
    try { return resolveStitchRun(source,g,previous?.stitchGroups ?? doc.stitchGroups ?? []); }
    catch { return { ...g, continuation: undefined }; }
  });
  return { ...doc, stitchGroups: surviving, stitchLinks, ...(doc.stitchTransfers ? { stitchTransfers: doc.stitchTransfers.filter(t => surviving.some(g => g.id === t.masterId) && doc.shapes.some(s => s.id === t.targetId)) } : {}) };
}
