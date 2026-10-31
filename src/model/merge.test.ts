import { expect, test } from "vitest";
import { mergeShapes } from "./merge";
import type { Shape } from "./project";
const line = (id: string, x: number, end: number): Shape => ({
  id,
  name: id,
  kind: "line",
  points: [
    { x, y: 0 },
    { x: end, y: 0 },
  ],
  radius: 0,
  rotation: 0,
});
test("joins reversed endpoints and rejects disconnected paths", () => {
  expect(
    mergeShapes([line("a", 0, 10), line("b", 20, 10)])?.points,
  ).toHaveLength(3);
  expect(mergeShapes([line("a", 0, 10), line("b", 11, 20)])).toBeNull();
});
test("unites overlapping rectangles", () => {
  const rect = (id: string, x: number): Shape => ({
    ...line(id, x, x + 10),
    kind: "rectangle",
    points: [
      { x, y: 0 },
      { x: x + 10, y: 10 },
    ],
  });
  expect(mergeShapes([rect("a", 0), rect("b", 5)])).not.toBeNull();
  expect(mergeShapes([rect("a", 0), rect("b", 20)])).toBeNull();
});

test("joins reversed curves without changing their cubic geometry", () => {
  const a: Shape = {
    ...line("a", 0, 10),
    kind: "control-curve",
    handles: [
      { incoming: { x: 0, y: 0 }, outgoing: { x: 3, y: 5 } },
      { incoming: { x: -3, y: 5 }, outgoing: { x: 0, y: 0 } },
    ],
  };
  const b: Shape = {
    ...a,
    id: "b",
    points: [
      { x: 20, y: 0 },
      { x: 10, y: 0 },
    ],
  };
  const result = mergeShapes([a, b])!;
  expect(result.kind).toBe("control-curve");
  expect(result.points).toEqual([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ]);
  expect(result.handles?.[1]).toEqual({
    incoming: { x: -3, y: 5 },
    outgoing: { x: -3, y: 5 },
  });
  expect(
    mergeShapes([
      a,
      {
        ...b,
        points: [
          { x: 21, y: 0 },
          { x: 11, y: 0 },
        ],
      },
    ]),
  ).toBeNull();
});

test("mixed transformed curve types preserve every cubic control point", async () => {
  const { cubicSegments, cubicAt } = await import("./curves");
  const { shapeMatrix, applyMatrix } = await import("./geometry");
  const a: Shape = {
    ...line("a", 0, 10),
    kind: "curve",
    points: [
      { x: 0, y: 0 },
      { x: 5, y: 4 },
      { x: 10, y: 0 },
    ],
    transform: { a: 2, b: 0, c: 0, d: 1, e: 20, f: 10 },
  };
  const b: Shape = {
    ...line("b", 40, 60),
    kind: "control-curve",
    points: [
      { x: 40, y: 10 },
      { x: 60, y: 10 },
    ],
    handles: [
      { incoming: { x: 0, y: 0 }, outgoing: { x: 4, y: 6 } },
      { incoming: { x: -4, y: -6 }, outgoing: { x: 0, y: 0 } },
    ],
  };
  const result = mergeShapes([a, b])!;
  const expected = [
    ...cubicSegments(a).map((c) =>
      c.map((p) => applyMatrix(shapeMatrix(a), p)),
    ),
    ...cubicSegments(b),
  ];
  const actual = cubicSegments(result);
  for (let i = 0; i < actual.length; i++)
    for (let j = 0; j < 4; j++) {
      expect(actual[i][j].x).toBeCloseTo(expected[i][j].x, 12);
      expect(actual[i][j].y).toBeCloseTo(expected[i][j].y, 12);
    }
  for (let i = 0; i < actual.length; i++)
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const a = cubicAt(actual[i], t),
        b = cubicAt(expected[i] as Parameters<typeof cubicAt>[0], t);
      expect(a.x).toBeCloseTo(b.x, 12);
      expect(a.y).toBeCloseTo(b.y, 12);
    }
});

test("curve chains reject branches and loops, and honor endpoint tolerance", () => {
  const c = (id: string, x: number, end: number): Shape => ({
    ...line(id, x, end),
    kind: "curve",
  });
  expect(
    mergeShapes([c("a", 0, 10), c("b", 10, 20), c("c", 20, 30)])?.points,
  ).toHaveLength(4);
  expect(
    mergeShapes([c("a", 0, 10), c("b", 10, 20), c("c", 10, 30)]),
  ).toBeNull();
  expect(mergeShapes([c("a", 0, 10), c("b", 10, 0)])).toBeNull();
  expect(mergeShapes([c("a", 0, 10), c("b", 10 + 1e-8, 20)])).not.toBeNull();
  expect(mergeShapes([c("a", 0, 10), c("b", 10 + 1e-6, 20)])).toBeNull();
});
