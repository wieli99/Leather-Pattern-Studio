import type { Point } from "../model/project";

/** Stack distance and direction around the active segment in screen pixels. */
export function segmentLabelPoint(
  start: Point,
  end: Point,
  angular: boolean,
): Point {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2 + (angular ? 56 : -16),
  };
}
