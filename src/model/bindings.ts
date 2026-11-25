import type { Binding } from "../generated/Binding";
import type { Doc, Shape } from "./project";
import type { ObjectNode } from "./objectTree";
import type { PrintNode } from "./printLayout";
import { formulaReferences } from "./expression";
import { getProperty, isPropertyId, keepLinkedCenter, propertyValueError, setProperty, PROPERTIES, type PropertyId } from "./propertySetters";
import { resizeText } from "./text";
import {
  evaluateFormula, interpolate, renameInFormula, renameInTemplate, resolveVariables,
  type Variable, type VariableValue,
} from "./variables";
import { REFERENCE_TOKENS } from "./expression";
import { editableNumber } from "./expression";

export type { Binding };
export type LinkProblem = { shapeId: string; property: string; message: string };

/** Value of a link in the property's stored unit (millimetres for lengths). */
export function evaluateBinding(b: Binding, values: Map<string, VariableValue>): number | null {
  if (!isPropertyId(b.property)) return null;
  return evaluateFormula(b.expression, PROPERTIES[b.property].kind, b.unit, values);
}

function matches(id: PropertyId, current: number, target: number) {
  const delta = id === "rotation" ? ((((current - target) % 360) + 540) % 360) - 180 : current - target;
  return Math.abs(delta) <= 1e-6 * Math.max(1, Math.abs(target));
}

const shapeLabel = (s: Shape) => (s.name.trim() ? `'${s.name}'` : "an object");

// Rotation first: curve widths and heights are world bounding-box sizes that change when
// the curve turns. Sizes and angles keep the centre, so linked positions apply last.
const ORDER: PropertyId[] = [
  "rotation", "width", "height", "radius", "indicatorSize", "sweep", "headSize", "fontSize",
  "lineSpacing", "strokeWidth", "measurementSections", "measurementOffset", "x", "y",
];

/** Apply every link of one shape; stops at the first value the shape cannot take. */
export function recomputeShape(
  shape: Shape,
  values: Map<string, VariableValue>,
): { shape: Shape; problem?: LinkProblem } {
  const bindings = [...(shape.bindings ?? [])].sort(
    (a, b) => ORDER.indexOf(a.property as PropertyId) - ORDER.indexOf(b.property as PropertyId),
  );
  const bound = new Set(bindings.map((b) => b.property));
  // Labels with `{name}` fit the shown text first, so linked positions use the final box.
  const fit = (s: Shape) => {
    if (s.kind !== "text" || !s.text || !formulaReferences(s.text).length) return s;
    const fitted = keepLinkedCenter(s, resizeText(s, interpolate(s.text, values).text));
    const same = fitted.points.every((p, i) => Math.abs(p.x - s.points[i].x) < 1e-9 && Math.abs(p.y - s.points[i].y) < 1e-9);
    return same ? s : fitted;
  };
  let next = fit(shape);
  for (const b of bindings) {
    if (!isPropertyId(b.property)) continue;
    const label = PROPERTIES[b.property].label;
    const problem = (message: string) => ({ shape, problem: { shapeId: shape.id, property: b.property, message } });
    const value = evaluateBinding(b, values);
    if (value === null) return problem(`${label} of ${shapeLabel(shape)} uses an invalid formula: ${b.expression}`);
    const range = propertyValueError(b.property, value);
    if (range) return problem(`${label} of ${shapeLabel(shape)} ${range}${PROPERTIES[b.property].kind === "length" && /\d$/.test(range) ? " mm" : ""}`);
    const current = getProperty(next, b.property);
    if (current === null || matches(b.property, current, value)) continue;
    // Only an image link made with the aspect ratio locked scales the other side.
    const updated = setProperty(next, b.property, value, {
      aspectLocked: !!b.keepAspect && !(bound.has("width") && bound.has("height")),
    });
    if (!updated) return problem(`${label} of ${shapeLabel(shape)} cannot be set to this value`);
    next = b.property === "x" || b.property === "y" ? updated : fit(updated);
  }
  return { shape: next };
}

/**
 * Re-evaluate every link after variables change. Changes to locked objects are reported
 * instead of applied, as with any other edit.
 */
export function recompute(
  doc: Doc,
  isLocked: (id: string) => boolean = () => false,
): { doc: Doc; problems: LinkProblem[] } {
  const { values } = resolveVariables(doc.variables);
  const problems: LinkProblem[] = [];
  const shapes = doc.shapes.map((shape) => {
    if (!shape.bindings?.length) return shape;
    const result = recomputeShape(shape, values);
    if (result.problem) problems.push(result.problem);
    else if (result.shape !== shape && isLocked(shape.id))
      problems.push({ shapeId: shape.id, property: "", message: `Unlock ${shapeLabel(shape)} to change its linked values` });
    return result.shape;
  });
  return { doc: { ...doc, shapes }, problems };
}

/**
 * Drop links whose property no longer equals its formula, e.g. after a drag or transform.
 * Returns the same document when nothing changed.
 */
export function pruneBindings(doc: Doc): { doc: Doc; removed: LinkProblem[] } {
  if (!doc.shapes.some((s) => s.bindings?.length)) return { doc, removed: [] };
  const { values } = resolveVariables(doc.variables);
  const removed: LinkProblem[] = [];
  let changed = false;
  const shapes = doc.shapes.map((shape) => {
    if (!shape.bindings?.length) return shape;
    const kept = shape.bindings.filter((b) => {
      const value = evaluateBinding(b, values);
      const current = isPropertyId(b.property) ? getProperty(shape, b.property) : null;
      const keep = value !== null && current !== null && matches(b.property as PropertyId, current, value);
      if (!keep)
        removed.push({
          shapeId: shape.id,
          property: b.property,
          message: `Unlinked ${isPropertyId(b.property) ? PROPERTIES[b.property].label.toLowerCase() : b.property} of ${shapeLabel(shape)} from ${b.expression}`,
        });
      return keep;
    });
    if (kept.length === shape.bindings.length) return shape;
    changed = true;
    const { bindings: _, ...rest } = shape;
    return kept.length ? { ...shape, bindings: kept } : (rest as Shape);
  });
  return { doc: changed ? { ...doc, shapes } : doc, removed };
}

/** Replace or remove one property link. A formula without variables removes the link. */
export function withBinding(shape: Shape, property: PropertyId, binding: Binding | null): Shape {
  const others = (shape.bindings ?? []).filter((b) => b.property !== property);
  const bindings = binding && formulaReferences(binding.expression).length ? [...others, binding] : others;
  const { bindings: _, ...rest } = shape;
  return bindings.length ? { ...rest, bindings } : (rest as Shape);
}

export function withoutBindings(shape: Shape): Shape {
  const { bindings: _, ...rest } = shape;
  return rest as Shape;
}

export const bindingFor = (shape: Shape | null | undefined, property: PropertyId) =>
  shape?.bindings?.find((b) => b.property === property) ?? null;

function mapTree(nodes: ObjectNode[] | undefined, rename: (name: string) => string): ObjectNode[] | undefined {
  return nodes?.map((node) =>
    node.kind === "group" ? { ...node, name: rename(node.name), children: mapTree(node.children, rename)! } : node,
  );
}

/**
 * Apply a rewrite to every shape a variable can appear in: model shapes and the shapes
 * stored in print-layout snapshots, plus print-copy names.
 */
export function mapShapes(doc: Doc, shape: (s: Shape) => Shape, name: (text: string) => string = (t) => t): Doc {
  const tree = (nodes: PrintNode[]): PrintNode[] =>
    nodes.map((n) => (n.kind === "group" ? { ...n, name: name(n.name), children: tree(n.children) } : n));
  return {
    ...doc,
    shapes: doc.shapes.map(shape),
    ...(doc.printLayouts
      ? {
          printLayouts: doc.printLayouts.map((layout) => ({
            ...layout,
            ...(layout.tree ? { tree: tree(layout.tree) } : {}),
            instances: layout.instances.map((item) => ({
              ...item,
              ...(item.name !== undefined && item.name !== null ? { name: name(item.name) } : {}),
              ...(item.snapshot ? { snapshot: { ...item.snapshot, shape: shape(item.snapshot.shape) } } : {}),
            })),
          })),
        }
      : {}),
  };
}

/** Rename a variable and every formula and placeholder that refers to it. */
export function renameVariable(doc: Doc, id: string, name: string): Doc {
  const target = doc.variables?.find((v) => v.id === id);
  if (!target || target.name === name) return doc;
  const from = target.name;
  const formula = (text: string) => renameInFormula(text, from, name);
  const template = (text: string) => renameInTemplate(text, from, name);
  const renamed = mapShapes(doc, (s) => ({
    ...s,
    name: template(s.name),
    ...(s.text !== undefined ? { text: template(s.text) } : {}),
    ...(s.bindings ? { bindings: s.bindings.map((b) => ({ ...b, expression: formula(b.expression) })) } : {}),
  }), template);
  return {
    ...renamed,
    variables: doc.variables!.map((v) =>
      v.id === id ? { ...v, name } : v.kind === "text" ? v : { ...v, value: formula(v.value) },
    ),
    ...(doc.objectTree ? { objectTree: mapTree(doc.objectTree, template) } : {}),
  };
}

/** Count of links, formulas and placeholders that use a variable. */
export function variableUses(doc: Doc, name: string): number {
  const uses = (text: string | null | undefined) => (text ? formulaReferences(text).filter((n) => n === name).length : 0);
  let count = 0;
  for (const v of doc.variables ?? []) if (v.kind !== "text" && uses(v.value)) count++;
  const shapes = [...doc.shapes, ...(doc.printLayouts ?? []).flatMap((l) => l.instances.flatMap((i) => (i.snapshot ? [i.snapshot.shape] : [])))];
  for (const s of shapes) {
    count += (s.bindings ?? []).filter((b) => uses(b.expression)).length;
    count += uses(s.name) + uses(s.text);
  }
  const printGroups = (nodes: PrintNode[] | undefined) =>
    nodes?.forEach((n) => { if (n.kind === "group") { count += uses(n.name); printGroups(n.children); } });
  for (const layout of doc.printLayouts ?? []) {
    for (const item of layout.instances) count += uses(item.name);
    printGroups(layout.tree);
  }
  const walk = (nodes: ObjectNode[] | undefined) =>
    nodes?.forEach((n) => { if (n.kind === "group") { count += uses(n.name); walk(n.children); } });
  walk(doc.objectTree);
  return count;
}

/**
 * Delete a variable while keeping what users see: links become fixed values, formulas
 * in other variables get the number, and placeholders get their current text.
 */
export function deleteVariable(doc: Doc, id: string): Doc {
  const target = doc.variables?.find((v) => v.id === id);
  if (!target) return doc;
  const { values } = resolveVariables(doc.variables);
  const resolved = values.get(target.name);
  const remaining = doc.variables!.filter((v) => v.id !== id);
  const bake = (v: Variable): Variable => {
    if (v.kind === "text" || !formulaReferences(v.value).includes(target.name)) return v;
    const value = values.get(v.name);
    if (!value || value.kind === "text") return v;
    return { ...v, value: editableNumber(value.value) };
  };
  // The baked text is literal, so its own braces are escaped.
  const shown = !resolved ? null
    : (resolved.kind === "text" ? resolved.value : editableNumber(resolved.value)).replace(/[{}]/g, (b) => b + b);
  const template = (text: string) =>
    text.replace(REFERENCE_TOKENS, (match, name?: string) => (name === target.name && shown !== null ? shown : match));
  // Names and labels must keep visible text; for a blank value keep the name as literal text.
  const label = (text: string) => {
    const baked = template(text);
    return baked.trim() ? baked : text.replace(REFERENCE_TOKENS, (match, name?: string) => (name === target.name ? `{{${name}}}` : match));
  };
  const baked = mapShapes(doc, (s) => {
    const bindings = s.bindings?.filter((b) => !formulaReferences(b.expression).includes(target.name));
    const { bindings: _, ...rest } = s;
    return {
      ...(bindings?.length ? { ...rest, bindings } : (rest as Shape)),
      name: label(s.name),
      ...(s.text !== undefined ? { text: label(s.text) } : {}),
    };
  }, label);
  return {
    ...baked,
    variables: remaining.map(bake),
    ...(doc.objectTree ? { objectTree: mapTree(doc.objectTree, label) } : {}),
  };
}
