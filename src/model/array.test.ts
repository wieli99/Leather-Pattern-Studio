import { test, expect } from "vitest";
import { arrayPlacements, type ArraySettings } from "./array";
const box = { x: 10, y: 20, width: 10, height: 20 };
const settings = (changes: Partial<ArraySettings> = {}): ArraySettings => ({
  kind: "rectangular",
  extent: true,
  vector1: { x: 30, y: 15 },
  vector2: { x: -10, y: 20 },
  rows: 2,
  columns: 4,
  count: 4,
  angle: 360,
  step: false,
  cx: 0,
  cy: 0,
  rotate: true,
  error: "",
  ...changes,
});
test("extent distributes two independent 2D directions to the endpoints", () => {
  const matrices = arrayPlacements(settings(), box);
  expect(matrices).toHaveLength(7);
  expect(matrices[0]).toMatchObject({ e: 10, f: 5 });
  expect(matrices.at(-1)).toMatchObject({ e: 20, f: 35 });
});
test("spacing holds inter-item distances independent of count", () => {
  expect(
    arrayPlacements(settings({ extent: false }), box).at(-1),
  ).toMatchObject({ e: 80, f: 65 });
  expect(
    arrayPlacements(settings({ extent: false, columns: 2 }), box)[0],
  ).toMatchObject({ e: 30, f: 15 });
});
test("radial Total uses count even for partial sweeps", () => {
  const partial = arrayPlacements(
    settings({ kind: "radial", angle: 180 }),
    box,
  );
  expect(partial[0].a).toBeCloseTo(Math.SQRT1_2);
  expect(partial.at(-1)!.a).toBeCloseTo(-Math.SQRT1_2);
  expect(
    arrayPlacements(settings({ kind: "radial", angle: -360 }), box)[0].b,
  ).toBeCloseTo(-1);
});
test("radial spacing and fixed orientation preserve source linear transforms", () => {
  const m = arrayPlacements(
    settings({
      kind: "radial",
      count: 2,
      angle: 180,
      step: true,
      rotate: false,
    }),
    box,
  )[0];
  expect(m).toMatchObject({ a: 1, b: 0, c: 0, d: 1 });
  expect(m.e).toBeCloseTo(-30);
  expect(m.f).toBeCloseTo(-60);
});
test("invalid counts, coordinates, directions and duplicate radial placements fail", () => {
  for (const changes of [
    { columns: 1.5 },
    { rows: 1001 },
    { vector1: { x: 0, y: 0 } },
    { vector1: { x: NaN, y: 0 } },
    { kind: "radial" as const, angle: 0 },
    { kind: "radial" as const, angle: 180, step: true },
  ])
    expect(() => arrayPlacements(settings(changes), box)).toThrow();
});
