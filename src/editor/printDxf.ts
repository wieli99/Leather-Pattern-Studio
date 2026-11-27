import { printStitchGroups, resolvedPrintItems, type PrintLayout } from "../model/printLayout";
import { isIndicator } from "../model/indicators";
import { flattenContours } from "../model/flattenOutline";
import { stitchGeometry } from "../model/stitchGeometry";
import { holeOutline } from "../model/stitchLayers";
import type { Doc, Point, Shape } from "../model/project";

/** Cutting-software layers, written in a safe cutting order: inner work before the outlines that free a piece. */
export const dxfLayers = [
  { id: "markings", name: "MARKINGS", label: "Markings", color: 3, preview: "#00a000" },
  { id: "holes", name: "STITCH_HOLES", label: "Stitch holes", color: 5, preview: "#0040ff" },
  { id: "cut", name: "CUT", label: "Cut outlines", color: 1, preview: "#e00000" },
] as const;
export type DxfLayer = (typeof dxfLayers)[number]["id"];
export const allDxfLayers: DxfLayer[] = dxfLayers.map(layer => layer.id);

type Entity = { layer: DxfLayer; area: number } & (
  | { kind: "path"; points: Point[]; closed: boolean }
  | { kind: "circle"; center: Point; radius: number });

/** Skiving and glueing areas and dashed or dotted outlines are marked, not cut through. */
export function dxfOutlineLayer(shape: Shape): DxfLayer {
  return shape.fillMode === "skiving" || shape.fillMode === "glueing" || shape.strokeStyle === "dashed" || shape.strokeStyle === "dotted"
    ? "markings" : "cut";
}

function boxArea(points: Point[]) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of points) {
    left = Math.min(left, p.x); top = Math.min(top, p.y);
    right = Math.max(right, p.x); bottom = Math.max(bottom, p.y);
  }
  return (right - left) * (bottom - top);
}

/** Minimal R2000 table records with handles and subclass markers, so strict readers accept the layers. */
function tables(handle: () => string) {
  const linetypes = handle(), layers = handle(), continuous = handle();
  const pairs: (string | number)[] = [0,"SECTION",2,"TABLES",
    0,"TABLE",2,"LTYPE",5,linetypes,100,"AcDbSymbolTable",70,1,
    0,"LTYPE",5,continuous,100,"AcDbSymbolTableRecord",100,"AcDbLinetypeTableRecord",2,"CONTINUOUS",70,0,3,"Solid line",72,65,73,0,40,0,
    0,"ENDTAB",
    0,"TABLE",2,"LAYER",5,layers,100,"AcDbSymbolTable",70,dxfLayers.length + 1];
  for (const [name, color] of [["0", 7], ...dxfLayers.map(layer => [layer.name, layer.color])])
    pairs.push(0,"LAYER",5,handle(),100,"AcDbSymbolTableRecord",100,"AcDbLayerTableRecord",2,name,70,0,62,color,6,"CONTINUOUS");
  pairs.push(0,"ENDTAB",0,"ENDSEC");
  return pairs;
}

/**
 * Export shared numeric geometry in physical coordinates, independent of zoom.
 * The origin always comes from every layer, so files exported with different layer choices stay registered.
 */
export function layoutDxf(doc: Doc, layout: PrintLayout, layers: readonly DxfLayer[] = allDxfLayers) {
  const entities: Entity[] = [], warnings: string[] = [];
  let vertices = 0;
  const count = (n: number) => {
    vertices += n;
    if (vertices > 500000) throw Error("Layout is too complex for DXF export");
  };
  for (const item of resolvedPrintItems(doc, layout)) {
    if (item.hidden) continue;
    const s = item.shape;
    if (!s.excludeFromDxf && !s.stitchOnly && !isIndicator(s.kind) && !["text", "image", "measurement"].includes(s.kind)) {
      const layer = dxfOutlineLayer(s);
      for (const { points, closed } of flattenContours(s, 0.01)) {
        if (points.length < 2) continue;
        count(points.length);
        entities.push({ layer, kind: "path", points, closed, area: boxArea(points) });
      }
    }
    if (s.kind === "measurement" || isIndicator(s.kind)) continue;
    for (const group of printStitchGroups(doc, layout, item.source.id)) {
      let holes;
      try {
        holes = stitchGeometry(s, group).holes;
      } catch (reason) {
        warnings.push(`Skipped stitching on “${item.source.name}”: ${reason instanceof Error ? reason.message : String(reason)}`);
        continue;
      }
      holes.forEach((hole, index) => {
        const hit = holeOutline(group, index, hole);
        count(hit.kind === "circle" ? 1 : hit.points.length);
        entities.push(hit.kind === "circle"
          ? { layer: "holes", kind: "circle", center: hit.center, radius: hit.radius, area: 4 * hit.radius ** 2 }
          : { layer: "holes", kind: "path", points: hit.points, closed: true, area: boxArea(hit.points) });
      });
    }
  }
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const extend = (p: Point, r = 0) => {
    left = Math.min(left, p.x - r); top = Math.min(top, p.y - r);
    right = Math.max(right, p.x + r); bottom = Math.max(bottom, p.y + r);
  };
  for (const e of entities) e.kind === "circle" ? extend(e.center, e.radius) : e.points.forEach(p => extend(p));
  // Within a layer, smaller bounding boxes first: anything enclosed by an outline is cut before that outline.
  const chosen = entities.filter(e => layers.includes(e.layer))
    .sort((a, b) => allDxfLayers.indexOf(a.layer) - allDxfLayers.indexOf(b.layer) || a.area - b.area);
  if (!chosen.length)
    throw Error([layers.length ? "Nothing to export on the selected layers" : "Choose at least one layer to export", ...warnings].join(". "));
  const n = (v: number) => String(Number(v.toFixed(8)));
  let nextHandle = 0x20;
  const handle = () => (nextHandle++).toString(16).toUpperCase();
  const name = (id: DxfLayer) => dxfLayers.find(layer => layer.id === id)!.name;
  const body: (string | number)[] = [...tables(handle), 0,"SECTION",2,"ENTITIES"];
  for (const e of chosen) {
    if (e.kind === "circle")
      body.push(0,"CIRCLE",5,handle(),100,"AcDbEntity",8,name(e.layer),100,"AcDbCircle",10,n(e.center.x-left),20,n(bottom-e.center.y),30,0,40,n(e.radius));
    else {
      body.push(0,"LWPOLYLINE",5,handle(),100,"AcDbEntity",8,name(e.layer),100,"AcDbPolyline",90,e.points.length,70,e.closed ? 1 : 0);
      for (const p of e.points) body.push(10,n(p.x-left),20,n(bottom-p.y));
    }
  }
  body.push(0,"ENDSEC",0,"EOF");
  const pairs = [0,"SECTION",2,"HEADER",9,"$ACADVER",1,"AC1015",9,"$HANDSEED",5,handle(),9,"$INSUNITS",70,4,0,"ENDSEC",...body];
  const width = Math.max(right-left, 1), height = Math.max(bottom-top, 1);
  const groups = dxfLayers.filter(layer => chosen.some(e => e.layer === layer.id)).map(layer =>
    `<g stroke="${layer.preview}" stroke-width="${layer.id === "holes" ? 0.1 : 0.2}">${chosen.filter(e => e.layer === layer.id).map(e => e.kind === "circle"
      ? `<circle cx="${n(e.center.x)}" cy="${n(e.center.y)}" r="${n(e.radius)}"/>`
      : `<path d="M${e.points.map(v => `${n(v.x)},${n(v.y)}`).join(" L")}${e.closed ? " Z" : ""}"/>`).join("")}</g>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left-1} ${top-1} ${width+2} ${height+2}" width="${width+2}mm" height="${height+2}mm"><rect x="${left-1}" y="${top-1}" width="${width+2}" height="${height+2}" fill="white"/><g fill="none">${groups.join("")}</g></svg>`;
  return { text: pairs.join("\r\n")+"\r\n", svg, width: width+2, height: height+2, warnings };
}
