import { expect, test } from "vitest";
import type { Shape, Doc } from "./project";
import { parseProject } from "./project";
import { defaultStitchSettings } from "./stitch";
import {
  stitchEdges,
  stitchGeometry,
  insideStitchSide,
  orderStitchEdges,
  reconcileStitches,
  type StitchGroup,
} from "./stitchGeometry";
const rect: Shape = {
  id: "r",
  name: "Rectangle",
  kind: "rectangle",
  points: [
    { x: 0, y: 0 },
    { x: 40, y: 30 },
  ],
  rotation: 0,
  radius: 8,
};
function group(s = rect, indices = [0]): StitchGroup {
  const all = stitchEdges(s);
  return {
    id: "g",
    shapeId: s.id,
    edges: indices.map((i) => all[i].key),
    side: insideStitchSide(s),
    settings: { ...defaultStitchSettings },
    closed: false,
  };
}
test("rounded rectangles expose four straight edges and four independently stitchable corners", () => {
  expect(stitchEdges(rect)).toHaveLength(8);
  const line = stitchGeometry(rect, group());
  expect(line.length).toBeCloseTo(14, 3);
  const corner = stitchGeometry(rect, group(rect, [1]));
  expect(corner.length).toBeCloseTo((5 * Math.PI) / 2, 3);
});
test("merge uses continuous spacing across straight/corner boundary", () => {
  const g = group(rect, [0, 1, 2]);
  const result = stitchGeometry(rect, g);
  expect(result.length).toBeCloseTo(24 + (5 * Math.PI) / 2 + 14, 3);
  expect(result.holes).toHaveLength(Math.floor(result.length / 3.85) + 1);
  expect(() =>
    orderStitchEdges(rect, [g.edges[0], stitchEdges(rect)[4].key]),
  ).toThrow();
});
test("sharp corners miter and full loops avoid duplicate seam holes", () => {
  const s = { ...rect, radius: 0 };
  const g = { ...group(s, [0, 1, 2, 3]), closed: true };
  const result = stitchGeometry(s, g);
  expect(result.length).toBeCloseTo(116, 5);
  expect(result.holes).toHaveLength(Math.floor(116 / 3.85));
});
test("reflection preserves inside and physical inset; resize preserves pitch", () => {
  const s = { ...rect, transform: { a: -2, b: 0, c: 0, d: 2, e: 0, f: 0 } };
  const result = stitchGeometry(s, group(s, [0]));
  expect(result.length).toBeCloseTo(28, 3);
  expect(result.points[0].x).toBeCloseTo(-3, 3);
});
test("collapsed offsets retained in files but do not produce holes", () => {
  const g = {
    ...group(rect, [1]),
    settings: { ...defaultStitchSettings, inset: 9 },
  };
  expect(() => stitchGeometry(rect, g)).toThrow();
  expect(
    parseProject(
      JSON.stringify({ version: 8, shapes: [rect], stitchGroups: [g] }),
    ).stitchGroups,
  ).toEqual([g]);
});
test("removed corner members split a merged group and undo data remains untouched", () => {
  const g = { ...group(rect, [0, 1, 2]), closed: false };
  const doc: Doc = {
    version: 8,
    shapes: [{ ...rect, radius: 0 }],
    stitchGroups: [g],
  };
  const next = reconcileStitches(doc);
  expect(next.stitchGroups?.map((g) => g.edges)).toEqual([
    [g.edges[0]],
    [g.edges[2]],
  ]);
  expect(g.edges).toHaveLength(3);
  expect(reconcileStitches({ ...doc, shapes: [] }).stitchGroups).toEqual([]);
});
test("version migration and ownership validation", () => {
  expect(parseProject('{"version":7,"shapes":[]}').version).toBe(22);
  const g = group();
  expect(() =>
    parseProject(
      JSON.stringify({
        version: 8,
        shapes: [rect],
        stitchGroups: [g, { ...g, id: "other" }],
      }),
    ),
  ).toThrow();
});
test("circles, ellipses, arcs and cubic segments use world-space offsets", () => {
  const circle: Shape = {
    ...rect,
    kind: "circle",
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
    radius: 0,
  };
  const cg = { ...group(circle), closed: true };
  expect(stitchGeometry(circle, cg).length).toBeCloseTo(34 * Math.PI, 3);
  const ellipse: Shape = { ...rect, kind: "ellipse", radius: 0 };
  expect(
    stitchGeometry(ellipse, { ...group(ellipse), closed: true }).length,
  ).toBeGreaterThan(60);
  const arc: Shape = { ...circle, kind: "arc", sweep: 90 };
  expect(stitchGeometry(arc, group(arc)).length).toBeCloseTo(
    (17 * Math.PI) / 2,
    3,
  );
  const curve: Shape = {
    ...rect,
    kind: "control-curve",
    points: [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ],
    radius: 0,
    handles: [
      { incoming: { x: 0, y: 0 }, outgoing: { x: 10, y: 10 } },
      { incoming: { x: -10, y: 10 }, outgoing: { x: 0, y: 0 } },
    ],
  };
  expect(
    stitchGeometry(curve, { ...group(curve), side: 1 }).length -
      stitchGeometry(curve, { ...group(curve), side: -1 }).length,
  ).toBeCloseTo(3 * Math.PI, 3);
});
test("adding a rounded corner extends the merged group through its new arc", () => {
  const sharp = { ...rect, radius: 0 },
    g = group(sharp, [0, 1]);
  const next = reconcileStitches(
    { version: 8, shapes: [rect], stitchGroups: [g] },
    { version: 8, shapes: [sharp], stitchGroups: [g] },
  );
  expect(next.stitchGroups).toHaveLength(1);
  expect(next.stitchGroups?.[0].edges).toEqual([
    g.edges[0],
    stitchEdges(rect)[1].key,
    g.edges[1],
  ]);
});
test("open paths expose both sides and self-intersecting merged offsets are rejected", () => {
  const line: Shape = {
    ...rect,
    kind: "line",
    radius: 0,
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
  };
  expect(stitchGeometry(line, { ...group(line), side: 1 }).points[0].y).toBe(3);
  expect(stitchGeometry(line, { ...group(line), side: -1 }).points[0].y).toBe(
    -3,
  );
  const s: Shape = {
    ...line,
    kind: "polyline",
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
      { x: 20, y: 0 },
    ],
  };
  expect(() => stitchGeometry(s, group(s, [0, 1, 2]))).toThrow();
});

test("reflection carries the chosen open-path side with the source", () => {
  const line: Shape = {
    ...rect,
    kind: "line",
    radius: 0,
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
    transform: { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 },
  };
  expect(stitchGeometry(line, { ...group(line), side: 1 }).points[0].y).toBe(3);
});

test("individual sharp rectangle edges stop at adjacent inset intersections", () => {
  const sharp = { ...rect, radius: 0 };
  for (let i = 0; i < 4; i++) {
    const result = stitchGeometry(sharp, group(sharp, [i]));
    expect(result.holes.length).toBeGreaterThan(1);
    expect(result.length).toBeCloseTo(i % 2 ? 34 : 24, 5);
  }
});

test("rounding preserves closed perimeters but does not claim arcs for single or separate lines", () => {
  const sharp = { ...rect, radius: 0 };
  const closed = { ...group(sharp, [0, 1, 2, 3]), closed: true };
  const adapt = (groups: StitchGroup[]) =>
    reconcileStitches(
      { version: 10, shapes: [rect], stitchGroups: groups },
      { version: 10, shapes: [sharp], stitchGroups: groups },
    );
  const full = adapt([closed]).stitchGroups![0];
  expect(full.id).toBe(closed.id);
  expect(full.closed).toBe(true);
  expect(full.edges).toEqual(stitchEdges(rect).map((e) => e.key));
  expect(() => stitchGeometry(rect, full)).not.toThrow();
  const single = group(sharp);
  expect(adapt([single]).stitchGroups![0].edges).toEqual(single.edges);
  const separate = [single, { ...group(sharp, [1]), id: "other" }];
  expect(adapt(separate).stitchGroups?.map((g) => g.edges)).toEqual(
    separate.map((g) => g.edges),
  );
});

test("triangle stitch endpoints meet neighboring inset lines for either winding", () => {
  const vertices = [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 30, y: 30 * Math.sqrt(3) },
  ];
  for (const order of [vertices, [...vertices].reverse()]) {
    const triangle: Shape = {
      ...rect,
      kind: "polyline",
      radius: 0,
      points: [...order, order[0]],
    };
    for (let i = 0; i < 3; i++) {
      const result = stitchGeometry(triangle, group(triangle, [i]));
      expect(result.length).toBeCloseTo(60 - 6 * Math.sqrt(3), 3);
      const single = group(triangle, [i]);
      const pair = {
        ...single,
        edges: orderStitchEdges(triangle, [
          single.edges[0],
          stitchEdges(triangle)[(i + 1) % 3].key,
        ]),
      };
      expect(() => stitchGeometry(triangle, pair)).not.toThrow();
    }
  }
});
test("acute and right triangles accept valid insets but reject collapsed paths", () => {
  for (const points of [
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 5, y: 20 },
      { x: 0, y: 0 },
    ],
    [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 0, y: 40 },
      { x: 0, y: 0 },
    ],
  ]) {
    const shape: Shape = { ...rect, kind: "polyline", radius: 0, points };
    for (let i = 0; i < 3; i++)
      expect(() =>
        stitchGeometry(shape, {
          ...group(shape, [i]),
          settings: { ...defaultStitchSettings, inset: 0.5 },
        }),
      ).not.toThrow();
    expect(() =>
      stitchGeometry(shape, {
        ...group(shape),
        settings: { ...defaultStitchSettings, inset: 100 },
      }),
    ).toThrow();
  }
});

test("project parsing preserves both stitch marker dimensions", () => {
  const g = group();
  g.settings = {
    ...g.settings,
    style: "round",
    roundDiameter: 2.3,
    flatLength: 4.1,
  };
  const project = { version: 10, shapes: [rect], stitchGroups: [g] };
  const loaded = parseProject(JSON.stringify(project));
  expect(loaded.stitchGroups![0].settings).toEqual(g.settings);
  expect(parseProject(JSON.stringify(loaded)).stitchGroups![0].settings).toEqual(
    g.settings,
  );
});

test("project preserves reverse irons, presets and dormant numbered hole overrides", () => {
  const g = group();
  g.settings.reversed = true;
  g.holeOverrides = { "100": { ...defaultStitchSettings, style: "round", roundDiameter: .8 } };
  const saved = { version: 20, shapes: [rect], stitchGroups: [g], stitchPresets: [{ name: "My iron", settings: g.settings }] };
  const loaded = parseProject(JSON.stringify(saved));
  expect(loaded.stitchGroups![0]).toEqual(g);
  expect(loaded.stitchPresets).toEqual(saved.stitchPresets);
  expect(stitchGeometry(rect, g).holes).toEqual(stitchGeometry(rect, { ...g, settings: { ...g.settings, reversed: false } }).holes);
  expect(parseProject(JSON.stringify(loaded))).toEqual(loaded);
});
