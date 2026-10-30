import { expect, test } from "vitest";
import {
  cubicAt,
  cubicSegments,
  flattenCubic,
  zeroHandles,
  type Cubic,
} from "./curves";
import {
  bounds,
  hitTest,
  intersectsBox,
  nearestOutline,
  scaleShape,
  stretchShape,
  worldCubics,
} from "./geometry";
import { parseProject, type Shape } from "./project";
const curve = (points: Shape["points"]): Shape => ({
  id: "c",
  name: "Curve",
  kind: "curve",
  points,
  radius: 0,
  rotation: 0,
});
const bezier = (): Shape => ({
  ...curve([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]),
  kind: "control-curve",
  handles: [
    { incoming: { x: 0, y: -100 }, outgoing: { x: 0, y: 100 } },
    { incoming: { x: 0, y: 100 }, outgoing: { x: 0, y: -100 } },
  ],
});
test("interpolation passes through anchors, tolerates repeated points, and keeps two points straight", () => {
  const s = curve([
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 10, y: 20 },
    { x: 100, y: 0 },
  ]);
  const cs = cubicSegments(s);
  expect(cs).toHaveLength(2);
  expect(cubicAt(cs[0], 1)).toEqual(s.points[1]);
  expect(cubicAt(cs[1], 0)).toEqual(s.points[1]);
  expect(
    cs.flat().every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
  ).toBe(true);
  expect(
    cubicAt(
      cubicSegments(
        curve([
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ]),
      )[0],
      0.5,
    ),
  ).toEqual({ x: 50, y: 50 });
});
test("Bézier bounds, selection, nearest edge, and crossing use the curved outline", () => {
  const s = bezier();
  expect(bounds([s])).toEqual({ x: 0, y: 0, width: 100, height: 75 });
  expect(hitTest(s, { x: 50, y: 75 }, 0.1)).toBe(true);
  expect(hitTest(s, { x: 50, y: 0 }, 0.1)).toBe(false);
  expect(nearestOutline(s, { x: 50, y: 80 }).y).toBeCloseTo(75, 3);
  expect(intersectsBox(s, { x: 49, y: 74, width: 2, height: 2 })).toBe(true);
  expect(intersectsBox(s, { x: 49, y: -1, width: 2, height: 2 })).toBe(false);
});
test("affine and uniform transforms retain handles and exact extrema", () => {
  const s = stretchShape(bezier(), 2, 0.5, { x: 0, y: 0 });
  expect(bounds([s])).toEqual({ x: 0, y: 0, width: 200, height: 37.5 });
  expect(hitTest(s, { x: 100, y: 37.5 }, 0.1)).toBe(true);
  expect(worldCubics(scaleShape(bezier(), 2, { x: 0, y: 0 }))[0][1]).toEqual({
    x: 0,
    y: 200,
  });
});
test("adaptive subdivision preserves collinear overshoot", () => {
  const c: Cubic = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 0 },
    { x: 100, y: 0 },
  ];
  expect(Math.max(...flattenCubic(c, 0.001).map((p) => p.x))).toBeGreaterThan(
    150,
  );
});
test("curve project round trips retain handles and reject invalid control geometry", () => {
  const doc = { version: 5, shapes: [bezier()] };
  expect(parseProject(JSON.stringify(doc))).toEqual({
    ...doc,
    version: 10,
    stitchGroups: [],
    guides: [],
  });
  for (const handles of [
    [],
    [zeroHandles()],
    [zeroHandles(), { incoming: { x: 1e8, y: 0 }, outgoing: { x: 0, y: 0 } }],
  ])
    expect(() =>
      parseProject(
        JSON.stringify({ ...doc, shapes: [{ ...bezier(), handles }] }),
      ),
    ).toThrow();
  expect(() =>
    parseProject(
      JSON.stringify({
        ...doc,
        shapes: [
          {
            ...curve(bezier().points),
            handles: [zeroHandles(), zeroHandles()],
          },
        ],
      }),
    ),
  ).toThrow();
});

test("curve snapping offers anchors and actual segment midpoints", async () => {
  const { snapCandidates } = await import("../editor/snapping");
  const candidates = snapCandidates(bezier());
  expect(
    candidates.some(
      (c) => c.kind === "midpoint" && c.point.x === 50 && c.point.y === 75,
    ),
  ).toBe(true);
  expect(
    candidates.some(
      (c) => c.kind === "vertex" && c.point.x === 0 && c.point.y === 0,
    ),
  ).toBe(true);
});
