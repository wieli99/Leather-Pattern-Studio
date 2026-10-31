import { isIndicator, indicatorGeometry } from "../model/indicators";
import { measurementGeometry } from "../model/measurement";
import { isClosedShape } from "../model/closedShape";
import { drawStitches } from "./stitchRenderer";
import { isCurve, cubicSegments } from "../model/curves";
import { snappedAxes } from "./snapping";
import type { Controller } from "./controller";
import {
  bounds,
  shapeMatrix,
  applyMatrix,
  isPolygon,
  polygonFillets,
} from "../model/geometry";
import type { Shape } from "../model/project";
export function shapePath(ctx: CanvasRenderingContext2D | Path2D, s: Shape) {
  const a = s.points[0],
    b = s.points[s.points.length - 1];
  if ("beginPath" in ctx) ctx.beginPath();
  if (isIndicator(s.kind)) return;
  if (isCurve(s)) {
    ctx.moveTo(a.x, a.y);
    for (const [, c1, c2, end] of cubicSegments(s))
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
  } else if ((isPolygon(s) && s.radius > 0) || s.cornerRadii) {
    const corners = polygonFillets(s).corners;
    ctx.moveTo(corners.at(-1)!.end.x, corners.at(-1)!.end.y);
    for (const c of corners) {
      ctx.lineTo(c.start.x, c.start.y);
      if (c.radius)
        ctx.arc(
          c.center.x,
          c.center.y,
          c.radius,
          c.angle,
          c.angle + c.span,
          c.span < 0,
        );
    }
    ctx.closePath();
  } else if (s.kind === "arc") {
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
  const images = new Map<string, HTMLImageElement>();
  const svgRasters = new Map<string, { canvas: HTMLCanvasElement; width: number; height: number }>();
  const unsubscribe = editor.subscribe(() => {
    dirty = true;
  });
  const observer = new ResizeObserver(() => {
    dirty = true;
  });
  observer.observe(canvas);
  function draw() {
    const sources = new Set((editor.preview ?? editor.document).shapes.map(s => s.image));
    for (const source of images.keys()) if (!sources.has(source)) { images.delete(source); svgRasters.delete(source); }
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
      gridFactor = editor.units === "mm" ? 10 : 2,
      spacing =
        editor.gridSize *
        Math.max(
          1,
          Math.pow(gridFactor, Math.ceil(Math.log(18 / (z * editor.gridSize)) / Math.log(gridFactor))),
        ),
      step = spacing * z;
    const rulerStep = editor.units === "mm" ? step : 25.4 * Math.pow(2, Math.ceil(Math.log2(60 / (z * 25.4)))) * z;
    ctx.fillStyle = color("grid");
    ctx.strokeStyle = color("grid");
    ctx.lineWidth = 0.5;
    if (editor.gridStyle === "dots") {
      ctx.fillStyle = color("grid-dot");
      for (let x = ((pan.x % step) + step) % step; x < w; x += step)
        for (let y = ((pan.y % step) + step) % step; y < h; y += step)
          ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
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
      if (s.id === editor.editingTextId) return;
      ctx.save();
      if (s.kind === "image" && s.image) {
        let bitmap = images.get(s.image);
        if (!bitmap) {
          bitmap = new Image();
          bitmap.onload = () => { dirty = true; };
          bitmap.src = s.image;
          images.set(s.image, bitmap);
        }
        if (bitmap.complete && bitmap.naturalWidth) {
          const m = shapeMatrix(s), a = s.points[0], b = s.points[1];
          ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f);
          ctx.globalAlpha = s.fillOpacity ?? 1;
          let source: CanvasImageSource = bitmap;
          if (s.image.startsWith("data:image/svg+xml;")) {
            // Resolve the SVG viewport at its original aspect ratio first.
            // Drawing the resulting pixels cannot reapply SVG aspect fitting.
            const resolution = Math.max(
              Math.abs(b.x - a.x) * Math.hypot(m.a, m.b),
              Math.abs(b.y - a.y) * Math.hypot(m.c, m.d) * bitmap.naturalWidth / bitmap.naturalHeight,
            ) * z * dpr;
            const width = Math.max(1, Math.min(4096, Math.ceil(resolution)));
            const height = Math.max(1, Math.min(4096, Math.ceil(width * bitmap.naturalHeight / bitmap.naturalWidth)));
            let raster = svgRasters.get(s.image);
            if (!raster || raster.width !== width || raster.height !== height) {
              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
              raster = { canvas, width, height };
              svgRasters.set(s.image, raster);
            }
            source = raster.canvas;
          }
          ctx.drawImage(source, a.x, a.y, b.x - a.x, b.y - a.y);
          if (editor.selected.includes(s.id) || editor.hover === s.id) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = color("accent");
            ctx.lineWidth = 1/editor.zoom;
            ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
          }
        }
        ctx.restore();
        return;
      }
      const primitive = new Path2D();
      shapePath(primitive, s);
      const path = new Path2D(),
        m = shapeMatrix(s);
      path.addPath(primitive, new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]));
      const selected = editor.selected.includes(s.id);
      ctx.lineWidth = s.strokeWidth ?? 0.35;
      ctx.strokeStyle = preview
        ? color("preview")
        : selected
          ? color("accent")
          : editor.hover === s.id
            ? color("text")
            : color("shape");
      if (!selected && !preview && editor.hover !== s.id) {
        ctx.strokeStyle = s.strokeColor ?? color("shape");
        ctx.globalAlpha = s.strokeOpacity ?? 1;
      }
      if (isClosedShape(s)) {
        ctx.save();
        ctx.globalAlpha = s.fillOpacity ?? (selected ? 0.12 : 0.05);
        ctx.fillStyle = s.fillColor ?? (selected ? color("accent") : color("shape"));
        ctx.fill(path);
        ctx.restore();
        if (s.fillMode === "skiving" || s.fillMode === "glueing" || s.fillMode === "cutout") {
          ctx.save();
          ctx.clip(path);
          ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
          ctx.strokeStyle = s.strokeColor ?? color("shape");
          ctx.globalAlpha = s.strokeOpacity ?? 1;
          const box = bounds([{ ...s, transform: undefined, rotation: 0 }]);
          ctx.beginPath();
          if (s.fillMode === "skiving" || s.fillMode === "cutout") {
            const spacing = 4 * Math.SQRT2;
            for (let offset = -box.height; offset <= box.width; offset += spacing) {
              ctx.moveTo(box.x + offset, box.y + box.height);
              ctx.lineTo(box.x + offset + box.height, box.y);
              if (s.fillMode === "cutout") {
                ctx.moveTo(box.x + offset, box.y);
                ctx.lineTo(box.x + offset + box.height, box.y + box.height);
              }
            }
          } else {
            for (let y = box.y + 2; y <= box.y + box.height - 2; y += 4) {
              ctx.moveTo(box.x, y);
              for (let x = box.x; x < box.x + box.width; x += 3) {
                const amplitude = Math.round((x - box.x) / 3) % 2 ? -1.33 : 1.33;
                ctx.bezierCurveTo(x + 1, y + amplitude, x + 2, y + amplitude, x + 3, y);
              }
            }
          }
          ctx.stroke();
          ctx.restore();
        }
      }
      if (isIndicator(s.kind)) {
        const g = indicatorGeometry(s, editor.units);
        ctx.beginPath();
        if (s.kind === "arrow" || s.kind === "arrow-head") {
          ctx.lineCap = "round"; ctx.lineJoin = "round";
          const head = g.lines.slice(-2);
          if (s.kind === "arrow") { const [a,b]=g.lines[0]; ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y); }
          ctx.moveTo(head[0][0].x,head[0][0].y); ctx.lineTo(head[0][1].x,head[0][1].y);ctx.lineTo(head[1][1].x,head[1][1].y);
        } else if (s.kind === "size-square") {
          ctx.lineJoin = "round";
          ctx.moveTo(g.lines[0][0].x,g.lines[0][0].y);
          for (const [,b] of g.lines) ctx.lineTo(b.x,b.y);
          ctx.closePath();
        } else { ctx.lineCap = "round"; for (const [a,b] of g.lines) { ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); } }
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        for (const l of g.labels) {
          ctx.save(); ctx.translate(l.point.x,l.point.y); ctx.rotate(l.angle);
          ctx.font = `${l.fontSize}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(l.text,0,0); ctx.restore();
        }
      } else if (s.kind === "measurement") {
        const g = measurementGeometry(s, editor.units);
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
      } else if (s.kind === "text") {
        ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
        ctx.font = `${s.fontSize ?? 5}px sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillStyle = ctx.strokeStyle;
        (s.text ?? "")
          .split("\n")
          .forEach((line, i) =>
            ctx.fillText(
              line,
              s.points[0].x,
              s.points[0].y + i * (s.fontSize ?? 5) * 1.2,
            ),
          );
      } else if (!s.stitchOnly || selected || preview) ctx.stroke(path);
      ctx.restore();
    }
    (editor.preview ?? editor.document).shapes.filter(s => !editor.isHidden(s.id)).forEach((s) => shape(s));
    drawStitches(ctx,editor,color);
    if (editor.trimMode && editor.pointerInside && editor.trimHighlight) {
      const [a] = editor.trimHighlight;
      ctx.save();
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      for (const p of editor.trimHighlight.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = color("canvas");
      ctx.lineWidth = 9 / z;
      ctx.stroke();
      ctx.strokeStyle = "#f43f5e";
      ctx.lineWidth = 5 / z;
      ctx.stroke();
      ctx.restore();
    }
    if (editor.transformTool === "mirror") {
      const line = editor.mirrorLine;
      const p = line ? line[0] : editor.transformPivot;
      const angle = line ? Math.atan2(line[1].y-p.y, line[1].x-p.x)
        : (editor.transformAngle + ({x:0,y:90,positive:45,negative:-45}[editor.mirrorAxis ?? ""] ?? 0))*Math.PI/180;
      ctx.save();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1 / z;
      ctx.setLineDash([4/z, 4/z]);
      for (const degrees of [0, 90, 45, -45]) {
        const a = (degrees + editor.transformAngle) * Math.PI / 180;
        const origin = editor.transformPivot;
        ctx.beginPath();
        ctx.moveTo(origin.x-Math.cos(a)*10000,origin.y-Math.sin(a)*10000);
        ctx.lineTo(origin.x+Math.cos(a)*10000,origin.y+Math.sin(a)*10000);
        ctx.stroke();
      }
      if (editor.mirrorAxis) {
        ctx.beginPath();
        ctx.moveTo(p.x-Math.cos(angle)*10000,p.y-Math.sin(angle)*10000);
        ctx.lineTo(p.x+Math.cos(angle)*10000,p.y+Math.sin(angle)*10000);
        ctx.strokeStyle = "#f43f5e";
        ctx.lineWidth = 1.5/z;
        ctx.setLineDash([6/z,4/z]);
        ctx.stroke();
      }
      const hover = editor.pointerInside && !editor.space && !editor.placingPivot ? editor.mirrorHover : null;
      if (hover) {
        const [a,b] = hover.line;
        const scale = hover.axis === "edge" ? 1 : 10000;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(hover.axis === "edge" ? a.x : a.x-(b.x-a.x)*scale, hover.axis === "edge" ? a.y : a.y-(b.y-a.y)*scale);
        ctx.lineTo(a.x+(b.x-a.x)*scale,a.y+(b.y-a.y)*scale);
        ctx.strokeStyle = color("canvas"); ctx.lineWidth = 7/z; ctx.stroke();
        ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 4/z; ctx.stroke();
      }
      ctx.restore();
    }
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
    function handleGuides(s: Shape) {
      if (!s.handles) return;
      const m = shapeMatrix(s);
      ctx.strokeStyle = color("accent");
      ctx.lineWidth = 1 / z;
      s.points.forEach((p, i) => {
        const a = applyMatrix(m, p);
        for (const v of [s.handles![i].incoming, s.handles![i].outgoing]) {
          if (Math.hypot(v.x, v.y) < 1e-9) continue;
          const b = applyMatrix(m, { x: p.x + v.x, y: p.y + v.y });
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(b.x, b.y, 3 / z, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
    }
    const anchorIndicator = editor.anchorIndicator;
    if (anchorIndicator) {
      const p = anchorIndicator;
      ctx.strokeStyle = color("accent");
      ctx.fillStyle = color("canvas");
      ctx.lineWidth = 1.5 / z;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 / z, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 3 / z, p.y);
      ctx.lineTo(p.x + 3 / z, p.y);
      ctx.moveTo(p.x, p.y - 3 / z);
      ctx.lineTo(p.x, p.y + 3 / z);
      ctx.stroke();
    }
    if (construction) handleGuides(construction);
    if (editor.tool === "select" && editor.active.length === 1)
      handleGuides(editor.active[0]);
    for (const p of editor.pending) {
      ctx.fillStyle = color("preview");
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 / z, 0, Math.PI * 2);
      ctx.fill();
    }
    if (editor.active.length) {
      const b = bounds(editor.active, editor.units);
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
          hovered.vertex === handle.vertex &&
          hovered.handleSide === handle.handleSide
        )
          ctx.strokeStyle = ctx.fillStyle = color("text");
        ctx.lineWidth = 2 / z;
        if (handle.handleSide && editor.active.length === 1) {
          const s = editor.active[0];
          const a = applyMatrix(shapeMatrix(s), s.points[handle.vertex!]);
          ctx.lineWidth = 1 / z;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(handle.point.x, handle.point.y);
          ctx.stroke();
        }
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
        } else if (handle.handleSide || handle.kind === "corner")
          ctx.arc(handle.point.x, handle.point.y, 4 / z, 0, Math.PI * 2);
        else
          ctx.rect(
            handle.point.x - 5 / z,
            handle.point.y - 5 / z,
            10 / z,
            10 / z,
          );
        ctx.fill();
      }
      if (editor.transformTool && editor.transformTool !== "corner") {
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
    if ((editor.objects || editor.guideDrag) && editor.snapTarget) {
      ctx.save();
      ctx.strokeStyle = color("preview");
      ctx.lineWidth = 1 / z;
      for (const id of new Set(
        editor.smartGuides.map((guide) => guide.objectId),
      )) {
        const source = editor.document.shapes.find((s) => s.id === id);
        if (!source) continue;
        const primitive = new Path2D();
        shapePath(primitive, source);
        const path = new Path2D();
        const m = shapeMatrix(source);
        path.addPath(primitive, new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]));
        ctx.strokeStyle = color("canvas");
        ctx.lineWidth = 5 / z;
        ctx.stroke(path);
        ctx.strokeStyle = color("preview");
        ctx.lineWidth = 2 / z;
        ctx.stroke(path);
      }
      ctx.lineWidth = 1 / z;
      ctx.setLineDash([4 / z, 4 / z]);
      for (const guide of editor.smartGuides) {
        ctx.beginPath();
        if (guide.axis === "x") {
          ctx.moveTo(guide.coordinate, guide.bounds.y);
          ctx.lineTo(guide.coordinate, guide.bounds.y + guide.bounds.height);
        } else {
          ctx.moveTo(guide.bounds.x, guide.coordinate);
          ctx.lineTo(guide.bounds.x + guide.bounds.width, guide.coordinate);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (target) {
      const p = target;
      ctx.strokeStyle = color("preview");
      ctx.lineWidth = 1 / z;
      ctx.beginPath();
      if (drawingCursor && editor.tool === "text") {
        // Match the initial 5 mm text line (1.2 line height), centered on placement.
        ctx.moveTo(p.x, p.y - 3);
        ctx.lineTo(p.x, p.y + 3);
        ctx.stroke();
      } else {
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
      const smartLabel = editor.objects
        ? editor.smartGuides
            .map((guide) => {
              const name =
                editor.document.shapes.find((s) => s.id === guide.objectId)
                  ?.name ?? "Object";
              return `${guide.alignment} · ${name}`;
            })
            .join(" / ")
        : "";
      const label =
        smartLabel ||
        (editor.snapKind === "vertex"
          ? "Endpoint / vertex"
          : editor.snapKind[0].toUpperCase() + editor.snapKind.slice(1)) +
          (axes.length ? ` · ${axes.join(" + ")}` : "");
      ctx.fillText(
        label,
        Math.max(
          4,
          Math.min(point.x + 22, w - ctx.measureText(label).width - 4),
        ),
        Math.max(14, Math.min(point.y - 10, h - 4)),
        Math.max(1, w - 8),
      );
    }
    ctx.font = "11px system-ui";
    ctx.fillStyle = color("muted");
    ctx.fillText(
      `${editor.formatLength(editor.gridSize)} ${editor.unitSymbol} grid${spacing !== editor.gridSize ? ` · shown every ${editor.formatLength(spacing)} ${editor.unitSymbol}` : ""}`,
      editor.rulers ? 30 : 14,
      h - 10,
    );
    if (
      g &&
      (g.kind === "rotate" || g.kind === "scale" || g.kind === "corner")
    ) {
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
    ctx.save();
    ctx.strokeStyle = color("accent");
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    for (const g of [
      ...((editor.pendingDocument ?? editor.document).guides ?? []).filter(
        (g) => g.id !== editor.guideDrag?.id,
      ),
      ...(editor.guideDrag ? [editor.guideDrag] : []),
    ]) {
      const p = g.coordinate * z + pan[g.axis];
      ctx.beginPath();
      ctx.moveTo(g.axis === "x" ? p : 0, g.axis === "y" ? p : 0);
      ctx.lineTo(g.axis === "x" ? p : w, g.axis === "y" ? p : h);
      ctx.stroke();
    }
    ctx.restore();
    if (editor.guideDrag) {
      const text = `${editor.formatLength(editor.guideDrag.coordinate)} ${editor.unitSymbol}${editor.guideSnapLabel ? " · " + editor.guideSnapLabel : ""}`;
      const point = editor.screen(editor.cursor);
      const width = ctx.measureText(text).width + 16;
      const left = Math.max(26, Math.min(w - width - 4, point.x + 14));
      const top = Math.max(26, Math.min(h - 28, point.y + 14));
      ctx.fillStyle = color("panel");
      ctx.fillRect(left, top, width, 24);
      ctx.fillStyle = color("accent");
      ctx.fillText(text, left + 8, top + 16);
    }
    if (editor.rulers) {
      ctx.fillStyle = color("panel");
      ctx.fillRect(0, 0, w, 22);
      ctx.fillRect(0, 0, 22, h);
      ctx.fillStyle = color("muted");
      ctx.strokeStyle = color("muted");
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = ((pan.x % rulerStep) + rulerStep) % rulerStep; x < w; x += rulerStep) {
        ctx.moveTo(x, 16);
        ctx.lineTo(x, 22);
        ctx.fillText(editor.formatLength((x - pan.x) / z), x + 3, 12);
      }
      for (let y = ((pan.y % rulerStep) + rulerStep) % rulerStep; y < h; y += rulerStep) {
        ctx.moveTo(16, y);
        ctx.lineTo(22, y);
        ctx.save();
        ctx.translate(11, y - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(editor.formatLength((y - pan.y) / z), 0, 0);
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
