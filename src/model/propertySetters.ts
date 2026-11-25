import {
  bounds,
  center,
  distance,
  inverse,
  isPolygon,
  moveShape,
  multiply,
  polygonFillets,
  rotateShape,
  shapeMatrix,
  stretchShape,
  transformShape,
} from "./geometry";
import { indicatorGeometry, isIndicator } from "./indicators";
import { measurementGeometry } from "./measurement";
import { resizeText } from "./text";
import type { Shape } from "./project";

/** Derived Inspector properties that can be set numerically and linked to variables. */
export type PropertyId =
  | "x" | "y" | "width" | "height" | "radius" | "sweep" | "rotation" | "strokeWidth"
  | "headSize" | "indicatorSize" | "fontSize" | "lineSpacing" | "measurementSections"
  | "measurementOffset";

type PropertyInfo = {
  label: string;
  kind: "length" | "number";
  min?: number;
  max?: number;
  integer?: boolean;
};
export const PROPERTIES: Record<PropertyId, PropertyInfo> = {
  x: { label: "Position X", kind: "length" },
  y: { label: "Position Y", kind: "length" },
  width: { label: "Width", kind: "length", min: 0.001 },
  height: { label: "Height", kind: "length", min: 0.001 },
  radius: { label: "Radius", kind: "length", min: 0.001 },
  sweep: { label: "Sweep", kind: "number", min: -360, max: 360 },
  rotation: { label: "Rotation", kind: "number" },
  strokeWidth: { label: "Outline width", kind: "length", min: 0.001 },
  headSize: { label: "Head size", kind: "length", min: 0.001 },
  indicatorSize: { label: "Size", kind: "length", min: 0.001 },
  fontSize: { label: "Font size", kind: "length" },
  lineSpacing: { label: "Line spacing", kind: "number" },
  measurementSections: { label: "Sections", kind: "number", min: 1, max: 100, integer: true },
  measurementOffset: { label: "Offset", kind: "length" },
};
export const isPropertyId = (id: string): id is PropertyId => id in PROPERTIES;

const isCurve = (s: Shape) => s.kind === "curve" || s.kind === "control-curve";
const sized = (s: Shape) => ["image", "rectangle", "ellipse", "curve", "control-curve"].includes(s.kind);
const angleOf = (s: Shape) => {
  const m = shapeMatrix(s);
  return (Math.atan2(m.b, m.a) * 180) / Math.PI;
};
function extent(s: Shape, axis: "x" | "y") {
  if (isCurve(s)) return axis === "x" ? bounds([s]).width : bounds([s]).height;
  const a = s.points[0], b = s.points.at(-1)!, m = shapeMatrix(s);
  return Math.abs(b[axis] - a[axis]) * (axis === "x" ? Math.hypot(m.a, m.b) : Math.hypot(m.c, m.d));
}

/** Current value, or null when the property does not apply to this shape. */
export function getProperty(s: Shape, id: PropertyId): number | null {
  switch (id) {
    case "x": return center(s).x;
    case "y": return center(s).y;
    case "width": return sized(s) ? extent(s, "x") : null;
    case "height": return sized(s) ? extent(s, "y") : null;
    case "radius": return s.kind === "circle" || s.kind === "arc" ? distance(s.points[0], s.points.at(-1)!) : null;
    case "sweep": return s.kind === "arc" ? s.sweep ?? 0 : null;
    case "rotation": return angleOf(s);
    case "strokeWidth": return s.kind === "text" ? null : s.strokeWidth ?? 0.35;
    case "headSize": return s.kind === "arrow" ? s.headSize ?? 3 : null;
    case "indicatorSize": return isIndicator(s.kind) ? indicatorGeometry(s).size : null;
    case "fontSize": return s.kind === "text" ? s.fontSize ?? 5 : null;
    case "lineSpacing": return s.kind === "text" ? s.lineSpacing ?? 1.2 : null;
    case "measurementSections": return s.kind === "measurement" ? s.measurementSections ?? 1 : null;
    case "measurementOffset": return s.kind === "measurement" ? measurementGeometry(s).offset : null;
  }
}

/** Range check shared by fields and variable-driven updates. */
export function propertyValueError(id: PropertyId, value: number): string | null {
  const p = PROPERTIES[id];
  if (!Number.isFinite(value)) return "must be a finite number";
  if (p.integer && !Number.isInteger(Math.round(value * 1e9) / 1e9)) return "must be a whole number";
  if (p.min !== undefined && value < p.min) return `must be ≥ ${p.min}`;
  if (p.max !== undefined && value > p.max) return `must be ≤ ${p.max}`;
  return null;
}

function size(s: Shape, axis: "x" | "y", v: number, aspectLocked: boolean): Partial<Shape> | null {
  const c = center(s), current = extent(s, axis);
  if (s.kind === "image" && aspectLocked) {
    const factor = v / current;
    return stretchShape(s, factor, factor, c);
  }
  if (isCurve(s)) {
    if (!(current > 0)) return null;
    return stretchShape(s, axis === "x" ? v / current : 1, axis === "y" ? v / current : 1, c);
  }
  const a = s.points[0], b = s.points.at(-1)!;
  if (s.transform) {
    const f = v / current, m = shapeMatrix(s),
      local = { a: axis === "x" ? f : 1, b: 0, c: 0, d: axis === "y" ? f : 1, e: 0, f: 0 };
    const origin = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    local.e = origin.x * (1 - local.a);
    local.f = origin.y * (1 - local.d);
    return transformShape(s, multiply(multiply(m, local), inverse(m)));
  }
  const length = Math.abs(b[axis] - a[axis]);
  if (!length) return null;
  const factor = v / length,
    points = s.points.map((p) => ({ ...p, [axis]: c[axis] + (p[axis] - c[axis]) * factor }));
  return {
    points,
    radius: s.kind === "rectangle"
      ? Math.min(s.radius, Math.abs(points[1].x - points[0].x) / 2, Math.abs(points[1].y - points[0].y) / 2)
      : s.radius,
  };
}

/**
 * Changes that give `s` the requested property value, as the Inspector applies them;
 * null when the property does not apply or cannot be set.
 */
export function propertyChanges(
  s: Shape,
  id: PropertyId,
  v: number,
  options: { aspectLocked?: boolean } = {},
): Partial<Shape> | null {
  if (getProperty(s, id) === null) return null;
  const c = center(s);
  switch (id) {
    case "x": return moveShape(s, v - c.x, 0);
    case "y": return moveShape(s, 0, v - c.y);
    case "width": return size(s, "x", v, options.aspectLocked ?? true);
    case "height": return size(s, "y", v, options.aspectLocked ?? true);
    case "radius": {
      const a = s.points[0], b = s.points.at(-1)!, f = v / distance(a, b);
      return { points: [a, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }] };
    }
    case "sweep": return { sweep: v };
    case "rotation": return rotateShape(s, v - angleOf(s), c);
    case "strokeWidth": return { strokeWidth: v };
    case "headSize": return { headSize: v };
    case "indicatorSize": {
      const current = indicatorGeometry(s).size;
      if (!(v > 0 && current > 0)) return null;
      if (s.kind === "arrow-head") {
        const local = distance(s.points[0], s.points[1]), world = indicatorGeometry(s).length;
        return { headSize: (v * local) / world };
      }
      return stretchShape(s, v / current, v / current, c);
    }
    case "fontSize": return { fontSize: v };
    case "lineSpacing": return { lineSpacing: v };
    case "measurementSections": return { measurementSections: Math.round(v) };
    case "measurementOffset": return { measurementOffset: v / measurementGeometry(s).offsetScale };
  }
}

/** Clamp polygon fillets after a geometry change, as every Inspector edit does. */
export function clampFillets(s: Shape, changes: Partial<Shape>): Partial<Shape> {
  const next = { ...s, ...changes };
  return isPolygon(next) ? { ...changes, radius: Math.min(next.radius, polygonFillets(next).max) } : changes;
}

/**
 * Text boxes re-measure from their top-left anchor. Keep the centre of `before` on axes
 * whose position is linked, so re-measuring never ends a position link.
 */
export function keepLinkedCenter(before: Shape, after: Shape): Shape {
  const linked = new Set((after.bindings ?? []).map((b) => b.property));
  if (!linked.has("x") && !linked.has("y")) return after;
  const a = center(before), b = center(after);
  const dx = linked.has("x") ? a.x - b.x : 0, dy = linked.has("y") ? a.y - b.y : 0;
  return dx || dy ? ({ ...after, ...moveShape(after, dx, dy) } as Shape) : after;
}

/** Merge changes the way the controller does, including text box resizing. */
export function applyChanges(s: Shape, changes: Partial<Shape>): Shape {
  const updated = { ...s, ...changes };
  // Only real changes re-measure: geometry setters return the whole shape, text included.
  const textChange = ["fontSize", "text", "fontFamily", "bold", "italic", "underline", "strikethrough", "textAlign", "lineSpacing"]
    .some((key) => {
      const value = (changes as Record<string, unknown>)[key];
      return value !== undefined && value !== (s as Record<string, unknown>)[key];
    });
  return s.kind === "text" && textChange ? keepLinkedCenter(updated, resizeText(updated)) : updated;
}

export function setProperty(s: Shape, id: PropertyId, v: number, options: { aspectLocked?: boolean } = {}): Shape | null {
  const changes = propertyChanges(s, id, v, options);
  return changes ? applyChanges(s, clampFillets(s, changes)) : null;
}
