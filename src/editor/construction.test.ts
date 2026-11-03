import { test, expect } from "vitest";
import { construct, constructionGuides } from "./construction";
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

test("regular polygons have equal sides and a closed outline", () => {
  for (const sides of [3, 5, 100]) {
    const shape = construct("polygon", [{ x: 10, y: 20 }, { x: 20, y: 30 }], undefined, sides);
    expect(shape.kind).toBe("polyline");
    expect(shape.points).toHaveLength(sides + 1);
    expect(shape.points[0]).toEqual({ x: 20, y: 30 });
    expect(shape.points.at(-1)).toEqual(shape.points[0]);
    const length = distance(shape.points[0], shape.points[1]);
    for (let i = 1; i < sides; i++)
      expect(distance(shape.points[i], shape.points[i + 1])).toBeCloseTo(length, 8);
  }
  expect(() => construct("polygon", [{ x: 0, y: 0 }, { x: 0, y: 0 }])).toThrow();
});

test("bounding-box polygons fit both corners in either drawing direction", () => {
  for (const points of [
    [{ x: 10, y: 20 }, { x: 90, y: 60 }],
    [{ x: 90, y: 60 }, { x: 10, y: 20 }],
  ]) {
    const shape = construct("polygon-box", points, undefined, 5);
    expect(shape.points).toHaveLength(6);
    expect(Math.min(...shape.points.map(p => p.x))).toBeCloseTo(10);
    expect(Math.max(...shape.points.map(p => p.x))).toBeCloseTo(90);
    expect(Math.min(...shape.points.map(p => p.y))).toBeCloseTo(20);
    expect(Math.max(...shape.points.map(p => p.y))).toBeCloseTo(60);
    expect(shape.points.at(-1)).toEqual(shape.points[0]);
  }
  expect(() => construct("polygon-box", [{ x: 0, y: 0 }, { x: 0, y: 10 }])).toThrow();
});

test("three-point guides follow the constrained endpoint and retain the baseline", () => {
  expect(constructionGuides("rectangle-three", [], b)).toEqual([]);
  expect(constructionGuides("select", [a], b)).toEqual([]);
  const first = constructionGuides("rectangle-three", [a], b);
  expect(first[0].points).toEqual([a, b]);
  const third = constructionGuides("rectangle-three", [a, b], c);
  expect(third).toHaveLength(1);
  expect(third[0].points).toEqual([a, b]);
  const circle = constructionGuides("circle-three", [a], b)[0];
  expect(circle).toEqual(construct("circle-two", [a, b]));
  expect(constructionGuides("circle-three", [a], a)).toEqual([]);
  expect(constructionGuides("circle-three", [a, b], c)).toEqual([]);
  expect(construct("circle-three", [a, b, c]).points[0]).not.toEqual(circle.points[0]);
});
