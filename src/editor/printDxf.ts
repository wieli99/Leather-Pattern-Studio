import { resolvedPrintItems, type PrintLayout } from "../model/printLayout";
import { isIndicator } from "../model/indicators";
import { flattenContours } from "../model/flattenOutline";
import type { Doc } from "../model/project";

/** Export shared numeric geometry in physical coordinates, independent of zoom. */
export function layoutDxf(doc: Doc, layout: PrintLayout) {
  const paths: { points: { x: number; y: number }[]; closed: boolean }[] = [];
  let vertices = 0;
  for (const item of resolvedPrintItems(doc, layout)) {
    const s = item.shape;
    if (item.hidden || s.stitchOnly || isIndicator(s.kind) || ["text", "image", "measurement"].includes(s.kind)) continue;
    for (const { points, closed } of flattenContours(s, 0.01)) {
      if (points.length < 2) continue;
      vertices += points.length;
      if (vertices > 500000) throw Error("Layout is too complex for DXF export");
      paths.push({ points, closed });
    }
  }
  if (!paths.length) throw Error("No outlines to export");
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const path of paths) for (const p of path.points) {
    left = Math.min(left, p.x); top = Math.min(top, p.y);
    right = Math.max(right, p.x); bottom = Math.max(bottom, p.y);
  }
  const n = (v: number) => String(Number(v.toFixed(8)));
  const pairs: (string | number)[] = [0,"SECTION",2,"HEADER",9,"$ACADVER",1,"AC1015",9,"$INSUNITS",70,4,0,"ENDSEC",0,"SECTION",2,"ENTITIES"];
  for (const path of paths) {
    pairs.push(0,"LWPOLYLINE",100,"AcDbEntity",8,"OUTLINES",100,"AcDbPolyline",90,path.points.length,70,path.closed ? 1 : 0);
    for (const p of path.points) pairs.push(10,n(p.x-left),20,n(bottom-p.y));
  }
  pairs.push(0,"ENDSEC",0,"EOF");
  const width = Math.max(right-left, 1), height = Math.max(bottom-top, 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left-1} ${top-1} ${width+2} ${height+2}" width="${width+2}mm" height="${height+2}mm"><rect x="${left-1}" y="${top-1}" width="${width+2}" height="${height+2}" fill="white"/><g fill="none" stroke="black" stroke-width="0.2">${paths.map(p => `<path d="M${p.points.map(v => `${n(v.x)},${n(v.y)}`).join(" L")}${p.closed ? " Z" : ""}"/>`).join("")}</g></svg>`;
  return { text: pairs.join("\r\n")+"\r\n", svg, width: width+2, height: height+2 };
}
