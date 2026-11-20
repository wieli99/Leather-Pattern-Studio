import type { Point } from "./project";
import type { Cubic } from "./curves";
export type SvgContour = { curves: Cubic[]; closed: boolean };
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (p: Point, n: number): Point => ({ x: p.x * n, y: p.y * n });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

/** SVG endpoint arcs, approximated in the destination's physical coordinate frame. */
export function svgArc(
  start: Point,
  end: Point,
  rx: number,
  ry: number,
  rotation: number,
  large: number,
  sweep: number,
  worldScale: number,
): Cubic[] {
  if (start.x === end.x && start.y === end.y) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry) return [[start, start, end, end]];
  const phi = (rotation * Math.PI) / 180,
    c = Math.cos(phi),
    s = Math.sin(phi);
  const dx = (start.x - end.x) / 2,
    dy = (start.y - end.y) / 2;
  const x = c * dx + s * dy,
    y = -s * dx + c * dy;
  const correction = Math.hypot(x / rx, y / ry);
  if (correction > 1) {
    rx *= correction;
    ry *= correction;
  }
  const factor =
    (large === sweep ? -1 : 1) *
    Math.sqrt(
      Math.max(
        0,
        (1 - (x / rx) ** 2 - (y / ry) ** 2) / ((x / rx) ** 2 + (y / ry) ** 2),
      ),
    );
  const cx = (factor * rx * y) / ry,
    cy = (-factor * ry * x) / rx;
  const center = {
    x: c * cx - s * cy + (start.x + end.x) / 2,
    y: s * cx + c * cy + (start.y + end.y) / 2,
  };
  const a = Math.atan2((y - cy) / ry, (x - cx) / rx);
  let span = Math.atan2((-y - cy) / ry, (-x - cx) / rx) - a;
  if (sweep && span < 0) span += 2 * Math.PI;
  if (!sweep && span > 0) span -= 2 * Math.PI;
  // Conservative sixth-order bound for tangent-matched cubic circular arcs.
  const radius = Math.max(rx, ry) * worldScale;
  const step = Math.min(
    Math.PI / 4,
    Math.pow(0.001 / Math.max(radius, 0.001), 1 / 6),
  );
  const count = Math.max(1, Math.ceil(Math.abs(span) / step));
  if (!Number.isFinite(count) || count > 100000)
    throw Error("SVG exceeds geometry limits");
  const at = (t: number): Point => ({
    x: center.x + c * rx * Math.cos(t) - s * ry * Math.sin(t),
    y: center.y + s * rx * Math.cos(t) + c * ry * Math.sin(t),
  });
  const derivative = (t: number): Point => ({
    x: -c * rx * Math.sin(t) - s * ry * Math.cos(t),
    y: -s * rx * Math.sin(t) + c * ry * Math.cos(t),
  });
  return Array.from({ length: count }, (_, i) => {
    const t = a + (span * i) / count,
      u = a + (span * (i + 1)) / count,
      k = (4 / 3) * Math.tan((u - t) / 4);
    const p = i === 0 ? start : at(t),
      q = i === count - 1 ? end : at(u);
    return [
      p,
      add(p, scale(derivative(t), k)),
      sub(q, scale(derivative(u), k)),
      q,
    ];
  });
}

export function parseSvgPath(data: string, worldScale = 1): SvgContour[] {
  // A comma separates numeric arguments only. Commands and the ends of
  // the path cannot be adjacent to commas, even with intervening whitespace.
  if (/(?:^|[a-z,])\s*,|,\s*(?:[a-z]|$)/i.test(data))
    throw Error("Invalid SVG path separator");
  const tokens =
    data.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  if (
    data.replace(
      /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[a-zA-Z]|[\s,]/g,
      "",
    )
  )
    throw Error("Invalid SVG path");
  let i = 0,
    command = "",
    current: Point = { x: 0, y: 0 },
    start = current,
    previous = "",
    control = current;
  const contours: SvgContour[] = [];
  let contour: SvgContour | undefined;
  let curveCount = 0;
  const number = () => {
    const token = tokens[i++];
    if (!token || /^[a-z]$/i.test(token) || !Number.isFinite(Number(token)))
      throw Error("Invalid SVG path number");
    return Number(token);
  };
  const curve = (c: Cubic) => {
    if (!contour) throw Error("SVG path must begin with moveto");
    current = c[3];
    if (++curveCount > 100000) throw Error("SVG exceeds geometry limits");
    if (c.some(point => point.x !== current.x || point.y !== current.y))
      contour.curves.push(c);
  };
  const line = (p: Point) => curve([current, current, p, p]);
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
    if (!command) throw Error("Invalid SVG path command");
    const op = command.toUpperCase(),
      relative = command !== op,
      origin = current;
    const point = (): Point =>
      add({ x: number(), y: number() }, relative ? origin : { x: 0, y: 0 });
    const reflected = () => add(current, sub(current, control));
    if (contour?.closed && op !== "M" && op !== "Z") {
      start = current;
      contour = { curves: [], closed: false };
      contours.push(contour);
    }
    if (op === "M") {
      current = point();
      start = current;
      contour = { curves: [], closed: false };
      contours.push(contour);
      command = relative ? "l" : "L";
    } else if (op === "Z") {
      if (!contour) throw Error("Invalid SVG closepath");
      if (current.x !== start.x || current.y !== start.y) line(start);
      contour.closed = true;
      current = start;
      command = "";
    } else if (op === "L") line(point());
    else if (op === "H")
      line({ x: number() + (relative ? origin.x : 0), y: origin.y });
    else if (op === "V")
      line({ x: origin.x, y: number() + (relative ? origin.y : 0) });
    else if (op === "C" || op === "S") {
      const a =
        op === "C"
          ? point()
          : ["C", "S"].includes(previous)
            ? reflected()
            : current;
      const b = point(),
        p = point();
      curve([current, a, b, p]);
      control = b;
    } else if (op === "Q" || op === "T") {
      const q =
        op === "Q"
          ? point()
          : ["Q", "T"].includes(previous)
            ? reflected()
            : current;
      const p = point();
      curve([
        current,
        add(current, scale(sub(q, current), 2 / 3)),
        add(p, scale(sub(q, p), 2 / 3)),
        p,
      ]);
      control = q;
    } else if (op === "A") {
      const rx = number(),
        ry = number(),
        rotation = number();
      // Flags may be adjacent to one another or the following coordinate.
      const flag = () => {
        const token = tokens[i];
        if (!token || !/^[01]/.test(token)) throw Error("Invalid SVG arc flag");
        const n = Number(token[0]);
        if (token.length === 1) i++;
        else tokens[i] = token.slice(1);
        return n;
      };
      const large = flag(),
        sweep = flag(),
        p = point();
      for (const c of svgArc(
        current,
        p,
        rx,
        ry,
        rotation,
        large,
        sweep,
        worldScale,
      ))
        curve(c);
      current = p;
    } else throw Error("Unsupported SVG path command: " + command);
    previous = op;
  }
  return contours.filter((c) => c.curves.length);
}
