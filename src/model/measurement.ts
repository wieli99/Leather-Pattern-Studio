import { formatLength, unitSymbol, type UnitMode } from "./units";
import type { Point, Shape } from "./project";
import { applyMatrix, shapeMatrix } from "./geometry";

/** Derive dimension strokes from endpoints and a signed local offset. */
function singleMeasurementGeometry(s: Shape, units: UnitMode = "mm") {
  const matrix = shapeMatrix(s);
  const [a, b] = s.points.map((p) => applyMatrix(matrix, p));
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
  const localLength = Math.hypot(
    s.points[1].x - s.points[0].x,
    s.points[1].y - s.points[0].y,
  );
  const nx = -(s.points[1].y - s.points[0].y) / localLength;
  const ny = (s.points[1].x - s.points[0].x) / localLength;
  // Project the transformed normal onto the world perpendicular. This preserves
  // a parallel dimension line under nonuniform resizing and reverses mirrored offsets.
  const offsetScale =
    (matrix.a * nx + matrix.c * ny) * -uy +
    (matrix.b * nx + matrix.d * ny) * ux;
  const offset = offsetScale * (s.measurementOffset ?? 0);
  const start = { x: a.x - uy * offset, y: a.y + ux * offset };
  const end = { x: b.x - uy * offset, y: b.y + ux * offset };
  const label = `${units === "mm" ? length.toFixed(2) : formatLength(length, units)} ${unitSymbol(units)}`;
  const fontSize = 3;
  const halfWidth = label.length * fontSize * 0.62 / 2;
  const gap = Math.min(length / 2, halfWidth + 1);
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const at = (p: Point, along: number, normal = 0) => ({
    x: p.x + ux * along - uy * normal,
    y: p.y + uy * along + ux * normal,
  });
  const arrowLength = 2.5;
  const arrowHalfWidth = 0.8;
  const outsideArrows = length < 2 * (halfWidth + 1 + arrowLength);
  const direction = outsideArrows ? -1 : 1;
  const arrowheads: [Point, Point, Point][] = [
    [start, at(start, direction * arrowLength, arrowHalfWidth),
      at(start, direction * arrowLength, -arrowHalfWidth)],
    [end, at(end, -direction * arrowLength, arrowHalfWidth),
      at(end, -direction * arrowLength, -arrowHalfWidth)],
  ];
  // Short dimensions keep their label above the line so outside arrows remain visible.
  const labelPoint = outsideArrows ? at(middle, 0, ux < 0 ? 4 : -4) : middle;
  const sign = Math.sign(offset) || 1;
  const lines: [Point, Point][] = [
    [a, at(start, 0, sign * 2)],
    [b, at(end, 0, sign * 2)],
  ];
  if (outsideArrows)
    lines.push([at(start, -arrowLength - 2), at(end, arrowLength + 2)]);
  else
    lines.push([start, at(middle, -gap)], [at(middle, gap), end]);
  for (const [tip, left, right] of arrowheads)
    lines.push([tip, left], [left, right], [right, tip]);
  const labelBounds = [-1, 1].flatMap((x) =>
    [-1, 1].map((y) => at(labelPoint, x * halfWidth, y * fontSize / 2)),
  );
  let angle = Math.atan2(uy, ux);
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
  return {
    a, b, length, offset, offsetScale, start, end, middle: labelPoint,
    arrowheads, outsideArrows,
    label, fontSize, angle, lines, labelBounds,
  };
}

export function measurementSegments(s: Shape): Shape[] {
  const count = s.measurementSections ?? 1;
  // Freeze the parent pivot before replacing endpoints with each span.
  const transform = shapeMatrix(s);
  const [a, b] = s.points;
  const at = (i: number) => ({
    x: a.x + (b.x - a.x) * i / count,
    y: a.y + (b.y - a.y) * i / count,
  });
  return Array.from({ length: count }, (_, i) => ({
    ...s, rotation: 0, transform, measurementSections: undefined,
    points: [at(i), at(i + 1)],
  }));
}

export function measurementGeometry(s: Shape, units: UnitMode = "mm") {
  const base = singleMeasurementGeometry(s, units);
  if (!s.measurementSections) return base;
  const spans = measurementSegments(s).map(part => singleMeasurementGeometry(part, units));
  return {
    ...base,
    lines: spans.flatMap(g => g.lines),
    arrowheads: spans.flatMap(g => g.arrowheads),
    labelBounds: spans.flatMap(g => g.labelBounds),
  };
}
