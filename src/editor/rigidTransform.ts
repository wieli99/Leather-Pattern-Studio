import type { Point, Shape } from "../model/project";
import { anchors, bounds, distance, nearestOutline } from "../model/geometry";
import { snapCandidates, smartSnap, type SmartGuide } from "./snapping";
/** Shared modifier policy for Model and print rotation gestures. */
export function snapRotation(
  angle: number,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean },
) {
  const step = modifiers.ctrlKey ? 10 : modifiers.shiftKey ? 5 : 1;
  return modifiers.altKey ? angle : Math.round(angle / step) * step;
}
export function unwrapRotation(previous: number, current: number) {
  let delta = current - previous;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return (delta * 180) / Math.PI;
}

export function snapRigidMove(
  shapes: Shape[],
  selectedIds: string[],
  delta: Point,
  options: {
    grid: boolean;
    objects: boolean;
    gridSize: number;
    tolerance: number;
    anchor?: Point;
  },
) {
  const selected = new Set(selectedIds),
    others = shapes.filter((s) => !selected.has(s.id));
  let best:
    | {
        anchor: Point;
        point: Point;
        priority: number;
        distance: number;
        guides: SmartGuide[];
      }
    | undefined;
  const candidates = options.anchor
    ? [options.anchor]
    : shapes.filter((s) => selected.has(s.id)).flatMap(anchors);
  for (const anchor of candidates) {
    const point = { x: anchor.x + delta.x, y: anchor.y + delta.y };
    let snapped:
      { point: Point; priority: number; guides: SmartGuide[] } | undefined;
    if (options.objects) {
      let closest = options.tolerance;
      for (const shape of others)
        for (const candidate of snapCandidates(shape)) {
          const d = distance(candidate.point, point);
          if (d < closest) {
            closest = d;
            snapped = { point: candidate.point, priority: 0, guides: [] };
          }
        }
      if (!snapped)
        for (const shape of others) {
          const b = bounds([shape]);
          if (
            point.x < b.x - options.tolerance ||
            point.x > b.x + b.width + options.tolerance ||
            point.y < b.y - options.tolerance ||
            point.y > b.y + b.height + options.tolerance
          )
            continue;
          const q = nearestOutline(shape, point, options.tolerance / 32),
            d = distance(point, q);
          if (d < closest) {
            closest = d;
            snapped = { point: q, priority: 0, guides: [] };
          }
        }
      if (!snapped) {
        const result = smartSnap(point, others, options.tolerance);
        if (result.guides.length)
          snapped = { point: result.point, priority: 1, guides: result.guides };
      }
    }
    if (!snapped && options.grid) {
      const q = {
        x: Math.round(point.x / options.gridSize) * options.gridSize,
        y: Math.round(point.y / options.gridSize) * options.gridSize,
      };
      if (distance(point, q) <= options.tolerance)
        snapped = { point: q, priority: 2, guides: [] };
    }
    if (snapped) {
      const d = distance(point, snapped.point);
      if (
        !best ||
        snapped.priority < best.priority ||
        (snapped.priority === best.priority && d < best.distance)
      )
        best = { anchor, ...snapped, distance: d };
    }
  }
  return best
    ? {
        delta: {
          x: best.point.x - best.anchor.x,
          y: best.point.y - best.anchor.y,
        },
        anchor: best.anchor,
        target: best.point,
        guides: best.guides,
      }
    : { delta, guides: [] };
}
