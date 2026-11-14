import { expect, test } from "vitest";
import { contains, polygonFillets, setCornerTreatment } from "./geometry";
import { flattenOutline } from "./flattenOutline";
import { parseProject, type Shape } from "./project";
const rectangle: Shape = { id: "r", name: "Rectangle", kind: "rectangle", points: [{x:0,y:0},{x:40,y:20}], radius: 0, rotation: 0 };
test("chamfer cuts equal setbacks and is shared by outline, hit testing and persistence", () => {
  const shape = setCornerTreatment(rectangle, 0, 5, true);
  const corner = polygonFillets(shape).corners[0];
  expect(corner.start).toEqual({x:0,y:5});
  expect(corner.end).toEqual({x:5,y:0});
  expect(corner.radius).toBe(0);
  expect(contains(shape, {x:1,y:1})).toBe(false);
  expect(contains(shape, {x:10,y:10})).toBe(true);
  expect(flattenOutline(shape).points).toContainEqual({x:5,y:0});
  expect(parseProject(JSON.stringify({version:23,shapes:[shape]})).shapes[0]).toEqual(shape);
});
test("mixed treatments clamp overlapping trims and reject invalid measurements", () => {
  let shape = setCornerTreatment(rectangle, 0, 5, false);
  shape = setCornerTreatment(shape, 1, 100, true);
  const corners = polygonFillets(shape).corners;
  expect(corners[0].radius).toBeGreaterThan(0);
  expect(corners[1].chamfer).toBeGreaterThan(0);
  expect(corners[1].chamfer).toBeLessThanOrEqual(20);
  expect(setCornerTreatment(shape,0,NaN,true)).toBe(shape);
  expect(setCornerTreatment(shape,0,-1,true)).toBe(shape);
});
test("chamfers preserve stitch corner identifiers and expose straight corner edges", async () => {
  const { stitchEdges } = await import("./stitchGeometry");
  const shape = setCornerTreatment(rectangle, 0, 5, true);
  const edge = stitchEdges(shape).find(e => e.key === "rectangle:2:corner:0")!;
  expect(edge).toBeDefined();
  expect(edge.points).toEqual([{x:0,y:5},{x:5,y:0}]);
});
test("non-right-angle corners use equal setbacks and preserve neighboring rounding", () => {
  const triangle: Shape = {...rectangle,kind:"polyline",points:[{x:0,y:0},{x:40,y:0},{x:20,y:30},{x:0,y:0}]};
  const rounded = setCornerTreatment(triangle, 1, 3, false);
  const shape = setCornerTreatment(rounded, 0, 100, true);
  const corners = polygonFillets(shape).corners;
  expect(corners[1].radius).toBeCloseTo(3);
  expect(Math.hypot(corners[0].start.x,corners[0].start.y)).toBeCloseTo(corners[0].chamfer);
  expect(Math.hypot(corners[0].end.x,corners[0].end.y)).toBeCloseTo(corners[0].chamfer);
});
