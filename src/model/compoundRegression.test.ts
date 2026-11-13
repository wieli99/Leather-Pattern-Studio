import { expect, test } from "vitest";
import { booleanShapes } from "./booleanShapes";
import {
  stitchEdges,
  stitchGeometry,
  reconcileStitches,
  type StitchGroup,
} from "./stitchGeometry";
import { defaultStitchSettings } from "./stitch";
import { insertAnchor } from "./insertAnchor";
import { cubicAt, type Cubic } from "./curves";
import { worldCubics, transformShape, contains } from "./geometry";
import { parseProject, type Shape, type Doc } from "./project";
import { shapeArea } from "./area";
import { edgeMeasurements } from "./edgeMeasurements";

const rectangle = (id: string, x: number, y: number, width: number): Shape => ({
  id,
  name: id,
  kind: "rectangle",
  points: [
    { x, y },
    { x: x + width, y: y + width },
  ],
  radius: 0,
  rotation: 0,
});
function ring() {
  return booleanShapes("subtract", [
    rectangle("ring", 0, 0, 30),
    rectangle("hole", 10, 10, 10),
  ])!;
}
function contourGroups(shape: Shape) {
  let offset = 0;
  return shape.contours!.map((contour, i): StitchGroup => {
    const keys = stitchEdges(shape)
      .slice(offset, offset + contour.length)
      .map((e) => e.key);
    offset += contour.length;
    return {
      id: "run" + i,
      shapeId: shape.id,
      edges: [...keys.slice(2), ...keys.slice(0, 2)],
      closed: true,
      side: 1,
      settings: { ...defaultStitchSettings, inset: 1, spacing: 3.38 },
      holeOverrides: {
        "1": {
          ...defaultStitchSettings,
          inset: 1,
          spacing: 3.38,
          style: "round",
          roundDiameter: 0.8,
        },
      },
    };
  });
}

test.each([0, 1])(
  "anchor insertion into contour %i preserves every stitched contour and repeated reconciliation",
  (contour) => {
    const shape = transformShape(ring(), {
      a: 0,
      b: 1,
      c: -1,
      d: 0,
      e: 60,
      f: 15,
    });
    const groups = contourGroups(shape);
    const before: Doc = {
      version: 22,
      shapes: [shape],
      stitchGroups: groups,
      stitchLinks: [{ id: 1, members: groups.map((g) => g.id) }],
    };
    const counts = groups.map((g) => stitchGeometry(shape, g).holes.length);
    const offset = shape
      .contours!.slice(0, contour)
      .reduce((n, c) => n + c.length, 0);
    const nextShape = insertAnchor(
      shape,
      cubicAt(worldCubics(shape)[offset], 0.5),
      0.001,
    )!;
    expect(nextShape).not.toBeNull();
    const next = reconcileStitches({ ...before, shapes: [nextShape] }, before);
    expect(next.stitchGroups).toHaveLength(2);
    expect(next.stitchLinks).toEqual(before.stitchLinks);
    next.stitchGroups!.forEach((g, i) => {
      expect(g.id).toBe(groups[i].id);
      expect(g.closed).toBe(true);
      expect(g.settings).toEqual(groups[i].settings);
      expect(g.holeOverrides).toEqual(groups[i].holeOverrides);
      expect(g.edges).toHaveLength(
        groups[i].edges.length + (i === contour ? 1 : 0),
      );
      expect(stitchGeometry(nextShape, g).holes).toHaveLength(counts[i]);
    });
    const repeated = reconcileStitches(next, before);
    expect(repeated.stitchGroups).toEqual(next.stitchGroups);
    // JSON round trips lose transient WeakMap entries: already-remapped keys must survive.
    const loaded = parseProject(JSON.stringify(next));
    expect(reconcileStitches(loaded, before).stitchGroups).toEqual(
      loaded.stitchGroups,
    );
  },
);

test("unrelated reconciliation preserves closed outer and hole runs at rotated seams", () => {
  const shape = ring(),
    groups = contourGroups(shape),
    before: Doc = { version: 22, shapes: [shape], stitchGroups: groups };
  const result = reconcileStitches(
    { ...before, shapes: [{ ...shape, name: "Renamed" }] },
    before,
  );
  expect(result.stitchGroups).toEqual(groups);
  result.stitchGroups!.forEach((g, i) =>
    expect(stitchGeometry(result.shapes[0], g).holes.length).toBe(
      stitchGeometry(shape, groups[i]).holes.length,
    ),
  );
});

function compound(cubic: Cubic): Shape {
  return {
    id: "loop",
    name: "Loop",
    kind: "compound",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    rotation: 0,
    radius: 0,
    contours: [[cubic]],
  };
}
test("coincident-endpoint cubic loops retain geometry, positive area, and stitching", () => {
  const shape = compound([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 0, y: 20 },
    { x: 0, y: 0 },
  ]);
  expect(stitchEdges(shape)).toHaveLength(1);
  expect(stitchEdges(shape)[0].points.length).toBeGreaterThan(2);
  expect(shapeArea(shape)).toBeGreaterThan(50);
  const group: StitchGroup = {
    id: "loop-run",
    shapeId: shape.id,
    edges: stitchEdges(shape).map((e) => e.key),
    closed: true,
    side: 1,
    settings: { ...defaultStitchSettings, inset: 0 },
  };
  const doc: Doc = { version: 22, shapes: [shape], stitchGroups: [group] };
  const next = reconcileStitches(doc, doc);
  expect(next.stitchGroups).toHaveLength(1);
  expect(
    stitchGeometry(shape, next.stitchGroups![0]).holes.length,
  ).toBeGreaterThan(1);
});
test("collinear overshoot and collapsed endpoints are sampled; ordinary straight cubics remain straight", () => {
  const overshoot = compound([
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: -20, y: 0 },
    { x: 10, y: 0 },
  ]);
  const points = stitchEdges(overshoot)[0].points;
  expect(points.length).toBeGreaterThan(2);
  const length = points
    .slice(1)
    .reduce(
      (n, p, i) => n + Math.hypot(p.x - points[i].x, p.y - points[i].y),
      0,
    );
  expect(length).toBeGreaterThan(10);
  const straight = compound([
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 7, y: 0 },
    { x: 10, y: 0 },
  ]);
  expect(stitchEdges(straight)[0].points).toHaveLength(2);
  const diagonal = compound([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 6 },
    { x: 1, y: 6 },
  ]);
  expect(stitchEdges(diagonal)[0].points).toHaveLength(2);
});
test("curved compound measurements correspond to cubics rather than flattening chords", () => {
  const circle: Shape = {
    ...rectangle("circle", 0, 0, 10),
    kind: "circle",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  };
  const shape = booleanShapes("union", [circle, rectangle("box", 0, -5, 10)])!;
  const measured = edgeMeasurements(shape);
  expect(measured).toHaveLength(worldCubics(shape).length);
  expect(measured.reduce((n, e) => n + e.length, 0)).toBeGreaterThan(50);
  expect(contains(shape, { x: 0, y: 0 })).toBe(true);
  const moved = transformShape(shape, { a: 2, b: 0, c: 0, d: 2, e: 50, f: 80 });
  const scaled = edgeMeasurements(moved);
  expect(scaled).toHaveLength(measured.length);
  expect(scaled.reduce((n, e) => n + e.length, 0)).toBeCloseTo(
    2 * measured.reduce((n, e) => n + e.length, 0),
    2,
  );
});
