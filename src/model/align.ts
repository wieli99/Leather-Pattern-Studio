import { bounds, moveShape, type Bounds } from "./geometry";
import type { Point, Shape } from "./project";
import type { UnitMode } from "./units";

export type AlignEdge = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
export type DistributeMode = "centers-x" | "centers-y" | "gaps-x" | "gaps-y";
export type AlignReference = "selection" | "first" | "last" | "largest" | "smallest";
export type AlignAction = { kind: "align"; edge: AlignEdge } | { kind: "distribute"; mode: DistributeMode };

/** Objects that move together: a selected group or a free object. */
export type AlignUnit = { ids: string[] };

const tolerance = 1e-9;

/** World bounds of a unit, ignoring stitching attached to a shape in the same unit. */
export function unitBounds(shapes: Shape[], units: UnitMode): Bounds | undefined {
  const ids = new Set(shapes.map((s) => s.id));
  const targets = shapes.filter((s) => !s.stitchParentId || !ids.has(s.stitchParentId));
  return targets.length ? bounds(targets, units) : undefined;
}

const start = (b: Bounds, axis: "x" | "y") => (axis === "x" ? b.x : b.y);
const size = (b: Bounds, axis: "x" | "y") => (axis === "x" ? b.width : b.height);

function edgeValue(b: Bounds, edge: AlignEdge) {
  const axis = edge === "left" || edge === "center-x" || edge === "right" ? "x" : "y";
  const position = edge === "left" || edge === "top" ? 0 : edge === "right" || edge === "bottom" ? 1 : 0.5;
  return { axis, value: start(b, axis) + size(b, axis) * position } as const;
}

function union(list: Bounds[]): Bounds {
  const x = Math.min(...list.map((b) => b.x)), y = Math.min(...list.map((b) => b.y));
  const right = Math.max(...list.map((b) => b.x + b.width)), bottom = Math.max(...list.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** Index of the unit that stays in place, or undefined when aligning to the selection bounds. */
export function referenceIndex(list: Bounds[], reference: AlignReference): number | undefined {
  if (reference === "selection" || !list.length) return undefined;
  if (reference === "first") return 0;
  if (reference === "last") return list.length - 1;
  const areas = list.map((b) => b.width * b.height);
  const target = reference === "largest" ? Math.max(...areas) : Math.min(...areas);
  return areas.findIndex((area) => area === target);
}

/**
 * Fixed outer units for equal gaps: the one reaching furthest toward the start and the one
 * reaching furthest toward the end, by their edges rather than their centers.
 */
function gapEnds(list: Bounds[], axis: "x" | "y") {
  const end = (b: Bounds) => start(b, axis) + size(b, axis);
  const first = list.reduce((best, b, i) =>
    start(b, axis) < start(list[best], axis) || start(b, axis) === start(list[best], axis) && end(b) < end(list[best]) ? i : best, 0);
  const last = list.reduce((best, b, i) =>
    end(b) > end(list[best]) || end(b) === end(list[best]) && start(b, axis) > start(list[best], axis) ? i : best, 0);
  return { first, last, span: end(list[last]) - start(list[first], axis) };
}

/**
 * Whether equal gaps can place every object side by side between the two outer edges.
 * Objects that overlap too much, or one object spanning all others, cannot be spaced.
 */
export function gapsFit(list: Bounds[], axis: "x" | "y") {
  if (list.length < 3) return true;
  const { first, last, span } = gapEnds(list, axis);
  const total = list.reduce((sum, b) => sum + size(b, axis), 0);
  return first !== last && span - total >= -tolerance;
}

/** Whether an action places objects a fixed gap apart instead of equalizing their gaps. */
const exactGap = (action: AlignAction, gap: number | null | undefined): gap is number =>
  action.kind === "distribute" && action.mode.startsWith("gaps") && gap != null && Number.isFinite(gap);

/** Minimum number of independent objects an action needs to change anything. */
export const requiredUnits = (action: AlignAction, reference: AlignReference, gap?: number | null) =>
  exactGap(action, gap) ? 2 : action.kind === "distribute" ? 3 : reference === "selection" ? 1 : 2;

/**
 * Offsets that align or distribute units, in selection order. Alignment moves every unit
 * except a fixed reference; distribution keeps the two outermost units in place. With an
 * exact gap, units are placed that far apart in their order along the axis, and the
 * reference unit (or, relative to the selection, the one furthest toward the start) stays.
 */
export function alignOffsets(list: Bounds[], action: AlignAction, reference: AlignReference = "selection", gap?: number | null): Point[] {
  const zero = list.map(() => ({ x: 0, y: 0 }));
  if (list.length < requiredUnits(action, reference, gap)) return zero;
  if (action.kind === "align") {
    const fixed = referenceIndex(list, reference);
    const { axis, value } = edgeValue(fixed === undefined ? union(list) : list[fixed], action.edge);
    return list.map((b, index) => {
      const delta = index === fixed ? 0 : value - edgeValue(b, action.edge).value;
      return axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta };
    });
  }
  const axis = action.mode.endsWith("x") ? "x" : "y";
  const centerOf = (b: Bounds) => start(b, axis) + size(b, axis) / 2;
  // Stable order: position along the axis, then selection order for ties.
  const byCenter = (a: number, b: number) => centerOf(list[a]) - centerOf(list[b]) || a - b;
  let order = list.map((_, i) => i).sort(byCenter);
  const targets = new Map<number, number>();
  if (exactGap(action, gap)) {
    const fixed = referenceIndex(list, reference) ?? order[0];
    const placed = new Map<number, number>();
    let cursor = 0;
    for (const index of order) {
      placed.set(index, cursor);
      cursor += size(list[index], axis) + gap;
    }
    const shift = start(list[fixed], axis) - placed.get(fixed)!;
    return list.map((b, index) => {
      let delta = index === fixed ? 0 : placed.get(index)! + shift - start(b, axis);
      if (Math.abs(delta) < tolerance) delta = 0;
      return axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta };
    });
  }
  if (action.mode.startsWith("centers")) {
    const from = centerOf(list[order[0]]), step = (centerOf(list[order.at(-1)!]) - from) / (order.length - 1);
    order.forEach((index, position) => targets.set(index, from + step * position - centerOf(list[index])));
  } else {
    if (!gapsFit(list, axis)) return zero;
    const { first, last, span } = gapEnds(list, axis);
    order = [first, ...order.filter((i) => i !== first && i !== last), last];
    const total = order.reduce((sum, index) => sum + size(list[index], axis), 0);
    const equal = (span - total) / (order.length - 1);
    let cursor = start(list[first], axis);
    for (const index of order) {
      targets.set(index, cursor - start(list[index], axis));
      cursor += size(list[index], axis) + equal;
    }
  }
  return list.map((_, index) => {
    let delta = targets.get(index) ?? 0;
    if (index === order[0] || index === order.at(-1) || Math.abs(delta) < tolerance) delta = 0;
    return axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta };
  });
}

function measureUnits(shapes: Shape[], unitsList: AlignUnit[], units: UnitMode) {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  return unitsList
    .map((unit) => ({ unit, box: unitBounds(unit.ids.flatMap((id) => byId.get(id) ?? []), units) }))
    .filter((entry): entry is { unit: AlignUnit; box: Bounds } => !!entry.box);
}

/** World bounds of each measurable unit, in the given order. */
export const unitBoxes = (shapes: Shape[], unitsList: AlignUnit[], units: UnitMode) =>
  measureUnits(shapes, unitsList, units).map((entry) => entry.box);

/** Axis an action moves objects along. */
export const alignAxis = (action: AlignAction): "x" | "y" =>
  action.kind === "align"
    ? (action.edge === "left" || action.edge === "center-x" || action.edge === "right" ? "x" : "y")
    : (action.mode.endsWith("x") ? "x" : "y");

/** Offsets of one horizontal and one vertical action, both measured from the same bounds. */
export function combinedOffsets(boxes: Bounds[], actions: AlignAction[], reference: AlignReference, gap?: number | null): Point[] {
  const offsets = boxes.map(() => ({ x: 0, y: 0 }));
  for (const action of actions)
    alignOffsets(boxes, action, reference, gap).forEach((offset, index) => {
      offsets[index].x += offset.x;
      offsets[index].y += offset.y;
    });
  return offsets;
}

/**
 * Apply actions to the shapes of each unit, all measured from the given shapes, so one
 * horizontal and one vertical action combine. Returns null when nothing moves.
 */
export function alignShapes(
  shapes: Shape[],
  unitsList: AlignUnit[],
  actions: AlignAction[],
  reference: AlignReference,
  units: UnitMode,
  gap?: number | null,
): Shape[] | null {
  const measured = measureUnits(shapes, unitsList, units);
  const offsets = combinedOffsets(measured.map((entry) => entry.box), actions, reference, gap);
  const moves = new Map<string, Point>();
  measured.forEach(({ unit }, index) => {
    const offset = offsets[index];
    if (Math.abs(offset.x) < tolerance && Math.abs(offset.y) < tolerance) return;
    for (const id of unit.ids) moves.set(id, offset);
  });
  if (!moves.size) return null;
  return shapes.map((shape) => {
    const offset = moves.get(shape.id);
    return offset ? moveShape(shape, offset.x, offset.y) : shape;
  });
}
