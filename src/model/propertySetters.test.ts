import { describe, expect, it, vi } from "vitest";
import { construct } from "../editor/construction";
import { rotateShape, center } from "./geometry";
import { getProperty, propertyValueError, setProperty, PROPERTIES, type PropertyId } from "./propertySetters";
import type { Shape } from "./project";
import { resizeText } from "./text";

// Text resizing measures with a canvas; a fixed advance keeps the test deterministic.
vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ font: "", measureText: (t: string) => ({ width: t.length * 2 }) }) }) });
const named = (s: Shape, id: string): Shape => ({ ...s, id, name: id });
const rect = named(construct("rectangle", [{ x: 0, y: 0 }, { x: 40, y: 20 }]), "rect");
const shapes: Shape[] = [
  rect,
  named(rotateShape(rect, 30, center(rect)) as Shape, "rotated"),
  named(construct("ellipse", [{ x: 0, y: 0 }, { x: 30, y: 10 }]), "ellipse"),
  named(construct("circle", [{ x: 5, y: 5 }, { x: 15, y: 5 }]), "circle"),
  named(construct("arrow", [{ x: 0, y: 0 }, { x: 20, y: 0 }]), "arrow"),
  named(construct("size-square", [{ x: 0, y: 0 }, { x: 10, y: 10 }]), "square"),
  named(construct("measurement", [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 10, y: 12 }]), "measure"),
  resizeText({ id: "text", name: "Text", kind: "text", text: "Cut two", fontSize: 5, points: [{ x: 10, y: 20 }, { x: 40, y: 26 }], radius: 0, rotation: 0 } as Shape),
];
const targets: Record<PropertyId, number> = {
  x: 12.5, y: -7, width: 33, height: 9, radius: 4, sweep: 90, rotation: 15, strokeWidth: 0.8,
  headSize: 4, indicatorSize: 14, fontSize: 7, lineSpacing: 1.5, measurementSections: 3, measurementOffset: 6,
};

describe("property setters", () => {
  for (const shape of shapes)
    for (const id of Object.keys(PROPERTIES) as PropertyId[]) {
      if (getProperty(shape, id) === null) continue;
      it(`sets ${id} on ${shape.id}`, () => {
        const next = setProperty(shape, id, targets[id]);
        expect(next).not.toBeNull();
        expect(getProperty(next!, id)).toBeCloseTo(targets[id], 6);
      });
    }
  it("skips properties that do not apply", () => {
    expect(getProperty(rect, "radius")).toBeNull();
    expect(setProperty(rect, "fontSize", 3)).toBeNull();
  });
  it("keeps other axes when an unlocked size changes", () => {
    const next = setProperty(rect, "width", 10)!;
    expect(getProperty(next, "height")).toBeCloseTo(20);
    expect(getProperty(next, "x")).toBeCloseTo(20);
  });
  it("checks ranges", () => {
    expect(propertyValueError("width", 0)).toMatch("≥");
    expect(propertyValueError("sweep", 400)).toMatch("≤");
    expect(propertyValueError("measurementSections", 2.5)).toMatch("whole");
    expect(propertyValueError("x", -1e3)).toBeNull();
  });
});
