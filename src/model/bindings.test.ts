import { describe, expect, it } from "vitest";
import { construct } from "../editor/construction";
import { moveShape } from "./geometry";
import { getProperty } from "./propertySetters";
import { deleteVariable, pruneBindings, recompute, renameVariable, variableUses, withBinding } from "./bindings";
import type { Doc, Shape } from "./project";
import type { Variable } from "./variables";

const card = (): Shape => ({ ...construct("rectangle", [{ x: 0, y: 0 }, { x: 86, y: 54 }]), id: "card", name: "{brand} card" });
const doc = (variables: Variable[], shapes: Shape[]): Doc => ({
  version: 25, variables, shapes,
  objectTree: [{ kind: "group", id: "g", name: "{brand} set", children: shapes.map((s) => ({ kind: "object", id: s.id })) }],
});
const vars = (w = "86"): Variable[] => [
  { id: "w", name: "card_w", kind: "number", value: w },
  { id: "t", name: "t", kind: "number", value: "1.5" },
  { id: "b", name: "brand", kind: "text", value: "Acme" },
];
const linked = () => withBinding(withBinding(card(), "width", { property: "width", expression: "{card_w} + 2*{t}", unit: "mm" }),
  "x", { property: "x", expression: "{card_w}", unit: "mm" });

describe("property links", () => {
  it("recomputes linked sizes before positions", () => {
    const { doc: next, problems } = recompute(doc(vars("100"), [linked()]));
    expect(problems).toEqual([]);
    expect(getProperty(next.shapes[0], "width")).toBeCloseTo(103);
    expect(getProperty(next.shapes[0], "height")).toBeCloseTo(54);
    expect(getProperty(next.shapes[0], "x")).toBeCloseTo(100);
  });
  it("reads plain variables in the unit the link was typed in", () => {
    const shape = withBinding(card(), "width", { property: "width", expression: "{card_w} + 1", unit: "in" });
    const { doc: next } = recompute(doc(vars("2"), [shape]));
    expect(getProperty(next.shapes[0], "width")).toBeCloseTo(76.2);
  });
  it("reports out-of-range values and locked objects instead of applying them", () => {
    const shape = withBinding(card(), "width", { property: "width", expression: "{card_w}", unit: "mm" });
    expect(recompute(doc(vars("-5"), [shape])).problems[0].message).toBe("Width of '{brand} card' must be ≥ 0.001 mm");
    expect(recompute(doc(vars("90"), [shape]), () => true).problems[0].message).toMatch("Unlock");
  });
  it("removes a link when the formula has no variables", () => {
    const shape = withBinding(linked(), "width", { property: "width", expression: "20", unit: "mm" });
    expect(shape.bindings?.map((b) => b.property)).toEqual(["x"]);
    expect(withBinding(shape, "x", null).bindings).toBeUndefined();
  });
  it("unlinks only properties a direct edit changed", () => {
    const start = recompute(doc(vars(), [linked()])).doc;
    expect(pruneBindings(start).doc).toBe(start);
    const moved = { ...start, shapes: [{ ...start.shapes[0], ...moveShape(start.shapes[0], 0, 5) }] };
    const { doc: pruned, removed } = pruneBindings(moved);
    expect(pruned).toBe(moved);
    expect(removed).toHaveLength(0);
    const shifted = { ...start, shapes: [{ ...start.shapes[0], ...moveShape(start.shapes[0], 5, 0) }] };
    const result = pruneBindings(shifted);
    expect(result.doc.shapes[0].bindings?.map((b) => b.property)).toEqual(["width"]);
    expect(result.removed[0].message).toBe("Unlinked position x of '{brand} card' from {card_w}");
  });
  it("renames references everywhere", () => {
    const renamed = renameVariable(renameVariable(doc(vars(), [linked()]), "w", "width"), "b", "maker");
    expect(renamed.variables?.map((v) => v.name)).toEqual(["width", "t", "maker"]);
    expect(renamed.shapes[0].bindings?.map((b) => b.expression)).toEqual(["{width} + 2*{t}", "{width}"]);
    expect(renamed.shapes[0].name).toBe("{maker} card");
    expect(renamed.objectTree?.[0].kind === "group" && renamed.objectTree[0].name).toBe("{maker} set");
  });
  it("counts uses and deletes by keeping current values", () => {
    const start = recompute(doc([...vars(), { id: "s", name: "slot", kind: "number", value: "{card_w} + 1" }], [linked()])).doc;
    expect(variableUses(start, "card_w")).toBe(3);
    expect(variableUses(start, "brand")).toBe(2);
    const deleted = deleteVariable(deleteVariable(start, "w"), "b");
    expect(deleted.variables?.map((v) => [v.name, v.value])).toEqual([["t", "1.5"], ["slot", "87"]]);
    expect(deleted.shapes[0].bindings).toBeUndefined();
    expect(getProperty(deleted.shapes[0], "width")).toBeCloseTo(89);
    expect(deleted.shapes[0].name).toBe("Acme card");
    expect(deleted.objectTree?.[0].kind === "group" && deleted.objectTree[0].name).toBe("Acme set");
  });
});

describe("review fixes", () => {
  it("renames and deletes inside print snapshots and copy names", () => {
    const shape = linked();
    const base = doc(vars(), [shape]);
    const withSnapshot: Doc = {
      ...base,
      printLayouts: [{ id: "l", name: "A4", instances: [{ id: "i", sourceId: "card", x: 0, y: 0, rotation: 0, name: "{brand} copy",
        snapshot: { shape: structuredClone(shape), stitchGroups: [] } }],
      tree: [{ kind: "group", id: "pg", name: "{brand} set", x: 0, y: 0, rotation: 0, children: [{ kind: "instance", id: "i" }] }] } as unknown as NonNullable<Doc["printLayouts"]>[number]],
    };
    expect(variableUses(withSnapshot, "card_w")).toBe(4);
    const renamed = renameVariable(withSnapshot, "b", "maker");
    expect(renamed.printLayouts![0].instances[0].name).toBe("{maker} copy");
    expect(variableUses(withSnapshot, "brand")).toBe(5);
    const group = renamed.printLayouts![0].tree![0];
    expect(group.kind === "group" && group.name).toBe("{maker} set");
    expect(renamed.printLayouts![0].instances[0].snapshot!.shape.name).toBe("{maker} card");
    const deleted = deleteVariable(deleteVariable(withSnapshot, "w"), "b");
    expect(deleted.printLayouts![0].instances[0].snapshot!.shape.bindings).toBeUndefined();
    expect(deleted.printLayouts![0].instances[0].name).toBe("Acme copy");
  });
  it("keeps visible text when a blank variable is deleted and escapes baked braces", () => {
    const label = { ...card(), name: "{suffix}", text: "{suffix}" } as Shape;
    const blank = doc([{ id: "s", name: "suffix", kind: "text", value: " " }], [label]);
    const baked = deleteVariable(blank, "s");
    expect(baked.shapes[0].name).toBe("{{suffix}}");
    expect(baked.shapes[0].text).toBe("{{suffix}}");
    // Literal braces in a text value are written as {{ and }}.
    const braces = doc([{ id: "s", name: "suffix", kind: "text", value: "{{x}}" }], [label]);
    expect(deleteVariable(braces, "s").shapes[0].name).toBe("{{x}}");
  });
  it("scales an image's other side only when the link kept the aspect ratio", () => {
    const image = { ...card(), id: "img", kind: "image", image: "data:image/png;base64,AA" } as Shape;
    const free = withBinding(image, "width", { property: "width", expression: "{card_w}", unit: "mm" });
    const locked = withBinding(image, "width", { property: "width", expression: "{card_w}", unit: "mm", keepAspect: true });
    expect(getProperty(recompute(doc(vars("172"), [free])).doc.shapes[0], "height")).toBeCloseTo(54);
    expect(getProperty(recompute(doc(vars("172"), [locked])).doc.shapes[0], "height")).toBeCloseTo(108);
  });
});

describe("label boxes", () => {
  it("keeps a linked position when the shown text changes its width", async () => {
    const { vi } = await import("vitest");
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ font: "", measureText: (t: string) => ({ width: t.length * 2 }) }) }) });
    const { resizeText } = await import("./text");
    const label = withBinding(
      resizeText({ id: "t", name: "Label", kind: "text", text: "{brand}", fontSize: 5, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], radius: 0, rotation: 0 } as Shape, "A"),
      "x", { property: "x", expression: "{cx}", unit: "mm" });
    const variables: Variable[] = [{ id: "b", name: "brand", kind: "text", value: "A" }, { id: "c", name: "cx", kind: "number", value: "50" }];
    const start = recompute(doc(variables, [label])).doc;
    expect(getProperty(start.shapes[0], "x")).toBeCloseTo(50);
    const longer = recompute({ ...start, variables: [{ ...variables[0], value: "Acme Leather" }, variables[1]] }).doc;
    expect(getProperty(longer.shapes[0], "x")).toBeCloseTo(50);
    expect(Math.abs(longer.shapes[0].points[1].x - longer.shapes[0].points[0].x)).toBeCloseTo(24);
    expect(pruneBindings(longer).removed).toEqual([]);
    // A direct font-size edit re-measures from the anchor but keeps the linked centre.
    const { applyChanges } = await import("./propertySetters");
    const bigger = applyChanges(longer.shapes[0], { fontSize: 8 });
    expect(getProperty(bigger, "x")).toBeCloseTo(50);
    vi.unstubAllGlobals();
  });
});

describe("one-time values in print groups", () => {
  it("bakes {=name} in print layout group names", async () => {
    const { bakeOnceText } = await import("./bindings");
    const base = doc(vars(), [card()]);
    const layout = { id: "l", name: "A4", instances: [], tree: [{ kind: "group", id: "pg", name: "{=brand} set", x: 0, y: 0, rotation: 0, children: [] }] };
    const baked = bakeOnceText({ ...base, printLayouts: [layout as unknown as NonNullable<Doc["printLayouts"]>[number]] });
    const group = baked.printLayouts![0].tree![0];
    expect(group.kind === "group" && group.name).toBe("Acme set");
  });
});
