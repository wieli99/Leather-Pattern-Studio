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
    expect(detectKind("{card_w}/({card_w}-1)", list)).toBe("number");
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
    expect(interpolate("{n}}", values).text).toBe("3}");
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

describe("composed text and one-time values", () => {
  it("text variables combine other variables and reject loops", () => {
    const { values, errors } = resolveVariables([
      v("full", "text", "{brand} No. {n} {{x}}"), v("brand", "text", "Acme"), v("n", "number", "2"),
      v("a", "text", "{b}"), v("b", "text", "x {a}"), v("c", "text", "{missing}"),
    ]);
    expect(values.get("full")).toEqual({ kind: "text", value: "Acme No. 2 {x}" });
    expect([...errors.keys()].sort()).toEqual(["a", "b", "c"]);
  });
  it("one-time values evaluate, bake and are told apart from links", async () => {
    const { formulaReferences, onceReferences } = await import("./expression");
    const { bakeFormula, bakeText, unlinkableError } = await import("./variables");
    const { values } = resolveVariables([v("w", "number", "20"), v("brand", "text", "A{{c}}")]);
    expect(evaluateFormula("{w} + {=w}", "length", "mm", values)).toBe(40);
    expect(formulaReferences("{w} + {=w}")).toEqual(["w"]);
    expect(onceReferences("{w} + {=w}")).toEqual(["w"]);
    expect(bakeFormula("{w} + {=w}", values)).toBe("{w} + (20)");
    expect(bakeText("{=brand} {brand} {=nope}", values)).toBe("A{{c}} {brand} {=nope}");
    expect(unlinkableError("{=w}*2")).toBeNull();
    expect(unlinkableError("{w}*2")).toBe("Use {=w} here: this field does not stay linked");
    expect(renameInTemplate("{w} {=w}", "w", "x")).toBe("{x} {=x}");
  });
});
