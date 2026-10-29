import { test, expect } from "vitest";
import { snapCandidates } from "./snapping";
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
import { snappedAxes } from "./snapping";
test("axis snap markers distinguish horizontal, vertical, origin and off-axis positions", () => {
  expect(snappedAxes({ x: 12, y: 0 })).toEqual(["X axis"]);
  expect(snappedAxes({ x: 0, y: -12 })).toEqual(["Y axis"]);
  expect(snappedAxes({ x: 0, y: 0 })).toEqual(["X axis", "Y axis"]);
  expect(snappedAxes({ x: 0.1, y: 0.1 })).toEqual([]);
});
