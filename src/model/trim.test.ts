import { expect, test } from "vitest";
import type { Shape } from "./project";
import { trimAt } from "./trim";
const line = (id: string, points: Shape["points"]): Shape => ({
  id,
  name: id,
  kind: "line",
  points,
  radius: 0,
  rotation: 0,
});
test("preview highlights the same crossing-bounded span that a click removes", () => {
  const shapes = [
    line("target", [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ]),
    line("cut1", [
      { x: 10, y: -5 },
      { x: 10, y: 5 },
    ]),
    line("cut2", [
      { x: 20, y: -5 },
      { x: 20, y: 5 },
    ]),
  ];
  const original = JSON.stringify(shapes);
  let span: Shape["points"] = [];
  trimAt(shapes, { x: 15, y: 1 }, 2, (value) => {
    span = value;
  });
  expect(span).toEqual([
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ]);
  expect(JSON.stringify(shapes)).toBe(original);
  const result = trimAt(shapes, { x: 15, y: 1 }, 2)!;
  expect(result.slice(0, 2).map((s) => s.points)).toEqual([
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    [
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ],
  ]);
  expect(result.slice(2)).toEqual(shapes.slice(1));
});
test("an isolated line is removed and empty clicks do nothing", () => {
  const shapes = [
    line("a", [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]),
  ];
  expect(trimAt(shapes, { x: 5, y: 0 }, 1)).toEqual([]);
  expect(trimAt(shapes, { x: 5, y: 10 }, 1)).toBeNull();
});

import { cubicAt } from "./curves";
import { boundary, worldCubics } from "./geometry";
import { parseProject } from "./project";
const circle = (id: string, x = 0): Shape => ({
  ...line(id, [
    { x, y: 0 },
    { x: x + 10, y: 0 },
  ]),
  kind: "circle",
});
const arch = (id: string): Shape => ({
  ...line(id, [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
  ]),
  kind: "control-curve",
  handles: [
    { incoming: { x: 0, y: 0 }, outgoing: { x: 10, y: 20 } },
    { incoming: { x: -10, y: 20 }, outgoing: { x: 0, y: 0 } },
  ],
});
test("circle trims across its parameter seam and preserves exact arcs", () => {
  const shapes = [
    circle("c"),
    line("cut", [
      { x: 5, y: -20 },
      { x: 5, y: 20 },
    ]),
  ];
  const result = trimAt(shapes, { x: 10, y: 0 }, 0.1)!;
  expect(result).toHaveLength(2);
  expect(result[0].kind).toBe("arc");
  expect(result[0].sweep).toBeCloseTo(240, 5);
  expect(boundary(result[0]).curves[0].c).toEqual({ x: 0, y: 0 });
  expect(
    parseProject(JSON.stringify({ version: 11, shapes: result })).shapes,
  ).toHaveLength(2);
});
test("anchors bound cuts on isolated smooth curves", () => {
  const shape: Shape = {
    ...line("c", [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]),
    kind: "curve",
  };
  expect(trimAt([shape], { x: 10, y: 10 }, 0.1)![0].points).toEqual([
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ]);
  expect(trimAt([circle("c")], { x: 10, y: 0 }, 0.1)).toEqual([]);
});
test("Bézier cuts retain exact geometry and preview follows the removed arch", () => {
  const curve = arch("arch"),
    original = JSON.stringify(curve);
  const shapes = [
    curve,
    line("a", [
      { x: 10, y: -5 },
      { x: 10, y: 30 },
    ]),
    line("b", [
      { x: 20, y: -5 },
      { x: 20, y: 30 },
    ]),
  ];
  let preview: Shape["points"] = [];
  trimAt(shapes, { x: 15, y: 15 }, 0.1, (p) => (preview = p));
  expect(preview[0].x).toBeCloseTo(10, 5);
  expect(preview.at(-1)!.x).toBeCloseTo(20, 5);
  expect(Math.max(...preview.map((p) => p.y))).toBeCloseTo(15, 3);
  const result = trimAt(shapes, { x: 15, y: 15 }, 0.1)!;
  expect(result).toHaveLength(4);
  expect(result.slice(0, 2).every((s) => s.kind === "control-curve")).toBe(
    true,
  );
  const retained = worldCubics(result[0])[0];
  const expected = cubicAt(worldCubics(curve)[0], 1 / 6);
  expect(cubicAt(retained, 0.5).x).toBeCloseTo(expected.x, 5);
  expect(cubicAt(retained, 0.5).y).toBeCloseTo(expected.y, 5);
  expect(JSON.stringify(curve)).toBe(original);
});
test("curves cut straight targets and a tangent does not split a circle", () => {
  const target = line("target", [
    { x: -20, y: 0 },
    { x: 20, y: 0 },
  ]);
  const result = trimAt([circle("c"), target], { x: 0, y: 0 }, 0.1)!;
  expect(result.filter((s) => s.id !== "c")).toHaveLength(2);
  expect(
    trimAt(
      [
        circle("c"),
        line("tangent", [
          { x: -20, y: 10 },
          { x: 20, y: 10 },
        ]),
      ],
      { x: 10, y: 0 },
      0.1,
    ),
  ).toHaveLength(1);
});
test("ellipses, negative arcs and transformed curves round trip", () => {
  const ellipse: Shape = {
    ...circle("e"),
    kind: "ellipse",
    points: [
      { x: -20, y: -10 },
      { x: 20, y: 10 },
    ],
    rotation: 25,
  };
  const cutter = line("cut", [
    { x: 0, y: -40 },
    { x: 0, y: 40 },
  ]);
  const result = trimAt([ellipse, cutter], { x: 18.126, y: 8.452 }, 0.1)!;
  expect(result[0].kind).toBe("arc");
  expect(
    parseProject(JSON.stringify({ version: 11, shapes: result })).shapes,
  ).toHaveLength(2);
  const arc: Shape = { ...circle("arc"), kind: "arc", sweep: -180 };
  const trimmed = trimAt([arc, cutter], { x: 7.071, y: -7.071 }, 0.1)!;
  expect(trimmed[0].sweep).toBeCloseTo(-90, 5);
});

test("rounded outlines continue through smooth joins and retain exact remaining pieces", () => {
  const rounded: Shape = {
    ...line("rounded", [
      { x: 0, y: 0 },
      { x: 40, y: 30 },
    ]),
    kind: "rectangle",
    radius: 5,
  };
  expect(trimAt([rounded], { x: 20, y: 0 }, 0.1)).toEqual([]);
  const cut = line("cut", [
    { x: 20, y: -10 },
    { x: 20, y: 40 },
  ]);
  const result = trimAt([rounded, cut], { x: 0, y: 15 }, 0.1)!;
  const remains = result.filter((s) => s.id !== "cut");
  expect(remains.some((s) => s.kind === "arc")).toBe(true);
  expect(remains.some((s) => s.kind === "line")).toBe(true);
  expect(
    parseProject(JSON.stringify({ version: 11, shapes: result })).shapes,
  ).toHaveLength(result.length);
});
test("curve-curve crossings, coincident cutters and affine transforms remain stable", () => {
  const shape = arch("arch");
  const cutting: Shape = {
    ...line("cut", [
      { x: 15, y: -10 },
      { x: 15, y: 30 },
    ]),
    kind: "control-curve",
    handles: [
      { incoming: { x: 0, y: 0 }, outgoing: { x: 0, y: 10 } },
      { incoming: { x: 0, y: -10 }, outgoing: { x: 0, y: 0 } },
    ],
  };
  const result = trimAt([shape, cutting], { x: 5, y: 8.3333 }, 0.1)!;
  expect(result[0].points[0].x).toBeCloseTo(15, 5);
  const duplicate = { ...cutting, id: "duplicate" };
  expect(
    trimAt([shape, cutting, duplicate], { x: 5, y: 8.3333 }, 0.1)!.length,
  ).toBe(3);
  const transformed = {
    ...shape,
    transform: { a: 2, b: 0.3, c: 0.5, d: 1, e: 40, f: 20 },
  };
  const point = cubicAt(worldCubics(transformed)[0], 0.5);
  expect(trimAt([transformed], point, 0.1)).toEqual([]);
  expect(
    trimAt([shape, { ...shape, id: "copy" }], { x: 15, y: 15 }, 0.1),
  ).toEqual([shape]);
});
test("sharp corners remain trim boundaries and empty clicks leave curves alone", () => {
  const poly: Shape = {
    ...line("p", [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]),
    kind: "polyline",
  };
  expect(trimAt([poly], { x: 5, y: 0 }, 0.1)![0].points).toEqual([
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ]);
  expect(trimAt([arch("a")], { x: 100, y: 100 }, 0.1)).toBeNull();
});

test("self-crossing cubic trims its loop without retaining degenerate fragments", () => {
  const loop: Shape = {
    ...line("loop", [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]),
    kind: "control-curve",
    handles: [
      { incoming: { x: 0, y: 0 }, outgoing: { x: 30, y: 30 } },
      { incoming: { x: -30, y: 30 }, outgoing: { x: 0, y: 0 } },
    ],
  };
  let span: Shape["points"] = [];
  trimAt([loop], { x: 10, y: 22.5 }, 0.1, (p) => (span = p));
  expect(span[0].x).toBeCloseTo(10, 4);
  expect(span.at(-1)!.x).toBeCloseTo(10, 4);
  const result = trimAt([loop], { x: 10, y: 22.5 }, 0.1)!;
  expect(result.length).toBeGreaterThan(0);
  for (const shape of result)
    for (const cubic of worldCubics(shape))
      expect(Math.max(...cubic.map((p) => p.y))).toBeLessThan(20);
  expect(
    parseProject(JSON.stringify({ version: 11, shapes: result })).shapes.length,
  ).toBe(result.length);
});

test("retained smooth cubic segments remain one editable connected curve", () => {
  const curve: Shape = {
    ...line("curve", [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
      { x: 30, y: 10 },
    ]),
    kind: "curve",
  };
  const cut = line("cut", [
    { x: 5, y: -20 },
    { x: 5, y: 30 },
  ]);
  const original = worldCubics(curve);
  const result = trimAt([curve, cut], original[0][0], 0.1)!;
  expect(result).toHaveLength(2);
  expect(result[0].kind).toBe("control-curve");
  expect(result[0].points).toHaveLength(4);
  const retained = worldCubics(result[0]);
  for (let i = 1; i < 3; i++)
    for (let j = 0; j < 4; j++) {
      expect(retained[i][j].x).toBeCloseTo(original[i][j].x, 6);
      expect(retained[i][j].y).toBeCloseTo(original[i][j].y, 6);
    }
});

for (const kind of ["curve", "control-curve"] as const)
  test(`${kind} cuts stop at smooth anchors`, () => {
    const shape: Shape = {
      ...line("c", [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ]),
      kind,
      ...(kind === "control-curve"
        ? {
            handles: Array.from({ length: 4 }, () => ({
              incoming: { x: -3, y: 0 },
              outgoing: { x: 3, y: 0 },
            })),
          }
        : {}),
    };
    const result = trimAt([shape], { x: 15, y: 0 }, 0.1)!;
    expect(result).toHaveLength(2);
    expect(result[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(result[1].points).toEqual([
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]);
  });
