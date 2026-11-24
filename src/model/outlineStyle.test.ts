import { expect, test } from "vitest";
import { hasStyledOutline, isOutlineStyle, outlineDash } from "./outlineStyle";

test("outline styles produce millimetre dash patterns scaled for thick outlines", () => {
  expect(outlineDash({ kind: "rectangle" })).toEqual([]);
  expect(outlineDash({ kind: "rectangle", strokeStyle: "solid" })).toEqual([]);
  expect(outlineDash({ kind: "line", strokeStyle: "dashed" })).toEqual([3, 1.5]);
  expect(outlineDash({ kind: "curve", strokeStyle: "dotted", strokeWidth: 0.1 })).toEqual([0, 1]);
  expect(outlineDash({ kind: "circle", strokeStyle: "dashed", strokeWidth: 0.7 })).toEqual([6, 3]);
});

test("annotations, text, and images keep solid marks", () => {
  for (const kind of ["text", "image", "measurement", "arrow", "size-ruler"] as const) {
    expect(hasStyledOutline(kind)).toBe(false);
    expect(outlineDash({ kind, strokeStyle: "dashed" })).toEqual([]);
  }
  expect(isOutlineStyle("dotted")).toBe(true);
  expect(isOutlineStyle("dash-dot")).toBe(false);
});
