import { migrateDetachedGuides, transferMapping, makeTransfer, pieceFrame, stitchingOnPiece, validateStitchTransfers } from "./stitchLayers";
import { validateStitchSettings } from "./stitch";
import { validatePrintLayouts, findSource } from "./printLayout";
import { objectTreeFromShapes, validateObjectTree, treeInDrawingOrder, type ObjectNode } from "./objectTree";
import { stitchClosed, validateStitchGroups } from "./stitchGeometry";
import type { StitchGroup } from "./stitchGeometry";
import type { StitchLink } from "../generated/StitchLink";
import type { Shape as CoreShape } from "../generated/Shape";
import type { Point as CorePoint } from "../generated/Point";
export type Point = CorePoint;
export type Shape = CoreShape;
export type Tool = "select" | Shape["kind"];
export type Guide = { id: string; axis: "x" | "y"; coordinate: number };
export type Doc = {
  printLayouts?: import("./printLayout").PrintLayout[];
  stitchPresets?: import("../generated/StitchPreset").StitchPreset[];
  stitchTransfers?: import("../generated/StitchTransfer").StitchTransfer[];
  version: 21 | 20 | 19 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18;
  shapes: Shape[];
  objectTree?: ObjectNode[];
  guides?: Guide[];
  stitchGroups?: StitchGroup[];
  stitchLinks?: StitchLink[];
};
export const DOCUMENT_VERSION = 21;
export const emptyDocument = (): Doc => ({ version: DOCUMENT_VERSION, shapes: [] });
export function parseProject(text: string, options: {frozen?:boolean} = {}): Doc {
  if (new TextEncoder().encode(text).length > 10_000_000)
    throw Error("Project exceeds 10 MB");
  const input = JSON.parse(text);
  if (!input || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].includes(input.version))
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
        "image",
        "text",
        "measurement",
        "arrow", "arrow-head", "crosshair", "size-square", "size-ruler",
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
    if (s.kind === "text" && (
      (s.fontFamily !== undefined && !["sans", "serif", "mono"].includes(s.fontFamily)) ||
      (s.textAlign !== undefined && !["left", "center", "right"].includes(s.textAlign)) ||
      (s.lineSpacing !== undefined && (!Number.isFinite(s.lineSpacing) || s.lineSpacing <= 0)) ||
      ["bold", "italic", "underline", "strikethrough"].some(k => s[k] !== undefined && typeof s[k] !== "boolean")
    )) throw Error("Invalid text formatting");
    if (s.kind === "image" && (s.points[0].x === s.points[1].x || s.points[0].y === s.points[1].y || typeof s.image !== "string" || !/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/.test(s.image))) throw Error("Invalid image");
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
      (s.fillMode !== undefined && !["solid", "skiving", "glueing", "cutout"].includes(s.fillMode)) ||
      (s.strokeColor !== undefined && (typeof s.strokeColor !== "string" || !/^#[0-9a-f]{6}$/i.test(s.strokeColor))) ||
      (s.strokeOpacity !== undefined && (typeof s.strokeOpacity !== "number" || !Number.isFinite(s.strokeOpacity) || s.strokeOpacity < 0 || s.strokeOpacity > 1)) ||
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
    if (s.kind === "measurement" &&
        (!Number.isFinite(s.measurementOffset) ||
          Math.abs(s.measurementOffset) > 1e7 ||
          Math.hypot(s.points[1].x - s.points[0].x, s.points[1].y - s.points[0].y) < 1e-9))
      throw Error("Invalid measurement");
    if (s.headSize !== undefined && (!Number.isFinite(s.headSize) || s.headSize <= 0 || s.headSize > 1e7))
      throw Error("Invalid arrowhead size");
    if (s.kind === "size-square") {
      const dx = Math.abs(b.x-a.x), dy = Math.abs(b.y-a.y);
      if (dx < 1e-9 || Math.abs(dx-dy) > 1e-8*Math.max(1,dx)) throw Error("Size guide must be square");
      if (s.transform) {
        const m = s.transform, x = Math.hypot(m.a,m.b), y = Math.hypot(m.c,m.d);
        if (Math.abs(x-y) > 1e-8*Math.max(x,y) || Math.abs(m.a*m.c+m.b*m.d) > 1e-8*x*y)
          throw Error("Size guide requires uniform scaling");
      }
    }
    if (s.strokeWidth !== undefined && (!Number.isFinite(s.strokeWidth) || s.strokeWidth <= 0)) throw Error("Invalid outline width");
    ids.add(s.id);
    result.push({
      ...(s.stitchParentId != null ? { stitchParentId:s.stitchParentId } : {}),
      id: s.id,
      name: s.name,
      ...(s.fillMode !== undefined ? { fillMode: s.fillMode } : {}),
      ...(s.strokeColor !== undefined ? { strokeColor: s.strokeColor } : {}),
      ...(s.strokeOpacity !== undefined ? { strokeOpacity: s.strokeOpacity } : {}),
      ...(s.hidden !== undefined ? { hidden: s.hidden } : {}),
      ...(s.locked !== undefined ? { locked: s.locked } : {}),
      ...(s.fillColor !== undefined ? { fillColor: s.fillColor } : {}),
      ...(s.fillOpacity !== undefined ? { fillOpacity: s.fillOpacity } : {}),
      kind: s.kind,
      ...(s.kind === "image" ? {image:s.image} : {}),
      ...(s.strokeWidth !== undefined ? {strokeWidth:s.strokeWidth} : {}),
      ...(s.headSize !== undefined ? { headSize: s.headSize } : {}),
      ...(s.stitchOnly === true ? { stitchOnly: true } : {}),
      points: s.points.map((p: Point) => ({ x: p.x, y: p.y })),
      ...(s.kind === "text" ? { text: s.text, fontSize: s.fontSize, fontFamily: s.fontFamily, bold: s.bold, italic: s.italic, underline: s.underline, strikethrough: s.strikethrough, textAlign: s.textAlign, lineSpacing: s.lineSpacing } : {}),
      ...(s.kind === "measurement" ? { measurementOffset: s.measurementOffset } : {}),
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
  const originalShapes=[...result];
  const addedGuides=options.frozen ? [] : migrateDetachedGuides(result,stitchGroups);
  addedGuides.forEach(s=>ids.add(s.id));
  for (const guide of result) if (guide.stitchParentId != null) {
    const parent=result.find(s=>s.id===guide.stitchParentId);
    if (typeof guide.stitchParentId!=="string" || !guide.stitchOnly || !parent || parent.stitchOnly || !stitchClosed(parent) || parent.stitchParentId || parent.id===guide.id) throw Error("Invalid stitch path attachment");
  }
  const transferDoc:Doc={version:DOCUMENT_VERSION,shapes:result,stitchGroups};
  const stitchTransfers = validateStitchTransfers(input.stitchTransfers, result, stitchGroups).map(t=>{
    if(t.pose) return t;
    try {
      const mapping=transferMapping(transferDoc,t),sf=pieceFrame(mapping.source),c=Math.cos(mapping.rotation),sn=Math.sin(mapping.rotation);
      const dx=sf.center.x-mapping.a[0].x,dy=sf.center.y-mapping.a[0].y;
      return {...makeTransfer(transferDoc,t.masterId,mapping.target,{x:mapping.b[0].x+c*dx-sn*dy,y:mapping.b[0].y+sn*dx+c*dy},mapping.rotation*180/Math.PI,t.placementId ?? t.id),id:t.id,visible:t.visible,number:t.number};
    } catch { return t; }
  });
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
  const objectTree = input.objectTree === undefined ? objectTreeFromShapes(originalShapes) : validateObjectTree(input.objectTree, originalShapes);
  objectTree.push(...addedGuides.map(s=>({kind:"object" as const,id:s.id})));
  const printLayouts = validatePrintLayouts(input.printLayouts ?? []);
  for (const layout of printLayouts) {
    for (const item of layout.instances) if (item.snapshot) {
      const snapshot = parseProject(JSON.stringify({ version: DOCUMENT_VERSION,
        shapes: [{...item.snapshot.shape,stitchParentId:undefined}], stitchGroups: item.snapshot.stitchGroups }),{frozen:true});
      item.snapshot = { shape: snapshot.shapes[0], stitchGroups: stitchingOnPiece(snapshot,snapshot.shapes[0].id) };
    }
    if (layout.instances.some(i => !i.snapshot && !ids.has(i.sourceId))) throw Error("Unknown print source");
    function validateSources(nodes: import("./printLayout").PrintNode[]) {
      for (const node of nodes) if (node.kind === 'group') {
        if (!node.unlinked && node.sourceId && findSource(objectTree,node.sourceId)?.kind !== 'group') throw Error("Unknown print folder source");
        validateSources(node.children);
      }
    }
    validateSources(layout.tree ?? []);
  }
  if (input.stitchPresets != null) {
    if (!Array.isArray(input.stitchPresets) || input.stitchPresets.length > 1000) throw Error("Invalid stitch presets");
    const names = new Set<string>();
    for (const preset of input.stitchPresets) {
      if (!preset || typeof preset.name !== "string" || !preset.name.trim() || preset.name.length > 200 || names.has(preset.name)) throw Error("Invalid stitch preset name");
      names.add(preset.name);
      validateStitchSettings(preset.settings);
    }
  }
  return {
    ...(input.stitchTransfers != null ? { stitchTransfers } : {}),
    ...(input.stitchPresets ? { stitchPresets: input.stitchPresets } : {}),
    printLayouts,
    objectTree,
    stitchLinks,
    stitchGroups,
    version: DOCUMENT_VERSION,
    shapes: treeInDrawingOrder(objectTree, result),
    guides: guides.map((g: Guide) => ({
      id: g.id,
      axis: g.axis,
      coordinate: g.coordinate,
    })),
  };
}
