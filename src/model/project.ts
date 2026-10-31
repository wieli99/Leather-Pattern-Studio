import { objectTreeFromShapes, validateObjectTree, treeInDrawingOrder, type ObjectNode } from "./objectTree";
import { validateStitchGroups } from "./stitchGeometry";
import type { StitchGroup } from "./stitchGeometry";
import type { StitchLink } from "../generated/StitchLink";
import type { Shape as CoreShape } from "../generated/Shape";
import type { Point as CorePoint } from "../generated/Point";
export type Point = CorePoint;
export type Shape = CoreShape;
export type Tool = "select" | Shape["kind"];
export type Guide = { id: string; axis: "x" | "y"; coordinate: number };
export type Doc = {
  version: 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
  shapes: Shape[];
  objectTree?: ObjectNode[];
  guides?: Guide[];
  stitchGroups?: StitchGroup[];
  stitchLinks?: StitchLink[];
};
export const emptyDocument = (): Doc => ({ version: 13, shapes: [] });
export function parseProject(text: string): Doc {
  if (new TextEncoder().encode(text).length > 10_000_000)
    throw Error("Project exceeds 10 MB");
  const input = JSON.parse(text);
  if (!input || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(input.version))
    throw Error("Unsupported project version");
  let shapes = input.shapes;
  if (input.version === 1) {
    if (!Array.isArray(input.pieces)) throw Error("Invalid legacy project");
    shapes = input.pieces.map((p: Record<string, any>) => {
      if (
        !p ||
        !["x", "y", "width", "height", "radius", "stitch", "spacing"].every(
          (k) => typeof p[k] === "number" && Number.isFinite(p[k]),
        ) ||
        p.width <= 0 ||
        p.height <= 0 ||
        p.radius < 0 ||
        p.spacing <= 0 ||
        p.stitch < 0
      )
        throw Error("Invalid legacy piece");
      return {
        id: p.id,
        name: "Rounded piece",
        kind: "rectangle",
        points: [
          { x: p.x, y: p.y },
          { x: p.x + p.width, y: p.y + p.height },
        ],
        radius: Math.min(p.radius, p.width / 2, p.height / 2),
        legacyStitch: { offset: p.stitch, spacing: p.spacing },
      };
    });
  }
  if (!Array.isArray(shapes) || shapes.length > 10000)
    throw Error("Invalid shape collection");
  const ids = new Set<string>();
  const result: Shape[] = [];
  for (const s of shapes) {
    if (
      !s ||
      typeof s.id !== "string" ||
      !s.id ||
      ids.has(s.id) ||
      typeof s.name !== "string" ||
      s.name.length > 200 ||
      ![
        "text",
        "line",
        "polyline",
        "curve",
        "control-curve",
        "rectangle",
        "circle",
        "ellipse",
        "arc",
      ].includes(s.kind) ||
      !Array.isArray(s.points) ||
      s.points.length < 2 ||
      s.points.length > 10000 ||
      (!["polyline", "curve", "control-curve"].includes(s.kind) &&
        s.points.length !== 2) ||
      !s.points.every(
        (p: Point) =>
          p &&
          typeof p.x === "number" &&
          typeof p.y === "number" &&
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          Math.abs(p.x) <= 1e7 &&
          Math.abs(p.y) <= 1e7,
      ) ||
      !Number.isFinite(s.radius) ||
      s.radius < 0
    )
      throw Error("Invalid shape");
    if (
      s.kind === "text" &&
      (typeof s.text !== "string" ||
        !s.text.trim() ||
        [...s.text].length > 10000 ||
        !Number.isFinite(s.fontSize) ||
        s.fontSize <= 0)
    )
      throw Error("Invalid text");
    if (s.kind === "control-curve") {
      if (!Array.isArray(s.handles) || s.handles.length !== s.points.length)
        throw Error("Invalid curve handle count");
      s.handles.forEach((h: any, i: number) => {
        for (const v of [h?.incoming, h?.outgoing]) {
          if (
            !v ||
            !Number.isFinite(v.x) ||
            !Number.isFinite(v.y) ||
            Math.abs(s.points[i].x + v.x) > 1e7 ||
            Math.abs(s.points[i].y + v.y) > 1e7
          )
            throw Error("Invalid curve handle");
        }
      });
    } else if (s.handles !== undefined)
      throw Error("Handles require a control point curve");
    const geometry: Point[] = [...s.points];
    s.handles?.forEach((h: any, i: number) => {
      for (const v of [h.incoming, h.outgoing])
        geometry.push({ x: s.points[i].x + v.x, y: s.points[i].y + v.y });
    });
    const rotation = input.version >= 3 ? s.rotation : 0;
    if (!Number.isFinite(rotation)) throw Error("Invalid rotation");
    const a = s.points[0],
      b = s.points[s.points.length - 1];
    if (s.points.every((p: Point) => p.x === a.x && p.y === a.y))
      throw Error("Shape must have positive size");
    if (
      ["rectangle", "ellipse"].includes(s.kind) &&
      (a.x === b.x || a.y === b.y)
    )
      throw Error("Width and height must be positive");
    if (
      s.kind === "rectangle" &&
      s.radius > Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) / 2
    )
      throw Error("Corner radius exceeds half the smaller dimension");
    if (
      s.kind === "arc" &&
      (input.version < 4 ||
        !Number.isFinite(s.sweep) ||
        Math.abs(s.sweep) <= 1e-9 ||
        Math.abs(s.sweep) > 360)
    )
      throw Error("Invalid arc sweep");
    if (s.transform !== undefined) {
      const m = s.transform;
      if (
        input.version < 5 ||
        !m ||
        !["a", "b", "c", "d", "e", "f"].every((k) => Number.isFinite(m[k])) ||
        Math.abs(m.a * m.d - m.b * m.c) < 1e-12
      )
        throw Error("Invalid affine transform");
      const cx = ["circle", "arc"].includes(s.kind)
        ? a.x
        : (Math.min(...s.points.map((p: Point) => p.x)) +
            Math.max(...s.points.map((p: Point) => p.x))) /
          2;
      const cy = ["circle", "arc"].includes(s.kind)
        ? a.y
        : (Math.min(...s.points.map((p: Point) => p.y)) +
            Math.max(...s.points.map((p: Point) => p.y))) /
          2;
      const r = Math.max(
        ...geometry.map((p: Point) => Math.hypot(p.x - cx, p.y - cy)),
      );
      if (
        Math.abs(m.a * cx + m.c * cy + m.e) + r * Math.hypot(m.a, m.c) > 1e7 ||
        Math.abs(m.b * cx + m.d * cy + m.f) + r * Math.hypot(m.b, m.d) > 1e7
      )
        throw Error("Transformed coordinate exceeds limit");
    }
    if (s.cornerRadii !== undefined) {
      const count =
        s.kind === "rectangle"
          ? 4
          : s.kind === "polyline" &&
              s.points.length >= 4 &&
              s.points[0].x === s.points.at(-1).x &&
              s.points[0].y === s.points.at(-1).y
            ? s.points.length - 1
            : 0;
      if (
        !Array.isArray(s.cornerRadii) ||
        !count ||
        s.cornerRadii.length !== count ||
        s.cornerRadii.some(
          (r: number) => !Number.isFinite(r) || r < 0 || r > 1e7,
        )
      )
        throw Error("Invalid corner radii");
    }
    if (
      (s.hidden !== undefined && typeof s.hidden !== "boolean") ||
      (s.locked !== undefined && typeof s.locked !== "boolean") ||
      (s.fillColor !== undefined &&
        (typeof s.fillColor !== "string" || !/^#[0-9a-f]{6}$/i.test(s.fillColor))) ||
      (s.fillOpacity !== undefined &&
        (typeof s.fillOpacity !== "number" ||
          !Number.isFinite(s.fillOpacity) ||
          s.fillOpacity < 0 || s.fillOpacity > 1))
    )
      throw Error("Invalid fill");
    ids.add(s.id);
    result.push({
      id: s.id,
      name: s.name,
      ...(s.hidden !== undefined ? { hidden: s.hidden } : {}),
      ...(s.locked !== undefined ? { locked: s.locked } : {}),
      ...(s.fillColor !== undefined ? { fillColor: s.fillColor } : {}),
      ...(s.fillOpacity !== undefined ? { fillOpacity: s.fillOpacity } : {}),
      kind: s.kind,
      ...(s.stitchOnly === true ? { stitchOnly: true } : {}),
      points: s.points.map((p: Point) => ({ x: p.x, y: p.y })),
      ...(s.kind === "text" ? { text: s.text, fontSize: s.fontSize } : {}),
      radius: s.radius,
      ...(s.cornerRadii ? { cornerRadii: [...s.cornerRadii] } : {}),
      ...(s.handles
        ? {
            handles: s.handles.map((h: any) => ({
              incoming: { ...h.incoming },
              outgoing: { ...h.outgoing },
            })),
          }
        : {}),
      ...(s.transform ? { transform: { ...s.transform } } : {}),
      ...(s.kind === "arc" ? { sweep: s.sweep } : {}),
      rotation: ((rotation % 360) + 360) % 360,
      ...(s.legacyStitch ? { legacyStitch: s.legacyStitch } : {}),
    });
  }
  const guides = input.guides ?? [];
  if (
    !Array.isArray(guides) ||
    guides.length > 10000 ||
    guides.some(
      (g: any) =>
        !g ||
        typeof g.id !== "string" ||
        !g.id ||
        !["x", "y"].includes(g.axis) ||
        !Number.isFinite(g.coordinate),
    ) ||
    new Set(guides.map((g: any) => g.id)).size !== guides.length
  )
    throw Error("Invalid guidelines");
  const stitchGroups = validateStitchGroups(input.stitchGroups ?? [], result);
  const stitchLinks = input.stitchLinks ?? [];
  const linkIds = new Set<number>(), members = new Set<string>();
  if (!Array.isArray(stitchLinks)) throw Error("Invalid stitch links");
  for (const link of stitchLinks) {
    if (!link || !Number.isSafeInteger(link.id) || link.id < 1 || link.id > 4294967295 || linkIds.has(link.id) ||
        !Array.isArray(link.members) || link.members.length < 2) throw Error("Invalid stitch link");
    linkIds.add(link.id);
    for (const member of link.members) {
      if (members.has(member) || !stitchGroups.some(g => g.id === member)) throw Error("Invalid stitch link member");
      members.add(member);
    }
  }
  const objectTree = input.objectTree === undefined ? objectTreeFromShapes(result) : validateObjectTree(input.objectTree, result);
  return {
    objectTree,
    stitchLinks,
    stitchGroups,
    version: 13,
    shapes: treeInDrawingOrder(objectTree, result),
    guides: guides.map((g: Guide) => ({
      id: g.id,
      axis: g.axis,
      coordinate: g.coordinate,
    })),
  };
}
