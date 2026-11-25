import { describe, expect, it } from "vitest";
import {
  evaluateFormula, interpolate, nextVariableName, renameInFormula, renameInTemplate,
  resolveVariables, templateReferences, variableNameError, type Variable,
} from "./variables";

const v = (name: string, kind: Variable["kind"], value: string, unit?: "mm" | "in"): Variable =>
  ({ id: name, name, kind, value, ...(unit ? { unit } : {}) });

describe("project variables", () => {
  it("resolves dependencies in any order and converts units", () => {
    const { values, errors } = resolveVariables([
      v("slot", "length", "card + 2*t"), v("card", "length", "3 1/2", "in"), v("t", "number", "1.5"),
      v("brand", "text", "Acme"),
    ]);
    expect(errors.size).toBe(0);
    expect(values.get("card")?.value).toBeCloseTo(88.9, 10);
    expect(values.get("slot")?.value).toBeCloseTo(91.9);
    expect(values.get("brand")).toEqual({ kind: "text", value: "Acme" });
  });
  it("reports cycles, unknown names, text in formulas and bad formulas", () => {
    const { errors } = resolveVariables([
      v("a", "number", "b"), v("b", "number", "a + 1"), v("c", "number", "missing"),
      v("d", "number", "brand"), v("brand", "text", "x"), v("e", "number", "1/0"),
    ]);
    expect([...errors.keys()].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("evaluates formulas in the unit they were typed in", () => {
    const { values } = resolveVariables([v("w", "length", "25.4"), v("n", "number", "2")]);
    expect(evaluateFormula("w + 1", "length", "in", values)).toBeCloseTo(50.8);
    expect(evaluateFormula("w + 1", "length", "mm", values)).toBeCloseTo(26.4);
    expect(evaluateFormula("w / n", "number", "in", values)).toBeCloseTo(0.5);
    expect(evaluateFormula("w + brand", "length", "mm", values)).toBeNull();
  });
  it("interpolates placeholders with escapes", () => {
    const { values } = resolveVariables([v("brand", "text", "Acme"), v("w", "length", "25.4"), v("n", "number", "3")]);
    expect(interpolate("{brand} slot {{x}} n={n}", values)).toEqual({ text: "Acme slot {x} n=3", missing: [] });
    expect(interpolate("{w}", values, "in-decimal").text).toBe("1 in");
    expect(interpolate("{nope} {brand}", values)).toEqual({ text: "{nope} Acme", missing: ["nope"] });
    expect(templateReferences("{{brand}} {n}")).toEqual(["n"]);
  });
  it("renames whole references only", () => {
    expect(renameInFormula("w + w2*1e-3 + (w)", "w", "width")).toBe("width + w2*1e-3 + (width)");
    expect(renameInTemplate("{w} {{w}} {w2}", "w", "width")).toBe("{width} {{w}} {w2}");
  });
  it("validates and proposes names", () => {
    const list = [v("var1", "number", "1")];
    expect(nextVariableName(list)).toBe("var2");
    expect(variableNameError("1x", list)).not.toBeNull();
    expect(variableNameError("var1", list)).toMatch("exists");
    expect(variableNameError("var1", list, "var1")).toBeNull();
    expect(variableNameError("card_w", list)).toBeNull();
  });
});

describe("evaluate-only fields", () => {
  it("matches plain parsing and adds variables", async () => {
    const { parseFieldValue } = await import("./variables");
    const { values } = resolveVariables([v("w", "length", "25.4"), v("n", "number", "2")]);
    expect(parseFieldValue("1 1/2", "in-fractional", values)).toBeCloseTo(38.1);
    expect(parseFieldValue("w*n", "mm", values)).toBeCloseTo(50.8);
    expect(parseFieldValue("w*n", "in-decimal", values)).toBeCloseTo(50.8);
    expect(parseFieldValue("n*45", "number", values)).toBe(90);
    expect(parseFieldValue("w", "number", values, "in-decimal")).toBe(1);
    expect(parseFieldValue("1 1/2", "number", values)).toBeNull();
  });
});
