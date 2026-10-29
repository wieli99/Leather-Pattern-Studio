import { expect, test } from "vitest";
import { editEdge } from "./editEdge";
import { edgeMeasurements } from "./edgeMeasurements";
import type { Shape } from "./project";
const rect: Shape = {
  id: "a",
  name: "A",
  kind: "rectangle",
  points: [
    { x: 0, y: 0 },
    { x: 30, y: 40 },
  ],
  rotation: 0,
  radius: 0,
};
test("rectangle edit changes only selected endpoints around midpoint", () => {
  const next = editEdge(rect, 0, 50)!;
  expect(next.kind).toBe("polyline");
  expect(next.points).toEqual([
    { x: 40, y: 40 },
    { x: -10, y: 40 },
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 40, y: 40 },
  ]);
  expect(edgeMeasurements(next)[0].length).toBeCloseTo(50);
});
test("rounded rotated transformed edge reaches requested world length", () => {
  const next = editEdge(
    {
      ...rect,
      radius: 3,
      rotation: 30,
      transform: { a: 2, b: 0, c: 0, d: 1, e: 20, f: 10 },
    },
    0,
    75,
  )!;
  expect(next.radius).toBe(3);
  expect(edgeMeasurements(next)[0].length).toBeCloseTo(75, 2);
});
test("invalid length rejected", () =>
  expect(() => editEdge(rect, 0, -1)).toThrow());
test("plain line edits retain type and midpoint", () => {
  const line = { ...rect, kind: "line" as const };
  const next = editEdge(line, 0, 100)!;
  expect(next.kind).toBe("line");
  expect(edgeMeasurements(next)[0].length).toBeCloseTo(100);
  expect((next.points[0].x + next.points[1].x) / 2).toBeCloseTo(15);
  expect((next.points[0].y + next.points[1].y) / 2).toBeCloseTo(20);
});

test("rounded rectangle keeps the two unrelated corners fixed", () => {
  const next = editEdge({ ...rect, radius: 3 }, 0, 45)!;
  expect(next.points[1]).toEqual({ x: 0, y: 0 });
  expect(next.points[2]).toEqual({ x: 30, y: 0 });
  expect(edgeMeasurements(next)[0].length).toBeCloseTo(45, 2);
});
