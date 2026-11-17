import { expect, test } from "vitest";
import { booleanOutlines, type BooleanOutline } from "./boolean";
import type { Cubic } from "./curves";
function box(x: number, y: number, size: number): BooleanOutline {
  const p = [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
  return [
    p.map((a, i) => {
      const b = p[(i + 1) % 4];
      return [a, a, b, b] as Cubic;
    }),
  ];
}
test("boolean operations preserve closed contours and holes", () => {
  expect(booleanOutlines("union", [box(0, 0, 10), box(5, 0, 10)])).toHaveLength(
    1,
  );
  expect(
    booleanOutlines("intersect", [box(0, 0, 10), box(20, 0, 10)]),
  ).toHaveLength(0);
  expect(
    booleanOutlines("subtract", [box(0, 0, 10), box(2, 2, 3)]),
  ).toHaveLength(2);
  expect(
    booleanOutlines("exclude", [box(0, 0, 10), box(0, 0, 10)]),
  ).toHaveLength(0);
});
test("three-way XOR uses odd parity", () => {
  expect(
    booleanOutlines("exclude", [box(0, 0, 10), box(0, 0, 10), box(0, 0, 10)]),
  ).toHaveLength(1);
});

test("compound geometry survives project round trips and rejects broken seams", async () => {
  const { parseProject } = await import("./project");
  const contours = booleanOutlines("subtract", [box(0, 0, 10), box(2, 2, 3)]);
  const shape = {
    id: "result",
    name: "Result",
    kind: "compound",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    contours,
    radius: 0,
    rotation: 0,
  };
  const serialized = JSON.stringify({ version: 22, shapes: [shape] });
  expect(parseProject(serialized).shapes[0].contours).toEqual(contours);
  shape.contours[0][0][0].x += 1;
  expect(() =>
    parseProject(JSON.stringify({ version: 22, shapes: [shape] })),
  ).toThrow("continuous");
});

import { booleanShapes } from "./booleanShapes";
import { contains, bounds, moveShape, scaleShape, hitTest } from "./geometry";
import { shapeArea } from "./area";
import { flattenContours } from "./flattenOutline";
import { offsetShape } from "./offset";
import {
  stitchEdges,
  stitchGeometry,
  validateStitchGroups,
} from "./stitchGeometry";
import { defaultStitchSettings } from "./stitch";
import type { Shape } from "./project";
const rect = (id: string, x: number, y: number, w: number, h = w): Shape => ({
  id,
  name: id,
  kind: "rectangle",
  points: [
    { x, y },
    { x: x + w, y: y + h },
  ],
  radius: 0,
  rotation: 0,
});
test("holes retain physical geometry across transforms, offsets, and exports", () => {
  const result = booleanShapes("subtract", [
    rect("a", 0, 0, 30),
    rect("b", 10, 10, 10),
  ])!;
  expect(shapeArea(result)).toBeCloseTo(800, 4);
  expect(contains(result, { x: 15, y: 15 })).toBe(false);
  expect(contains(result, { x: 5, y: 5 })).toBe(true);
  expect(hitTest(result, { x: 10, y: 15 }, 0.01)).toBe(true);
  expect(flattenContours(result)).toHaveLength(2);
  const moved = moveShape(result, 100, 200);
  expect(bounds([moved])).toMatchObject({
    x: 100,
    y: 200,
    width: 30,
    height: 30,
  });
  expect(contains(moved, { x: 115, y: 215 })).toBe(false);
  expect(shapeArea(scaleShape(result, 2, { x: 0, y: 0 }))).toBeCloseTo(3200, 3);
  const offset = offsetShape(result, 1, "sharp");
  expect(contains(offset, { x: 10.5, y: 15 })).toBe(true);
  expect(contains(offset, { x: 15, y: 15 })).toBe(false);
});
test("curved booleans keep cubic segments and disconnected islands", () => {
  const circle: Shape = {
    ...rect("circle", 0, 0, 10),
    kind: "circle",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  };
  const result = booleanShapes("intersect", [
    circle,
    rect("clip", 0, -20, 20, 40),
  ])!;
  expect(shapeArea(result)).toBeCloseTo(Math.PI * 50, 2);
  expect(
    result.contours!.flat().some((c) => c[0].x !== c[1].x || c[0].y !== c[1].y),
  ).toBe(true);
  expect(
    booleanShapes("union", [circle, rect("other", 30, 0, 10)])!.contours,
  ).toHaveLength(2);
});
test("stitching attaches to a single hole contour without joining separate contours", () => {
  const shape = booleanShapes("subtract", [
    rect("a", 0, 0, 30),
    rect("b", 10, 10, 10),
  ])!;
  const edges = stitchEdges(shape);
  let offset = 0;
  for (const contour of shape.contours!) {
    const group = {
      id: "st",
      shapeId: shape.id,
      edges: edges.slice(offset, offset + contour.length).map((e) => e.key),
      side: 1 as const,
      closed: true,
      settings: { ...defaultStitchSettings, inset: 1 },
    };
    expect(validateStitchGroups([group], [shape])).toHaveLength(1);
    expect(stitchGeometry(shape, group).holes.length).toBeGreaterThan(0);
    offset += contour.length;
  }
});

test("compound SVG and DXF export preserve separate hole contours", async () => {
  const { printShapeSvg } = await import("../editor/printScene");
  const { layoutDxf } = await import("../editor/printDxf");
  const shape = booleanShapes("subtract", [
    rect("a", 0, 0, 30),
    rect("b", 10, 10, 10),
  ])!;
  const doc = { version: 22 as const, shapes: [shape] };
  const layout = {
    id: "p",
    name: "Print",
    width: 210,
    height: 297,
    margin: 10,
    units: "mm" as const,
    pages: [],
    instances: [{ id: "copy", sourceId: shape.id, x: 0, y: 0, rotation: 0 }],
  };
  const svg = printShapeSvg(doc, shape, shape.id, layout);
  expect(svg).toContain('fill-rule="evenodd"');
  expect((svg.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(2);
  const dxf = layoutDxf(doc, layout).text;
  expect(dxf.split("0\r\nLWPOLYLINE\r\n").slice(1)).toHaveLength(2);
});

test("invalid self crossings and touching or identical outlines are deterministic", () => {
  const p = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 10, y: 0 },
  ];
  const crossed: BooleanOutline = [
    p.map((a, i) => {
      const b = p[(i + 1) % 4];
      return [a, a, b, b];
    }),
  ];
  expect(() => booleanOutlines("union", [crossed, box(20, 0, 10)])).toThrow();
  expect(
    shapeArea(
      booleanShapes("union", [rect("a", 0, 0, 10), rect("b", 10, 0, 10)])!,
    ),
  ).toBeCloseTo(200);
  expect(
    booleanShapes("subtract", [rect("a", 0, 0, 10), rect("b", 0, 0, 10)]),
  ).toBeNull();
});

test("inserting and toggling a compound anchor preserves the other contours", async () => {
  const { insertAnchor } = await import("./insertAnchor");
  const { toggleAnchor } = await import("./sharpAnchor");
  const { cubicAt } = await import("./curves");
  const shape = booleanShapes("subtract", [
    rect("a", 0, 0, 30),
    rect("b", 10, 10, 10),
  ])!;
  const inserted = insertAnchor(
    shape,
    cubicAt(shape.contours![0][0], 0.5),
    0.01,
  )!;
  expect(inserted.contours![0]).toHaveLength(shape.contours![0].length + 1);
  expect(inserted.contours![1]).toEqual(shape.contours![1]);
  expect(shapeArea(inserted)).toBeCloseTo(shapeArea(shape)!, 4);
  const toggled = toggleAnchor(inserted, 0);
  expect(toggled.contours![1]).toEqual(shape.contours![1]);
});
