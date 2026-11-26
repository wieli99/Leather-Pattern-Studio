import { createId } from "./id";
import { isIndicator } from "./indicators";
import type { Point, Shape } from "./project";
import { boundary, distanceToSegment, worldCubics } from "./geometry";
import { mergeShapes } from "./merge";
import { cubicAt, isCurve, type Cubic } from "./curves";
type Piece = {
  source: Shape;
  selfCrossing?: boolean;
  at: (t: number) => Point;
  shape: (a: number, b: number) => Shape;
};
function split(c: Cubic, t: number): [Cubic, Cubic] {
  const lerp = (a: Point, b: Point): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const a = lerp(c[0], c[1]),
    b = lerp(c[1], c[2]),
    d = lerp(c[2], c[3]);
  const e = lerp(a, b),
    f = lerp(b, d),
    m = lerp(e, f);
  return [
    [c[0], a, e, m],
    [m, f, d, c[3]],
  ];
}
/** A crossing-, corner- or anchor-bounded span of one shape's outline. */
export type SegmentRef = {
  shapeId: string;
  /** Chain parameters: integer part selects the primitive piece, fraction the position on it. */
  lo: number;
  hi: number;
  /** World-space samples of the span, for rendering and box tests. */
  points: Point[];
};
export const segmentKey = (s: Pick<SegmentRef, "shapeId" | "lo" | "hi">) =>
  `${s.shapeId}:${s.lo.toFixed(6)}:${s.hi.toFixed(6)}`;
export const sameSegment = (
  a: Pick<SegmentRef, "shapeId" | "lo" | "hi">,
  b: Pick<SegmentRef, "shapeId" | "lo" | "hi">,
) =>
  a.shapeId === b.shapeId &&
  Math.abs(a.lo - b.lo) < 1e-6 &&
  Math.abs(a.hi - b.hi) < 1e-6;

const splittable = (source: Shape) =>
  !isIndicator(source.kind) &&
  source.kind !== "text" &&
  source.kind !== "measurement";

function piecesOf(source: Shape): Piece[] {
  const pieces: Piece[] = [];
  if (!splittable(source)) return pieces;
  const base = {
    ...source,
    rotation: 0,
    radius: 0,
    cornerRadii: undefined,
    transform: undefined,
    handles: undefined,
    contours: undefined,
    sweep: undefined,
  };
  if (isCurve(source) || source.kind === "compound") {
    for (const c of worldCubics(source))
      pieces.push({
        source,
        selfCrossing: true,
        at: (t) => cubicAt(c, t),
        shape: (a, b) => {
          const q = split(split(c, b)[0], a / b)[1];
          return {
            ...base,
            kind: "control-curve",
            points: [q[0], q[3]],
            handles: [
              {
                incoming: { x: 0, y: 0 },
                outgoing: { x: q[1].x - q[0].x, y: q[1].y - q[0].y },
              },
              {
                incoming: { x: q[2].x - q[3].x, y: q[2].y - q[3].y },
                outgoing: { x: 0, y: 0 },
              },
            ],
          };
        },
      });
  } else {
    const boundaryPieces = boundary(source);
    for (const [a, b] of boundaryPieces.lines) {
      if (distance(a, b) < 1e-10) continue;
      const at = (t: number) => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
      pieces.push({
        source,
        at,
        shape: (a, b) => ({ ...base, kind: "line", points: [at(a), at(b)] }),
      });
    }
    for (const c of boundaryPieces.curves) {
      if (Math.hypot(c.u.x, c.u.y) * Math.hypot(c.v.x, c.v.y) < 1e-15)
        continue;
      const at = (t: number) => {
        const angle = c.start + c.span * t;
        return {
          x: c.c.x + c.u.x * Math.cos(angle) + c.v.x * Math.sin(angle),
          y: c.c.y + c.u.y * Math.cos(angle) + c.v.y * Math.sin(angle),
        };
      };
      pieces.push({
        source,
        at,
        shape: (a, b) => ({
          ...base,
          kind: "arc",
          points: [
            { x: 0, y: 0 },
            {
              x: Math.cos(c.start + c.span * a),
              y: Math.sin(c.start + c.span * a),
            },
          ],
          sweep: (c.span * (b - a) * 180) / Math.PI,
          transform: {
            a: c.u.x,
            b: c.u.y,
            c: c.v.x,
            d: c.v.y,
            e: c.c.x,
            f: c.c.y,
          },
        }),
      });
    }
  }
  // Boundary exposes straight and round pieces separately. Restore traversal order
  // before deciding whether a join is smooth or a trim boundary.
  const ordered: Piece[] = [];
  const pending = [...pieces];
  while (pending.length) {
    let p = pending.shift()!;
    ordered.push(p);
    while (pending.length) {
      const end = p.at(1);
      const i = pending.findIndex((q) => distance(end, q.at(0)) < EPS);
      if (i < 0) break;
      p = pending.splice(i, 1)[0];
      ordered.push(p);
    }
  }
  return ordered;
}

type Layout = {
  ordered: Piece[];
  paths: Sample[][];
  pathBounds: Box[];
  segmentBounds: Box[][];
  trees: BoxTree[];
};
function layout(shapes: Shape[]): Layout {
  const ordered = shapes.flatMap(piecesOf);
  const paths = ordered.map((p) => sample(p));
  const pathBounds = paths.map(bounds);
  const segmentBounds = paths.map((path) =>
    path.slice(1).map((p, i) => bounds([path[i], p])),
  );
  const trees = segmentBounds.map((boxes) =>
    makeTree(boxes.map((box, index) => ({ box, index }))),
  );
  return { ordered, paths, pathBounds, segmentBounds, trees };
}

type Chain = { source: Shape; indices: number[]; count: number; closed: boolean };
const smooth = (a: Piece, b: Piece) => {
  if (distance(a.at(1), b.at(0)) > EPS) return false;
  const u = sub(a.at(1), a.at(1 - 1e-5)),
    v = sub(b.at(1e-5), b.at(0));
  const norm = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  return norm > 0 && (u.x * v.x + u.y * v.y) / norm > 1 - 1e-7;
};
function chainOf(ordered: Piece[], source: Shape): Chain {
  const indices = ordered
    .map((p, i) => (p.source === source ? i : -1))
    .filter((i) => i >= 0);
  const count = indices.length;
  const closed =
    count > 0 &&
    !isCurve(source) &&
    source.kind !== "compound" &&
    smooth(ordered[indices[count - 1]], ordered[indices[0]]);
  return { source, indices, count, closed };
}

/** Sorted, de-duplicated cut parameters bounding the chain's segments. */
function cutsOf({ ordered, paths, pathBounds, segmentBounds, trees }: Layout, chain: Chain) {
  const { source, indices, count, closed } = chain;
  const cuts: number[] = [];
  if (!closed) cuts.push(0, count);
  for (let i = 1; i < count; i++)
    if (
      isCurve(source) || source.kind === "compound" ||
      !smooth(ordered[indices[i - 1]], ordered[indices[i]])
    )
      cuts.push(i);
  // Only compute intersections involving the target object's path. Bounds reject
  // distant candidates before any subdivision-pair work.
  for (let n = 0; n < count; n++) {
    const i = indices[n];
    for (let j = 0; j < ordered.length; j++) {
      if (j < i && ordered[j].source === source) continue;
      if (i === j && !ordered[i].selfCrossing) continue;
      if (!overlap(pathBounds[i], pathBounds[j])) continue;
      if (
        i !== j &&
        [false, true].some((reverse) =>
          [0, 0.25, 0.5, 0.75, 1].every(
            (t) =>
              distance(ordered[i].at(t), ordered[j].at(reverse ? 1 - t : t)) <
              EPS,
          ),
        )
      )
        continue;
      const a = paths[i],
        b = paths[j];
      for (let x = 0; x < a.length - 1; x++)
        for (const y of queryTree(trees[j], segmentBounds[i][x])) {
          if (i === j && y <= x + 1) continue;
          if (!overlap(segmentBounds[i][x], segmentBounds[j][y])) continue;
          const pair = intersection(
            ordered[i],
            ordered[j],
            a[x],
            a[x + 1],
            b[y],
            b[y + 1],
          );
          if (!pair) continue;
          const [t, u] = pair;
          // Adjacent primitives meeting at their shared endpoint aren't crossings.
          if (
            ordered[j].source === source &&
            distance(ordered[i].at(t), ordered[j].at(u)) < EPS &&
            (t < EPS || t > 1 - EPS) &&
            (u < EPS || u > 1 - EPS)
          )
            continue;
          cuts.push(n + t);
          const m = indices.indexOf(j);
          if (m >= 0) cuts.push(m + u);
        }
    }
  }
  if (closed) {
    // A crossing on a closed seam can appear at both 0 and count.
    const wrapped = cuts.map((t) => ((t % count) + count) % count).sort((a, b) => a - b);
    const unique = wrapped.filter((t, i) => !i || t - wrapped[i - 1] > 1e-7);
    if (unique.length > 1 && unique[0] + count - unique.at(-1)! <= 1e-7) unique.pop();
    return unique;
  }
  cuts.sort((a, b) => a - b);
  return cuts.filter((t, i) => !i || t - cuts[i - 1] > 1e-7);
}

function intervalsOf(ordered: Piece[], chain: Chain, start: number, end: number) {
  const result: { piece: Piece; a: number; b: number }[] = [];
  for (let k = Math.floor(start); k < end - 1e-10; k++) {
    const a = Math.max(start, k) - k,
      b = Math.min(end, k + 1) - k;
    if (b - a > 1e-9)
      result.push({
        piece: ordered[chain.indices[((k % chain.count) + chain.count) % chain.count]],
        a,
        b,
      });
  }
  return result;
}

function spanPoints(ordered: Piece[], chain: Chain, lo: number, hi: number) {
  const points: Point[] = [];
  for (const { piece, a, b } of intervalsOf(ordered, chain, lo, hi))
    for (const entry of sample(piece, a, b)) points.push(entry.p);
  return points;
}

function refOf(ordered: Piece[], chain: Chain, lo: number, hi: number): SegmentRef {
  return { shapeId: chain.source.id, lo, hi, points: spanPoints(ordered, chain, lo, hi) };
}

/** Nearest editable segment within `tolerance` of `point`, or null. */
export function segmentAt(
  shapes: Shape[],
  point: Point,
  tolerance: number,
  canEdit: (shape: Shape) => boolean = () => true,
): SegmentRef | null {
  const view = layout(shapes);
  const { ordered, paths } = view;
  let best = Infinity,
    target = -1,
    parameter = 0;
  paths.forEach((points, k) =>
    points.slice(1).forEach((b, i) => {
      const a = points[i],
        d = distanceToSegment(point, a.p, b.p);
      if (d <= tolerance && d <= best) {
        const dx = b.p.x - a.p.x,
          dy = b.p.y - a.p.y;
        const fraction = Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.p.x) * dx + (point.y - a.p.y) * dy) /
              (dx * dx + dy * dy || 1),
          ),
        );
        best = d;
        target = k;
        parameter = a.t + (b.t - a.t) * fraction;
      }
    }),
  );
  if (target < 0) return null;
  const source = ordered[target].source;
  if (!canEdit(source)) return null;
  const chain = chainOf(ordered, source);
  const unique = cutsOf(view, chain);
  const { count, closed } = chain;
  const position = chain.indices.indexOf(target) + parameter;
  let lo: number, hi: number;
  if (!unique.length) {
    lo = 0;
    hi = count;
  } else if (closed) {
    const extended = [
      ...unique.map((t) => t - count),
      ...unique,
      ...unique.map((t) => t + count),
    ];
    const end = extended.findIndex((t) => t > position + 1e-9);
    hi = extended[end];
    lo = extended[end - 1];
  } else {
    const end = unique.findIndex((t) => t > position + 1e-9);
    const j = end < 0 ? unique.length - 1 : end;
    lo = unique[j - 1];
    hi = unique[j];
  }
  return refOf(ordered, chain, lo, hi);
}

/** Every segment of every editable shape, in shape order. */
export function segmentsOf(
  shapes: Shape[],
  canEdit: (shape: Shape) => boolean = () => true,
): SegmentRef[] {
  const view = layout(shapes);
  const result: SegmentRef[] = [];
  for (const source of shapes) {
    if (!canEdit(source)) continue;
    const chain = chainOf(view.ordered, source);
    if (!chain.count) continue;
    const unique = cutsOf(view, chain);
    if (!unique.length) {
      result.push(refOf(view.ordered, chain, 0, chain.count));
      continue;
    }
    for (let i = 1; i < unique.length; i++)
      result.push(refOf(view.ordered, chain, unique[i - 1], unique[i]));
    if (chain.closed)
      result.push(refOf(view.ordered, chain, unique.at(-1)!, unique[0] + chain.count));
  }
  return result;
}

// Keep adjacent cubic portions editable as one connected control curve.
function buildFragments(parts: { piece: Piece; a: number; b: number }[]) {
  const remaining: Shape[] = [];
  for (const fragment of parts.map(({ piece, a, b }) => piece.shape(a, b))) {
    const last = remaining.at(-1);
    const merged =
      last && isCurve(last) && isCurve(fragment)
        ? mergeShapes([last, fragment])
        : null;
    if (merged) remaining[remaining.length - 1] = merged;
    else if (
      last &&
      ["line", "polyline"].includes(last.kind) &&
      fragment.kind === "line" &&
      distance(last.points.at(-1)!, fragment.points[0]) < EPS
    ) {
      remaining[remaining.length - 1] = {
        ...last,
        kind: "polyline",
        points: [...last.points, fragment.points[1]],
      };
    } else if (
      last?.kind === "arc" &&
      fragment.kind === "arc" &&
      JSON.stringify(last.transform) === JSON.stringify(fragment.transform) &&
      distance(arcEnd(last), arcStart(fragment)) < EPS &&
      Math.abs((last.sweep ?? 0) + (fragment.sweep ?? 0)) <= 360 + EPS
    ) {
      remaining[remaining.length - 1] = {
        ...last,
        sweep: (last.sweep ?? 0) + (fragment.sweep ?? 0),
      };
    } else remaining.push(fragment);
  }
  return remaining;
}

export type SegmentSplit = {
  /** The document shapes with sources rebuilt (or untouched when copying). */
  shapes: Shape[];
  /** Ids of the shapes built from the selected segments, in selection order. */
  extracted: string[];
  /** Source shape id for every newly created shape id. */
  origin: Map<string, string>;
};
/**
 * Splits each referenced segment out of its source shape. With `copy`, sources stay
 * intact and the segments are added as new shapes after them. A source whose whole
 * outline is selected hands its id to the first extracted shape, so links survive.
 */
export function splitSegments(
  shapes: Shape[],
  refs: readonly Pick<SegmentRef, "shapeId" | "lo" | "hi">[],
  { copy = false }: { copy?: boolean } = {},
): SegmentSplit {
  const extracted: string[] = [];
  const origin = new Map<string, string>();
  const result = shapes.flatMap((source) => {
    const mine = refs.filter((r) => r.shapeId === source.id);
    if (!mine.length) return [source];
    const ordered = piecesOf(source);
    const chain = chainOf(ordered, source);
    if (!chain.count) return [source];
    const { count, closed } = chain;
    // Normalise to [0, count) and drop overlapping duplicates.
    const spans = mine
      .map((r) => {
        const shift = closed ? Math.floor(r.lo / count) * count : 0;
        return { lo: r.lo - shift, hi: r.hi - shift };
      })
      .sort((a, b) => a.lo - b.lo)
      .filter((s, i, all) => !i || s.lo >= all[i - 1].hi - 1e-9);
    const pieces = spans.map((s) => buildFragments(intervalsOf(ordered, chain, s.lo, s.hi)));
    let retained: Shape[] = [];
    if (!copy) {
      const parts = closed
        ? spans.flatMap((s, i) =>
            intervalsOf(ordered, chain, s.hi, i + 1 < spans.length ? spans[i + 1].lo : spans[0].lo + count),
          )
        : spans.flatMap((s, i) => [
            ...(i ? [] : intervalsOf(ordered, chain, 0, s.lo)),
            ...intervalsOf(ordered, chain, s.hi, i + 1 < spans.length ? spans[i + 1].lo : count),
          ]);
      retained = buildFragments(parts);
    }
    let keepId = !copy;
    const named = (shape: Shape) => {
      const id = keepId ? source.id : createId();
      if (!keepId) origin.set(id, source.id);
      keepId = false;
      return { ...shape, id };
    };
    const kept = retained.map(named);
    const segments = pieces.flatMap((group) => {
      const built = group.map(named);
      extracted.push(...built.map((s) => s.id));
      return built;
    });
    return copy ? [source, ...segments] : [...kept, ...segments];
  });
  return { shapes: result, extracted, origin };
}

/** Whether a segment lies fully inside `box`, or with `crossing`, touches it at all. */
export function segmentInBox(
  ref: Pick<SegmentRef, "points">,
  box: { x: number; y: number; width: number; height: number },
  crossing = false,
) {
  const right = box.x + box.width,
    bottom = box.y + box.height;
  const inside = (p: Point) => p.x >= box.x && p.x <= right && p.y >= box.y && p.y <= bottom;
  if (!crossing) return ref.points.length > 0 && ref.points.every(inside);
  if (ref.points.some(inside)) return true;
  const corners = [p0(box.x, box.y), p0(right, box.y), p0(right, bottom), p0(box.x, bottom)];
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const meets = (a: Point, b: Point, c: Point, d: Point) =>
    // The extent check rejects collinear pieces that do not overlap.
    Math.max(a.x, b.x) >= Math.min(c.x, d.x) && Math.max(c.x, d.x) >= Math.min(a.x, b.x) &&
    Math.max(a.y, b.y) >= Math.min(c.y, d.y) && Math.max(c.y, d.y) >= Math.min(a.y, b.y) &&
    cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
  return ref.points.slice(1).some((b, i) =>
    corners.some((c, k) => meets(ref.points[i], b, c, corners[(k + 1) % 4])),
  );
}
const p0 = (x: number, y: number): Point => ({ x, y });

export function trimAt(
  shapes: Shape[],
  point: Point,
  tolerance: number,
  preview?: (span: Point[]) => void,
  canEdit: (shape: Shape) => boolean = () => true,
): Shape[] | null {
  const ref = segmentAt(shapes, point, tolerance, canEdit);
  if (!ref) return null;
  if (preview) {
    preview(ref.points);
    return null;
  }
  const { shapes: next, extracted } = splitSegments(shapes, [ref]);
  const removed = new Set(extracted);
  return next.filter((s) => !removed.has(s.id));
}

const EPS = 1e-5;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
type Sample = { t: number; p: Point };
// Fixed world-space error; zoom only affects pointer hit tolerance.
function sample(piece: Piece, start = 0, end = 1): Sample[] {
  const result: Sample[] = [{ t: start, p: piece.at(start) }];
  const visit = (a: number, b: number, depth: number) => {
    const p = piece.at(a),
      q = piece.at(b);
    const error = Math.max(
      ...[0.25, 0.5, 0.75].map((f) =>
        distanceToSegment(piece.at(a + (b - a) * f), p, q),
      ),
    );
    if (depth >= 20 || error <= 0.0001) {
      result.push({ t: b, p: q });
      return;
    }
    const mid = (a + b) / 2;
    visit(a, mid, depth + 1);
    visit(mid, b, depth + 1);
  };
  visit(start, end, 0);
  return result;
}
function bounds(points: Sample[]) {
  const box = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };
  for (const { p } of points) {
    box.minX = Math.min(box.minX, p.x);
    box.maxX = Math.max(box.maxX, p.x);
    box.minY = Math.min(box.minY, p.y);
    box.maxY = Math.max(box.maxY, p.y);
  }
  return box;
}

function overlap(a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) {
  return (
    a.minX <= b.maxX + EPS &&
    b.minX <= a.maxX + EPS &&
    a.minY <= b.maxY + EPS &&
    b.minY <= a.maxY + EPS
  );
}
function intersection(
  a: Piece,
  b: Piece,
  p: Sample,
  q: Sample,
  r: Sample,
  s: Sample,
): [number, number] | null {
  const v = sub(q.p, p.p),
    w = sub(s.p, r.p),
    d = sub(r.p, p.p),
    cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
  const den = cross(v, w);
  // Coincident spans and tangencies do not introduce crossing boundaries.
  if (Math.abs(den) < 1e-14) return null;
  const x = cross(d, w) / den,
    y = cross(d, v) / den;
  if (x < -0.01 || x > 1.01 || y < -0.01 || y > 1.01) return null;
  let t = p.t + x * (q.t - p.t),
    u = r.t + y * (s.t - r.t);
  for (let k = 0; k < 12; k++) {
    const delta = sub(b.at(u), a.at(t));
    const derivative = (piece: Piece, n: number) => {
      const lo = Math.max(0, n - 1e-6),
        hi = Math.min(1, n + 1e-6),
        v = sub(piece.at(hi), piece.at(lo));
      return { x: v.x / (hi - lo), y: v.y / (hi - lo) };
    };
    const da = derivative(a, t),
      db = derivative(b, u),
      det = cross(da, db);
    if (Math.abs(det) < 1e-10) return null;
    t += cross(delta, db) / det;
    u += cross(delta, da) / det;
    if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) return null;
    t = Math.max(0, Math.min(1, t));
    u = Math.max(0, Math.min(1, u));
    if (distance(a.at(t), b.at(u)) < 1e-8) return [t, u];
  }
  return null;
}

function arcPoint(shape: Shape, end: boolean): Point {
  const c = boundary(shape).curves[0];
  const angle = c.start + (end ? c.span : 0);
  return {
    x: c.c.x + c.u.x * Math.cos(angle) + c.v.x * Math.sin(angle),
    y: c.c.y + c.u.y * Math.cos(angle) + c.v.y * Math.sin(angle),
  };
}
const arcEnd = (shape: Shape) => arcPoint(shape, true);
const arcStart = (shape: Shape) => arcPoint(shape, false);

type Box = ReturnType<typeof bounds>;
type BoxEntry = { box: Box; index: number };
type BoxTree = {
  box: Box;
  entries?: BoxEntry[];
  left?: BoxTree;
  right?: BoxTree;
};
function makeTree(entries: BoxEntry[]): BoxTree {
  const box = entries.reduce(
    (a, { box: b }) => ({
      minX: Math.min(a.minX, b.minX),
      maxX: Math.max(a.maxX, b.maxX),
      minY: Math.min(a.minY, b.minY),
      maxY: Math.max(a.maxY, b.maxY),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  if (entries.length <= 8) return { box, entries };
  const axis = box.maxX - box.minX > box.maxY - box.minY ? "minX" : "minY";
  entries.sort((a, b) => a.box[axis] - b.box[axis]);
  const mid = Math.floor(entries.length / 2);
  return {
    box,
    left: makeTree(entries.slice(0, mid)),
    right: makeTree(entries.slice(mid)),
  };
}
function* queryTree(tree: BoxTree, box: Box): Generator<number> {
  if (!overlap(tree.box, box)) return;
  if (tree.entries) {
    for (const entry of tree.entries)
      if (overlap(entry.box, box)) yield entry.index;
  } else {
    yield* queryTree(tree.left!, box);
    yield* queryTree(tree.right!, box);
  }
}
