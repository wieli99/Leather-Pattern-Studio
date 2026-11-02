import { describe, expect, it } from "vitest";
import { applyPrintDocument, printDocument } from "./printDocument";
import { emptyDocument, parseProject, type Shape } from "./project";
import { resolvedPrintItems, type PrintLayout } from "./printLayout";
import { shapeMatrix, worldPoints } from "./geometry";

const shape: Shape = { id: "label", name: "Label", kind: "text", text: "Cut two", fontSize: 5, points: [{x: 10,y: 20},{x: 40,y: 26}], radius: 0, rotation: 25 };
const layout: PrintLayout = { id: "print", name: "Print", width: 210, height: 297, margin: 10, units: "mm", pages: [{column: 0,row: 0}], instances: [] };
describe("editable print document", () => {
  it("stores native objects without adding Grid shapes and preserves geometry", () => {
    const document = emptyDocument();
    const next = { ...emptyDocument(), shapes: [shape] };
    const result = applyPrintDocument(layout, printDocument(document, layout), next);
    const roundtrip = printDocument(document, result);
    expect(document.shapes).toEqual([]);
    expect(result.instances[0].snapshot?.shape).toEqual(shape);
    worldPoints(roundtrip.shapes[0]).forEach((point, index) => {
      expect(point.x).toBeCloseTo(worldPoints(shape)[index].x);
      expect(point.y).toBeCloseTo(worldPoints(shape)[index].y);
    });
    expect(parseProject(JSON.stringify({ ...document, printLayouts: [result] })).printLayouts).toHaveLength(1);
  });
  it("retains untouched source links and isolates edited snapshots", () => {
    const document = { ...emptyDocument(), shapes: [shape] };
    const linked = { ...layout, instances: [{id: "instance", sourceId: shape.id, x: 80, y: 90, rotation: 45, mirrored: true}] };
    const original = printDocument(document, linked);
    expect(applyPrintDocument(linked, original, original).instances[0]).toBe(linked.instances[0]);
    const next = { ...original, shapes: original.shapes.map(s => ({ ...s, text: "Cut four" })) };
    const result = applyPrintDocument(linked, original, next);
    expect(result.instances[0].snapshot?.shape.text).toBe("Cut four");
    expect(document.shapes[0].text).toBe("Cut two");
    expect(linked.instances[0]).not.toHaveProperty("snapshot");
    const resolved = resolvedPrintItems(document, result)[0].shape;
    const expected = shapeMatrix(next.shapes[0]);
    const actual = shapeMatrix(resolved);
    for (const key of ["a", "b", "c", "d", "e", "f"] as const) expect(actual[key]).toBeCloseTo(expected[key]);
  });
  it("keeps copied image data and groups local across round trips", () => {
    const image: Shape = { ...shape, id: "image", kind: "image", image: "data:image/png;base64,iVBORw0KGgo=", text: undefined };
    const next = { ...emptyDocument(), shapes: [image], objectTree: [{kind: "group" as const, id: "group", name: "Notes", children: [{kind: "object" as const, id: image.id}]}] };
    const result = applyPrintDocument(layout, emptyDocument(), next);
    expect(printDocument(emptyDocument(), result).objectTree?.[0]).toMatchObject({kind: "group", name: "Notes"});
    expect(result.instances[0].snapshot?.shape.image).toBe(image.image);
  });
});

it("preserves linked folder membership metadata when adding native print objects", () => {
  const linked: PrintLayout = {
    ...layout,
    instances: [{id: "instance", sourceId: shape.id, x: 10, y: 20, rotation: 0}],
    tree: [{kind: "group", id: "folder", sourceId: "grid-folder", name: "Pattern", x: 7, y: 8, rotation: 30, excludedSourceIds: ["omitted"], children: [{kind: "instance", id: "instance"}]}],
  };
  const original = printDocument({ ...emptyDocument(), shapes: [shape] }, linked);
  const next = { ...original, shapes: [...original.shapes, { ...shape, id: "native" }], objectTree: [...original.objectTree!, {kind: "object" as const, id: "native"}] };
  const result = applyPrintDocument(linked, original, next);
  expect(result.tree?.[0]).toEqual(linked.tree?.[0]);
  expect(result.instances[0]).toBe(linked.instances[0]);
  expect(result.instances[1].snapshot).toBeDefined();
});

it("keeps stitching identifiers stable through repeated independent edits", () => {
  const rectangle: Shape = { ...shape, kind: "rectangle", text: undefined };
  const document = { ...emptyDocument(), shapes: [rectangle], stitchGroups: [{
    id: "st", shapeId: rectangle.id, edges: ["rectangle:2:edge:0"], side: 1 as const, closed: false,
    settings: {style: "round" as const, spacing: 4, inset: 2, alignment: "center" as const, startClearance: 0, endClearance: 0},
  }] };
  let result: PrintLayout = { ...layout, instances: [{id: "instance", sourceId: rectangle.id, x: 80, y: 90, rotation: 0}] };
  for (let i = 0; i < 5; i++) {
    const original = printDocument(document, result);
    const next = { ...original, shapes: original.shapes.map(s => ({...s, name: `Edit ${i}`})) };
    result = applyPrintDocument(result, original, next);
    expect(printDocument(document, result).stitchGroups?.[0].id).toBe("instance:stitch:0");
    expect(result.instances[0].snapshot?.stitchGroups).toHaveLength(1);
  }
});
