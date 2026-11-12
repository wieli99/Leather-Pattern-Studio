import { flattenOutline } from "./flattenOutline";
import { compactOffset } from "./compactOffset";
import { shapeMatrix } from "./geometry";
import type { Point, Shape } from "./project";

export type OffsetJoin = "sharp" | "rounded";
const EPS = 1e-8;
const LIMIT = 5000;
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Point, n: number): Point => ({ x: a.x * n, y: a.y * n });
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const length = (a: Point) => Math.hypot(a.x, a.y);
const near = (a: Point, b: Point) => length(sub(a, b)) < EPS;
const area = (points: Point[]) => points.reduce((sum, a, i) => sum + cross(a, points[(i + 1) % points.length]), 0) / 2;

function similarityScale(shape: Shape) {
  const m = shapeMatrix(shape), x = Math.hypot(m.a, m.b), y = Math.hypot(m.c, m.d);
  return x > EPS && Math.abs(x-y) <= 1e-9 * x && Math.abs(m.a*m.c+m.b*m.d) <= 1e-9*x*y ? x : null;
}

function primitive(source: Shape, kind: "circle" | "rectangle", points: Point[], radius: number): Shape {
  return { id: crypto.randomUUID(), name: `${source.name.slice(0, 193)} offset`, kind, points, radius,
    rotation: source.rotation, transform: source.transform, strokeColor: source.strokeColor,
    strokeOpacity: source.strokeOpacity, strokeWidth: source.strokeWidth, fillOpacity: 0 };
}

function crossing(a: Point, b: Point, c: Point, d: Point) {
  const ab = sub(b, a), cd = sub(d, c), den = cross(ab, cd);
  if (Math.abs(den) < EPS) return false;
  const t = cross(sub(c, a), cd) / den, u = cross(sub(c, a), ab) / den;
  return t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS;
}

function lineIntersection(a: Point, direction: Point, b: Point, other: Point): Point | null {
  const den = cross(direction, other);
  if (Math.abs(den) < 1e-10) return null;
  return add(a, mul(direction, cross(sub(b, a), other) / den));
}

function push(points: Point[], point: Point) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1e7 || Math.abs(point.y) > 1e7)
    throw Error("Offset exceeds document coordinate limits.");
  if (!points.length || !near(points.at(-1)!, point)) points.push(point);
  if (points.length > LIMIT) throw Error("Offset has too many points; use a larger distance or simpler outline.");
}

/** One-sided parallel outline in world millimetres. Positive is visually left on open paths. */
export function offsetShape(source: Shape, distance: number, join: OffsetJoin): Shape {
  if (!Number.isFinite(distance) || Math.abs(distance) < EPS) throw Error("Enter a non-zero finite offset distance.");
  if (join !== "sharp" && join !== "rounded") throw Error("Invalid corner style.");
  const scale = similarityScale(source);
  if (scale && (source.kind === "circle" || source.kind === "ellipse" && Math.abs(Math.abs(source.points[1].x-source.points[0].x)-Math.abs(source.points[1].y-source.points[0].y)) < EPS)) {
    const center = source.kind === "circle" ? source.points[0] : { x:(source.points[0].x+source.points[1].x)/2, y:(source.points[0].y+source.points[1].y)/2 };
    const oldRadius = source.kind === "circle" ? length(sub(source.points[1], center)) : Math.abs(source.points[1].x-source.points[0].x)/2;
    const nextRadius = oldRadius + distance / scale;
    if (nextRadius <= EPS) throw Error("Offset collapses the outline.");
    return primitive(source, "circle", [center, {x:center.x+nextRadius,y:center.y}], 0);
  }
  if (scale && source.kind === "rectangle" && !source.cornerRadii) {
    const a = source.points[0], b = source.points[1], d = distance/scale;
    const left = Math.min(a.x,b.x)-d, right = Math.max(a.x,b.x)+d;
    const top = Math.min(a.y,b.y)-d, bottom = Math.max(a.y,b.y)+d;
    if (right-left <= EPS || bottom-top <= EPS) throw Error("Offset collapses the outline.");
    const oldRadius = Math.min(source.radius, Math.abs(b.x-a.x)/2, Math.abs(b.y-a.y)/2);
    const radius = oldRadius === 0 && join === "sharp" ? 0 : Math.max(0, oldRadius+d);
    return primitive(source, "rectangle", [{x:left,y:top},{x:right,y:bottom}], radius);
  }
  if (scale && source.kind === "arc") {
    const center=source.points[0], radial=sub(source.points[1],center), oldRadius=length(radial);
    const matrix=shapeMatrix(source), determinant=matrix.a*matrix.d-matrix.b*matrix.c;
    const side=Math.abs(source.sweep ?? 0)===360 ? 1 : Math.sign(source.sweep ?? 0)*Math.sign(determinant);
    const nextRadius=oldRadius+distance*side/scale;
    if (nextRadius <= EPS) throw Error("Offset collapses the outline.");
    return {...source,id:crypto.randomUUID(),name:`${source.name.slice(0,193)} offset`,
      points:[center,add(center,mul(radial,nextRadius/oldRadius))],radius:0,fillOpacity:0};
  }
  if (["circle", "ellipse", "arc", "curve", "control-curve"].includes(source.kind))
    return compactOffset(source, distance, join);
  let outline: ReturnType<typeof flattenOutline>;
  try { outline = flattenOutline(source, 0.01); }
  catch { throw Error("Outline is too complex to offset."); }
  const input = outline.points.filter((p, i, all) => !i || !near(p, all[i - 1]));
  const closed = outline.closed;
  if (input.length < (closed ? 3 : 2) || input.length > LIMIT) throw Error("Outline is too complex or degenerate to offset.");
  const signedArea = closed ? area(input) : 0;
  if (closed && Math.abs(signedArea) < EPS) throw Error("Closed outline has no area.");
  const side = closed ? Math.sign(signedArea) * Math.sign(distance) : Math.sign(distance);
  const radius = Math.abs(distance);
  const count = closed ? input.length : input.length - 1;
  const directions: Point[] = [], normals: Point[] = [];
  for (let i = 0; i < count; i++) {
    const edge = sub(input[(i + 1) % input.length], input[i]);
    const size = length(edge);
    if (size < EPS) throw Error("Outline contains a collapsed edge.");
    const direction = mul(edge, 1 / size);
    directions.push(direction);
    normals.push({ x: direction.y * side * radius, y: -direction.x * side * radius });
  }
  const result: Point[] = [];
  const incoming: Point[] = [], outgoing: Point[] = [];
  const joins = closed ? input.length : input.length - 2;
  if (!closed) push(result, add(input[0], normals[0]));
  for (let j = 0; j < joins; j++) {
    const i = closed ? j : j + 1;
    const prev = (i - 1 + count) % count, next = i % count;
    const a = add(input[i], normals[prev]), b = add(input[i], normals[next]);
    const turn = cross(directions[prev], directions[next]) * side;
    if (join === "rounded" && turn > EPS && !near(a, b)) {
      incoming[i] = a; outgoing[i] = b;
      const start = Math.atan2(normals[prev].y, normals[prev].x);
      let sweep = Math.atan2(cross(normals[prev], normals[next]), dot(normals[prev], normals[next]));
      if (side > 0 && sweep < 0) sweep += Math.PI * 2;
      if (side < 0 && sweep > 0) sweep -= Math.PI * 2;
      const step = 2 * Math.acos(Math.max(-1, 1 - 0.01 / radius));
      const pieces = Math.max(1, Math.ceil(Math.abs(sweep) / step));
      for (let k = 0; k <= pieces; k++) {
        const angle = start + sweep * k / pieces;
        push(result, { x: input[i].x + radius * Math.cos(angle), y: input[i].y + radius * Math.sin(angle) });
      }
    } else {
      const intersection = lineIntersection(a, directions[prev], b, directions[next]) ?? (near(a, b) ? a : null);
      if (!intersection || length(sub(intersection, input[i])) > Math.max(radius * 10, 0.01))
        throw Error("Sharp corner creates an excessive spike; try Rounded corners or a smaller distance.");
      incoming[i] = outgoing[i] = intersection;
      push(result, intersection);
    }
  }
  if (!closed) push(result, add(input.at(-1)!, normals.at(-1)!));
  if (closed && near(result[0], result.at(-1)!)) result.pop();
  if (result.length < (closed ? 3 : 2)) throw Error("Offset collapses the outline.");
  for (let i = 0; i < count; i++) {
    const start = closed ? outgoing[i] : i === 0 ? add(input[0], normals[0]) : outgoing[i];
    const endIndex = (i + 1) % input.length;
    const end = closed ? incoming[endIndex] : i === count - 1 ? add(input.at(-1)!, normals.at(-1)!) : incoming[endIndex];
    if (!start || !end || dot(sub(end, start), directions[i]) <= EPS)
      throw Error("Offset collapses or reverses part of the outline.");
  }
  for (let i = 0; i < result.length - (closed ? 0 : 1); i++) {
    const a = result[i], b = result[(i + 1) % result.length];
    for (let j = i + 2; j < result.length - (closed ? 0 : 1); j++) {
      if (closed && i === 0 && j === result.length - 1) continue;
      if (crossing(a, b, result[j], result[(j + 1) % result.length])) throw Error("Offset intersects itself.");
    }
  }
  if (closed && Math.sign(area(result)) !== Math.sign(signedArea)) throw Error("Offset collapses the outline.");
  const points = closed ? [...result, result[0]] : result;
  if (points.length > 10000) throw Error("Offset exceeds document point limit.");
  return {
    id: crypto.randomUUID(), name: `${source.name.slice(0, 193)} offset`, kind: points.length === 2 ? "line" : "polyline",
    points, radius: 0, rotation: 0, strokeColor: source.strokeColor, strokeOpacity: source.strokeOpacity,
    strokeWidth: source.strokeWidth, fillOpacity: 0,
  };
}
