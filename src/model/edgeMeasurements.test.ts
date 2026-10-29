import { describe, expect, it } from "vitest";
import { edgeMeasurements, formatEdgeLength } from "./edgeMeasurements";
import type { Shape } from "./project";
const shape: Shape = {
  id: "a",
  name: "A",
  kind: "rectangle",
  points: [
    { x: 0, y: 0 },
    { x: 30, y: 40 },
  ],
  rotation: 0,
  radius: 0,
};
describe("edge measurements", () => {
  it("measures all rectangle sides", () => {
    expect(
      edgeMeasurements(shape)
        .map((e) => e.length)
        .sort(),
    ).toEqual([30, 30, 40, 40]);
  });
  it("measures curved outlines and rounded corners", () => {
    expect(edgeMeasurements({ ...shape, radius: 5 })).toHaveLength(8);
    expect(
      edgeMeasurements({ ...shape, kind: "circle" })[0].length,
    ).toBeCloseTo(100 * Math.PI, 2);
  });
  it("uses transformed millimetres", () => {
    expect(
      edgeMeasurements({
        ...shape,
        transform: { a: 2, b: 0, c: 0, d: 2, e: 20, f: 10 },
      })
        .map((e) => e.length)
        .sort(),
    ).toEqual([60, 60, 80, 80]);
  });
  it("formats compact values", () => {
    expect(formatEdgeLength(25)).toBe("25 mm");
    expect(formatEdgeLength(25.367)).toBe("25.37 mm");
  });
});
