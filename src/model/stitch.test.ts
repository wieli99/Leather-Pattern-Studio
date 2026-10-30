import { expect, test } from "vitest";
import {
  defaultStitchSettings,
  offsetStitchSegment,
  stitchDistances,
  validateStitchSettings,
} from "./stitch";
const settings = { ...defaultStitchSettings, spacing: 3 };
test("open alignment distributes the remainder along the inset path", () => {
  expect(stitchDistances(10, settings)).toEqual([0.5, 3.5, 6.5, 9.5]);
  expect(stitchDistances(10, { ...settings, alignment: "start" })).toEqual([
    0, 3, 6, 9,
  ]);
  expect(stitchDistances(10, { ...settings, alignment: "end" })).toEqual([
    1, 4, 7, 10,
  ]);
});
test("exact pitch and short paths", () => {
  expect(stitchDistances(9, settings)).toEqual([0, 3, 6, 9]);
  expect(stitchDistances(2, settings)).toEqual([1]);
  expect(stitchDistances(11.55, defaultStitchSettings)).toHaveLength(4);
});
test("loops preserve pitch without repeating the seam", () => {
  expect(stitchDistances(9, { ...settings, alignment: "start" }, true)).toEqual(
    [0, 3, 6],
  );
  expect(stitchDistances(10, settings, true)).toEqual([2, 5, 8]);
  expect(stitchDistances(10, { ...settings, alignment: "end" }, true)).toEqual([
    4, 7, 0,
  ]);
  expect(stitchDistances(2, settings, true)).toEqual([1]);
});
test("world-space offset supports either side and rejects collapsed geometry", () => {
  expect(offsetStitchSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 3, 1)).toEqual([
    { x: 0, y: 3 },
    { x: 10, y: 3 },
  ]);
  expect(offsetStitchSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 3, -1)).toEqual([
    { x: 0, y: -3 },
    { x: 10, y: -3 },
  ]);
  expect(() =>
    offsetStitchSegment({ x: 0, y: 0 }, { x: 0, y: 0 }, 3, 1),
  ).toThrow();
});
test("invalid settings and unbounded hole generation fail explicitly", () => {
  for (const spacing of [0, -1, NaN, Infinity, 1.001])
    expect(() => validateStitchSettings({ ...settings, spacing })).toThrow();
  expect(() => validateStitchSettings({ ...settings, inset: -1 })).toThrow();
  expect(() => stitchDistances(0, settings)).toThrow();
  expect(() => stitchDistances(1e7, settings)).toThrow();
});

test("clearances shorten the alignment interval and open a loop at its seam", () => {
  const value = {
    ...defaultStitchSettings,
    spacing: 3,
    startClearance: 2,
    endClearance: 1,
  };
  expect(stitchDistances(12, value)).toEqual([2, 5, 8, 11]);
  expect(stitchDistances(12, value, true)).toEqual([2, 5, 8, 11]);
  expect(() => stitchDistances(3, value)).toThrow();
});
