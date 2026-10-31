import { isIndicator } from "./indicators";
import { boundary, distance, worldCubics } from "./geometry";
import { cubicAt, isCurve } from "./curves";
import type { Point, Shape } from "./project";

export type EdgeMeasurement = { length: number; point: Point; angle: number };
export const formatEdgeLength = (length: number) =>
  `${Number(length.toFixed(2))} mm`;

// Progressively refined world-space sampling keeps measurement independent of viewport zoom.
function measure(at: (t: number) => Point): EdgeMeasurement | undefined {
  let samples: Point[] = [];
  let previous = -1;
  let length = 0;
  for (let count = 32; count <= 32768; count *= 2) {
    samples = Array.from({ length: count + 1 }, (_, i) => at(i / count));
    length = samples
      .slice(1)
      .reduce((sum, p, i) => sum + distance(samples[i], p), 0);
    if (previous >= 0 && Math.abs(length - previous) < 0.001) break;
    previous = length;
  }
  if (!Number.isFinite(length) || length < 1e-9) return;
  let traversed = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i],
      segment = distance(a, b);
    if (traversed + segment >= length / 2 && segment > 0) {
      const t = (length / 2 - traversed) / segment;
      return {
        length,
        point: { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) },
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    traversed += segment;
  }
}

export function edgeMeasurements(shape: Shape): EdgeMeasurement[] {
  if (isIndicator(shape.kind) || shape.kind === "text" || shape.kind === "measurement") return [];
  if (isCurve(shape))
    return worldCubics(shape)
      .map((c) => measure((t) => cubicAt(c, t)))
      .filter((v): v is EdgeMeasurement => !!v);
  const outline = boundary(shape);
  const result: EdgeMeasurement[] = outline.lines.flatMap(([a, b]) => {
    const length = distance(a, b);
    return length > 1e-9
      ? [
          {
            length,
            point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            angle: Math.atan2(b.y - a.y, b.x - a.x),
          },
        ]
      : [];
  });
  for (const curve of outline.curves) {
    const value = measure((t) => {
      const angle = curve.start + t * curve.span;
      return {
        x:
          curve.c.x + curve.u.x * Math.cos(angle) + curve.v.x * Math.sin(angle),
        y:
          curve.c.y + curve.u.y * Math.cos(angle) + curve.v.y * Math.sin(angle),
      };
    });
    if (value) result.push(value);
  }
  return result;
}
