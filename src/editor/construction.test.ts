import { test, expect } from "vitest";
import { construct } from "./construction";
import { parseProject } from "../model/project";
import {
  bounds,
  contains,
  intersectsBox,
  nearestOutline,
  rotateShape,
  arcPoint,
  distance,
} from "../model/geometry";
const a = { x: 0, y: 0 },
  b = { x: 20, y: 10 },
  c = { x: 0, y: 20 };
test.each([
  "rectangle",
  "rectangle-center",
  "rectangle-three",
  "circle",
  "circle-two",
  "circle-three",
  "ellipse",
  "ellipse-center",
  "arc",
  "arc-three",
] as const)("constructs and round-trips %s", (mode) => {
  const shape = { ...construct(mode, [a, b, c], 90), id: "a", name: "Shape" };
  const project = parseProject(JSON.stringify({ version: 4, shapes: [shape] }));
  expect(project.shapes[0].kind).toBe(shape.kind);
  expect(bounds([shape]).width).toBeGreaterThan(0);
});
test("three-point rectangle and center ellipse support rotation", () => {
  const rect = construct("rectangle-three", [
    a,
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]);
  expect(rect.rotation).toBe(45);
  expect(contains(rect, { x: 2, y: 7 })).toBe(true);
  const ellipse = construct("ellipse-center", [
    a,
    { x: 10, y: 10 },
    { x: -5, y: 5 },
  ]);
  expect(ellipse.rotation).toBe(45);
  expect(contains(ellipse, a)).toBe(true);
});
test("diameter circle and circumcircle dimensions", () => {
  const diameter = construct("circle-two", [a, { x: 20, y: 0 }]);
  expect(diameter.points[0]).toEqual({ x: 10, y: 0 });
  const circle = construct("circle-three", [
    { x: 10, y: 0 },
    { x: 0, y: 10 },
    { x: -10, y: 0 },
  ]);
  expect(distance(circle.points[0], a)).toBeCloseTo(0);
});
test("rejects collinear circumcircle", () =>
  expect(() =>
    construct("circle-three", [a, { x: 1, y: 1 }, { x: 2, y: 2 }]),
  ).toThrow("non-collinear"));
test("arc bounds and hit geometry exclude unused circle", () => {
  const arc = construct("arc", [a, { x: 10, y: 0 }, { x: 0, y: 10 }], 90);
  expect(bounds([arc]).width).toBeCloseTo(10);
  expect(intersectsBox(arc, { x: -10, y: -10, width: 2, height: 2 })).toBe(
    false,
  );
  expect(intersectsBox(arc, { x: 6, y: 6, width: 2, height: 2 })).toBe(true);
  expect(arcPoint(rotateShape(arc, 90), 0).y).toBeCloseTo(10);
});
test("crossing tests actual outline, including rounded corners and ellipse", () => {
  const ellipse = construct("ellipse", [a, { x: 100, y: 100 }]);
  expect(intersectsBox(ellipse, { x: 0, y: 0, width: 5, height: 5 })).toBe(
    false,
  );
  expect(intersectsBox(ellipse, { x: 48, y: -1, width: 4, height: 4 })).toBe(
    true,
  );
  expect(nearestOutline(ellipse, { x: 50, y: -2 }).y).toBeCloseTo(0);
  const rect = {
    ...construct("rectangle", [a, { x: 100, y: 100 }]),
    radius: 20,
  };
  expect(intersectsBox(rect, { x: 0, y: 0, width: 2, height: 2 })).toBe(false);
});
test("three-point arc fixes first two endpoints and passes through third", () => {
  const start = { x: 0, y: 0 },
    end = { x: 20, y: 0 },
    through = { x: 7, y: 8 },
    arc = construct("arc-three", [start, end, through]);
  expect(distance(arcPoint(arc, 0), start)).toBeCloseTo(0);
  expect(distance(arcPoint(arc, 1), end)).toBeCloseTo(0);
  expect(distance(nearestOutline(arc, through), through)).toBeLessThan(1e-6);
});
