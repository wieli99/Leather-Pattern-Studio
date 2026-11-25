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
  { id: "w", name: "card_w", kind: "length", value: w },
  { id: "t", name: "t", kind: "number", value: "1.5" },
  { id: "b", name: "brand", kind: "text", value: "Acme" },
];
const linked = () => withBinding(withBinding(card(), "width", { property: "width", expression: "card_w + 2*t", unit: "mm" }),
  "x", { property: "x", expression: "card_w", unit: "mm" });

describe("property links", () => {
  it("recomputes linked sizes before positions", () => {
    const { doc: next, problems } = recompute(doc(vars("100"), [linked()]));
    expect(problems).toEqual([]);
    expect(getProperty(next.shapes[0], "width")).toBeCloseTo(103);
    expect(getProperty(next.shapes[0], "height")).toBeCloseTo(54);
    expect(getProperty(next.shapes[0], "x")).toBeCloseTo(100);
  });
  it("evaluates formulas in their own unit", () => {
    const shape = withBinding(card(), "width", { property: "width", expression: "card_w + 1", unit: "in" });
    const { doc: next } = recompute(doc(vars("25.4"), [shape]));
    expect(getProperty(next.shapes[0], "width")).toBeCloseTo(50.8);
  });
  it("reports out-of-range values and locked objects instead of applying them", () => {
    const shape = withBinding(card(), "width", { property: "width", expression: "card_w", unit: "mm" });
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
    expect(result.removed[0].message).toBe("Unlinked position x of '{brand} card' from card_w");
  });
  it("renames references everywhere", () => {
    const renamed = renameVariable(renameVariable(doc(vars(), [linked()]), "w", "width"), "b", "maker");
    expect(renamed.variables?.map((v) => v.name)).toEqual(["width", "t", "maker"]);
    expect(renamed.shapes[0].bindings?.map((b) => b.expression)).toEqual(["width + 2*t", "width"]);
    expect(renamed.shapes[0].name).toBe("{maker} card");
    expect(renamed.objectTree?.[0].kind === "group" && renamed.objectTree[0].name).toBe("{maker} set");
  });
  it("counts uses and deletes by keeping current values", () => {
    const start = recompute(doc([...vars(), { id: "s", name: "slot", kind: "length", value: "card_w + 1", unit: "in" }], [linked()])).doc;
    expect(variableUses(start, "card_w")).toBe(3);
    expect(variableUses(start, "brand")).toBe(2);
    const deleted = deleteVariable(deleteVariable(start, "w"), "b");
    expect(deleted.variables?.map((v) => [v.name, v.value])).toEqual([["t", "1.5"], ["slot", "4.38582677165354"]]);
    expect(deleted.shapes[0].bindings).toBeUndefined();
    expect(getProperty(deleted.shapes[0], "width")).toBeCloseTo(89);
    expect(deleted.shapes[0].name).toBe("Acme card");
    expect(deleted.objectTree?.[0].kind === "group" && deleted.objectTree[0].name).toBe("Acme set");
  });
});
