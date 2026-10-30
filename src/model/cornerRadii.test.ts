import { expect, test } from "vitest";
import {
  cornerRadii,
  polygonFillets,
  setCornerRadius,
  boundary,
  contains,
} from "./geometry";
import { parseProject, type Shape } from "./project";
const rect: Shape = {
  id: "r",
  name: "Rectangle",
  kind: "rectangle",
  points: [
    { x: 0, y: 0 },
    { x: 40, y: 20 },
  ],
  radius: 0,
  rotation: 0,
};
test("independent radii preserve neighbours and use available edge length", () => {
  const a = setCornerRadius(rect, 0, 15);
  expect(cornerRadii(a)).toEqual([15, 0, 0, 0]);
  const b = setCornerRadius(a, 3, 12);
  expect(cornerRadii(b)[3]).toBeCloseTo(5);
  expect(polygonFillets(b).corners.map((c) => Math.round(c.radius))).toEqual([
    15, 0, 0, 5,
  ]);
  expect(contains(a, { x: 1, y: 1 })).toBe(false);
  expect(contains(a, { x: 39, y: 1 })).toBe(true);
  expect(boundary(a).curves).toHaveLength(1);
  expect(
    cornerRadii({
      ...a,
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 10 },
      ],
    } as Shape)[0],
  ).toBeCloseTo(10);
});
test("uniform edits clamp and old documents retain uniform fallback", () => {
  expect(setCornerRadius(rect, 0, 99, true).radius).toBeCloseTo(10);
  const doc = parseProject(
    JSON.stringify({ version: 6, shapes: [{ ...rect, radius: 4 }] }),
  );
  expect(cornerRadii(doc.shapes[0])).toEqual([4, 4, 4, 4]);
  const next = { ...doc, shapes: [setCornerRadius(doc.shapes[0], 1, 7)] };
  expect(parseProject(JSON.stringify(next))).toEqual(next);
  expect(() =>
    parseProject(
      JSON.stringify({ ...doc, shapes: [{ ...rect, cornerRadii: [1] }] }),
    ),
  ).toThrow("Invalid corner radii");
});

test("closed polygons handle concave corners and transforms", () => {
  const polygon: Shape = {
    ...rect,
    kind: "polyline",
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 20, y: 10 },
      { x: 40, y: 20 },
      { x: 0, y: 20 },
      { x: 0, y: 0 },
    ],
  };
  const rounded = setCornerRadius(polygon, 2, 2);
  const fillet = polygonFillets(rounded).corners[2];
  expect(fillet.radius).toBeCloseTo(2);
  expect(
    Math.hypot(
      fillet.start.x - fillet.center.x,
      fillet.start.y - fillet.center.y,
    ),
  ).toBeCloseTo(2);
  const transformed = {
    ...rounded,
    transform: { a: 2, b: 0, c: 0, d: 3, e: 5, f: 7 },
  };
  expect(boundary(transformed).curves).toHaveLength(1);
  expect(
    parseProject(JSON.stringify({ version: 7, shapes: [transformed] }))
      .shapes[0],
  ).toEqual(transformed);
});
