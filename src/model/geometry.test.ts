import { test, expect } from "vitest";
import {
  distanceToSegment,
  hitTest,
  rotateShape,
  bounds,
  scaleShape,
  worldPoints,
} from "./geometry";
import type { Shape } from "./project";
const circle: Shape = {
  id: "c",
  name: "circle",
  kind: "circle",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
  radius: 0,
  rotation: 0,
};
test("circle picks full circumference", () => {
  expect(hitTest(circle, { x: -10, y: 0 }, 0.1)).toBe(true);
  expect(hitTest(circle, { x: 0, y: 10 }, 0.1)).toBe(true);
  expect(hitTest(circle, { x: 0, y: 0 }, 0.1)).toBe(false);
});
test("segment distances clamp", () =>
  expect(
    distanceToSegment({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }),
  ).toBe(10));
test("rotation preserves local geometry and updates world coordinates", () => {
  const line = { ...circle, kind: "line" as const };
  const rotated = rotateShape(line, 90);
  expect(rotated.points).toEqual(line.points);
  expect(worldPoints(rotated)[0].x).toBeCloseTo(5);
  expect(worldPoints(rotated)[0].y).toBeCloseTo(-5);
});
test("bounds account for circle radius", () =>
  expect(bounds([circle])).toEqual({ x: -10, y: -10, width: 20, height: 20 }));
test("scaling preserves circles", () =>
  expect(bounds([scaleShape(circle, 2, { x: 0, y: 0 })]).width).toBe(40));
test("rotated rectangle hit testing", () => {
  const s: Shape = {
    ...circle,
    kind: "rectangle",
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 10 },
    ],
    rotation: 90,
  };
  expect(hitTest(s, { x: 5, y: 5 }, 0.1)).toBe(true);
  expect(hitTest(s, { x: 0, y: 0 }, 0.1)).toBe(false);
});
test("eccentric ellipse hit testing", () => {
  const s: Shape = {
    ...circle,
    kind: "ellipse",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 4 },
    ],
  };
  expect(hitTest(s, { x: 100, y: 2 }, 0.1)).toBe(true);
  expect(hitTest(s, { x: 50, y: 2 }, 0.1)).toBe(false);
});
