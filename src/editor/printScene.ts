import { flattenOutline } from "../model/flattenOutline";
import { holeAppearance, holeMark } from "../model/stitchLayers";
import { shapePath } from "./renderer";
import { bounds, shapeMatrix } from "../model/geometry";
import { isClosedShape } from "../model/closedShape";
import { measurementGeometry } from "../model/measurement";
import { indicatorGeometry, isIndicator } from "../model/indicators";
import { stitchGeometry } from "../model/stitchGeometry";
import { stitchMarks } from "../model/stitch";
import {
  printableSize,
  printStitchGroups,
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
    if (isClosedShape(shape) && !shape.stitchOnly) {
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
  for (const group of printStitchGroups(doc, layout, sourceId)) {
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
    result += geometry.holes.map(({ point, angle }, index) => {
      const appearance = holeAppearance(group,index), mark = holeMark(appearance);
      const w = mark.width, h = mark.height;
      return `<g transform="translate(${xy(point)}) rotate(${n(((angle + (group.settings.reversed ? -mark.angle : mark.angle)) * 180) / Math.PI)})" fill="#111111">${appearance.style === "round" ? `<circle r="${w / 2}"/>` : appearance.style === "japanese" ? `<path d="M${-w / 2} 0 L0 ${-h / 2} L${w / 2} 0 L0 ${h / 2}Z"/>` : `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}"/>`}</g>`;
    }).join("");
  }
  return result;
}
export function orderedPrintPages(layout: PrintLayout) {
  return [...layout.pages].sort((a, b) => a.row - b.row || a.column - b.column);
}
const assemblyTolerance = 1e-7;
function polygonInterior(points: Point[], p: Point) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j],
      b = points[i];
    const vx = b.x - a.x,
      vy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1),
      ),
    );
    if (Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy) <= assemblyTolerance)
      return false;
    if (
      (a.y > p.y) !== (b.y > p.y) &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
/** Inclusive segment/rectangle intersection, including a notch wholly inside the box. */
function segmentTouchesRectangle(
  a: Point,
  b: Point,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  let enter = 0,
    leave = 1;
  for (const [start, delta, low, high] of [
    [a.x, b.x - a.x, left, right],
    [a.y, b.y - a.y, top, bottom],
  ]) {
    if (Math.abs(delta) <= assemblyTolerance) {
      if (start < low - assemblyTolerance || start > high + assemblyTolerance)
        return false;
    } else {
      const t1 = (low - assemblyTolerance - start) / delta,
        t2 = (high + assemblyTolerance - start) / delta;
      enter = Math.max(enter, Math.min(t1, t2));
      leave = Math.min(leave, Math.max(t1, t2));
      if (enter > leave) return false;
    }
  }
  return true;
}
export function pageSvg(
  doc: Doc,
  layout: PrintLayout,
  page: PrintPage,
  decorationsOnly = false,
  resolved = resolvedPrintItems(doc, layout),
): string {
  const size = printableSize(layout),
    x = page.column * size.width,
    y = page.row * size.height;
  const items = resolved.filter((i) => !i.hidden);
  const artwork = decorationsOnly
    ? ""
    : items
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
    const neighbour = { column: page.column + dx, row: page.row + dy };
    const pages = orderedPrintPages(layout);
    const pageNumber = (p: PrintPage) =>
      pages.findIndex((q) => q.column === p.column && q.row === p.row) + 1;
    const pair = [pageNumber(page), pageNumber(neighbour)]
      .sort((a, b) => a - b)
      .join("–");
    const length = dx ? size.height : size.width;
    const origin = {
      x: layout.margin + (dx > 0 ? size.width : 0),
      y: layout.margin + (dy > 0 ? size.height : 0),
    };
    const at = (along: number, outward: number): Point => ({
      x: origin.x + (dx ? dx * outward : along),
      y: origin.y + (dy ? dy * outward : along),
    });
    marks += `<path data-assembly="trim" d="${lines([[at(0, 0), at(length, 0)]])}" stroke="#555" stroke-width=".15" stroke-dasharray="2 2" fill="none"/>`;
    let connector = 0;
    for (const item of items) {
      if (!isClosedShape(item.shape) || item.shape.stitchOnly) continue;
      const { points } = flattenOutline(item.shape, 0.01);
      const hits: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        const av = dx ? a.x : a.y,
          bv = dx ? b.x : b.y;
        if ((av <= edge && bv > edge) || (bv <= edge && av > edge)) {
          const t = (edge - av) / (bv - av);
          hits.push(dx ? a.y + t * (b.y - a.y) - y : a.x + t * (b.x - a.x) - x);
        }
      }
      hits.sort((a, b) => a - b);
      for (let i = 0; i + 1 < hits.length; i += 2) {
        const start = Math.max(0, hits[i]),
          end = Math.min(length, hits[i + 1]);
        const radius = Math.min(2, (end - start) / 4);
        if (radius < 0.5) continue;
        const along = (start + end) / 2;
        const worldCentre = dx
          ? { x: edge, y: y + along }
          : { x: x + along, y: edge };
        const offset = assemblyTolerance * 10;
        if (
          ![-1, 1].every((sign) =>
            polygonInterior(points, {
              x: worldCentre.x + (dx ? sign * offset : 0),
              y: worldCentre.y + (dy ? sign * offset : 0),
            }),
          )
        )
          continue;
        // Both pages derive the same diamond; the paper clip retains one half.
        const polygon = [
          at(along - radius, 0),
          at(along, -radius),
          at(along + radius, 0),
        ];
        const clipId = `assembly-${dx}-${dy}-${connector}`;
        const localOutline = points.map((p) => ({
          x: p.x - x + layout.margin,
          y: p.y - y + layout.margin,
        }));
        marks += `<defs><clipPath id="${clipId}"><path d="M${localOutline.map(xy).join(" L")}Z"/></clipPath></defs><path data-assembly="registration" clip-path="url(#${clipId})" d="M${polygon.map(xy).join(" L")}Z" stroke="#111" stroke-width=".2" fill="none"/>`;
        const key = `${pair} ${++connector}`;
        const width = key.length * 1.2;
        // Leave 1 mm between the diamond tip and the nearest label edge.
        // Vertical joins need half the text width; horizontal joins need half its height.
        const centre = at(along, -(radius + 1 + (dx ? width / 2 : 1.5)));
        // Only label generous interior spans; check the complete label rectangle.
        const corners = [-1, 1].flatMap((u) =>
          [-1, 1].map((v) => ({
            x: centre.x + (u * width) / 2,
            y: centre.y + v * 1.5,
          })),
        );
        const worldCorners = corners.map((p) => ({
          x: p.x - layout.margin + x,
          y: p.y - layout.margin + y,
        }));
        const left = worldCorners[0].x,
          top = worldCorners[0].y;
        const right = worldCorners[3].x,
          bottom = worldCorners[3].y;
        const boundaryTouchesLabel = points.some((p, i) =>
          segmentTouchesRectangle(
            p,
            points[(i + 1) % points.length],
            left,
            top,
            right,
            bottom,
          ),
        );
        if (
          !boundaryTouchesLabel &&
          corners.every(
            (p) =>
              p.x >= layout.margin &&
              p.x <= layout.width - layout.margin &&
              p.y >= layout.margin &&
              p.y <= layout.height - layout.margin &&
              polygonInterior(points, {
                x: p.x - layout.margin + x,
                y: p.y - layout.margin + y,
              }),
          )
        )
          marks += `<g data-assembly="label" fill="#111">${label(key, centre, 0, 2)}</g>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}"><rect width="${layout.width}" height="${layout.height}" fill="${decorationsOnly ? "none" : "white"}"/><defs><clipPath id="paper-clip"><rect x="${layout.margin}" y="${layout.margin}" width="${size.width}" height="${size.height}"/></clipPath></defs><g clip-path="url(#paper-clip)"><g transform="translate(${n(layout.margin - x)} ${n(layout.margin - y)})">${artwork}</g></g><g clip-path="url(#paper-clip)">${marks}</g></svg>`;
}
