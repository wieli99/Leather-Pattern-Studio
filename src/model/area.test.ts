import { expect, test } from "vitest";
import { shapeArea } from "./area";
import type { Shape } from "./project";
const polygon = (points: number[][]): Shape =>
  ({
    id: "a",
    name: "A",
    kind: "polyline",
    points: points.map(([x, y]) => ({ x, y })),
    radius: 0,
    rotation: 0,
  }) as Shape;
test("closed polygon area and open paths", () => {
  expect(
    shapeArea(
      polygon([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ]),
    ),
  ).toBeCloseTo(100);
  expect(
    shapeArea(
      polygon([
        [0, 0],
        [10, 0],
        [10, 10],
      ]),
    ),
  ).toBeNull();
});
test("crossed outline measures both filled lobes", () => {
  expect(
    shapeArea(
      polygon([
        [0, 0],
        [10, 10],
        [0, 10],
        [10, 0],
        [0, 0],
      ]),
    ),
  ).toBeCloseTo(50);
});
test("affine transforms scale area", () => {
  const s = polygon([
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]);
  s.transform = { a: -2, b: 0, c: 1, d: 3, e: 100, f: 20 };
  expect(shapeArea(s)).toBeCloseTo(600);
});
