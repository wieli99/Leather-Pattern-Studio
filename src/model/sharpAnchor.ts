import type { Shape } from "./project";
import { distance } from "./geometry";
export function sharpAnchor(shape: Shape, index: number): Shape {
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
