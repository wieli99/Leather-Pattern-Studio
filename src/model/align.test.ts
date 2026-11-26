import { test, expect } from "vitest";
import { alignAxis, alignOffsets, gapsFit, alignShapes, referenceIndex, unitBounds } from "./align";
import { bounds } from "./geometry";
import type { Shape } from "./project";

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const rectangle = (id: string, x: number, y: number, width: number, height: number): Shape => ({
  id, name: id, kind: "rectangle", points: [{ x, y }, { x: x + width, y: y + height }], radius: 0, rotation: 0,
});
const xs = (offsets: { x: number }[]) => offsets.map((o) => o.x);
const ys = (offsets: { y: number }[]) => offsets.map((o) => o.y);

test("Aligns edges and centers to the combined selection bounds", () => {
  const list = [box(0, 0, 10, 10), box(30, 20, 20, 40), box(15, 5, 5, 5)];
  expect(xs(alignOffsets(list, { kind: "align", edge: "left" }))).toEqual([0, -30, -15]);
  expect(xs(alignOffsets(list, { kind: "align", edge: "right" }))).toEqual([40, 0, 30]);
  expect(xs(alignOffsets(list, { kind: "align", edge: "center-x" }))).toEqual([20, -15, 7.5]);
  expect(ys(alignOffsets(list, { kind: "align", edge: "top" }))).toEqual([0, -20, -5]);
  expect(ys(alignOffsets(list, { kind: "align", edge: "bottom" }))).toEqual([50, 0, 50]);
  expect(ys(alignOffsets(list, { kind: "align", edge: "center-y" }))).toEqual([25, -10, 22.5]);
  // Alignment never moves objects along the other axis.
  expect(ys(alignOffsets(list, { kind: "align", edge: "left" }))).toEqual([0, 0, 0]);
});

test("A fixed reference object stays in place while others align to it", () => {
  const list = [box(10, 0, 10, 10), box(40, 0, 30, 30), box(0, 0, 5, 5)];
  expect(referenceIndex(list, "first")).toBe(0);
  expect(referenceIndex(list, "last")).toBe(2);
  expect(referenceIndex(list, "largest")).toBe(1);
  expect(referenceIndex(list, "smallest")).toBe(2);
  expect(xs(alignOffsets(list, { kind: "align", edge: "left" }, "first"))).toEqual([0, -30, 10]);
  expect(xs(alignOffsets(list, { kind: "align", edge: "right" }, "largest"))).toEqual([50, 0, 65]);
  expect(xs(alignOffsets(list, { kind: "align", edge: "center-x" }, "last"))).toEqual([-12.5, -52.5, 0]);
  // A reference needs another object to align; a lone object stays put.
  expect(xs(alignOffsets([box(5, 5, 1, 1)], { kind: "align", edge: "left" }, "first"))).toEqual([0]);
});

test("Distributes centers evenly between the outermost objects", () => {
  const list = [box(100, 0, 20, 10), box(0, 0, 10, 10), box(30, 0, 4, 10), box(60, 0, 10, 10)];
  // Centers 110, 5, 32, 65 → order 5, 32, 65, 110 with a 35 mm step.
  expect(xs(alignOffsets(list, { kind: "distribute", mode: "centers-x" }))).toEqual([0, 0, 8, 10]);
});

test("Equalizes gaps while keeping the outermost objects fixed", () => {
  const list = [box(0, 0, 10, 10), box(12, 0, 10, 10), box(70, 0, 10, 10), box(100, 0, 20, 10)];
  // Span 120 with 50 mm of objects leaves three gaps of 70/3.
  const gap = 70 / 3;
  const offsets = ys(alignOffsets(list.map((b) => ({ ...b, x: b.y, y: b.x, width: b.height, height: b.width })),
    { kind: "distribute", mode: "gaps-y" }));
  expect(offsets[0]).toBe(0);
  expect(offsets[1]).toBeCloseTo(10 + gap - 12);
  expect(offsets[2]).toBeCloseTo(20 + 2 * gap - 70);
  expect(offsets[3]).toBe(0);
  // Objects too wide to sit side by side between the outer edges stay put.
  const crowded = [box(0, 0, 50, 5), box(10, 0, 50, 5), box(40, 0, 50, 5)];
  expect(gapsFit(crowded, "x")).toBe(false);
  expect(xs(alignOffsets(crowded, { kind: "distribute", mode: "gaps-x" }))).toEqual([0, 0, 0]);
});

test("Distribution needs three objects and leaves evenly spaced objects unchanged", () => {
  expect(xs(alignOffsets([box(0, 0, 1, 1), box(50, 0, 1, 1)], { kind: "distribute", mode: "centers-x" }))).toEqual([0, 0]);
  expect(xs(alignOffsets([box(0, 0, 10, 1), box(20, 0, 10, 1), box(40, 0, 10, 1)], { kind: "distribute", mode: "gaps-x" })))
    .toEqual([0, 0, 0]);
});

test("Moves whole units, ignores attached stitching for bounds and reports no-ops", () => {
  const shapes = [
    rectangle("a", 0, 0, 10, 10),
    rectangle("b1", 40, 30, 10, 10),
    rectangle("b2", 60, 50, 10, 10),
    { ...rectangle("stitch", -500, 0, 1, 1), stitchParentId: "b1" },
    rectangle("free", 100, 100, 5, 5),
  ];
  expect(unitBounds([shapes[1], shapes[3]], "mm")).toEqual(bounds([shapes[1]], "mm"));
  const next = alignShapes(shapes, [{ ids: ["a"] }, { ids: ["b1", "b2", "stitch"] }], [{ kind: "align", edge: "left" }], "first", "mm")!;
  expect(bounds([next[0]], "mm")).toEqual(bounds([shapes[0]], "mm"));
  expect(bounds([next[1]], "mm").x).toBe(0);
  expect(bounds([next[2]], "mm").x).toBe(20);
  expect(bounds([next[3]], "mm").x).toBe(-540);
  expect(next[4]).toBe(shapes[4]);
  expect(alignShapes(next, [{ ids: ["a"] }, { ids: ["b1", "b2", "stitch"] }], [{ kind: "align", edge: "left" }], "first", "mm")).toBeNull();
});

test("A horizontal and a vertical action combine, both measured from the original positions", () => {
  const shapes = [rectangle("a", 0, 0, 10, 10), rectangle("b", 40, 20, 20, 40), rectangle("c", 100, 90, 10, 10)];
  const unitsList = shapes.map((s) => ({ ids: [s.id] }));
  const next = alignShapes(shapes, unitsList,
    [{ kind: "align", edge: "center-x" }, { kind: "distribute", mode: "gaps-y" }], "largest", "mm")!;
  // Pocket b (largest) keeps x; y gaps: span 0–100 with 60 mm of objects leaves two 20 mm gaps.
  expect(next.map((s) => bounds([s], "mm"))).toEqual([
    { x: 45, y: 0, width: 10, height: 10 },
    { x: 40, y: 30, width: 20, height: 40 },
    { x: 45, y: 90, width: 10, height: 10 },
  ]);
  expect(alignAxis({ kind: "align", edge: "bottom" })).toBe("y");
  expect(alignAxis({ kind: "distribute", mode: "centers-x" })).toBe("x");
});

test("Equal gaps keep the objects reaching furthest out fixed, not the outermost centers", () => {
  // A wide object whose center lies between the others keeps its far edge.
  const list = [box(0, 0, 10, 5), box(20, 0, 70, 5), box(40, 0, 10, 5)];
  expect(gapsFit(list, "x")).toBe(true);
  expect(xs(alignOffsets(list, { kind: "distribute", mode: "gaps-x" }))).toEqual([0, 0, -30]);
  // One object spanning all others leaves no room to space them: nothing moves past it.
  const spanning = [box(10, 0, 10, 5), box(0, 0, 100, 5), box(80, 0, 10, 5)];
  expect(gapsFit(spanning, "x")).toBe(false);
  expect(xs(alignOffsets(spanning, { kind: "distribute", mode: "gaps-x" }))).toEqual([0, 0, 0]);
});

test("An exact gap places objects that far apart from the start-most or reference object", () => {
  const list = [box(40, 0, 10, 10), box(0, 0, 20, 10), box(100, 0, 5, 10)];
  const action = { kind: "distribute", mode: "gaps-x" } as const;
  // Order along x: 1 (0–20), 0, 2; object 1 stays and the others follow 5 mm apart.
  expect(xs(alignOffsets(list, action, "selection", 5))).toEqual([-15, 0, -60]);
  // The reference stays instead: the last selected object at 100–105.
  expect(xs(alignOffsets(list, action, "last", 5))).toEqual([45, 60, 0]);
  // Two objects are enough, and a zero gap butts them together.
  expect(xs(alignOffsets([box(0, 0, 10, 10), box(30, 0, 10, 10)], action, "selection", 0))).toEqual([0, -20]);
  // Overlapping objects are spread apart rather than refused.
  const crowded = [box(0, 0, 50, 5), box(10, 0, 50, 5), box(40, 0, 50, 5)];
  expect(xs(alignOffsets(crowded, action, "selection", 2))).toEqual([0, 42, 64]);
  // Equal-center distribution ignores the gap value.
  expect(xs(alignOffsets(list, { kind: "distribute", mode: "centers-x" }, "selection", 5)))
    .toEqual(xs(alignOffsets(list, { kind: "distribute", mode: "centers-x" })));
});

test("An exact vertical gap moves objects along y only", () => {
  const list = [box(0, 0, 10, 10), box(5, 50, 10, 20)];
  const offsets = alignOffsets(list, { kind: "distribute", mode: "gaps-y" }, "selection", 3);
  expect(ys(offsets)).toEqual([0, -37]);
  expect(xs(offsets)).toEqual([0, 0]);
});
