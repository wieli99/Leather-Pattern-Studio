import { expect, test } from "vitest";
import { adjustedNumber } from "./numericWheel";
test("wheel direction, modifiers, fractions and bounds", () => {
  expect(adjustedNumber(2.5, -1, false, false)).toBe(3.5);
  expect(adjustedNumber(2.5, 1, true, false)).toBe(-2.5);
  expect(adjustedNumber(2.5, -1, true, true)).toBe(12.5);
  expect(adjustedNumber(2, 1, false, true, 1, 100)).toBe(1);
  expect(adjustedNumber(99, -1, false, true, 1, 100)).toBe(100);
});
test("larger steps reach and remain at limits", () => {
  for (const [shift, ctrl] of [[false, false], [true, false], [false, true]]) {
    expect(adjustedNumber(22.5, -1, shift, ctrl, 1, 23)).toBe(23);
    expect(adjustedNumber(23, -1, shift, ctrl, 1, 23)).toBe(23);
    expect(adjustedNumber(1.5, 1, shift, ctrl, 1, 23)).toBe(1);
    expect(adjustedNumber(1, 1, shift, ctrl, 1, 23)).toBe(1);
  }
});
test("a nonzero field steps across zero without changing ordinary fields", () => {
  expect(adjustedNumber(1, 1, false, false, -Infinity, Infinity, true)).toBe(-1);
  expect(adjustedNumber(-1, -1, false, false, -Infinity, Infinity, true)).toBe(1);
  expect(adjustedNumber(5, 1, true, false, -Infinity, Infinity, true)).toBe(-5);
  expect(adjustedNumber(1, 1, false, false)).toBe(0);
});
