import type { Shape } from "./project";
import type { Cubic } from "./curves";
/** Contours share the parent's local frame and appearance. */
export function contourShape(shape: Shape, contour: Cubic[]): Shape {
  const points = [contour[0][0], ...contour.map((c) => c[3])];
  return {
    ...shape,
    kind: "control-curve",
    contours: undefined,
    points,
    handles: points.map((p, i) => ({
      incoming: i
        ? { x: contour[i - 1][2].x - p.x, y: contour[i - 1][2].y - p.y }
        : { x: 0, y: 0 },
      outgoing:
        i < contour.length
          ? { x: contour[i][1].x - p.x, y: contour[i][1].y - p.y }
          : { x: 0, y: 0 },
    })),
  };
}
