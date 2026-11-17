import { shapePath } from "../editor/renderer";
import { applyMatrix, shapeMatrix, bounds } from "./geometry";
import { isClosedShape } from "./closedShape";
import {
  booleanOutlines,
  type BooleanOperation,
  type BooleanOutline,
} from "./boolean";
import type { Shape, Point } from "./project";
import type { Cubic } from "./curves";

/** Record the same outline as the renderer, preserving cubics in world millimetres. */
export function booleanOutline(shape: Shape): BooleanOutline {
  if (!isClosedShape(shape))
    throw Error("Boolean tools require closed outlines.");
  const matrix = shapeMatrix(shape),
    contours: BooleanOutline = [];
  let current: Point, start: Point;
  const world = (p: Point) => applyMatrix(matrix, p);
  const sink = {
    moveTo(x: number, y: number) {
      current = start = { x, y };
      contours.push([]);
    },
    lineTo(x: number, y: number) {
      const end = { x, y };
      if (Math.hypot(end.x - current.x, end.y - current.y) > 1e-10)
        contours.at(-1)!.push([current, current, end, end].map(world) as Cubic);
      current = end;
    },
    bezierCurveTo(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      x: number,
      y: number,
    ) {
      const end = { x, y };
      contours
        .at(-1)!
        .push(
          [current, { x: x1, y: y1 }, { x: x2, y: y2 }, end].map(
            world,
          ) as Cubic,
        );
      current = end;
    },
    closePath() {
      this.lineTo(start.x, start.y);
    },
    ellipse(
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      rotation: number,
      a: number,
      b: number,
      ccw = false,
    ) {
      let span = b - a;
      if (Math.abs(span) >= 2 * Math.PI) span = (ccw ? -1 : 1) * 2 * Math.PI;
      else if (ccw && span > 0) span -= 2 * Math.PI;
      else if (!ccw && span < 0) span += 2 * Math.PI;
      const at = (t: number): Point => ({
        x:
          cx +
          rx * Math.cos(t) * Math.cos(rotation) -
          ry * Math.sin(t) * Math.sin(rotation),
        y:
          cy +
          rx * Math.cos(t) * Math.sin(rotation) +
          ry * Math.sin(t) * Math.cos(rotation),
      });
      const derivative = (t: number): Point => ({
        x:
          -rx * Math.sin(t) * Math.cos(rotation) -
          ry * Math.cos(t) * Math.sin(rotation),
        y:
          -rx * Math.sin(t) * Math.sin(rotation) +
          ry * Math.cos(t) * Math.cos(rotation),
      });
      const radius =
        Math.max(rx, ry) * Math.hypot(matrix.a, matrix.b, matrix.c, matrix.d);
      const step = Math.min(
        Math.PI / 4,
        Math.pow(0.001 / Math.max(radius, 0.001), 1 / 6),
      );
      const count = Math.max(1, Math.ceil(Math.abs(span) / step));
      if (count > 10000) throw Error("Outline is too complex.");
      const first = at(a);
      if (!current) this.moveTo(first.x, first.y);
      else this.lineTo(first.x, first.y);
      for (let i = 0; i < count; i++) {
        const t = a + (span * i) / count,
          u = a + (span * (i + 1)) / count,
          k = (4 / 3) * Math.tan((u - t) / 4),
          p = at(t),
          q = at(u),
          v = derivative(t),
          w = derivative(u);
        this.bezierCurveTo(
          p.x + k * v.x,
          p.y + k * v.y,
          q.x - k * w.x,
          q.y - k * w.y,
          q.x,
          q.y,
        );
      }
    },
    arc(cx: number, cy: number, r: number, a: number, b: number, ccw = false) {
      this.ellipse(cx, cy, r, r, 0, a, b, ccw);
    },
    roundRect(x: number, y: number, w: number, h: number, r: number) {
      this.moveTo(x + r, y);
      this.lineTo(x + w - r, y);
      if (r) this.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
      this.lineTo(x + w, y + h - r);
      if (r) this.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
      this.lineTo(x + r, y + h);
      if (r) this.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
      this.lineTo(x, y + r);
      if (r) this.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
      this.closePath();
    },
  };
  shapePath(sink as unknown as Path2D, shape);
  return contours;
}
export function booleanShapes(
  operation: BooleanOperation,
  shapes: Shape[],
): Shape | null {
  const contours = booleanOutlines(operation, shapes.map(booleanOutline));
  if (!contours.length) return null;
  const result: Shape = {
    ...shapes[0],
    kind: "compound",
    contours,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    rotation: 0,
    radius: 0,
    transform: undefined,
    handles: undefined,
    cornerRadii: undefined,
    sweep: undefined,
  };
  const box = bounds([result]);
  result.points = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
  ];
  return result;
}
