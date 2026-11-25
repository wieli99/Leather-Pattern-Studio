import { editableNumber, formulaReferences, parseExpression } from "./expression";
import { toMillimetres, type UnitMode } from "./units";
import type { Variable } from "../generated/Variable";
import type { BindingUnit } from "../generated/BindingUnit";
export type { Variable, BindingUnit };

/** Resolved values: numbers are plain (unitless), text verbatim. */
export type VariableValue =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string };
export type VariableScope = {
  values: Map<string, VariableValue>;
  /** Variable id → reason it could not be resolved. */
  errors: Map<string, string>;
};

export const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const bindingUnit = (mode: UnitMode): BindingUnit => (mode === "mm" ? "mm" : "in");

/** Number variables are plain values; text variables cannot be used in formulas. */
const numberOf = (values: Map<string, VariableValue>) => (name: string) => {
  const v = values.get(name);
  return v && v.kind === "number" ? v.value : null;
};

/**
 * Evaluate a formula typed in `unit`. Variables and literals are taken in that unit; a
 * length result converts to millimetres.
 */
export function evaluateFormula(
  text: string,
  kind: "length" | "number",
  unit: BindingUnit,
  values: Map<string, VariableValue>,
): number | null {
  const result = parseExpression(text, unit === "in", numberOf(values));
  if (result === null) return null;
  const converted = kind === "length" && unit === "in" ? result * 25.4 : result;
  return Number.isFinite(converted) ? converted : null;
}

/**
 * Number when the value is a formula; text otherwise. A lone unknown word such as `Acme`
 * is text, while `card_ww + 2` stays a (broken) number so typos are reported.
 */
export function detectKind(value: string, variables: readonly Variable[] | undefined, self?: string): Variable["kind"] {
  const text = value.trim();
  if (!text) return "text";
  if (parseExpression(text, true, () => 1) === null) return "text";
  const names = formulaReferences(text);
  const known = (name: string) => (variables ?? []).some((v) => v.name === name && v.name !== self && v.kind === "number");
  if (names.length === 1 && VARIABLE_NAME.test(text) && !known(text)) return "text";
  return "number";
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
    const value = parseExpression(v.value, true, numberOf(values));
    if (value === null) {
      errors.set(v.id, "Enter a valid formula");
      return false;
    }
    values.set(v.name, { kind: "number", value });
    return true;
  }
  for (const v of variables ?? []) resolve(v);
  return { values, errors };
}

/** Text for `{name}` placeholders; `{{` and `}}` escape literal braces. */
export function interpolate(
  template: string,
  values: Map<string, VariableValue>,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = template.replace(/\{\{|\}\}|\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name?: string) => {
    if (!name) return match[0];
    const v = values.get(name);
    if (!v) {
      missing.push(name);
      return match;
    }
    return v.kind === "text" ? v.value : editableNumber(v.value);
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
): number | null {
  const result = parseExpression(text, mode !== "number" && mode !== "mm", numberOf(values));
  if (result === null || mode === "number") return result;
  const mm = toMillimetres(result, mode);
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
export const displayTemplate = (template: string, variables: readonly Variable[] | undefined) =>
  hasPlaceholders(template) || /\{\{|\}\}/.test(template) ? interpolate(template, variableScopeOf(variables).values).text : template;
