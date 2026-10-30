import { applyMatrix, shapeMatrix } from "../model/geometry";
import type { Controller } from "./controller";
import {
  stitchGeometry,
  stitchEdges,
  type StitchGroup,
} from "../model/stitchGeometry";
import { stitchMarks } from "../model/stitch";
export function drawStitches(
  ctx: CanvasRenderingContext2D,
  editor: Controller,
  color: (name: string) => string,
) {
  const doc = editor.preview ?? editor.document;
  function draw(g: StitchGroup, preview = false) {
    const s = doc.shapes.find((s) => s.id === g.shapeId);
    if (!s) return;
    const selected =
      preview || (editor.stitchMode && editor.stitchSelected.includes(g.id));
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = color(selected ? "accent" : "shape");
    ctx.lineWidth = 1 / editor.zoom;
    try {
      const geometry = stitchGeometry(s, g),
        baseMark = stitchMarks[g.settings.style],
        flatScale =
          (g.settings.flatLength ?? stitchMarks.flat.width) / stitchMarks.flat.width,
        mark = {
          ...baseMark,
          width: g.settings.style === "round"
            ? (g.settings.roundDiameter ?? baseMark.width)
            : g.settings.style === "flat"
              ? baseMark.width * flatScale
              : baseMark.width,
          height: g.settings.style === "flat"
            ? baseMark.height * flatScale
            : baseMark.height,
        };
      if (preview) {
        ctx.save();
        ctx.setLineDash([4 / editor.zoom, 3 / editor.zoom]);
        ctx.beginPath();
        for (const edge of stitchEdges(s).filter((e) =>
          g.edges.includes(e.key),
        ))
          edge.points.forEach((p, i) =>
            i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
          );
        ctx.stroke();
        ctx.restore();
      }
      if (selected) {
        ctx.save();
        ctx.lineJoin = ctx.lineCap = "round";
        ctx.globalAlpha = preview ? 0.12 : 0.24;
        ctx.lineWidth = 9 / editor.zoom;
        ctx.beginPath();
        geometry.points.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.stroke();
        ctx.globalAlpha = preview ? 0.6 : 1;
        ctx.lineWidth = 2 / editor.zoom;
        ctx.setLineDash([5 / editor.zoom, 4 / editor.zoom]);
        ctx.stroke();
        ctx.restore();
      }
      for (const { point, angle } of geometry.holes) {
        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate(angle + mark.angle);
        ctx.beginPath();
        if (g.settings.style === "round")
          ctx.arc(0, 0, mark.width / 2, 0, Math.PI * 2);
        else if (g.settings.style === "japanese") {
          ctx.moveTo(-mark.width / 2, 0);
          ctx.lineTo(0, -mark.height / 2);
          ctx.lineTo(mark.width / 2, 0);
          ctx.lineTo(0, mark.height / 2);
          ctx.closePath();
        } else
          ctx.rect(-mark.width / 2, -mark.height / 2, mark.width, mark.height);
        ctx.fill();
        ctx.restore();
      }
      if (selected) {
        const a = geometry.points[0],
          b = geometry.points[1],
          angle = Math.atan2(b.y - a.y, b.x - a.x),
          size = 7 / editor.zoom;
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(size * 2, 0);
        ctx.lineTo(size, -size / 2);
        ctx.moveTo(size * 2, 0);
        ctx.lineTo(size, size / 2);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(a.x, a.y, 3 / editor.zoom, 0, Math.PI * 2);
        ctx.stroke();
        const end = geometry.points.at(-1)!;
        if (!geometry.closed)
          ctx.strokeRect(
            end.x - 2 / editor.zoom,
            end.y - 2 / editor.zoom,
            4 / editor.zoom,
            4 / editor.zoom,
          );
      }
    } catch {
      const p = applyMatrix(shapeMatrix(s), s.points[0]);
      ctx.fillStyle = color("accent");
      ctx.font = `${14 / editor.zoom}px sans-serif`;
      ctx.fillText("⚠ Stitch inset invalid", p.x, p.y);
    } finally {
      ctx.restore();
    }
  }
  for (const g of (doc.stitchGroups ?? []).filter(
    (g) =>
      !editor.stitchMode ||
      !editor.stitchHover ||
      !editor.stitchAbsorbed.includes(g.id),
  ))
    draw(
      editor.stitchDraft?.id === g.id && !editor.stitchError
        ? editor.stitchDraft
        : g,
    );
  if (
    editor.stitchMode &&
    editor.stitchHover?.id === "preview" &&
    !editor.stitchDraft
  )
    draw(editor.stitchHover, true);
}
