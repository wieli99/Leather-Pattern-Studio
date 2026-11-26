import { createId } from "../model/id";
import { isSvgCssValue, prepareSvgXml, rejectSvgGeometryCss, svgClassStyles, svgCondition, svgDeclarations, svgSwitchBranch, truncateSvgName } from "./svgImportCompatibility";
import paper from "paper/dist/paper-core";
import {
  parseProject,
  DOCUMENT_VERSION,
  type Shape,
  type Point,
} from "../model/project";
import { reconcileObjectTree, type ObjectNode } from "../model/objectTree";
import type { DetectedStitchRun } from "../model/detectSvgStitches";
import type { StitchGroup } from "../model/stitchGeometry";
import type { Affine } from "../generated/Affine";
import type { Cubic } from "../model/curves";
import { bounds, applyMatrix } from "../model/geometry";
import { parseSvgPath, svgArc, type SvgContour } from "../model/svgPath";

export type VectorImport = {
  shapes: Shape[];
  stitchGroups?: StitchGroup[];
  stitchExcludedIds?: ReadonlySet<string>;
  tree: ObjectNode[];
  warnings: string[];
  width: number;
  height: number;
  bounds: ReturnType<typeof bounds>;
};
const identity: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const scope = new paper.PaperScope();
const maxSegments = 100000;
function hasNonCollinearControls(contour: Cubic[]): boolean {
  const origin = contour[0][0];
  let direction: Point | undefined;
  for (const curve of contour) for (const point of curve) {
    const offset = { x: point.x - origin.x, y: point.y - origin.y };
    if (!direction) {
      if (offset.x || offset.y) direction = offset;
    } else if (direction.x * offset.y !== direction.y * offset.x) {
      return true;
    }
  }
  return false;
}

/** SVG fills implicitly close every subpath, even when its stroke remains open. */
function resolveSvgFill(contours: Cubic[][], evenOdd: boolean): Cubic[][] {
  const candidates = contours.filter(hasNonCollinearControls);
  if (!candidates.length) return [];
  if (candidates.reduce((total, contour) => total + contour.length, 0) > 5000)
    throw Error("SVG fill exceeds normalization limits (5000 segments)");
  scope.activate();
  scope.setup(new scope.Size(1, 1));
  try {
    const input = new scope.CompoundPath({ insert: false, fillRule: evenOdd ? "evenodd" : "nonzero" });
    for (const contour of candidates) {
      const path = new scope.Path({ insert: false });
      path.moveTo(new scope.Point(contour[0][0]));
      for (const [, b, c, d] of contour)
        path.cubicCurveTo(new scope.Point(b), new scope.Point(c), new scope.Point(d));
      path.closePath();
      input.addChild(path);
    }
    // Paper's self-union can discard part of a fill when different contours share an edge.
    if (candidates.length > 1) input.getIntersections(input, (location: paper.CurveLocation) => {
      if (location.hasOverlap() && location.path !== location.intersection.path &&
          !location.path.compare(location.intersection.path))
        throw Error("Editable SVG cannot reliably resolve a fill with partially shared contour edges. Combine the fill boundaries in the source artwork or choose Import as image.");
      return false;
    });
    const output = input.unite(input, { insert: false });
    const paths = output instanceof scope.CompoundPath
      ? output.children as paper.Path[]
      : [output as paper.Path];
    return paths.filter(path => path.curves.length && path.area !== 0).map(path =>
      path.curves.map(curve => [
        curve.point1, curve.point1.add(curve.handle1),
        curve.point2.add(curve.handle2), curve.point2,
      ].map(({ x, y }) => ({ x, y })) as Cubic),
    );
  } finally {
    scope.project.remove();
  }
}

function multiply(a: Affine, b: Affine): Affine {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e,
    f: a.b * b.e + a.d * b.f + a.f,
  };
}
const finite = (n: number) => {
  if (!Number.isFinite(n)) throw Error("Invalid SVG geometry");
  return n;
};
const scalar = (value: string) => {
  if (!/^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?$/i.test(value.trim()))
    throw Error("Invalid SVG number: " + value);
  return finite(Number(value));
};
function numbers(value: string) {
  const tokens =
    value.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) ?? [];
  if (value.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?|[\s,]/gi, ""))
    throw Error("Invalid SVG number list");
  return tokens.map(scalar);
}
function transform(value: string | null): Affine {
  let result = identity,
    end = 0;
  for (const match of (value ?? "").matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    if ((value ?? "").slice(end, match.index).replace(/[\s,]/g, ""))
      throw Error("Invalid SVG transform");
    end = match.index! + match[0].length;
    const v = numbers(match[2]);
    let m = { ...identity };
    switch (match[1]) {
      case "matrix":
        if (v.length !== 6) throw Error("Invalid matrix");
        m = { a: v[0], b: v[1], c: v[2], d: v[3], e: v[4], f: v[5] };
        break;
      case "translate":
        if (v.length < 1 || v.length > 2) throw Error("Invalid translate");
        m.e = v[0];
        m.f = v[1] ?? 0;
        break;
      case "scale":
        if (v.length < 1 || v.length > 2) throw Error("Invalid scale");
        m.a = v[0];
        m.d = v[1] ?? v[0];
        break;
      case "rotate": {
        if (v.length !== 1 && v.length !== 3) throw Error("Invalid rotate");
        const a = (v[0] * Math.PI) / 180,
          c = Math.cos(a),
          s = Math.sin(a),
          x = v[1] ?? 0,
          y = v[2] ?? 0;
        m = {
          a: c,
          b: s,
          c: -s,
          d: c,
          e: x - c * x + s * y,
          f: y - s * x - c * y,
        };
        break;
      }
      case "skewX":
      case "skewY":
        if (v.length !== 1) throw Error("Invalid skew");
        m[match[1] === "skewX" ? "c" : "b"] = Math.tan((v[0] * Math.PI) / 180);
        break;
      default:
        throw Error("Unsupported SVG transform");
    }
    result = multiply(result, m);
  }
  if ((value ?? "").slice(end).trim()) throw Error("Invalid SVG transform");
  Object.values(result).forEach(finite);
  return result;
}
const units: Record<string, number> = {
  mm: 96 / 25.4,
  cm: 960 / 25.4,
  in: 96,
  pt: 96 / 72,
  pc: 16,
  px: 1,
};
function length(value: string, fallback?: number): number {
  if (!value.trim() && fallback !== undefined) return fallback;
  const match =
    /^\s*([-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(
      value,
    );
  if (!match) throw Error("Unresolved SVG length: " + value);
  return finite(Number(match[1]) * units[match[2]?.toLowerCase() ?? "px"]);
}
const supported = new Set([
  "svg",
  "g",
  "switch",
  "path",
  "line",
  "polyline",
  "polygon",
  "rect",
  "circle",
  "ellipse",
]);
const presentation = new Set([
  "fill",
  "stroke",
  "stroke-width",
  "fill-rule",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "display",
  "visibility",
  "color",
]);
type Style = Record<string, string>;
const initialStyle: Style = {
  fill: "black", stroke: "none", "stroke-width": "1", "fill-rule": "nonzero",
  opacity: "1", "fill-opacity": "1", "stroke-opacity": "1",
  display: "inline", visibility: "visible", color: "black",
  "clip-path": "none", mask: "none", filter: "none",
};
const nonInherited = new Set(["display", "opacity", "clip-path", "mask", "filter"]);
const paintKeywords = new Set(["none", "contents", "currentcolor", "nonzero", "evenodd", "inline", "hidden", "visible", "collapse"]);
function resolveSvgValue(key: string, raw: string | null, inherited: Style): string {
  const value = raw?.trim();
  const keyword = value?.toLowerCase();
  const fallback = nonInherited.has(key) ? initialStyle[key] : inherited[key];
  if (keyword === "revert-layer" || (value && /\\|\b(?:var|env)\s*\(/i.test(value)))
    throw Error(`Editable SVG cannot resolve ${key}: ${value}. Simplify the style or choose Import as image.`);
  if (keyword === "inherit" || (key === "color" && keyword === "currentcolor")) return inherited[key];
  if (keyword === "initial") return initialStyle[key];
  if (!value || keyword === "unset" || keyword === "revert") return fallback;
  return keyword && paintKeywords.has(keyword) ? keyword : value;
}

/** Parse inert XML; source markup is never rendered or handed to a resource-loading importer. */
export function parseVectorSvg(text: string): VectorImport {
  if (new TextEncoder().encode(text).length > 10 * 1024 * 1024)
    throw Error("SVG exceeds 10 MiB");
  text = prepareSvgXml(text);
  const xml = new DOMParser().parseFromString(text, "image/svg+xml"),
    root = xml.documentElement;
  if (root.localName !== "svg" || xml.querySelector("parsererror"))
    throw Error("Invalid SVG");
  const warnings = new Map<string, number>();
  const warn = (s: string) => warnings.set(s, (warnings.get(s) ?? 0) + 1);
  if (/<\?xml-stylesheet/i.test(text))
    warn("External stylesheets are unsupported and were not loaded.");
  if (root.hasAttribute("transform-origin") || root.querySelector("[transform-origin]"))
    throw Error("Editable SVG cannot apply the transform-origin attribute. Remove it after baking the transform into the artwork or choose Import as image.");
  rejectSvgGeometryCss(root.getAttribute("style") ?? "");
  for (const element of root.querySelectorAll("[style]"))
    rejectSvgGeometryCss(element.getAttribute("style")!);
  const styleProperties = new Set([...presentation, "clip-path", "mask", "filter"]);
  const classStyle = svgClassStyles(root, styleProperties, warn);
  const vb = root.hasAttribute("viewBox")
    ? numbers(root.getAttribute("viewBox")!)
    : undefined;
  if (vb && (vb.length !== 4 || vb[2] <= 0 || vb[3] <= 0))
    throw Error("Invalid SVG viewBox");
  const widthAttribute = root.getAttribute("width"),
    heightAttribute = root.getAttribute("height");
  let w = length(widthAttribute ?? "", vb?.[2] ?? 300),
    h = length(heightAttribute ?? "", vb?.[3] ?? 150);
  if (vb && widthAttribute && !heightAttribute) h = (w * vb[3]) / vb[2];
  if (vb && heightAttribute && !widthAttribute) w = (h * vb[2]) / vb[3];
  if (w <= 0 || h <= 0) throw Error("Invalid SVG dimensions");
  if (
    !root.hasAttribute("width") ||
    !root.hasAttribute("height") ||
    [root.getAttribute("width"), root.getAttribute("height")].some(
      (v) =>
        (v && !/[a-z]/i.test(v.replace(/e[-+]?\d+/i, ""))) || v?.endsWith("px"),
    )
  )
    warn(
      "Pixel and unitless dimensions use 96 pixels per inch. Missing dimensions are inferred from the viewBox or default viewport; verify a known dimension.",
    );
  const pixelsToMm = { ...identity, a: 25.4 / 96, d: 25.4 / 96 };
  let viewport = identity;
  if (vb) {
    let sx = w / vb[2],
      sy = h / vb[3],
      dx = 0,
      dy = 0;
    const aspect = (
      root.getAttribute("preserveAspectRatio") ?? "xMidYMid meet"
    ).trim();
    if (!/^none(?:\s+(?:meet|slice))?$/.test(aspect)) {
      const match =
        /^(xMin|xMid|xMax)(YMin|YMid|YMax)(?:\s+(meet|slice))?$/.exec(aspect);
      if (!match) throw Error("Invalid preserveAspectRatio");
      sx = sy = match[3] === "slice" ? Math.max(sx, sy) : Math.min(sx, sy);
      dx =
        (w - vb[2] * sx) *
        (match[1] === "xMin" ? 0 : match[1] === "xMid" ? 0.5 : 1);
      dy =
        (h - vb[3] * sy) *
        (match[2] === "YMin" ? 0 : match[2] === "YMid" ? 0.5 : 1);
      if (match[3] === "slice")
        warn(
          "Viewport clipping is not applied; all supported outlines are imported.",
        );
    }
    viewport = {
      a: sx,
      b: 0,
      c: 0,
      d: sy,
      e: dx - vb[0] * sx,
      f: dy - vb[1] * sy,
    };
  }
  const shapes: Shape[] = [],
    tree: ObjectNode[] = [];
  const stitchExcludedIds = new Set<string>();
  let segmentCount = 0,
    objectCount = 0;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  const colors = new Map<string, { hex: string; alpha: number } | undefined>();
  const color = (value: string): { hex: string; alpha: number } | undefined => {
    if (value === "none") return undefined;
    if (colors.has(value)) return colors.get(value);
    if (
      /url\s*\(|var\s*\(|env\s*\(|currentcolor|inherit|initial|unset|revert/i.test(
        value,
      ) ||
      !CSS.supports("color", value)
    )
      return undefined;
    // Canvas silently leaves fillStyle unchanged when it rejects an assignment.
    ctx.fillStyle = "#010203";
    const first = ctx.fillStyle;
    ctx.fillStyle = value;
    if (ctx.fillStyle === first) {
      ctx.fillStyle = "#040506";
      const second = ctx.fillStyle;
      ctx.fillStyle = value;
      if (ctx.fillStyle === second) {
        colors.set(value, undefined);
        return undefined;
      }
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    const result = {
      hex:
        "#" +
        [...pixel.slice(0, 3)]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join(""),
      alpha: pixel[3] / 255,
    };
    colors.set(value, result);
    return result;
  };
  const opacity = (property: string, s: string) => {
    if (s.includes("(") && CSS.supports(property, s))
      throw Error(`Editable SVG cannot apply a CSS expression for ${property}. Use a number or percentage or choose Import as image.`);
    return Math.max(
      0,
      Math.min(1, s.endsWith("%") ? scalar(s.slice(0, -1)) / 100 : scalar(s)),
    );
  };
  const paintValue = (value: string, currentColor: string) => {
    const reference = /^url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)"']*))\s*\)\s*(.*)$/is.exec(value);
    if (reference) {
      const resource = reference[1] ?? reference[2] ?? reference[3];
      const server = resource.startsWith("#") ? xml.getElementById(resource.slice(1)) : null;
      if (!server || server.namespaceURI !== "http://www.w3.org/2000/svg" ||
          !["linearGradient", "radialGradient", "pattern"].includes(server.localName))
        value = reference[4].trim() || "none";
    }
    if (value.toLowerCase() === "currentcolor") value = currentColor;
    const keyword = value.toLowerCase();
    return ["none", "context-fill", "context-stroke"].includes(keyword) ? "none" : value;
  };
  const visit = (
    el: Element,
    parent: Affine,
    inherited: Style,
    alpha: number,
    children: ObjectNode[],
    depth: number,
  ) => {
    if (depth > 100) throw Error("SVG nesting exceeds 100 levels");
    if (++objectCount > 100000) throw Error("SVG exceeds element limits");
    const tag = el.localName,
      label =
        el.getAttribute("inkscape:label") ||
        el.getAttribute("aria-label") ||
        el.id;
    const safeLabel = label ? truncateSvgName(label.trim()) : undefined;
    const describe = tag + (label ? " “" + label + "”" : "");
    if (["defs", "title", "desc", "metadata", "style"].includes(tag)) return;
    if (el.namespaceURI && el.namespaceURI !== "http://www.w3.org/2000/svg") {
      warn("Omitted foreign element " + describe);
      return;
    }
    const active = svgCondition(el);
    if (active !== true) {
      if (active === undefined) warn("Omitted " + describe + " with an unsupported rendering condition");
      return;
    }
    const declarations = classStyle(el);
    const inline = svgDeclarations(el.getAttribute("style") ?? "", styleProperties,
      () => warn("Unsupported inline style on " + describe));
    for (const [key, declaration] of inline) {
      if (!declarations.get(key)?.important || declaration.important)
        declarations.set(key, declaration);
    }
    const style: Style = {};
    for (const key of styleProperties) {
      const attribute = el.getAttribute(key)?.trim();
      const validAttribute = attribute && isSvgCssValue(key, attribute) ? attribute : null;
      style[key] = resolveSvgValue(key, declarations.get(key)?.value ?? validAttribute, inherited);
    }
    const container = tag === "g" || tag === "svg" || tag === "switch";
    if (style.display === "none" || (style.display === "contents" && !container)) return;
    if (
      ["hidden", "collapse"].includes(style.visibility) &&
      !container
    )
      return;
    if (!supported.has(tag) || (tag === "svg" && depth > 0)) {
      warn("Omitted unsupported " + describe);
      return;
    }
    const contentsGroup = tag === "g" && style.display === "contents";
    if (
      !contentsGroup && ["clip-path", "mask", "filter"].some(key => style[key] !== "none")
    ) {
      warn("Omitted " + describe + " with clipping, masking, or filters");
      return;
    }
    for (const attribute of el.attributes) {
      if (
        [
          "marker-start",
          "marker-mid",
          "marker-end",
          "stroke-dasharray",
          "stroke-linecap",
          "stroke-linejoin",
          "vector-effect",
        ].includes(attribute.localName)
      )
        warn("Unsupported " + attribute.localName + " on " + describe);
    }
    const local = contentsGroup ? identity : transform(el.getAttribute("transform"));
    const matrix = depth === 0
      ? multiply(pixelsToMm, multiply(local, viewport))
      : multiply(parent, local);
    const worldScale = Math.hypot(matrix.a, matrix.b, matrix.c, matrix.d);
    const computedOpacity = contentsGroup ? 1 : opacity("opacity", style.opacity);
    const effectiveAlpha = alpha * computedOpacity;
    if (effectiveAlpha === 0) return;
    if (container) {
      if (!contentsGroup && effectiveAlpha < 1)
        warn("Group opacity flattened to individual outlines on " + describe);
      const nodes: ObjectNode[] = [];
      const active = tag === "switch" ? svgSwitchBranch(el, warn) : undefined;
      if (tag === "switch" && !active) return;
      for (const child of active ? [active] : el.children)
        visit(
          child,
          matrix,
          contentsGroup ? style : { ...style, opacity: String(computedOpacity) },
          effectiveAlpha,
          nodes,
          depth + 1,
        );
      if (tag === "svg") children.push(...nodes);
      else if (nodes.length)
        children.push({
          kind: "group",
          id: createId(),
          name: safeLabel || "Imported group",
          children: nodes,
        });
      return;
    }
    // Only the composed transform of a drawable element determines whether it renders.
    const scaleX = Math.hypot(matrix.a, matrix.b);
    const scaleY = Math.hypot(matrix.c, matrix.d);
    if (!scaleX || !scaleY ||
        (matrix.a / scaleX) * (matrix.d / scaleY) === (matrix.b / scaleX) * (matrix.c / scaleY)) {
      warn("Omitted collapsed " + describe);
      return;
    }
    const n = (key: string, fallback = 0) =>
      length(el.getAttribute(key) ?? "", fallback);
    const radius = (key: string) => {
      const value = el.getAttribute(key)?.trim();
      return value == null || value.toLowerCase() === "auto" ? undefined : length(value);
    };
    let contours: SvgContour[] = [];
    const line = (a: Point, b: Point): Cubic => [a, a, b, b];
    if (tag === "path")
      contours = parseSvgPath(el.getAttribute("d") ?? "", worldScale);
    else if (tag === "line")
      contours = [
        {
          closed: false,
          curves: [
            line({ x: n("x1"), y: n("y1") }, { x: n("x2"), y: n("y2") }),
          ],
        },
      ];
    else if (tag === "polygon" || tag === "polyline") {
      const values = numbers(el.getAttribute("points") ?? "");
      if (values.length % 2) throw Error("Invalid SVG points");
      if (values.length > 200000) throw Error("SVG exceeds geometry limits");
      const points = Array.from({ length: values.length / 2 }, (_, i) => ({
        x: values[i * 2],
        y: values[i * 2 + 1],
      }));
      if (tag === "polygon" && points.length) points.push(points[0]);
      contours = [
        {
          closed: tag === "polygon",
          curves: points.slice(1).map((p, i) => line(points[i], p)),
        },
      ];
    } else if (tag === "circle" || tag === "ellipse") {
      const cx = n("cx"), cy = n("cy");
      const x = tag === "circle" ? n("r") : radius("rx");
      const y = tag === "circle" ? x : radius("ry");
      const rx = x ?? y ?? 0, ry = y ?? x ?? 0;
      if (rx < 0 || ry < 0) throw Error("Negative SVG radius");
      if (rx && ry)
        contours = [
          {
            closed: true,
            curves: [
              ...svgArc(
                { x: cx + rx, y: cy },
                { x: cx - rx, y: cy },
                rx,
                ry,
                0,
                0,
                1,
                worldScale,
              ),
              ...svgArc(
                { x: cx - rx, y: cy },
                { x: cx + rx, y: cy },
                rx,
                ry,
                0,
                0,
                1,
                worldScale,
              ),
            ],
          },
        ];
    } else if (tag === "rect") {
      const x = n("x"),
        y = n("y"),
        width = n("width"),
        height = n("height");
      if (width < 0 || height < 0)
        throw Error("Negative SVG rectangle dimensions");
      const xRadius = radius("rx"), yRadius = radius("ry");
      const rx = Math.min(width / 2, xRadius ?? yRadius ?? 0);
      const ry = Math.min(height / 2, yRadius ?? xRadius ?? 0);
      if (rx < 0 || ry < 0) throw Error("Negative SVG radius");
      if (width && height) {
        if (rx && ry)
          contours = parseSvgPath(
            `M ${x + rx} ${y} H ${x + width - rx} A ${rx} ${ry} 0 0 1 ${x + width} ${y + ry} V ${y + height - ry} A ${rx} ${ry} 0 0 1 ${x + width - rx} ${y + height} H ${x + rx} A ${rx} ${ry} 0 0 1 ${x} ${y + height - ry} V ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`,
            worldScale,
          );
        else
          contours = parseSvgPath(
            `M${x} ${y}h${width}v${height}h${-width}Z`,
            worldScale,
          );
      }
    }
    segmentCount += contours.reduce((sum, c) => sum + c.curves.length, 0);
    if (segmentCount > maxSegments) throw Error("SVG exceeds geometry limits");
    contours = contours
      .filter((c) => c.curves.length)
      .map((c) => ({
        ...c,
        curves: c.curves.map(
          (curve) =>
            curve.map((p) => {
              const q = applyMatrix(matrix, p);
              finite(q.x);
              finite(q.y);
              return q;
            }) as Cubic,
        ),
      }));
    const fillValue = paintValue(style.fill, style.color),
      strokeValue = paintValue(style.stroke, style.color);
    const fill = color(fillValue),
      stroke = color(strokeValue);

    const strokeCoverage = strokeValue === "none" || stroke?.alpha === 0
      ? 0 : effectiveAlpha * opacity("stroke-opacity", style["stroke-opacity"]);
    const strokeWidth = strokeCoverage > 0
      ? length(style["stroke-width"]) * Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c))
      : 0;
    if (strokeWidth < 0) throw Error("Negative SVG stroke width");
    if (
      stroke && strokeWidth > 0 &&
      (Math.abs(scaleX - scaleY) > 1e-8 * Math.max(scaleX, scaleY) ||
        Math.abs((matrix.a / scaleX) * (matrix.c / scaleY) +
          (matrix.b / scaleX) * (matrix.d / scaleY)) > 1e-8)
    )
      warn("Nonuniform stroke scaling approximated on " + describe);
    const fillAlpha = fillValue === "none" || tag === "line" ? 0 : effectiveAlpha * opacity("fill-opacity", style["fill-opacity"]);
    const strokeAlpha = strokeWidth === 0 ? 0 : strokeCoverage;
    const fillOpacity = (fill?.alpha ?? 0) * fillAlpha;
    const sourceStrokeOpacity = (stroke?.alpha ?? 0) * strokeAlpha;
    if (!stroke && strokeAlpha > 0)
      warn("Unsupported stroke on " + describe + "; imported as outlines");
    if (effectiveAlpha < 1 && fillOpacity > 0 && sourceStrokeOpacity > 0)
      warn("Opacity may appear stronger where fill and stroke overlap on " + describe);
    const synthesizedStroke = Math.max(fill ? 0 : fillAlpha, stroke ? 0 : strokeAlpha);
    const appearance = {
      fillColor: fill?.hex,
      fillOpacity,
      strokeColor: sourceStrokeOpacity > 0 ? stroke?.hex : undefined,
      strokeOpacity: sourceStrokeOpacity || synthesizedStroke,
      strokeWidth: sourceStrokeOpacity > 0 ? strokeWidth : synthesizedStroke ? 0.35 : undefined,
    };
    const sourceClosed = contours.filter(c => c.closed).map(c => c.curves);
    const open = contours.filter(c => !c.closed);
    const evenOdd = style["fill-rule"] === "evenodd";
    const openStrokeOpacity = sourceStrokeOpacity || (stroke ? 0 : strokeAlpha);
    const fillCoverage = fill ? fillOpacity : fillAlpha;
    const singleOpenFallback = contours.length === 1 && open.length === 1 && !openStrokeOpacity;
    const normalizeFill = (!singleOpenFallback && open.some(c => hasNonCollinearControls(c.curves))) ||
      (!evenOdd && sourceClosed.length > 1) ||
      (!sourceStrokeOpacity && sourceClosed.length > 0 && (evenOdd || tag === "path" || tag === "polygon"));
    let closed = sourceClosed;
    if (normalizeFill && (fillOpacity > 0 || (!openStrokeOpacity && fillCoverage > 0))) {
      closed = resolveSvgFill(contours.map(c => c.curves), evenOdd);
      warn("Normalized " + (evenOdd ? "even-odd" : "nonzero") + " compound fill boundaries on " + describe);
    }
    const openFallback = singleOpenFallback && fillCoverage > 0 &&
      resolveSvgFill([open[0].curves], evenOdd).length > 0;
    if (!fill && fillAlpha > 0 && (closed.length || openFallback || openStrokeOpacity > 0))
      warn("Unsupported fill on " + describe + "; imported as outlines");
    if (openFallback) {
      warn("Open path fills become unfilled outlines on " + describe + "; paths remain open");
    }
    const withLinearHandles = (curves: Cubic[]): Cubic[] => curves.map(curve => {
      const [a, b, c, d] = curve;
      if (a.x !== b.x || a.y !== b.y || c.x !== d.x || c.y !== d.y) return curve;
      const dx = (d.x - a.x) / 3, dy = (d.y - a.y) / 3;
      return [a, { x: a.x + dx, y: a.y + dy }, { x: d.x - dx, y: d.y - dy }, d];
    });
    const make = (curves: Cubic[], compound?: Cubic[][], closedPath = true,
      paint: Partial<Shape> = {}, target = children, suffix = "") => {
      if (!curves.length) return;
      curves = withLinearHandles(curves);
      if (compound) compound = compound.map(withLinearHandles);
      const first = curves[0][0],
        last = curves.at(-1)![3];
      if (
        !closedPath &&
        Math.hypot(first.x - last.x, first.y - last.y) < 1e-9
      ) {
        warn("Omitted open subpath with coincident endpoints on " + describe);
        return;
      }
      const points = [first, ...curves.map((c) => c[3])];
      if (
        closedPath &&
        !compound &&
        points.every((p) => p.x === first.x && p.y === first.y)
      )
        compound = [curves];
      const shape: Shape = {
        id: createId(),
        name: truncateSvgName(safeLabel || "Imported " + tag, 200 - suffix.length) + suffix,
        kind: compound ? "compound" : "control-curve",
        radius: 0,
        rotation: 0,
        points,
        handles: compound
          ? undefined
          : points.map((p, i) => ({
              incoming: i
                ? { x: curves[i - 1][2].x - p.x, y: curves[i - 1][2].y - p.y }
                : { x: 0, y: 0 },
              outgoing:
                i < curves.length
                  ? { x: curves[i][1].x - p.x, y: curves[i][1].y - p.y }
                  : { x: 0, y: 0 },
            })),
        contours: compound,
        ...appearance,
        ...paint,
      };
      if (!closedPath) {
        shape.fillOpacity = 0;
        // The stored path stays open. Only a painted fill can supply a fallback stroke.
        const fallbackOpacity = openFallback ? fillCoverage : 0;
        shape.strokeColor = sourceStrokeOpacity > 0 ? stroke?.hex : fallbackOpacity > 0 ? fill?.hex : undefined;
        shape.strokeOpacity = openStrokeOpacity || fallbackOpacity;
        shape.strokeWidth = sourceStrokeOpacity > 0 ? strokeWidth : shape.strokeOpacity ? 0.35 : undefined;
      }
      if (!shape.fillOpacity && !shape.strokeOpacity) {
        warn("Omitted unpainted " + describe);
        return;
      }
      const count = compound
        ? compound.reduce((n, c) => n + c.length, 0)
        : curves.length + 1;
      if (count > 10000)
        throw Error(
          "SVG outline exceeds document limit (10000 points or segments)",
        );
      if (compound) {
        const b = bounds([shape]);
        shape.points = [
          { x: b.x, y: b.y },
          { x: b.x + b.width, y: b.y + b.height },
        ];
      }
      if (
        shape.points.every(
          (p) => p.x === shape.points[0].x && p.y === shape.points[0].y,
        )
      ) {
        warn("Omitted zero-size " + describe);
        return;
      }
      if (shapes.length >= 10000) throw Error("SVG exceeds object limits");
      shapes.push(shape);
      target.push({ kind: "object", id: shape.id });
      if (suffix || (synthesizedStroke && !fillOpacity && !sourceStrokeOpacity))
        stitchExcludedIds.add(shape.id);
    };
    if (closed !== sourceClosed && openStrokeOpacity > 0) {
      const layers: ObjectNode[] = [];
      if (closed.length) make(closed[0], closed, true, { strokeOpacity: 0, excludeFromDxf: true }, layers, " (fill)");
      if (sourceClosed.length)
        make(sourceClosed[0], sourceClosed, true, { fillOpacity: 0 }, layers, " (stroke)");
      for (const contour of open) make(contour.curves, undefined, false, {}, layers);
      if (layers.length) children.push({
        kind: "group", id: createId(), name: safeLabel || "Imported " + tag, children: layers,
      });
    } else {
      if (closed.length > 1) make(closed[0], closed);
      else if (closed.length) make(closed[0], style["fill-rule"] === "evenodd" ? [closed[0]] : undefined);
      if (openStrokeOpacity || openFallback)
        for (const contour of open) make(contour.curves, undefined, false);
    }
  };
  visit(
    root,
    identity,
    initialStyle,
    1,
    tree,
    0,
  );
  const reverse = (nodes: ObjectNode[]) => {
    nodes.reverse();
    for (const node of nodes) if (node.kind === "group") reverse(node.children);
  };
  // Each group adds an object and a children array to serde_json's nesting budget.
  // Leave one of Rust's 62 supported project groups for the import wrapper.
  const verifyDepth = (nodes: readonly ObjectNode[], parentDepth: number) => {
    for (const node of nodes) {
      if (node.kind !== "group") continue;
      if (parentDepth >= 62)
        throw Error("Editable SVG exceeds 61 nested groups. Reduce the SVG group nesting or choose Import as image.");
      verifyDepth(node.children, parentDepth + 1);
    }
  };
  verifyDepth(tree, 1);
  reverse(tree);
  parseProject(
    JSON.stringify({ version: DOCUMENT_VERSION, shapes, objectTree: tree }),
  );
  return {
    shapes,
    tree,
    stitchExcludedIds,
    warnings: [...warnings].map(
      ([message, count]) =>
        message + (count > 1 ? ` (${count} occurrences)` : ""),
    ),
    width: (w * 25.4) / 96,
    height: (h * 25.4) / 96,
    bounds: shapes.length
      ? bounds(shapes)
      : { x: 0, y: 0, width: 0, height: 0 },
  };
}

/** Replace accepted marks in their source group, retaining any unconverted contours. */
export function applyDetectedStitches(result: VectorImport, runs: DetectedStitchRun[]): VectorImport {
  if (!runs.length) return result;
  const byMark = new Map(runs.flatMap(run => run.sourceIds.map(id => [id, run] as const)));
  const byCompound = new Map<string, { indices: Set<number>; runs: DetectedStitchRun[] }>();
  for (const run of runs) {
    if (!run.sourceContours) continue;
    const { shapeId, indices } = run.sourceContours;
    let entry = byCompound.get(shapeId);
    if (!entry) {
      entry = { indices: new Set(), runs: [] };
      byCompound.set(shapeId, entry);
    }
    for (const index of indices) entry.indices.add(index);
    entry.runs.push(run);
  }
  const shapes = result.shapes.flatMap(shape => {
    if (byMark.has(shape.id)) return [];
    const entry = byCompound.get(shape.id);
    if (!entry) return [shape];
    const contours = shape.contours!.filter((_, index) => !entry.indices.has(index));
    if (!contours.length) return [];
    const remaining = { ...shape, contours };
    const box = bounds([remaining]);
    return [{ ...remaining, points: [
      { x: box.x, y: box.y }, { x: box.x + box.width, y: box.y + box.height },
    ] }];
  });
  const retained = new Set(shapes.map(shape => shape.id));
  const inserted = new Set<string>();
  const object = (id: string): ObjectNode => ({ kind: "object", id });
  const replace = (nodes: ObjectNode[]): ObjectNode[] => nodes.flatMap<ObjectNode>(node => {
    if (node.kind === "group") {
      const children = replace(node.children);
      return children.length ? [{ ...node, children }] : [];
    }
    const compound = byCompound.get(node.id);
    if (compound) return [
      ...(retained.has(node.id) ? [node] : []),
      ...compound.runs.map(run => object(run.shape.id)),
    ];
    const run = byMark.get(node.id);
    if (!run) return [node];
    if (inserted.has(run.shape.id)) return [];
    inserted.add(run.shape.id);
    return [object(run.shape.id)];
  });
  shapes.push(...runs.map(run => run.shape));
  return {
    ...result, shapes, tree: reconcileObjectTree(replace(result.tree), shapes),
    stitchGroups: runs.map(run => run.group),
  };
}
