import { describe, expect, test } from "vitest";
import { calibrateImage, hasGeometryBinding, pointInImage } from "./imageCalibration";
import { applyMatrix, distance, inverse, shapeMatrix } from "./geometry";
import type { Point, Shape } from "./project";

const image = (extra: Partial<Shape> = {}): Shape => ({
  id: "img",
  name: "Image",
  kind: "image",
  image: "data:image/png;base64,AA==",
  points: [{ x: 0, y: 0 }, { x: 100, y: 50 }],
  radius: 0,
  rotation: 0,
  ...extra,
});
/** Where a world point on the original image ends up after the shape changed. */
const follow = (before: Shape, after: Shape, p: Point) =>
  applyMatrix(shapeMatrix(after), applyMatrix(inverse(shapeMatrix(before)), p));
const close = (a: Point, b: Point) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe("calibrateImage", () => {
  const cases: [string, Shape][] = [
    ["plain", image()],
    ["rotated", image({ rotation: 30 })],
    ["mirrored", image({ transform: { a: -1, b: 0, c: 0, d: 1, e: 120, f: 5 } })],
    ["transformed and rotated", image({ rotation: -12, transform: { a: 0.5, b: 0.2, c: -0.2, d: 0.5, e: 10, f: 20 } })],
  ];
  for (const [name, s] of cases) {
    test(`${name} images keep the first point and reach the known distance`, () => {
      const p1 = applyMatrix(shapeMatrix(s), { x: 10, y: 10 }),
        p2 = applyMatrix(shapeMatrix(s), { x: 70, y: 40 });
      const result = calibrateImage(s, p1, p2, 250);
      if (typeof result === "string") throw new Error(result);
      close(follow(s, result, p1), p1);
      expect(distance(follow(s, result, p1), follow(s, result, p2))).toBeCloseTo(250, 9);
      expect(result.points).toEqual(s.points);
    });
  }
  test("rejects coincident points and invalid distances", () => {
    const p = { x: 5, y: 5 };
    expect(calibrateImage(image(), p, p, 10)).toBe("Pick two different points.");
    for (const known of [0, -1, Number.NaN, Infinity])
      expect(typeof calibrateImage(image(), p, { x: 6, y: 5 }, known)).toBe("string");
  });
});

test("pointInImage follows rotation and flips", () => {
  expect(pointInImage(image(), { x: 50, y: 25 })).toBe(true);
  expect(pointInImage(image(), { x: 100, y: 50 })).toBe(true);
  expect(pointInImage(image(), { x: 101, y: 25 })).toBe(false);
  const flipped = image({ transform: { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 } });
  expect(pointInImage(flipped, { x: -50, y: 25 })).toBe(true);
  expect(pointInImage(flipped, { x: 50, y: 25 })).toBe(false);
  const turned = image({ rotation: 90 });
  expect(pointInImage(turned, { x: 50, y: 60 })).toBe(true);
  expect(pointInImage(turned, { x: 90, y: 25 })).toBe(false);
  expect(pointInImage({ ...image(), kind: "rectangle" }, { x: 50, y: 25 })).toBe(false);
});

test("hasGeometryBinding detects linked position or size", () => {
  expect(hasGeometryBinding(image())).toBe(false);
  expect(hasGeometryBinding(image({ bindings: [{ property: "rotation", expression: "a" } as never] }))).toBe(false);
  for (const property of ["x", "y", "width", "height"])
    expect(hasGeometryBinding(image({ bindings: [{ property, expression: "a" } as never] }))).toBe(true);
});
