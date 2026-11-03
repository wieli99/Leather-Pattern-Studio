import type { Point, Shape } from "../model/project";
import { zeroHandles } from "../model/curves";
import { distance } from "../model/geometry";
export const variants = {
  indicator: ["measurement", "size-square", "size-ruler", "arrow", "arrow-head", "crosshair"],
  polygon: ["polygon", "polygon-box"],
  polyline: ["polyline", "curve", "control-curve"],
  rectangle: ["rectangle", "rectangle-center", "rectangle-three"],
  circle: [
    "circle",
    "circle-two",
    "circle-three",
    "ellipse",
    "ellipse-center",
    "arc",
    "arc-three",
  ],
} as const;
export type Mode =
  | (typeof variants.polygon)[number]
  | (typeof variants.indicator)[number]
  | "text"
  | "measurement"
  | "select"
  | (typeof variants.polyline)[number]
  | (typeof variants.rectangle)[number]
  | (typeof variants.circle)[number];
export const labels: Record<Mode, string> = {
  arrow: "Arrow",
  "arrow-head": "Bodyless arrow",
  crosshair: "Crosshair",
  "size-square": "Square size guide",
  "size-ruler": "Ruler size guide",
  polygon: "Center polygon",
  "polygon-box": "Bounding-box polygon",
  curve: "Curve",
  "control-curve": "Control point curve",
  select: "Select",
  text: "Text",
  measurement: "Measurement",
  polyline: "Polyline",
  rectangle: "Corner rectangle",
  "rectangle-center": "Center rectangle",
  "rectangle-three": "Three-point rectangle",
  circle: "Center circle",
  "circle-two": "Diameter circle",
  "circle-three": "Three-point circle",
  ellipse: "Bounding-box ellipse",
  "ellipse-center": "Center ellipse",
  arc: "Center arc",
  "arc-three": "Three-point arc",
};
export const isCurveMode = (mode: string) =>
  mode === "curve" || mode === "control-curve";
export const pointCount = (mode: Mode) =>
  isCurveMode(mode)
    ? Infinity
    : [
          "measurement",
          "rectangle-three",
          "circle-three",
          "ellipse-center",
          "arc",
          "arc-three",
        ].includes(mode)
      ? 3
      : 2;
export function circumcenter(a: Point, b: Point, c: Point): Point {
  const x = b.x - a.x,
    y = b.y - a.y,
    u = c.x - a.x,
    v = c.y - a.y,
    d = 2 * (x * v - y * u);
  if (Math.abs(d) < 1e-9 * Math.max(1, Math.hypot(x, y) * Math.hypot(u, v)))
    throw Error("Choose three non-collinear points");
  return {
    x: a.x + (v * (x * x + y * y) - y * (u * u + v * v)) / d,
    y: a.y + (x * (u * u + v * v) - u * (x * x + y * y)) / d,
  };
}
export function construct(
  mode: Mode,
  points: Point[],
  sweep?: number,
  sides = 3,
): Shape {
  const [a, b, c] = points;
  let kind: Shape["kind"] = "polyline",
    out = points,
    rotation = 0;
  if (!a || !b) throw Error("Place another point");
  if (mode !== "measurement" && (variants.indicator as readonly string[]).includes(mode)) {
    if (distance(a,b) < 1e-9) throw Error("Indicator must have positive size");
    if (mode === "crosshair") {
      const radius = distance(a,b);
      return {id:"",name:"",kind:"crosshair",points:[a,{x:a.x+radius,y:a.y}],
        rotation:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI,radius:0};
    }
    const side = Math.max(Math.abs(b.x-a.x), Math.abs(b.y-a.y));
    return { id: "", name: "", kind: mode as Shape["kind"],
      points: [a, mode === "size-square" ? { x: a.x+(b.x<a.x?-side:side), y:a.y+(b.y<a.y?-side:side) } : b],
      rotation: 0, radius: 0,
      ...(["arrow", "arrow-head"].includes(mode) ? { headSize: 3 } : {}),
    };
  }
  if (mode === "measurement") {
    const len = distance(a, b);
    if (len < 1e-9) throw Error("Choose distinct measurement endpoints");
    return {
      id: "", name: "", kind: "measurement", points: [a, b], rotation: 0, radius: 0,
      measurementOffset: c
        ? ((c.x - a.x) * -(b.y - a.y) + (c.y - a.y) * (b.x - a.x)) / len
        : 0,
    };
  }
  if (mode === "polygon" || mode === "polygon-box") {
    const radius = distance(a, b);
    if (radius < 1e-9) throw Error("Shape must have positive size");
    const count = Math.max(3, Math.min(100, Math.round(sides)));
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    out = Array.from({ length: count }, (_, i) => ({
      x: a.x + radius * Math.cos(angle + (i * 2 * Math.PI) / count),
      y: a.y + radius * Math.sin(angle + (i * 2 * Math.PI) / count),
    }));
    if (mode === "polygon-box") {
      const width = Math.abs(b.x - a.x),
        height = Math.abs(b.y - a.y);
      if (width < 1e-9 || height < 1e-9)
        throw Error("Shape must have positive size");
      const unit = Array.from({ length: count }, (_, i) => ({
        x: Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / count),
        y: Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / count),
      }));
      const minX = Math.min(...unit.map((p) => p.x)),
        maxX = Math.max(...unit.map((p) => p.x)),
        minY = Math.min(...unit.map((p) => p.y)),
        maxY = Math.max(...unit.map((p) => p.y));
      out = unit.map((p) => ({
        x: Math.min(a.x, b.x) + ((p.x - minX) / (maxX - minX)) * width,
        y: Math.min(a.y, b.y) + ((p.y - minY) / (maxY - minY)) * height,
      }));
    }
    out.push({ ...out[0] });
  }
  if (isCurveMode(mode)) kind = mode as "curve" | "control-curve";
  if (mode === "rectangle" || mode === "ellipse") {
    kind = mode;
    out = [a, b];
  }
  if (mode === "rectangle-center") {
    kind = "rectangle";
    out = [{ x: 2 * a.x - b.x, y: 2 * a.y - b.y }, b];
  }
  if (mode === "rectangle-three" || mode === "ellipse-center") {
    if (!c) throw Error("Place the third point");
    const len = distance(a, b);
    if (len < 1e-9) throw Error("Shape must have positive size");
    const ux = (b.x - a.x) / len,
      uy = (b.y - a.y) / len,
      h = (c.x - a.x) * -uy + (c.y - a.y) * ux;
    rotation = (Math.atan2(uy, ux) * 180) / Math.PI;
    const center =
      mode === "rectangle-three"
        ? {
            x: (a.x + b.x) / 2 - (uy * h) / 2,
            y: (a.y + b.y) / 2 + (ux * h) / 2,
          }
        : a;
    const rx = mode === "rectangle-three" ? len / 2 : len,
      ry = mode === "rectangle-three" ? Math.abs(h) / 2 : Math.abs(h);
    kind = mode === "rectangle-three" ? "rectangle" : "ellipse";
    out = [
      { x: center.x - rx, y: center.y - ry },
      { x: center.x + rx, y: center.y + ry },
    ];
  }
  if (mode === "circle") {
    kind = "circle";
    out = [a, b];
  }
  if (mode === "circle-two") {
    kind = "circle";
    out = [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b];
  }
  if (mode === "circle-three") {
    kind = "circle";
    out = [circumcenter(a, b, c), a];
  }
  if (mode === "arc" || mode === "arc-three") {
    kind = "arc";
    const center = mode === "arc" ? a : circumcenter(a, b, c),
      start = mode === "arc" ? b : a,
      end = mode === "arc" ? c : b;
    const angle = (p: Point) =>
      (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;
    const positive = (n: number) => ((n % 360) + 360) % 360;
    let span = positive(angle(end) - angle(start));
    if (mode === "arc-three" && positive(angle(c) - angle(start)) > span)
      span -= 360;
    if (mode === "arc") span = sweep ?? span;
    out = [center, start];
    return {
      id: "",
      name: "",
      kind,
      points: out,
      rotation,
      radius: 0,
      sweep: span,
    };
  }
  return {
    id: "",
    name: "",
    kind,
    points: out,
    rotation,
    radius: 0,
    ...(kind === "control-curve" ? { handles: out.map(zeroHandles) } : {}),
  };
}

/** Transient guides; never become document geometry. */
export function constructionGuides(mode: Mode, pending: Point[], cursor: Point): Shape[] {
  if (!["rectangle-three", "circle-three"].includes(mode) || !pending.length)
    return [];
  const a = pending[0], b = pending[1] ?? cursor;
  const line: Shape = {
    id: "", name: "", kind: "polyline", points: [a, b], radius: 0, rotation: 0,
  };
  if (mode === "circle-three")
    return pending.length === 1 && distance(a, b) > 1e-9
      ? [construct("circle-two", [a, b])]
      : [];
  return [line];
}
