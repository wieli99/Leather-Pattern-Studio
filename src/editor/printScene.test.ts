import { expect, it } from "vitest";
import { pageSvg, svgShapePath, orderedPrintPages } from "./printScene";
import type { Doc, Shape } from "../model/project";
import type { PrintLayout } from "../model/printLayout";
const shape: Shape = {
  id: "piece",
  name: "Piece",
  kind: "rectangle",
  points: [
    { x: 0, y: 0 },
    { x: 40, y: 20 },
  ],
  radius: 2,
  rotation: 0,
};
const layout: PrintLayout = {
  id: "print",
  name: "A4",
  width: 210,
  height: 297,
  margin: 10,
  units: "in-decimal",
  pages: [
    { column: 0, row: 0 },
    { column: 1, row: 0 },
  ],
  instances: [{ id: "copy", sourceId: "piece", x: 190, y: 100, rotation: 0 }],
};
const doc: Doc = { version: 18, shapes: [shape] };
it("uses physical paper dimensions, clips artwork, and pairs seam identifiers", () => {
  const first = pageSvg(doc, layout, layout.pages[0]),
    second = pageSvg(doc, layout, layout.pages[1]);
  expect(first).toContain('width="210mm"');
  expect(first).toContain('clip-path="url(#paper-clip)"');
  expect(first).toContain("V1,0");
  expect(second).toContain("V1,0");
  expect(
    orderedPrintPages({
      ...layout,
      pages: [
        { column: 1, row: 1 },
        { column: -1, row: 0 },
        { column: 0, row: 0 },
      ],
    }),
  ).toEqual([
    { column: -1, row: 0 },
    { column: 0, row: 0 },
    { column: 1, row: 1 },
  ]);
});
it("emits editable vector paths for arcs, fillets and cubic curves", () => {
  expect(svgShapePath(shape)).toContain("A2 2");
  expect(svgShapePath({ ...shape, kind: "circle" })).toContain("A");
  expect(
    svgShapePath({
      ...shape,
      kind: "curve",
      radius: 0,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 40, y: 0 },
      ],
    }),
  ).toContain("C");
});
it("converts measurement labels to layout units and escapes user text", () => {
  const measurement: Shape = {
    ...shape,
    kind: "measurement",
    points: [
      { x: 0, y: 0 },
      { x: 25.4, y: 0 },
    ],
    measurementOffset: 5,
    radius: 0,
  };
  const svg = pageSvg(
    { version: 18, shapes: [measurement] },
    layout,
    layout.pages[0],
  );
  expect(svg).toContain("1 in");
  expect(svg).not.toContain("25.40 mm");
  const text: Shape = {
    ...shape,
    kind: "text",
    text: '<script>&"',
    fontSize: 5,
  };
  expect(
    pageSvg({ version: 18, shapes: [text] }, layout, layout.pages[0]),
  ).toContain("&lt;script&gt;&amp;&quot;");
});
it("keeps hidden grid sources visible but honors print visibility", () => {
  expect(
    pageSvg(
      { version: 18, shapes: [{ ...shape, hidden: true }] },
      layout,
      layout.pages[0],
    ),
  ).toContain("A2 2");
  expect(
    pageSvg(
      doc,
      { ...layout, instances: [{ ...layout.instances[0], hidden: true }] },
      layout.pages[0],
    ),
  ).not.toContain("A2 2");
});

import { unlinkPrintNode } from "../model/printLayout";
it("exports frozen artwork and stitching after unlinking and source deletion", () => {
  const stitched: Doc = { ...doc, stitchGroups: [{ id: "st", shapeId: shape.id,
    edges: ["rectangle:2:edge:0"], side: 1, closed: false,
    settings: { style: "round", spacing: 4, inset: 2, alignment: "center", startClearance: 0, endClearance: 0 } }] };
  const detached = unlinkPrintNode(stitched, layout, "copy");
  const before = pageSvg(stitched, layout, layout.pages[0]);
  expect(pageSvg(stitched, detached, layout.pages[0])).toBe(before);
  expect(pageSvg({ ...stitched, shapes: [], stitchGroups: [] }, detached, layout.pages[0])).toBe(before);
});
