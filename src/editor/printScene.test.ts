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
  expect(first).toContain("1–2 1");
  expect(second).toContain("1–2 1");
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

it("keeps registration decorations inside pieces even with narrow margins", () => {
  const svg = pageSvg(doc, layout, layout.pages[0]);
  expect(svg.match(/data-assembly="registration"/g)).toHaveLength(1);
  expect(svg).toContain("1–2 1");
  expect(svg).toContain('data-assembly="trim"');
  const narrow = pageSvg(doc, { ...layout, margin: 2 }, layout.pages[0]);
  expect(narrow).toContain('data-assembly="registration"');
  expect(narrow).toContain('data-assembly="label"');
  expect(
    pageSvg(doc, { ...layout, instances: [] }, layout.pages[0]),
  ).not.toContain("data-assembly=");
});

it("leaves a clear gap between both diamond halves and their labels", () => {
  const labelPosition = (svg: string) => {
    const match = svg.match(
      /data-assembly="label"[^>]*><text transform="translate\(([-\d.]+) ([-\d.]+)\)/,
    );
    expect(match).not.toBeNull();
    return { x: Number(match![1]), y: Number(match![2]) };
  };
  const first = labelPosition(pageSvg(doc, layout, layout.pages[0]));
  const second = labelPosition(pageSvg(doc, layout, layout.pages[1]));
  const halfWidth = ("1–2 1".length * 1.2) / 2;
  expect(200 - (first.x + halfWidth)).toBeGreaterThanOrEqual(3);
  expect(second.x - halfWidth - 10).toBeGreaterThanOrEqual(3);
  expect(first.y).toBe(second.y);
});

it("omits labels crossed by a concave notch even when their corners are inside", () => {
  const notched: Shape = {
    ...shape,
    kind: "polyline",
    radius: 0,
    points: [
      [0, 0],
      [40, 0],
      [40, 20],
      [14, 20],
      [14, 10],
      [13, 10],
      [13, 20],
      [0, 20],
      [0, 0],
    ].map(([x, y]) => ({ x, y })),
  };
  const first = pageSvg({ ...doc, shapes: [notched] }, layout, layout.pages[0]);
  expect(first).toContain('data-assembly="registration"');
  expect(first).not.toContain('data-assembly="label"');
  const second = pageSvg(
    { ...doc, shapes: [notched] },
    layout,
    layout.pages[1],
  );
  expect(second).toContain('data-assembly="label"');
  expect(second).toContain("1–2 1");
});

for (const vertical of [true, false]) {
  it(`rejects touching pieces on both sides of a ${vertical ? "vertical" : "horizontal"} join`, () => {
    const pieces = [
      shape,
      { ...shape, id: "before", radius: 0 },
      { ...shape, id: "after", radius: 0 },
    ];
    const testLayout: PrintLayout = {
      ...layout,
      pages: [
        { column: 0, row: 0 },
        vertical ? { column: 1, row: 0 } : { column: 0, row: 1 },
      ],
      instances: pieces.map((p, i) => ({
        id: `copy${i}`,
        sourceId: p.id,
        x: vertical ? [190, 170, 210][i] : 100,
        y: vertical ? 100 : [277, 267, 287][i],
        rotation: 0,
      })),
    };
    for (const page of testLayout.pages) {
      const svg = pageSvg({ ...doc, shapes: pieces }, testLayout, page);
      expect(svg.match(/data-assembly="registration"/g)).toHaveLength(1);
      expect(svg).toContain("1–2 1");
      expect(svg).not.toContain("1–2 2");
    }
  });
}

it("joins closed polygon corners while preserving open endpoints", () => {
  const polygon: Shape = { ...shape, kind: "polyline", radius: 0,
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 0 }] };
  expect(svgShapePath(polygon)).toBe("M0 0 L20 0 L10 20 Z");
  expect(svgShapePath({ ...polygon, points: polygon.points.slice(0, -1) })).not.toContain("Z");
  expect(svgShapePath({ ...polygon, radius: 2 })).toMatch(/Z$/);
});
it("closes curves after their final curved segment", () => {
  const curve: Shape = { ...shape, kind: "curve", radius: 0,
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 0 }] };
  expect(svgShapePath(curve)).toMatch(/C[^Z]+Z$/);
  expect(svgShapePath({ ...curve, points: curve.points.slice(0, -1) })).not.toContain("Z");
});
