import type { Shape } from "./project";
import { distance } from "./geometry";
export function isClosedShape(s: Shape) {
  return (
    ["rectangle", "circle", "ellipse", "compound"].includes(s.kind) ||
    (["polyline", "curve", "control-curve"].includes(s.kind) &&
      distance(s.points[0], s.points.at(-1)!) < 1e-9) ||
    (s.kind === "arc" && Math.abs(s.sweep ?? 0) === 360)
  );
}
