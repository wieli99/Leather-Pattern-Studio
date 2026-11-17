import { contourShape } from "./compound";
import { cubicSegments } from "./curves";
import type { Shape } from "./project";
import { insertAnchor } from "./insertAnchor";
import { zeroHandles } from "./curves";
import { cornerPoints, cornerRadii, worldPoints, distance } from "./geometry";
/** Expand a rectangle without changing its local bounds or transform. */
export function rectanglePath(shape: Shape): Shape {
  if (shape.kind !== "rectangle") return shape;
  const points = cornerPoints(shape);
  return { ...shape, kind: "polyline", points: [...points, { ...points[0] }] };
}

export function sharpAnchor(shape: Shape, index: number): Shape {
  if (shape.kind === "compound") {
    let offset = 0;
    for (let i=0;i<shape.contours!.length;i++) {
      const contour = shape.contours![i];
      if (index < offset + contour.length) {
        const part = {...contourShape(shape,contour),rotation:0,transform:undefined};
        const next = sharpAnchor(part,index-offset);
        return {...shape,contours:shape.contours!.map((c,j)=>j===i?cubicSegments(next):c)};
      }
      offset += contour.length;
    }
    return shape;
  }
  if (shape.kind !== "control-curve" || !shape.handles || !shape.points[index])
    return shape;
  const last = shape.points.length - 1;
  const seam =
    last > 1 &&
    distance(shape.points[0], shape.points[last]) < 1e-9 &&
    (index === 0 || index === last);
  let changed = false;
  const handles = shape.handles.map((handle, i) => {
    if (i !== index && !(seam && (i === 0 || i === last))) return handle;
    if (
      handle.incoming.x === 0 &&
      handle.incoming.y === 0 &&
      handle.outgoing.x === 0 &&
      handle.outgoing.y === 0
    )
      return handle;
    changed = true;
    return { incoming: { x: 0, y: 0 }, outgoing: { x: 0, y: 0 } };
  });
  return changed ? { ...shape, handles } : shape;
}

/** Toggle sharp anchors to mirrored tangents derived from their neighbours. */
export function toggleAnchor(shape: Shape, index: number): Shape {
  if (shape.kind === "compound") {
    let offset = 0;
    for (let i=0;i<shape.contours!.length;i++) {
      const contour = shape.contours![i];
      if (index < offset + contour.length) {
        const part = {...contourShape(shape,contour),rotation:0,transform:undefined};
        const next = toggleAnchor(part,index-offset);
        return {...shape,contours:shape.contours!.map((c,j)=>j===i?cubicSegments(next):c)};
      }
      offset += contour.length;
    }
    return shape;
  }
  if (shape.kind === "rectangle") return toggleAnchor(rectanglePath(shape), index);
  if (shape.kind === "polyline" && shape.points[index]) {
    const radii = cornerRadii(shape);
    if (radii.some((r) => r > 0)) {
      const target = worldPoints(shape)[index];
      const last = shape.points.length - 1;
      const i =
        index === last && distance(shape.points[0], shape.points[last]) < 1e-9
          ? 0 : index;
      const rounded = {
        ...shape,
        radius: 0,
        cornerRadii: radii.map((r, j) => j === i ? 0 : r),
      };
      const converted = insertAnchor(rounded, target, Infinity, undefined, true);
      if (!converted) return shape;
      const vertex = converted.points.findIndex(p => distance(p, target) < 1e-7);
      return vertex < 0
        ? shape
        : toggleAnchor(sharpAnchor(converted, vertex), vertex);
    }
    return toggleAnchor({
      ...shape,
      kind: "control-curve",
      radius: 0,
      cornerRadii: undefined,
      handles: shape.points.map(zeroHandles),
    }, index);
  }
  const h = shape.handles?.[index];
  if (shape.kind !== "control-curve" || !h || !shape.points[index])
    return shape;
  if ([h.incoming, h.outgoing].some((v) => v.x !== 0 || v.y !== 0))
    return sharpAnchor(shape, index);
  const last = shape.points.length - 1;
  const closed =
    last > 1 && distance(shape.points[0], shape.points[last]) < 1e-9;
  const count = closed ? last : shape.points.length;
  const i = closed && index === last ? 0 : index;
  const p = shape.points[i];
  const prev =
    i > 0 ? shape.points[i - 1] : closed ? shape.points[count - 1] : undefined;
  const next =
    i + 1 < count ? shape.points[i + 1] : closed ? shape.points[0] : undefined;
  const before = prev ? distance(prev, p) : 0;
  const after = next ? distance(p, next) : 0;
  let x =
    (before > 1e-9 ? (p.x - prev!.x) / before : 0) +
    (after > 1e-9 ? (next!.x - p.x) / after : 0);
  let y =
    (before > 1e-9 ? (p.y - prev!.y) / before : 0) +
    (after > 1e-9 ? (next!.y - p.y) / after : 0);
  if (Math.hypot(x, y) < 1e-9) {
    x = after > 1e-9 ? next!.x - p.x : before > 1e-9 ? p.x - prev!.x : 0;
    y = after > 1e-9 ? next!.y - p.y : before > 1e-9 ? p.y - prev!.y : 0;
  }
  const norm = Math.hypot(x, y);
  if (norm < 1e-9) return shape;
  const length =
    (before > 1e-9 && after > 1e-9
      ? Math.min(before, after)
      : Math.max(before, after)) / 3;
  const outgoing = { x: (x / norm) * length, y: (y / norm) * length };
  const incoming = { x: -outgoing.x, y: -outgoing.y };
  return {
    ...shape,
    handles: shape.handles!.map((handle, j) =>
      j === index || (closed && i === 0 && (j === 0 || j === last))
        ? { incoming: { ...incoming }, outgoing: { ...outgoing } }
        : handle,
    ),
  };
}
