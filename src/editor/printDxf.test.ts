import { expect, it } from "vitest";
import { layoutDxf } from "./printDxf";
import type { Shape } from "../model/project";
import type { PrintLayout } from "../model/printLayout";
it("writes entity closure flags for full arcs and closed and open paths without DOM APIs", () => {
  const points=[{x:0,y:0},{x:100,y:50},{x:200,y:0},{x:0,y:0}];
  const shapes: Shape[] = ["polyline","curve","control-curve","arc","arc"].map((kind,i) => ({
    id:String(i),name:"Piece",kind:kind as Shape["kind"],points:kind === "arc" ? points.slice(0,2) : points,radius:0,rotation:0,sweep:i===4?-360:360,
    handles:points.map(() => ({incoming:{x:0,y:0},outgoing:{x:0,y:0}})),
  }));
  shapes.push({...shapes[0],id:"open",points:points.slice(0,3)});
  const layout: PrintLayout={id:"p",name:"Test",width:210,height:297,margin:10,units:"mm",pages:[],instances:shapes.map(s => ({id:`p${s.id}`,sourceId:s.id,x:0,y:0,rotation:0}))};
  const result=layoutDxf({version:21,shapes},layout);
  const entities=result.text.split("0\r\nLWPOLYLINE\r\n").slice(1);
  expect(entities).toHaveLength(6);
  const flags=entities.map(e => Number(e.match(/\r\n70\r\n(\d+)/)![1]));
  expect(flags.filter(f=>f===1)).toHaveLength(5);
  expect(flags.filter(f=>f===0)).toHaveLength(1);
  expect(result.svg).toContain('fill="white"');
});

const rect = (id: string, extra: Partial<Shape> = {}): Shape => ({ id, name: id, kind: "rectangle", points: [{ x: 0, y: 0 }, { x: 40, y: 20 }], radius: 0, rotation: 0, ...extra });
const placed = (shapes: Shape[]): PrintLayout => ({ id: "p", name: "Test", width: 210, height: 297, margin: 10, units: "mm", pages: [],
  instances: shapes.map((s, i) => ({ id: `p${s.id}`, sourceId: s.id, x: i * 60, y: 0, rotation: 0 })) });
const entities = (text: string) => {
  const lines = text.split("\r\n"), list: { kind: string; layer: string; color: string }[] = [];
  let inEntities = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const [code, value] = [lines[i], lines[i + 1]];
    if (code === "2" && value === "ENTITIES") inEntities = true;
    else if (inEntities && code === "0" && (value === "LWPOLYLINE" || value === "CIRCLE")) list.push({ kind: value, layer: "", color: "" });
    else if (inEntities && list.length && code === "8") list[list.length - 1].layer = value;
    else if (inEntities && list.length && code === "62") list[list.length - 1].color = value;
  }
  return list;
};
const stitched = (style: "round" | "french" | "japanese" | "flat") => ({ id: "st", shapeId: "a", edges: ["rectangle:2:edge:0"], side: 1 as const, closed: false,
  settings: { style, spacing: 4, inset: 2, alignment: "center" as const, startClearance: 0, endClearance: 0 } });

it("separates cut outlines, stitch holes and markings into coloured layers in cutting order", () => {
  const shapes = [rect("a"), rect("skive", { fillMode: "skiving" }), rect("fold", { strokeStyle: "dashed" }), rect("hole", { fillMode: "cutout" })];
  const result = layoutDxf({ version: 25, shapes, stitchGroups: [stitched("round")] }, placed(shapes));
  const list = entities(result.text);
  const layers = list.map(e => e.layer);
  expect(layers.filter(l => l === "CUT")).toHaveLength(2);
  expect(layers.filter(l => l === "MARKINGS")).toHaveLength(2);
  const holes = list.filter(e => e.layer === "STITCH_HOLES");
  expect(holes.length).toBeGreaterThanOrEqual(4);
  expect(holes.every(e => e.kind === "CIRCLE" && e.color === "")).toBe(true);
  expect(layers.lastIndexOf("MARKINGS")).toBeLessThan(layers.indexOf("STITCH_HOLES"));
  expect(layers.lastIndexOf("STITCH_HOLES")).toBeLessThan(layers.indexOf("CUT"));
  expect(result.text).toMatch(/AcDbLayerTableRecord\r\n2\r\nCUT\r\n70\r\n0\r\n62\r\n1\r\n6\r\nCONTINUOUS/);
  expect(result.text).toMatch(/2\r\nLTYPE\r\n5\r\n\w+\r\n100\r\nAcDbSymbolTable/);
  expect(result.svg).toContain('stroke="#0040ff"');
});

it("writes slit and diamond holes as closed outlines with their printed size", () => {
  for (const [style, corners, width] of [["french", 4, 1.4], ["japanese", 4, 1.4], ["flat", 4, 1.4]] as const) {
    const shapes = [rect("a")];
    const text = layoutDxf({ version: 25, shapes, stitchGroups: [stitched(style)] }, placed(shapes), ["holes"]).text;
    const first = text.split("0\r\nLWPOLYLINE\r\n")[1].split("\r\n");
    expect(first[first.indexOf("90") + 1]).toBe(String(corners));
    expect(first[first.indexOf("70") + 1]).toBe("1");
    const xs = first.flatMap((v, i) => v === "10" ? [Number(first[i + 1])] : []), ys = first.flatMap((v, i) => v === "20" ? [Number(first[i + 1])] : []);
    const pts = xs.map((x, i) => ({ x, y: ys[i] }));
    const longest = Math.max(...pts.flatMap(p => pts.map(q => Math.hypot(p.x - q.x, p.y - q.y))));
    expect(longest).toBeCloseTo(style === "japanese" ? width : Math.hypot(1.4, style === "flat" ? 0.3 : 0.2), 6);
  }
});

it("exports only the chosen layers and explains empty choices", () => {
  const shapes = [rect("a"), rect("skive", { fillMode: "glueing" })];
  const doc = { version: 25, shapes, stitchGroups: [stitched("round")] };
  expect(new Set(entities(layoutDxf(doc, placed(shapes), ["cut"]).text).map(e => e.layer))).toEqual(new Set(["CUT"]));
  const holesOnly = layoutDxf(doc, placed(shapes), ["holes"]).text;
  expect(new Set(entities(holesOnly).map(e => e.layer))).toEqual(new Set(["STITCH_HOLES"]));
  expect(() => layoutDxf(doc, placed(shapes), [])).toThrow("Choose at least one layer");
  expect(() => layoutDxf({ version: 25, shapes: [rect("a")] }, placed([rect("a")]), ["holes", "markings"])).toThrow("Nothing to export on the selected layers");
});

it("keeps holes of stitch-only and hidden-outline pieces but skips hidden print copies", () => {
  const shapes = [rect("a", { stitchOnly: true })];
  const doc = { version: 25, shapes, stitchGroups: [stitched("round")] };
  expect(entities(layoutDxf(doc, placed(shapes)).text).every(e => e.layer === "STITCH_HOLES")).toBe(true);
  const hidden = placed(shapes);
  hidden.instances[0].hidden = true;
  expect(() => layoutDxf(doc, hidden)).toThrow("Nothing to export");
});

const firstPoint = (text: string, entity: "LWPOLYLINE" | "CIRCLE", layer: string) => {
  const lines = text.split("\r\n");
  for (let i = 0; i < lines.length; i += 2)
    if (lines[i] === "0" && lines[i + 1] === entity && lines[lines.indexOf("8", i) + 1] === layer) {
      const x = lines.indexOf("10", i);
      return { x: Number(lines[x + 1]), y: Number(lines[x + 3]) };
    }
  throw Error("missing entity");
};

it("keeps the same origin whichever layers are exported", () => {
  const shapes = [rect("a"), rect("skive", { fillMode: "skiving" })];
  const doc = { version: 25, shapes, stitchGroups: [stitched("round")] };
  const all = layoutDxf(doc, placed(shapes)).text;
  const holes = layoutDxf(doc, placed(shapes), ["holes"]);
  const cut = layoutDxf(doc, placed(shapes), ["cut"]).text;
  expect(firstPoint(holes.text, "CIRCLE", "STITCH_HOLES")).toEqual(firstPoint(all, "CIRCLE", "STITCH_HOLES"));
  expect(firstPoint(cut, "LWPOLYLINE", "CUT")).toEqual(firstPoint(all, "LWPOLYLINE", "CUT"));
  expect(holes.width).toBeCloseTo(102);
});

it("cuts enclosed outlines before the outline around them regardless of object order", () => {
  const piece = rect("piece", { points: [{ x: 0, y: 0 }, { x: 80, y: 40 }] });
  const slot = rect("slot", { points: [{ x: 10, y: 10 }, { x: 30, y: 20 }], fillMode: "cutout" });
  for (const shapes of [[piece, slot], [slot, piece]]) {
    const layout: PrintLayout = { ...placed(shapes), instances: shapes.map(s => ({ id: `p${s.id}`, sourceId: s.id, x: 0, y: 0, rotation: 0 })) };
    const text = layoutDxf({ version: 25, shapes }, layout, ["cut"]).text;
    const lines = text.split("\r\n"), counts = lines.flatMap((v, i) => v === "90" && i % 2 === 0 ? [Number(lines[i + 1])] : []);
    const xs = text.split("LWPOLYLINE").slice(1).map(e => { const l = e.split("\r\n"); return Math.max(...l.flatMap((v, i) => v === "10" ? [Number(l[i + 1])] : [])); });
    expect(counts).toHaveLength(2);
    expect(xs[0]).toBeLessThan(xs[1]);
  }
});

it("skips a broken stitching run with a warning but still exports outlines", () => {
  const shapes = [rect("a")];
  const broken = { ...stitched("round"), edges: ["missing:edge"] };
  const result = layoutDxf({ version: 25, shapes, stitchGroups: [broken] }, placed(shapes));
  expect(entities(result.text).map(e => e.layer)).toEqual(["CUT"]);
  expect(result.warnings).toEqual([expect.stringContaining("Skipped stitching on “a”")]);
  expect(() => layoutDxf({ version: 25, shapes, stitchGroups: [broken] }, placed(shapes), ["holes"])).toThrow(/Nothing to export.*Skipped stitching/);
});
