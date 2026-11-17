import { bounds, center } from "./geometry";
import type { Point, Shape } from "./project";
import type { UnitMode } from "./units";

export type PivotMode = "bounding-box" | "median" | "custom";
export function automaticPivot(shapes: Shape[], mode: Exclude<PivotMode, "custom">, units: UnitMode): Point | undefined {
  const unique = [...new Map(shapes.map(s => [s.id, s])).values()];
  const ids = new Set(unique.map(s => s.id));
  const targets = unique.filter(s => !s.stitchParentId || !ids.has(s.stitchParentId));
  if (!targets.length) return undefined;
  if (mode === "median") {
    const points = targets.map(center);
    return { x: points.reduce((sum,p) => sum+p.x,0)/points.length, y: points.reduce((sum,p) => sum+p.y,0)/points.length };
  }
  const b = bounds(targets, units);
  return { x: b.x+b.width/2, y: b.y+b.height/2 };
}
