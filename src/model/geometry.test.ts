import { test, expect } from "vitest";
import {
  contains,
  polygonFillets,
  distance,
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

test("affine curves retain exact extrema, containment and screen-space picking", async () => {
  const {
    stretchShape,
    rotateShape,
    arcPoint,
    contains,
    nearestOutline,
    hitTest,
    outlineBounds,
    center,
    inverse,
    shapeMatrix,
    applyMatrix,
  } = await import("./geometry");
  const circle: Shape = {
    id: "c",
    name: "c",
    kind: "circle",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    radius: 0,
    rotation: 0,
  };
  const ellipse = stretchShape(circle, 3, 0.5, { x: 0, y: 0 });
  expect(bounds([ellipse])).toEqual({ x: -30, y: -5, width: 60, height: 10 });
  expect(contains(ellipse, { x: 29, y: 0 })).toBe(true);
  expect(contains(ellipse, { x: 0, y: 6 })).toBe(false);
  expect(hitTest(ellipse, { x: 30.5, y: 0 }, 0.6)).toBe(true);
  expect(hitTest(ellipse, { x: 0, y: 5.7 }, 0.4)).toBe(false);
  const arc = stretchShape({ ...circle, kind: "arc", sweep: 90 }, 3, 0.5, {
    x: 0,
    y: 0,
  });
  expect(arcPoint(arc, 0.5).x).toBeCloseTo(30 / Math.sqrt(2));
  expect(arcPoint(arc, 0.5).y).toBeCloseTo(5 / Math.sqrt(2));
  const rotated = rotateShape(ellipse, 35, { x: 10, y: 20 });
  const point = arcPoint({ ...rotated, kind: "arc", sweep: 360 }, 0.2);
  expect(distance(nearestOutline(rotated, point), point)).toBeLessThan(1e-6);
  const local = applyMatrix(inverse(shapeMatrix(rotated)), point);
  expect(Math.hypot(local.x, local.y)).toBeCloseTo(10);
  expect(outlineBounds(rotated).length).toBeGreaterThan(3);
  expect(center(rotated)).not.toEqual({ x: 0, y: 0 });
});

test("sheared rounded rectangles and arcs participate in exact bounds and marquee queries", async () => {
  const {
    stretchShape,
    rotateShape,
    transformShape,
    contains,
    nearestOutline,
    intersectsBox,
  } = await import("./geometry");
  const rounded: Shape = {
    id: "r",
    name: "r",
    kind: "rectangle",
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 20 },
    ],
    radius: 5,
    rotation: 40,
  };
  const sheared = stretchShape(rounded, 2, 0.5, { x: 0, y: 0 });
  const c = transformShape(sheared, { a: 1, b: 0, c: 0, d: 1, e: 50, f: 20 });
  const p = worldPoints(c)[0];
  const nearest = nearestOutline(c, p);
  expect(hitTest(c, nearest, 0.01)).toBe(true);
  expect(
    intersectsBox(c, {
      x: nearest.x - 0.1,
      y: nearest.y - 0.1,
      width: 0.2,
      height: 0.2,
    }),
  ).toBe(true);
  const b = bounds([c]);
  expect(b.width).toBeGreaterThan(50);
  expect(contains(c, { x: 50 + 2 * 20, y: 20 + 0.5 * 10 })).toBe(true);
});

test("polygon fillets clamp and remove sharp corners from selection", () => {
  const s: Shape = {
    ...circle,
    kind: "polyline",
    radius: 2,
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ],
  };
  expect(polygonFillets(s).max).toBeCloseTo(5);
  expect(hitTest(s, { x: 0, y: 0 }, 0.1)).toBe(false);
  expect(contains(s, { x: 0.1, y: 0.1 })).toBe(false);
  expect(contains(s, { x: 5, y: 5 })).toBe(true);
  expect(polygonFillets({ ...s, radius: 100 }).corners[0].radius).toBeCloseTo(
    5,
  );
  expect(
    polygonFillets({ ...s, points: [...s.points].reverse() }).max,
  ).toBeCloseTo(5);
});

test("polygon arcs meet both edges tangentially in either winding", () => {
  const polygons = [
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ],
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 5 },
      { x: 0, y: 10 },
    ],
  ];
  for (const polygon of polygons)
    for (const pts of [polygon, [...polygon].reverse()]) {
      for (const radius of [1, 100]) {
        const shape: Shape = {
          ...circle,
          kind: "polyline",
          radius,
          points: [...pts, pts[0]],
        };
        polygonFillets(shape).corners.forEach((c, i) => {
          expect(distance(c.center, c.start)).toBeCloseTo(c.radius, 10);
          expect(distance(c.center, c.end)).toBeCloseTo(c.radius, 10);
          const prev = pts[(i + pts.length - 1) % pts.length],
            next = pts[(i + 1) % pts.length];
          for (const [tangent, edge] of [
            [c.start, prev],
            [c.end, next],
          ]) {
            expect(
              (tangent.x - c.center.x) * (edge.x - pts[i].x) +
                (tangent.y - c.center.y) * (edge.y - pts[i].y),
            ).toBeCloseTo(0, 9);
          }
          expect(
            c.center.x + c.radius * Math.cos(c.angle + c.span),
          ).toBeCloseTo(c.end.x, 10);
          expect(
            c.center.y + c.radius * Math.sin(c.angle + c.span),
          ).toBeCloseTo(c.end.y, 10);
        });
      }
    }
});
