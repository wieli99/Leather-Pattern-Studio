import type { Shape } from "./project";
import { shapeMatrix } from "./geometry";

export function textFamily(shape: Partial<Shape>) {
  return ({ sans: "PatternSans", serif: "PatternSerif", mono: "PatternMono" } as Record<string, string>)[shape.fontFamily ?? "sans"] ?? "PatternSans";
}
export function textFont(shape: Partial<Shape>, size = shape.fontSize ?? 5) {
  return `${shape.italic ? "italic " : ""}${shape.bold ? "bold " : ""}${size}px ${textFamily(shape)}`;
}
export function measureText(text: string, size: number, shape: Partial<Shape> = {}) {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = textFont(shape, size);
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return {
    text: lines.join("\n"),
    width: Math.max(size / 2, ...lines.map((line) => ctx.measureText(line).width)),
    height: lines.length * size * (shape.lineSpacing ?? 1.2),
  };
}

export function resizeText(shape: Shape): Shape {
  const layout = measureText(shape.text ?? "", shape.fontSize ?? 5, shape);
  const anchor = shape.points[0];
  return {
    ...shape,
    text: layout.text,
    transform: shapeMatrix(shape),
    rotation: 0,
    points: [anchor, { x: anchor.x + layout.width, y: anchor.y + layout.height }],
  };
}
