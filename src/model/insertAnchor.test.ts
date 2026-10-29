import { expect, test } from "vitest";
import type { Shape } from "./project";
import { insertAnchor } from "./insertAnchor";
import { cubicAt } from "./curves";
import { distance, worldCubics } from "./geometry";

const circle: Shape = {
  id: "circle",
  name: "Circle",
  kind: "circle",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
  radius: 0,
  rotation: 0,
};
test("circle approximation joins do not block anchor insertion", () => {
  let point = null;
  const result = insertAnchor(circle, { x: 10, y: 0 }, 8, (p) => {
    point = p;
  });
  expect(result).not.toBeNull();
  expect(point).not.toBeNull();
  expect(result!.points[0]).toEqual(result!.points.at(-1));
  for (const c of worldCubics(result!))
    for (let i = 0; i <= 10; i++)
      expect(
        Math.abs(distance(cubicAt(c, i / 10), { x: 0, y: 0 }) - 10),
      ).toBeLessThan(0.001);
});
test("splitting a line preserves its outline and rejects duplicate anchors", () => {
  const shape: Shape = {
    ...circle,
    kind: "line",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  };
  const result = insertAnchor(shape, { x: 50, y: 2 }, 8)!;
  expect(result.points).toHaveLength(3);
  expect(result.points[1].x).toBeCloseTo(50, 4);
  expect(result.points[1].y).toBe(0);
  expect(insertAnchor(result, { x: 50, y: 0 }, 8)).toBeNull();
});
