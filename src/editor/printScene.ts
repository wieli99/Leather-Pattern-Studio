import { shapePath } from "./renderer";
import { bounds, shapeMatrix } from "../model/geometry";
import { isClosedShape } from "../model/closedShape";
import { measurementGeometry } from "../model/measurement";
import { indicatorGeometry, isIndicator } from "../model/indicators";
import { stitchGeometry } from "../model/stitchGeometry";
import { stitchMarks } from "../model/stitch";
import {
  printableSize,
  resolvedPrintItems,
  printArtworkBounds,
  printItemIntersects,
  type PrintLayout,
  type PrintPage,
} from "../model/printLayout";
import type { Doc, Point, Shape } from "../model/project";

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const n = (v: number) => Number(v.toFixed(8));
const xy = (p: Point) => `${n(p.x)} ${n(p.y)}`;
/** Canvas path recorder: share the editor's primitive/fillet/curve construction. */
export function svgShapePath(shape: Shape): string {
  const commands: string[] = [];
  let current: Point | undefined;
  const sink = {
    moveTo(x: number, y: number) {
      commands.push(`M${n(x)} ${n(y)}`);
      current = { x, y };
    },
    lineTo(x: number, y: number) {
      commands.push(`L${n(x)} ${n(y)}`);
      current = { x, y };
    },
    bezierCurveTo(
      a: number,
      b: number,
      c: number,
      d: number,
      x: number,
      y: number,
    ) {
      commands.push(`C${n(a)} ${n(b)} ${n(c)} ${n(d)} ${n(x)} ${n(y)}`);
      current = { x, y };
    },
    closePath() {
      commands.push("Z");
    },
    ellipse(
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      rotation: number,
      start: number,
      end: number,
      anticlockwise = false,
    ) {
      let span = end - start;
      if (Math.abs(span) >= Math.PI * 2)
        span = (anticlockwise ? -1 : 1) * Math.PI * 2;
      else if (anticlockwise && span > 0) span -= Math.PI * 2;
      else if (!anticlockwise && span < 0) span += Math.PI * 2;
      const at = (t: number) => ({
        x:
          cx +
          rx * Math.cos(t) * Math.cos(rotation) -
          ry * Math.sin(t) * Math.sin(rotation),
        y:
          cy +
          rx * Math.cos(t) * Math.sin(rotation) +
          ry * Math.sin(t) * Math.cos(rotation),
      });
      const p = at(start);
      if (!current) this.moveTo(p.x, p.y);
      else if (Math.hypot(current.x - p.x, current.y - p.y) > 1e-8)
        this.lineTo(p.x, p.y);
      const count = Math.max(1, Math.ceil(Math.abs(span) / Math.PI));
      for (let i = 1; i <= count; i++) {
        const p = at(start + (span * i) / count);
        commands.push(
          `A${n(rx)} ${n(ry)} ${n((rotation * 180) / Math.PI)} 0 ${span >= 0 ? 1 : 0} ${xy(p)}`,
        );
        current = p;
      }
    },
    arc(
      x: number,
      y: number,
      radius: number,
      start: number,
      end: number,
      anticlockwise = false,
    ) {
      this.ellipse(x, y, radius, radius, 0, start, end, anticlockwise);
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
  return commands.join(" ");
}
function label(
  text: string,
  point: Point,
  angle: number,
  size: number,
  centre = true,
) {
  // SVG and PDF use the bundled Liberation Sans face; text remains actual vector text.
  return `<text transform="translate(${xy(point)}) rotate(${n((angle * 180) / Math.PI)})" font-family="PrintSans" font-size="${n(size)}" ${centre ? 'text-anchor="middle"' : ""} y="${n(size * 0.35)}">${escape(text)}</text>`;
}
function lines(segments: [Point, Point][]) {
  return segments.map(([a, b]) => `M${xy(a)} L${xy(b)}`).join(" ");
}
export function printShapeSvg(
  doc: Doc,
  shape: Shape,
  sourceId: string,
  layout: PrintLayout,
): string {
  const m = shapeMatrix(shape),
    matrix = `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(n).join(" ")})`;
  const color = shape.strokeColor ?? "#111111",
    opacity = shape.strokeOpacity ?? 1;
  const style = `stroke="${color}" stroke-opacity="${opacity}" stroke-width="${shape.strokeWidth ?? 0.35}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  let result = "";
  if (isIndicator(shape.kind)) {
    const g = indicatorGeometry(shape, layout.units);
    result = `<path d="${lines(g.lines)}" ${style}/><g fill="${color}" fill-opacity="${opacity}">${g.labels.map((l) => label(l.text, l.point, l.angle, l.fontSize)).join("")}</g>`;
  } else if (shape.kind === "measurement") {
    const g = measurementGeometry(shape, layout.units);
    result = `<path d="${lines(g.lines)}" ${style}/><g fill="${color}" fill-opacity="${opacity}">${g.arrowheads.map((p) => `<path d="M${p.map(xy).join(" L")}Z"/>`).join("")}${label(g.label, g.middle, g.angle, g.fontSize)}</g>`;
  } else if (shape.kind === "text") {
    const size = shape.fontSize ?? 5;
    result = `<g transform="${matrix}" fill="${color}" fill-opacity="${opacity}">${(
      shape.text ?? ""
    )
      .split("\n")
      .map((line, i) =>
        label(
          line,
          {
            x: shape.points[0].x,
            y: shape.points[0].y + size * 0.65 + i * size * 1.2,
          },
          0,
          size,
          false,
        ),
      )
      .join("")}</g>`;
  } else if (shape.kind === "image") {
    const [a, b] = shape.points;
    result = `<image transform="${matrix}" x="${n(Math.min(a.x, b.x))}" y="${n(Math.min(a.y, b.y))}" width="${n(Math.abs(b.x - a.x))}" height="${n(Math.abs(b.y - a.y))}" opacity="${shape.fillOpacity ?? 1}" preserveAspectRatio="none" href="${escape(shape.image ?? "")}"/>`;
  } else {
    const path = svgShapePath(shape),
      id = `clip-${shape.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    let fill = "";
    if (isClosedShape(shape)) {
      fill = `<path d="${path}" fill="${shape.fillColor ?? "#111111"}" fill-opacity="${shape.fillOpacity ?? 0.05}"/>`;
      if (["skiving", "glueing", "cutout"].includes(shape.fillMode ?? "")) {
        const box = bounds([{ ...shape, rotation: 0, transform: undefined }]);
        if (box.width + box.height > 200000)
          throw Error("Patterned fill is too large to print");
        const hatch: string[] = [];
        if (shape.fillMode === "glueing") {
          for (let y = box.y + 2; y <= box.y + box.height - 2; y += 4) {
            hatch.push(`M${n(box.x)} ${n(y)}`);
            for (let x = box.x; x < box.x + box.width; x += 3) {
              const amp = Math.round((x - box.x) / 3) % 2 ? -1.33 : 1.33;
              hatch.push(
                `C${n(x + 1)} ${n(y + amp)} ${n(x + 2)} ${n(y + amp)} ${n(x + 3)} ${n(y)}`,
              );
            }
          }
        } else {
          for (
            let offset = -box.height;
            offset <= box.width;
            offset += 4 * Math.SQRT2
          ) {
            hatch.push(
              `M${n(box.x + offset)} ${n(box.y + box.height)} L${n(box.x + offset + box.height)} ${n(box.y)}`,
            );
            if (shape.fillMode === "cutout")
              hatch.push(
                `M${n(box.x + offset)} ${n(box.y)} L${n(box.x + offset + box.height)} ${n(box.y + box.height)}`,
              );
          }
        }
        fill += `<defs><clipPath id="${id}"><path d="${path}"/></clipPath></defs><path clip-path="url(#${id})" d="${hatch.join(" ")}" ${style}/>`;
      }
    }
    result = `<g transform="${matrix}">${fill}${shape.stitchOnly ? "" : `<path d="${path}" ${style}/>`}</g>`;
  }
  for (const group of (doc.stitchGroups ?? []).filter(
    (g) => g.shapeId === sourceId,
  )) {
    const geometry = stitchGeometry(shape, group),
      base = stitchMarks[group.settings.style];
    const scale =
      group.settings.style === "flat"
        ? (group.settings.flatLength ?? base.width) / base.width
        : 1;
    const w =
      group.settings.style === "round"
        ? (group.settings.roundDiameter ?? base.width)
        : base.width * scale;
    const h = base.height * scale;
    result += geometry.holes
      .map(
        ({ point, angle }) =>
          `<g transform="translate(${xy(point)}) rotate(${n(((angle + base.angle) * 180) / Math.PI)})" fill="#111111">${group.settings.style === "round" ? `<circle r="${w / 2}"/>` : group.settings.style === "japanese" ? `<path d="M${-w / 2} 0 L0 ${-h / 2} L${w / 2} 0 L0 ${h / 2}Z"/>` : `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}"/>`}</g>`,
      )
      .join("");
  }
  return result;
}
export function orderedPrintPages(layout: PrintLayout) {
  return [...layout.pages].sort((a, b) => a.row - b.row || a.column - b.column);
}
export function pageSvg(
  doc: Doc,
  layout: PrintLayout,
  page: PrintPage,
): string {
  const size = printableSize(layout),
    x = page.column * size.width,
    y = page.row * size.height;
  const items = resolvedPrintItems(doc, layout).filter((i) => !i.hidden);
  const artwork = items
    .map((i) => printShapeSvg(doc, i.shape, i.source.id, layout))
    .join("");
  let marks = "";
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    if (
      !layout.pages.some(
        (p) => p.column === page.column + dx && p.row === page.row + dy,
      )
    )
      continue;
    const edge = dx
      ? x + (dx > 0 ? size.width : 0)
      : y + (dy > 0 ? size.height : 0);
    const crossing = items.some((i) => {
      const b = printArtworkBounds(doc, layout, i);
      const region = dx
        ? { x: edge - 1e-6, y, width: 2e-6, height: size.height }
        : { x, y: edge - 1e-6, width: size.width, height: 2e-6 };
      if (!printItemIntersects(doc, layout, i, region)) return false;
      return dx
        ? b.x < edge - 1e-7 &&
            b.x + b.width > edge + 1e-7 &&
            b.y < y + size.height &&
            b.y + b.height > y
        : b.y < edge - 1e-7 &&
            b.y + b.height > edge + 1e-7 &&
            b.x < x + size.width &&
            b.x + b.width > x;
    });
    if (!crossing) continue;
    const px =
        layout.margin + (dx ? (dx > 0 ? size.width : 0) : size.width / 2),
      py = layout.margin + (dy ? (dy > 0 ? size.height : 0) : size.height / 2);
    const key = dx
      ? `V${Math.max(page.column, page.column + dx)},${page.row}`
      : `H${page.column},${Math.max(page.row, page.row + dy)}`;
    marks += `<g transform="translate(${n(px)} ${n(py)}) rotate(${dx > 0 ? 0 : dx < 0 ? 180 : dy > 0 ? 90 : -90})" stroke="#111" stroke-width=".3" fill="none"><path d="M1 -3 V3 M5 -2 L2 0 L5 2"/></g>`;
    if (layout.margin >= 3)
      marks += `<g fill="#111">${label(key, { x: px + (dx ? (dx * layout.margin) / 2 : 0), y: py + (dy ? (dy * layout.margin) / 2 : 4) }, dx ? Math.PI / 2 : 0, 2)}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}"><rect width="${layout.width}" height="${layout.height}" fill="white"/><defs><clipPath id="paper-clip"><rect x="${layout.margin}" y="${layout.margin}" width="${size.width}" height="${size.height}"/></clipPath></defs><g clip-path="url(#paper-clip)"><g transform="translate(${n(layout.margin - x)} ${n(layout.margin - y)})">${artwork}</g></g>${marks}</svg>`;
}
