import { describe, expect, it } from "vitest";
import {
  detectKind, evaluateFormula, interpolate, nextVariableName, parseFieldValue, renameInFormula, renameInTemplate,
  resolveVariables, templateReferences, variableNameError, type Variable,
} from "./variables";

const v = (name: string, kind: Variable["kind"], value: string): Variable => ({ id: name, name, kind, value });

describe("project variables", () => {
  it("resolves dependencies in any order as plain numbers", () => {
    const { values, errors } = resolveVariables([
      v("slot", "number", "{card} + 2*{t}"), v("card", "number", "3 1/2"), v("t", "number", "1.5"),
      v("brand", "text", "Acme"),
    ]);
    expect(errors.size).toBe(0);
    expect(values.get("card")).toEqual({ kind: "number", value: 3.5 });
    expect(values.get("slot")).toEqual({ kind: "number", value: 6.5 });
    expect(values.get("brand")).toEqual({ kind: "text", value: "Acme" });
  });
  it("reports cycles, unknown names, text in formulas and bad formulas", () => {
    const { errors } = resolveVariables([
      v("a", "number", "{b}"), v("b", "number", "{a} + 1"), v("c", "number", "{missing}"),
      v("d", "number", "{brand}"), v("brand", "text", "x"), v("e", "number", "1/0"),
    ]);
    expect([...errors.keys()].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("reads variables in the unit a formula was typed in", () => {
    const { values } = resolveVariables([v("w", "number", "2"), v("n", "number", "3")]);
    expect(evaluateFormula("{w} + 1", "length", "in", values)).toBeCloseTo(76.2);
    expect(evaluateFormula("{w} + 1", "length", "mm", values)).toBe(3);
    expect(evaluateFormula("{w} * {n}", "number", "in", values)).toBe(6);
    expect(evaluateFormula("{w} + {brand}", "length", "mm", values)).toBeNull();
  });
  it("detects numbers and text from the value", () => {
    const list = [v("card_w", "number", "86"), v("brand", "text", "Acme")];
    expect(detectKind("86", list)).toBe("number");
    expect(detectKind("3 1/2", list)).toBe("number");
    expect(detectKind("{card_w}*2", list)).toBe("number");
    expect(detectKind("{card_w}", list)).toBe("number");
    expect(detectKind("{card_ww} + 2", list)).toBe("number");
    expect(detectKind("card_w", list)).toBe("text");
    expect(detectKind("Acme", list)).toBe("text");
    expect(detectKind("{brand}", list)).toBe("text");
    expect(detectKind("Card 2", list)).toBe("text");
    expect(detectKind("", list)).toBe("text");
  });
  it("interpolates placeholders with escapes", () => {
    const { values } = resolveVariables([v("brand", "text", "Acme"), v("n", "number", "3")]);
    expect(interpolate("{brand} slot {{x}} n={n}", values)).toEqual({ text: "Acme slot {x} n=3", missing: [] });
    expect(interpolate("{nope} {brand}", values)).toEqual({ text: "{nope} Acme", missing: ["nope"] });
    expect(templateReferences("{{brand}} {n}")).toEqual(["n"]);
  });
  it("renames whole references only", () => {
    expect(renameInFormula("{w} + {w2}*1e-3 + ({w}) + w", "w", "width")).toBe("{width} + {w2}*1e-3 + ({width}) + w");
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
  it("matches plain parsing and adds variables in the field's unit", () => {
    const { values } = resolveVariables([v("w", "number", "2"), v("n", "number", "3")]);
    expect(parseFieldValue("1 1/2", "in-fractional", values)).toBeCloseTo(38.1);
    expect(parseFieldValue("{w}*{n}", "mm", values)).toBe(6);
    expect(parseFieldValue("{w}*{n}", "in-decimal", values)).toBeCloseTo(152.4);
    expect(parseFieldValue("{n}*45", "number", values)).toBe(135);
    expect(parseFieldValue("1 1/2", "number", values)).toBeNull();
  });
});
