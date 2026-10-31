import { expect, test, vi } from "vitest";
import { measureText, resizeText } from "./text";
import { applyMatrix, shapeMatrix } from "./geometry";
import type { Shape } from "./project";

test("text bounds follow font size and multiline content without moving a rotated anchor", () => {
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () => ({
        font: "",
        measureText(line: string) {
          return { width: line.length * parseFloat(this.font) };
        },
      }),
    }),
  });
  try {
    expect(measureText("ab\r\nc", 10)).toEqual({ text: "ab\nc", width: 20, height: 24 });
    expect(measureText("", 10).width).toBe(5);
    const shape: Shape = {
      id: "t", name: "Text", kind: "text", text: "ab\nc", fontSize: 10,
      points: [{ x: 3, y: 4 }, { x: 13, y: 16 }],
      radius: 0, rotation: 35,
      transform: { a: 2, b: 0, c: 0, d: 3, e: 10, f: 20 },
    };
    const anchor = applyMatrix(shapeMatrix(shape), shape.points[0]);
    const next = resizeText(shape);
    expect(next.points[1]).toEqual({ x: 23, y: 28 });
    expect(applyMatrix(shapeMatrix(next), next.points[0])).toEqual(anchor);
    expect(resizeText({ ...next, fontSize: 5 }).points[1]).toEqual({ x: 13, y: 16 });
  } finally {
    vi.unstubAllGlobals();
  }
});
