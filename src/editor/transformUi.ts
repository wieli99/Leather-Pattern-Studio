import { distanceToSegment } from "../model/geometry";
import type { Point } from "../model/project";
/** Grid and print use an eight-screen-pixel hit area around gizmo shafts. */
export function hitsTransformShaft(
  point: Point,
  pivot: Point,
  tip: Point,
  zoom = 1,
) {
  return distanceToSegment(point, pivot, tip) < 8 / zoom;
}

/** Draw in world or CSS-pixel coordinates using the supplied zoom. */
export function drawRotationGizmo(
  ctx: CanvasRenderingContext2D,
  pivot: Point,
  zoom: number,
  angle: number,
  hovered: boolean,
  accent: string,
  text: string,
) {
  ctx.save();
  ctx.strokeStyle = hovered ? text : accent;
  ctx.lineWidth = (hovered ? 3 : 2) / zoom;
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 60 / zoom, 0, Math.PI * 2);
  ctx.stroke();
  if (angle) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.arc(pivot.x, pivot.y, 60 / zoom, 0, (angle * Math.PI) / 180, angle < 0);
    ctx.closePath();
    ctx.fill();
  }
  drawPivotPoint(ctx, pivot, zoom, accent);
  ctx.restore();
}

export function drawPivotPoint(
  ctx: CanvasRenderingContext2D,
  pivot: Point,
  zoom: number,
  accent: string,
) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 3 / zoom, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawTransformReadout(
  ctx: CanvasRenderingContext2D,
  point: Point,
  text: string,
  panel: string,
  accent: string,
) {
  ctx.save();
  ctx.font = "11px system-ui";
  const width = ctx.measureText(text).width;
  ctx.fillStyle = panel;
  ctx.fillRect(point.x + 12, point.y - 24, width + 16, 23);
  ctx.fillStyle = accent;
  ctx.fillText(text, point.x + 20, point.y - 8);
  ctx.restore();
}
