import { isIndicator, indicatorGeometry } from "../model/indicators";
import { measurementSegments, measurementGeometry } from "../model/measurement";
import type { Shape } from "../model/project";
import type { UnitMode } from "../model/units";
export function drawAnnotation(ctx: CanvasRenderingContext2D, s: Shape, units: UnitMode) {
  if (isIndicator(s.kind)) {
    const g = indicatorGeometry(s, units);
    ctx.beginPath();
    if (s.kind === "arrow" || s.kind === "arrow-head") {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const head = g.lines.slice(-2);
      if (s.kind === "arrow") { const [a, b] = g.lines[0]; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.moveTo(head[0][0].x,head[0][0].y); ctx.lineTo(head[0][1].x,head[0][1].y);ctx.lineTo(head[1][1].x,head[1][1].y);
    } else if (s.kind === "size-square") {
      ctx.lineJoin = "round";
      ctx.moveTo(g.lines[0][0].x,g.lines[0][0].y);
      for (const [, b] of g.lines) ctx.lineTo(b.x, b.y);
      ctx.closePath();
    } else { ctx.lineCap = "round"; for (const [a,b] of g.lines) { ctx.moveTo(a.x,a.y); ctx.lineTo(b.x, b.y); } }
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    for (const l of g.labels) {
      ctx.save(); ctx.translate(l.point.x,l.point.y); ctx.rotate(l.angle);
      ctx.font = `${l.fontSize}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(l.text, 0, 0); ctx.restore();
    }
  } else if (s.kind === "measurement") {
    if (s.measurementSections) {
      for (const part of measurementSegments(s)) {
        ctx.save();
        drawAnnotation(ctx, part, units);
        ctx.restore();
      }
      return;
    }
    const g = measurementGeometry(s, units);
    ctx.lineWidth = s.strokeWidth ?? 0.35;
    ctx.beginPath();
    for (const [a, b] of g.lines) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    for (const [tip, left, right] of g.arrowheads) {
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.translate(g.middle.x, g.middle.y);
    ctx.rotate(g.angle);
    ctx.font = `${g.fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(g.label, 0, 0);
  }
}
