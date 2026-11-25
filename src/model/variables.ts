import { editableNumber, formulaReferences, parseExpression } from "./expression";
import { formatLength, fromMillimetres, unitSymbol, type UnitMode } from "./units";
import type { Variable } from "../generated/Variable";
import type { BindingUnit } from "../generated/BindingUnit";
export type { Variable, BindingUnit };

/** Resolved values: lengths in millimetres, numbers unitless, text verbatim. */
export type VariableValue =
  | { kind: "length"; value: number }
  | { kind: "number"; value: number }
  | { kind: "text"; value: string };
export type VariableScope = {
  values: Map<string, VariableValue>;
  /** Variable id → reason it could not be resolved. */
  errors: Map<string, string>;
};

export const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const bindingUnit = (mode: UnitMode): BindingUnit => (mode === "mm" ? "mm" : "in");
const unitMode = (unit: BindingUnit | undefined): UnitMode => (unit === "in" ? "in-decimal" : "mm");

/**
 * Evaluate a formula typed in `unit`. Length variables convert to that unit; numbers and
 * literals are taken as-is. A length result converts back to millimetres.
 */
export function evaluateFormula(
  text: string,
  kind: "length" | "number",
  unit: BindingUnit,
  values: Map<string, VariableValue>,
): number | null {
  const mode = unitMode(unit);
  const result = parseExpression(text, unit === "in", (name) => {
    const v = values.get(name);
    if (!v || v.kind === "text") return null;
    return v.kind === "length" ? fromMillimetres(v.value, mode) : v.value;
  });
  if (result === null) return null;
  const converted = kind === "length" && unit === "in" ? result * 25.4 : result;
  return Number.isFinite(converted) ? converted : null;
}

export function resolveVariables(variables: readonly Variable[] | undefined): VariableScope {
  const values = new Map<string, VariableValue>(),
    errors = new Map<string, string>(),
    byName = new Map((variables ?? []).map((v) => [v.name, v])),
    visiting = new Set<string>();
  function resolve(v: Variable): boolean {
    if (values.has(v.name)) return true;
    if (errors.has(v.id)) return false;
    if (v.kind === "text") {
      values.set(v.name, { kind: "text", value: v.value });
      return true;
    }
    if (visiting.has(v.name)) {
      errors.set(v.id, `${v.name} refers to itself`);
      return false;
    }
    visiting.add(v.name);
    for (const name of formulaReferences(v.value)) {
      const dependency = byName.get(name);
      if (!dependency) errors.set(v.id, `Unknown variable ${name}`);
      else if (dependency.kind === "text") errors.set(v.id, `${name} is text`);
      else if (!resolve(dependency)) errors.set(v.id, errors.get(v.id) ?? `${name} is invalid`);
      if (errors.has(v.id)) break;
    }
    visiting.delete(v.name);
    if (errors.has(v.id)) return false;
    const value = evaluateFormula(v.value, v.kind, v.unit ?? "mm", values);
    if (value === null) {
      errors.set(v.id, "Enter a valid formula");
      return false;
    }
    values.set(v.name, { kind: v.kind, value });
    return true;
  }
  for (const v of variables ?? []) resolve(v);
  return { values, errors };
}

/** Text for `{name}` placeholders; `{{` and `}}` escape literal braces. */
export function interpolate(
  template: string,
  values: Map<string, VariableValue>,
  units: UnitMode = "mm",
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = template.replace(/\{\{|\}\}|\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name?: string) => {
    if (!name) return match[0];
    const v = values.get(name);
    if (!v) {
      missing.push(name);
      return match;
    }
    if (v.kind === "text") return v.value;
    if (v.kind === "number") return editableNumber(v.value);
    return `${formatLength(v.value, units)} ${unitSymbol(units)}`;
  });
  return { text, missing };
}

export const hasPlaceholders = (template: string) =>
  /\{[A-Za-z_][A-Za-z0-9_]*\}/.test(template.replace(/\{\{|\}\}/g, ""));
export const templateReferences = (template: string) =>
  [...template.replace(/\{\{|\}\}/g, "").matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]);

/** Rewrite whole-identifier references in a formula. */
export function renameInFormula(text: string, from: string, to: string): string {
  return text.replace(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*/g, (token) =>
    token === from ? to : token,
  );
}

/** Rewrite `{from}` placeholders, leaving escaped braces untouched. */
export function renameInTemplate(text: string, from: string, to: string): string {
  return text.replace(/\{\{|\}\}|\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name?: string) =>
    name === from ? `{${to}}` : match,
  );
}

/** First unused name such as `var1`, `var2`. */
export function nextVariableName(variables: readonly Variable[] | undefined, base = "var"): string {
  const used = new Set((variables ?? []).map((v) => v.name));
  for (let i = 1; ; i++) if (!used.has(`${base}${i}`)) return `${base}${i}`;
}

/** Validation message for a proposed name, or null when it is usable. */
export function variableNameError(name: string, variables: readonly Variable[] | undefined, id?: string): string | null {
  if (!VARIABLE_NAME.test(name) || name.length > 64)
    return "Use letters, digits and _; start with a letter or _";
  if ((variables ?? []).some((v) => v.name === name && v.id !== id)) return `${name} already exists`;
  return null;
}

/**
 * Evaluate a field draft with variables: millimetres for a unit mode, a plain number for
 * "number". Matches parseLength/parseExpression when the text uses no variables.
 */
export function parseFieldValue(
  text: string,
  mode: UnitMode | "number",
  values: Map<string, VariableValue>,
  displayUnits: UnitMode = "mm",
): number | null {
  const units = mode === "number" ? displayUnits : mode;
  const result = parseExpression(text, mode !== "number" && mode !== "mm", (name) => {
    const v = values.get(name);
    if (!v || v.kind === "text") return null;
    return v.kind === "length" ? fromMillimetres(v.value, units) : v.value;
  });
  if (result === null || mode === "number") return result;
  const mm = mode === "mm" ? result : result * 25.4;
  return Number.isFinite(mm) ? mm : null;
}

const scopes = new WeakMap<readonly Variable[], VariableScope>();
const EMPTY_SCOPE: VariableScope = { values: new Map(), errors: new Map() };
/** Cached resolution for renderers and exports that only hold a document. */
export function variableScopeOf(variables: readonly Variable[] | undefined): VariableScope {
  if (!variables?.length) return EMPTY_SCOPE;
  let scope = scopes.get(variables);
  if (!scope) scopes.set(variables, (scope = resolveVariables(variables)));
  return scope;
}
/** Shown form of a name or text template. */
export const displayTemplate = (template: string, variables: readonly Variable[] | undefined, units: UnitMode = "mm") =>
  hasPlaceholders(template) || /\{\{|\}\}/.test(template) ? interpolate(template, variableScopeOf(variables).values, units).text : template;
