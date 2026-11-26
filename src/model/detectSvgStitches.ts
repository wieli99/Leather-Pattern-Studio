import { createId } from "./id";
import type { ObjectNode } from "./objectTree";
import { contourShape } from "./compound";
import { cubicAt, cubicSegments } from "./curves";
import { bounds, distance } from "./geometry";
import type { Point, Shape } from "./project";
import { defaultStitchSettings, type StitchStyle } from "./stitch";
import {
  stitchEdges,
  stitchGeometry,
  type StitchGroup,
} from "./stitchGeometry";
import { holeMark } from "./stitchLayers";

type Mark = {
  id: string;
  center: Point;
  kind: "round" | "diamond" | "slot";
  width: number;
  height: number;
  angle: number;
};
export type DetectedStitchRun = {
  shape: Shape;
  group: StitchGroup;
  sourceIds: string[];
  sourceContours?: { shapeId: string; indices: number[] };
  holes: ReturnType<typeof stitchGeometry>["holes"];
};
const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x);
const midpoint = (a: Point, b: Point) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    (sorted[Math.floor((sorted.length - 1) / 2)] +
      sorted[Math.floor(sorted.length / 2)]) /
    2
  );
};
const axisDifference = (a: number, b: number) =>
  Math.acos(Math.min(1, Math.abs(Math.cos(a - b))));
const nearSize = (a: number, b: number) =>
  Math.abs(a - b) <= 0.2 * Math.min(a, b);

function classify(shape: Shape): Mark | undefined {
  if (
    shape.kind !== "control-curve" ||
    shape.points.length > 65 ||
    distance(shape.points[0], shape.points.at(-1)!) > 1e-8
  )
    return;
  const box = bounds([shape]);
  if (
    Math.max(box.width, box.height) > 6 ||
    Math.min(box.width, box.height) < 0.08
  )
    return;
  const curves = cubicSegments(shape).filter(([a, b, c, d]) =>
    [b, c, d].some((p) => distance(a, p) > 1e-8),
  );
  const samples = curves.flatMap((curve) =>
    [0, 0.25, 0.5, 0.75].map((t) => cubicAt(curve, t)),
  );
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const radius = (box.width + box.height) / 4;
  if (
    curves.length >= 4 &&
    samples.every((p) => Math.abs(distance(center, p) - radius) <= radius * 0.1)
  ) {
    return {
      id: shape.id,
      center,
      kind: "round",
      width: 2 * radius,
      height: 2 * radius,
      angle: 0,
    };
  }
  const straight = curves.filter(([a, b, c, d]) => {
    const length = distance(a, d);
    return (
      length > 1e-8 &&
      [b, c].every(
        (p) =>
          Math.abs((d.x - a.x) * (p.y - a.y) - (d.y - a.y) * (p.x - a.x)) <=
          length * 1e-7,
      )
    );
  });
  if (curves.length === 4 && straight.length === 4) {
    const [a, b, c, d] = curves.map((curve) => curve[0]);
    const ab = distance(a, b),
      bc = distance(b, c);
    if (distance(midpoint(a, c), midpoint(b, d)) > 0.05 * Math.min(ab, bc))
      return;
    const corner = axisDifference(angle(a, b), angle(b, c));
    if (Math.abs(corner - Math.PI / 2) < 0.12) {
      if (Math.max(ab, bc) < 2.5 * Math.min(ab, bc)) return;
      return {
        id: shape.id,
        center,
        kind: "slot",
        width: Math.max(ab, bc),
        height: Math.min(ab, bc),
        angle: ab >= bc ? angle(a, b) : angle(b, c),
      };
    }
    const ac = distance(a, c),
      bd = distance(b, d);
    if (
      Math.abs(axisDifference(angle(a, c), angle(b, d)) - Math.PI / 2) < 0.12 &&
      Math.max(ac, bd) >= 1.7 * Math.min(ac, bd)
    ) {
      return {
        id: shape.id,
        center,
        kind: "diamond",
        width: Math.max(ac, bd),
        height: Math.min(ac, bd),
        angle: ac >= bd ? angle(a, c) : angle(b, d),
      };
    }
  }
  // A rounded slot has two parallel long sides and symmetric ends.
  if (straight.length < 2 || curves.length > 20) return;
  const longest = (curve: (typeof curves)[number]) =>
    distance(curve[0], curve[3]);
  const [first, second] = [...straight].sort((a, b) => longest(b) - longest(a));
  const direction = angle(first[0], first[3]);
  if (
    !nearSize(longest(first), longest(second)) ||
    axisDifference(direction, angle(second[0], second[3])) > 0.1
  )
    return;
  const cos = Math.cos(direction),
    sin = Math.sin(direction);
  const along = samples.map(
    (p) => cos * (p.x - center.x) + sin * (p.y - center.y),
  );
  const across = samples.map(
    (p) => -sin * (p.x - center.x) + cos * (p.y - center.y),
  );
  const width = Math.max(...along) - Math.min(...along);
  const height = Math.max(...across) - Math.min(...across);
  if (
    width < 2.5 * height ||
    Math.abs(Math.max(...along) + Math.min(...along)) > 0.1 * width ||
    Math.abs(Math.max(...across) + Math.min(...across)) > 0.1 * height ||
    distance(midpoint(first[0], first[3]), midpoint(second[0], second[3])) <
      0.9 * height
  )
    return;
  return {
    id: shape.id,
    center,
    kind: "slot",
    width,
    height,
    angle: direction,
  };
}

function fitRun(marks: Mark[], closed: boolean, angular = false): DetectedStitchRun | undefined {
  const points = marks.map((mark) => mark.center);
  const ring = closed ? [...points, points[0]] : points;
  const gaps = ring.slice(1).map((p, i) => distance(ring[i], p));
  const pitch = median(gaps);
  if (gaps.some((gap) => Math.abs(gap - pitch) > 0.15 * pitch)) return;
  const last = points.at(-1)!;
  const direction = angle(points[0], last);
  const straight =
    !closed &&
    points.every(
      (p) =>
        Math.abs(
          Math.sin(direction) * (p.x - points[0].x) -
            Math.cos(direction) * (p.y - points[0].y),
        ) <= Math.min(0.1, pitch * 0.05),
    );
  if (marks.length === 3 && !straight) return;
  const shape: Shape = {
    id: createId(),
    name: "Detected stitching",
    stitchOnly: true,
    radius: 0,
    rotation: 0,
    kind: angular ? "polyline" : straight ? "line" : closed ? "control-curve" : "curve",
    points: straight && !angular ? [points[0], last] : ring,
  };
  if (closed && !angular)
    shape.handles = ring.map((_, index) => {
      const previous = points[(index + points.length - 1) % points.length];
      const next = points[(index + 1) % points.length];
      const outgoing = {
        x: (next.x - previous.x) / 6,
        y: (next.y - previous.y) / 6,
      };
      return { outgoing, incoming: { x: -outgoing.x, y: -outgoing.y } };
    });
  const edges = stitchEdges(shape);
  const length = edges.reduce(
    (sum, edge) =>
      sum +
      edge.points
        .slice(1)
        .reduce((total, p, i) => total + distance(edge.points[i], p), 0),
    0,
  );
  const width = median(marks.map((mark) => mark.width));
  const slot = marks[0].kind === "slot";
  const styles: StitchStyle[] = slot
    ? ["flat", "french"]
    : [marks[0].kind === "round" ? "round" : "japanese"];
  for (const style of styles)
    for (const reversed of style === "french" || style === "japanese"
      ? [false, true]
      : [false]) {
      const settings = {
        ...defaultStitchSettings,
        style,
        reversed,
        inset: 0,
        alignment: "start" as const,
        spacing: length / (closed ? points.length : points.length - 1),
        ...(style === "round"
          ? { roundDiameter: width }
          : style === "flat"
            ? { flatLength: width }
            : {}),
        ...(closed ? {} : { holeCount: points.length }),
      };
      const model = holeMark(settings);
      if (
        marks.some(
          (mark) =>
            !nearSize(mark.width, model.width) ||
            !nearSize(
              mark.height,
              style === "round" ? model.width : model.height,
            ),
        )
      )
        continue;
      const group: StitchGroup = {
        id: createId(),
        shapeId: shape.id,
        edges: edges.map((edge) => edge.key),
        side: 1,
        settings,
        closed,
      };
      try {
        const { holes } = stitchGeometry(shape, group);
        if (
          holes.length === marks.length &&
          holes.every(
            (hole, i) =>
              distance(hole.point, points[i]) <=
                Math.min(0.2, settings.spacing * 0.1) &&
              (style === "round" ||
                axisDifference(
                  hole.angle + model.angle * (reversed ? -1 : 1),
                  marks[i].angle,
                ) <=
                  Math.PI / 12),
          )
        )
          return {
            shape,
            group,
            holes,
            sourceIds: marks.map((mark) => mark.id),
          };
      } catch {
        // Invalid or self-intersecting fits leave the original marks intact.
      }
    }
}

type Detection = { runs: DetectedStitchRun[]; warning?: string };

export function detectSvgStitches(shapes: Shape[], tree: readonly ObjectNode[] = [],
  excludedIds: ReadonlySet<string> = new Set()): Detection {
  const parents = new Map<string, string | undefined>();
  const index = (nodes: readonly ObjectNode[], parent?: string) => {
    for (const node of nodes) {
      if (node.kind === "group") index(node.children, node.id);
      else parents.set(node.id, parent);
    }
  };
  index(tree);
  const standalone = new Map<string, Mark[]>();
  const compounds = new Map<string, Mark[]>();
  let candidates = 0;
  let overlapChecks = 0;
  for (const shape of shapes) {
    const filled = (shape.fillOpacity ?? 0) > 0;
    if (excludedIds.has(shape.id) || (!filled && !(shape.strokeOpacity && shape.strokeColor))) continue;
    if (shape.kind === "compound") {
      const contours = shape.contours!.map(contour => contourShape(shape, contour));
      const boxes = filled ? contours.map(contour => bounds([contour])) : [];
      const marks: Mark[] = [];
      for (const [index, contour] of contours.entries()) {
        const mark = classify({ ...contour, id: String(index) });
        if (!mark) continue;
        if (++candidates > 2000) break;
        if (filled) {
          const box = boxes[index];
          const overlaps = boxes.some((other, i) => {
            if (i === index) return false;
            return ++overlapChecks > 2_000_000 || (
              box.x <= other.x + other.width && box.x + box.width >= other.x &&
              box.y <= other.y + other.height && box.y + box.height >= other.y
            );
          });
          if (overlapChecks > 2_000_000) return {
            runs: [], warning: "Stitch detection skipped because the filled contours are too complex.",
          };
          if (overlaps) continue;
        }
        marks.push(mark);
      }
      if (marks.length >= 3) compounds.set(shape.id, marks);
    } else {
      const mark = classify(shape);
      if (mark) {
        const paintGroup = JSON.stringify([
          parents.get(shape.id),
          filled ? [shape.fillColor, shape.fillOpacity] : null,
          shape.strokeOpacity && shape.strokeColor
            ? [shape.strokeColor, shape.strokeOpacity, shape.strokeWidth] : null,
        ]);
        const siblings = standalone.get(paintGroup) ?? [];
        siblings.push(mark);
        standalone.set(paintGroup, siblings);
        candidates++;
      }
    }
    if (candidates > 2000) return {
      runs: [],
      warning: "Stitch detection skipped because the SVG contains too many candidate marks.",
    };
  }
  const detected: Detection = { runs: [] };
  for (const siblings of standalone.values()) {
    const result = matchRuns(siblings, false);
    if (result.warning) return result;
    detected.runs.push(...result.runs);
  }
  for (const [shapeId, marks] of compounds) {
    const { runs, warning } = matchRuns(marks, true);
    if (warning) return { runs: [], warning };
    for (const run of runs) {
      detected.runs.push({
        ...run,
        sourceIds: [],
        sourceContours: { shapeId, indices: run.sourceIds.map(Number) },
      });
    }
  }
  return detected;
}

/** Competing neighbours leave the whole connected run unconverted. */
function matchRuns(marks: Mark[], splitCorners: boolean): Detection {
  const neighbours = marks.map(
    (): { index: number; gap: number; angle: number }[] => [],
  );
  let candidatePairs = 0;
  for (let i = 0; i < marks.length; i++)
    for (let j = i + 1; j < marks.length; j++) {
      const a = marks[i],
        b = marks[j];
      if (
        a.kind !== b.kind ||
        !nearSize(a.width, b.width) ||
        !nearSize(a.height, b.height)
      )
        continue;
      const gap = distance(a.center, b.center);
      if (gap < Math.max(a.width, b.width, 0.3) * 1.15 || gap > 12) continue;
      if (++candidatePairs > 50_000) return {
        runs: [],
        warning: "Stitch detection skipped because too many marks are close together.",
      };
      neighbours[i].push({ index: j, gap, angle: angle(a.center, b.center) });
      neighbours[j].push({ index: i, gap, angle: angle(b.center, a.center) });
    }
  const ambiguous = new Set<number>();
  const corners = new Set<number>();
  const links = neighbours.map((options, index) => {
    options.sort((a, b) => a.gap - b.gap || a.index - b.index);
    const first = options[0];
    if (!first) return [];
    const similar = options
      .slice(1)
      .filter((option) => option.gap <= first.gap * 1.15);
    const opposite = similar.filter(
      (option) =>
        Math.cos(option.angle - first.angle) <= -Math.cos(Math.PI / 3),
    );
    if (splitCorners && similar.length === 1 && opposite.length === 0) corners.add(index);
    else if (similar.length !== opposite.length || opposite.length > 1) ambiguous.add(index);
    return [first.index, ...similar.map((option) => option.index)];
  });
  const graph = marks.map(() => new Set<number>());
  for (let i = 0; i < links.length; i++)
    for (const j of links[i]) {
      graph[i].add(j);
      graph[j].add(i);
    }
  const seen = new Set<number>();
  const runs: DetectedStitchRun[] = [];
  for (let i = 0; i < graph.length; i++) {
    if (seen.has(i)) continue;
    seen.add(i);
    const component = [i];
    for (const vertex of component)
      for (const next of graph[vertex]) {
        if (!seen.has(next)) {
          seen.add(next);
          component.push(next);
        }
      }
    if (
      component.length < (splitCorners ? 3 : 4) ||
      component.some(
        (vertex) =>
          ambiguous.has(vertex) ||
          graph[vertex].size > 2 ||
          [...graph[vertex]].some(next => !links[vertex].includes(next)),
      )
    )
      continue;
    if (component.length > 250)
      return {
        runs: [],
        warning:
          "Stitch detection skipped because a candidate run is too long.",
      };
    const endpoint = component.find((vertex) => graph[vertex].size === 1);
    const start = endpoint ?? i;
    const ordered: number[] = [];
    let current: number | undefined = start;
    while (current !== undefined && ordered.length < component.length) {
      ordered.push(current);
      const previous = ordered.at(-2);
      current = [...graph[current]].find(
        (next) => next !== previous && next !== start,
      );
    }
    if (ordered.length !== component.length) continue;
    const corner = ordered.findIndex(index => corners.has(index));
    if (corner < 0) {
      const run = fitRun(ordered.map(index => marks[index]), endpoint === undefined);
      if (run) runs.push(run);
      continue;
    }
    const angular = fitRun(ordered.map(index => marks[index]), endpoint === undefined, true);
    if (angular) {
      runs.push(angular);
      continue;
    }
    // Start a loop at a corner so the fitted segments cannot straddle the seam.
    const sequence = endpoint === undefined
      ? [...ordered.slice(corner), ...ordered.slice(0, corner)]
      : ordered;
    let segment: Mark[] = [];
    const finish = () => {
      const run = segment.length >= 3 ? fitRun(segment, false) : undefined;
      if (run) runs.push(run);
      segment = [];
    };
    for (const index of sequence) {
      if (corners.has(index)) finish();
      else segment.push(marks[index]);
    }
    finish();
  }
  return { runs };
}
