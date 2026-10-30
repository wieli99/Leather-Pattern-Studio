import { test, expect } from "vitest";
import { snapCandidates, snappedAxes, smartSnap } from "./snapping";
import type { Shape } from "../model/project";
const rect: Shape = {
  id: "a",
  name: "Rect",
  kind: "rectangle",
  points: [
    { x: 0, y: 0 },
    { x: 20, y: 10 },
  ],
  rotation: 0,
  radius: 0,
};
test("snap candidates classify rectangle corners, center and midpoints", () => {
  const points = snapCandidates(rect);
  expect(points.filter((p) => p.kind === "center")).toHaveLength(1);
  expect(points.filter((p) => p.kind === "vertex")).toHaveLength(4);
  expect(points.filter((p) => p.kind === "midpoint")).toHaveLength(4);
  expect(points.every((p) => p.objectId === "a")).toBe(true);
});
test("circle quadrants are distinct from centers", () => {
  const points = snapCandidates({ ...rect, kind: "circle" });
  expect(points.filter((p) => p.kind === "center")).toHaveLength(1);
  expect(points.filter((p) => p.kind === "quadrant")).toHaveLength(4);
});
test("axis snap markers distinguish horizontal, vertical, origin and off-axis positions", () => {
  expect(snappedAxes({ x: 12, y: 0 })).toEqual(["X axis"]);
  expect(snappedAxes({ x: 0, y: -12 })).toEqual(["Y axis"]);
  expect(snappedAxes({ x: 0, y: 0 })).toEqual(["X axis", "Y axis"]);
  expect(snappedAxes({ x: 0.1, y: 0.1 })).toEqual([]);
});

test("smart alignment independently matches bounds and centers", () => {
  expect(smartSnap({ x: 10.2, y: 40 }, [rect], 1).point).toEqual({ x: 10, y: 40 });
  expect(smartSnap({ x: 10.2, y: 5.2 }, [rect], 1).guides).toHaveLength(2);
  expect(smartSnap({ x: 30, y: 40 }, [rect], 1).guides).toHaveLength(0);
});

test("polygon corner center excludes the repeated closing vertex", () => {
  const polygon: Shape = { ...rect, kind: "polyline",
    points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 12 }, { x: 0, y: 0 }] };
  expect(snapCandidates(polygon)).toContainEqual({
    point: { x: 10, y: 4 }, kind: "center", objectId: "a" });
  expect(snapCandidates({ ...polygon, radius: 2,
    transform: { a: 2, b: 0, c: 0, d: 3, e: 5, f: 7 } })).toContainEqual({
      point: { x: 25, y: 19 }, kind: "center", objectId: "a" });
});
