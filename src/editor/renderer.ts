import { snappedAxes } from "./snapping";
import type { Controller } from "./controller";
import { shapeMatrix } from "../model/geometry";
import type { Shape } from "../model/project";
export function shapePath(ctx: CanvasRenderingContext2D | Path2D, s: Shape) {
  const a = s.points[0],
    b = s.points[s.points.length - 1];
  if ("beginPath" in ctx) ctx.beginPath();
  if (s.kind === "arc") {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.arc(
      a.x,
      a.y,
      Math.hypot(b.x - a.x, b.y - a.y),
      angle,
      angle + ((s.sweep ?? 0) * Math.PI) / 180,
      (s.sweep ?? 0) < 0,
    );
  } else if (s.kind === "rectangle")
    ctx.roundRect(
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.abs(b.x - a.x),
      Math.abs(b.y - a.y),
      Math.min(s.radius, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2),
    );
  else if (s.kind === "circle")
    ctx.arc(a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y), 0, Math.PI * 2);
  else if (s.kind === "ellipse")
    ctx.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.abs(b.x - a.x) / 2,
      Math.abs(b.y - a.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
  else
    s.points.forEach((p, i) =>
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
}
export function attachRenderer(canvas: HTMLCanvasElement, editor: Controller) {
  const ctx = canvas.getContext("2d")!;
  let frame = 0,
    dirty = true;
  const unsubscribe = editor.subscribe(() => {
    dirty = true;
  });
  const observer = new ResizeObserver(() => {
    dirty = true;
  });
  observer.observe(canvas);
  function draw() {
    const rect = canvas.getBoundingClientRect(),
      dpr = devicePixelRatio || 1,
      w = rect.width,
      h = rect.height;
    if (
      canvas.width !== Math.round(w * dpr) ||
      canvas.height !== Math.round(h * dpr)
    ) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    editor.width = w;
    editor.height = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(canvas),
      color = (name: string) => css.getPropertyValue("--" + name).trim();
    const z = editor.zoom,
      pan = editor.pan,
      spacing =
        editor.gridSize *
        Math.max(
          1,
          Math.pow(10, Math.ceil(Math.log10(18 / (z * editor.gridSize)))),
        ),
      step = spacing * z;
    ctx.fillStyle = color("grid");
    ctx.strokeStyle = color("grid");
    ctx.lineWidth = 0.5;
    if (editor.gridStyle === "dots") {
      ctx.fillStyle = color("grid-dot");
      for (let x = ((pan.x % step) + step) % step; x < w; x += step)
        for (let y = ((pan.y % step) + step) % step; y < h; y += step)
          ctx.fillRect(x, y, 1, 1);
    } else {
      ctx.beginPath();
      for (let x = ((pan.x % step) + step) % step; x < w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = ((pan.y % step) + step) % step; y < h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = color("muted");
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pan.x, 0);
    ctx.lineTo(pan.x, h);
    ctx.moveTo(0, pan.y);
    ctx.lineTo(w, pan.y);
    ctx.stroke();
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(z, z);
    function shape(s: Shape, preview = false) {
      ctx.save();
      const primitive = new Path2D();
      shapePath(primitive, s);
      const path = new Path2D(),
        m = shapeMatrix(s);
      path.addPath(primitive, new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]));
      const selected = editor.selected.includes(s.id);
      ctx.lineWidth = (selected ? 1.7 : 1.2) / z;
      ctx.strokeStyle = preview
        ? color("preview")
        : selected
          ? color("accent")
          : editor.hover === s.id
            ? color("text")
            : color("shape");
      if (["rectangle", "circle", "ellipse"].includes(s.kind)) {
        ctx.save();
        ctx.globalAlpha = selected ? 0.07 : 0.02;
        ctx.fillStyle = selected ? color("accent") : color("shape");
        ctx.fill(path);
        ctx.restore();
      }
      ctx.stroke(path);
      ctx.restore();
    }
    (editor.preview ?? editor.document).shapes.forEach((s) => shape(s));
    const construction = editor.constructionPreview;
    if (construction) shape(construction, true);
    else if (editor.mode === "arc-three" && editor.pending.length)
      shape(
        {
          id: "",
          name: "",
          kind: "polyline",
          points: [editor.pending[0], editor.pending[1] ?? editor.cursor],
          radius: 0,
          rotation: 0,
        },
        true,
      );
    for (const p of editor.pending) {
      ctx.fillStyle = color("preview");
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 / z, 0, Math.PI * 2);
      ctx.fill();
    }
    if (editor.selected.length) {
      const b = editor.selectionBounds;
      ctx.strokeStyle = color("accent");
      ctx.lineWidth = 1 / z;
      ctx.setLineDash([4 / z, 4 / z]);
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.setLineDash([]);
      const pivot = editor.transformPivot;
      const hovered = editor.pointerInside
        ? editor.handleAt(editor.cursor)
        : undefined;
      if (editor.transformTool === "rotate") {
        ctx.strokeStyle = color(hovered?.kind === "rotate" ? "text" : "accent");
        ctx.lineWidth = (hovered?.kind === "rotate" ? 3 : 2) / z;
        ctx.beginPath();
        ctx.arc(pivot.x, pivot.y, 60 / z, 0, Math.PI * 2);
        ctx.stroke();
        if (editor.transformValues.angle) {
          ctx.save();
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = color("accent");
          ctx.beginPath();
          ctx.moveTo(pivot.x, pivot.y);
          ctx.arc(
            pivot.x,
            pivot.y,
            60 / z,
            0,
            (editor.transformValues.angle * Math.PI) / 180,
            editor.transformValues.angle < 0,
          );
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      for (const handle of editor.handles()) {
        ctx.strokeStyle = ctx.fillStyle =
          handle.axis === "x"
            ? "#e87474"
            : handle.axis === "y"
              ? "#79c990"
              : color("accent");
        if (
          hovered &&
          hovered.kind === handle.kind &&
          hovered.axis === handle.axis &&
          hovered.vertex === handle.vertex
        )
          ctx.strokeStyle = ctx.fillStyle = color("text");
        ctx.lineWidth = 2 / z;
        if (handle.axis) {
          ctx.beginPath();
          ctx.moveTo(pivot.x, pivot.y);
          ctx.lineTo(handle.point.x, handle.point.y);
          ctx.stroke();
        }
        ctx.beginPath();
        if (handle.kind === "rotate") continue;
        if (handle.kind === "move" && handle.axis) {
          const t = Math.atan2(
            handle.point.y - pivot.y,
            handle.point.x - pivot.x,
          );
          ctx.moveTo(handle.point.x, handle.point.y);
          ctx.lineTo(
            handle.point.x - (12 * Math.cos(t - 0.45)) / z,
            handle.point.y - (12 * Math.sin(t - 0.45)) / z,
          );
          ctx.lineTo(
            handle.point.x - (12 * Math.cos(t + 0.45)) / z,
            handle.point.y - (12 * Math.sin(t + 0.45)) / z,
          );
          ctx.closePath();
        } else
          ctx.rect(
            handle.point.x - 5 / z,
            handle.point.y - 5 / z,
            10 / z,
            10 / z,
          );
        ctx.fill();
      }
      if (editor.transformTool) {
        ctx.strokeStyle = color("accent");
        ctx.beginPath();
        ctx.arc(pivot.x, pivot.y, 3 / z, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const g = editor.gesture;
    if (g?.kind === "marquee") {
      ctx.fillStyle = color("preview");
      ctx.globalAlpha = 0.09;
      ctx.strokeStyle = color("preview");
      ctx.lineWidth = 1 / z;
      ctx.fillRect(
        g.start.x,
        g.start.y,
        g.end.x - g.start.x,
        g.end.y - g.start.y,
      );
      ctx.globalAlpha = 1;
      ctx.strokeRect(
        g.start.x,
        g.start.y,
        g.end.x - g.start.x,
        g.end.y - g.start.y,
      );
    }
    const drawingCursor =
      editor.pointerInside &&
      editor.tool !== "select" &&
      editor.gesture?.kind !== "pan";
    const target = drawingCursor
      ? editor.cursor
      : editor.gesture &&
          ["move", "scale", "vertex"].includes(editor.gesture.kind)
        ? editor.snapTarget
        : null;
    if (target) {
      const p = target;
      ctx.strokeStyle = color("preview");
      ctx.lineWidth = 1 / z;
      ctx.beginPath();
      ctx.moveTo(p.x - 6 / z, p.y);
      ctx.lineTo(p.x - 2 / z, p.y);
      ctx.moveTo(p.x + 2 / z, p.y);
      ctx.lineTo(p.x + 6 / z, p.y);
      ctx.moveTo(p.x, p.y - 6 / z);
      ctx.lineTo(p.x, p.y - 2 / z);
      ctx.moveTo(p.x, p.y + 2 / z);
      ctx.lineTo(p.x, p.y + 6 / z);
      ctx.stroke();
      ctx.fillStyle = color("preview");
      ctx.fillRect(p.x - 0.5 / z, p.y - 0.5 / z, 1 / z, 1 / z);
    }
    ctx.restore();
    if (target && editor.snapTarget && editor.snapKind) {
      const point = editor.screen(target);
      ctx.fillStyle = color("preview");
      ctx.font = "11px system-ui";
      ctx.strokeStyle = color("preview");
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x = point.x + 14,
        y = point.y - 14;
      if (editor.snapKind === "center" || editor.snapKind === "quadrant")
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
      else if (editor.snapKind === "vertex") {
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x + 3, y);
        ctx.lineTo(x, y + 3);
        ctx.lineTo(x - 3, y);
        ctx.closePath();
      } else if (editor.snapKind === "midpoint") {
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x + 3, y + 3);
        ctx.lineTo(x - 3, y + 3);
        ctx.closePath();
      } else {
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x + 3, y);
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x, y + 3);
      }
      ctx.stroke();
      const axes = snappedAxes(target);
      ctx.beginPath();
      if (axes.includes("X axis")) {
        ctx.moveTo(point.x - 10, point.y);
        ctx.lineTo(point.x + 10, point.y);
      }
      if (axes.includes("Y axis")) {
        ctx.moveTo(point.x, point.y - 10);
        ctx.lineTo(point.x, point.y + 10);
      }
      ctx.stroke();
      ctx.fillText(
        (editor.snapKind === "vertex"
          ? "Endpoint / vertex"
          : editor.snapKind[0].toUpperCase() + editor.snapKind.slice(1)) +
          (axes.length ? ` · ${axes.join(" + ")}` : ""),
        point.x + 22,
        point.y - 10,
      );
    }
    ctx.font = "11px system-ui";
    ctx.fillStyle = color("muted");
    ctx.fillText(
      `${editor.gridSize} mm grid${spacing !== editor.gridSize ? ` · shown every ${spacing} mm` : ""}`,
      editor.rulers ? 30 : 14,
      h - 10,
    );
    if (g && (g.kind === "rotate" || g.kind === "scale")) {
      const point = editor.screen(g.end),
        text =
          g.kind === "scale"
            ? `${((g.factor ?? 1) * 100).toFixed(1)}%`
            : editor.message.replace("Rotation ", "");
      const width = ctx.measureText(text).width;
      ctx.fillStyle = color("panel");
      ctx.fillRect(point.x + 12, point.y - 24, width + 16, 23);
      ctx.fillStyle = color("accent");
      ctx.fillText(text, point.x + 20, point.y - 8);
    }
    if (editor.rulers) {
      ctx.fillStyle = color("panel");
      ctx.fillRect(0, 0, w, 22);
      ctx.fillRect(0, 0, 22, h);
      ctx.fillStyle = color("muted");
      ctx.strokeStyle = color("muted");
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = ((pan.x % step) + step) % step; x < w; x += step) {
        ctx.moveTo(x, 16);
        ctx.lineTo(x, 22);
        ctx.fillText((+((x - pan.x) / z).toFixed(1)).toString(), x + 3, 12);
      }
      for (let y = ((pan.y % step) + step) % step; y < h; y += step) {
        ctx.moveTo(16, y);
        ctx.lineTo(22, y);
        ctx.save();
        ctx.translate(11, y - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText((+((y - pan.y) / z).toFixed(1)).toString(), 0, 0);
        ctx.restore();
      }
      ctx.stroke();
    }
  }
  function loop() {
    if (dirty) {
      draw();
      dirty = false;
    }
    frame = requestAnimationFrame(loop);
  }
  loop();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    unsubscribe();
  };
}
