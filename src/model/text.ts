import type { Shape } from "./project";
import { shapeMatrix } from "./geometry";

export function measureText(text: string, size: number) {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = `${size}px sans-serif`;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return {
    text: lines.join("\n"),
    width: Math.max(size / 2, ...lines.map((line) => ctx.measureText(line).width)),
    height: lines.length * size * 1.2,
  };
}

export function resizeText(shape: Shape): Shape {
  const layout = measureText(shape.text ?? "", shape.fontSize ?? 5);
  const anchor = shape.points[0];
  return {
    ...shape,
    text: layout.text,
    transform: shapeMatrix(shape),
    rotation: 0,
    points: [anchor, { x: anchor.x + layout.width, y: anchor.y + layout.height }],
  };
}
