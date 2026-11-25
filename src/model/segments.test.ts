import { describe, expect, test } from "vitest";
import type { Point, Shape } from "./project";
import { boundary } from "./geometry";
import { sameSegment, segmentAt, segmentsOf, splitSegments } from "./trim";

const shape = (id: string, kind: Shape["kind"], points: Point[], extra: Partial<Shape> = {}): Shape => ({
  id,
  name: id,
  kind,
  points,
  radius: 0,
  rotation: 0,
  ...extra,
});
const p = (x: number, y: number) => ({ x, y });
const length = (shapes: Shape[]) =>
  shapes.reduce((sum, s) => {
    const b = boundary(s);
    const straight = b.lines.reduce((t, [a, c]) => t + Math.hypot(c.x - a.x, c.y - a.y), 0);
    const round = b.curves.reduce((t, c) => t + Math.abs(c.span) * Math.hypot(c.u.x, c.u.y), 0);
    return sum + straight + round;
  }, 0);

describe("segment selection geometry", () => {
  const crossed = () => [
    shape("target", "line", [p(0, 0), p(30, 0)]),
    shape("cut1", "line", [p(10, -5), p(10, 5)]),
    shape("cut2", "line", [p(20, -5), p(20, 5)]),
  ];

  test("segmentAt returns the crossing-bounded span without mutating shapes", () => {
    const shapes = crossed();
    const before = JSON.stringify(shapes);
    const ref = segmentAt(shapes, p(15, 1), 2)!;
    expect(ref.shapeId).toBe("target");
    expect(ref.points[0]).toEqual(p(10, 0));
    expect(ref.points.at(-1)).toEqual(p(20, 0));
    expect(JSON.stringify(shapes)).toBe(before);
    expect(segmentAt(shapes, p(15, 9), 2)).toBeNull();
    expect(segmentAt(shapes, p(15, 1), 2, (s) => s.id !== "target")).toBeNull();
  });

  test("segmentsOf enumerates every span and matches segmentAt", () => {
    const shapes = crossed();
    const all = segmentsOf(shapes);
    // Target splits in three; each cut line splits in two.
    expect(all.filter((s) => s.shapeId === "target")).toHaveLength(3);
    expect(all).toHaveLength(7);
    const hit = segmentAt(shapes, p(25, 0.5), 2)!;
    expect(all.some((s) => sameSegment(s, hit))).toBe(true);
    expect(segmentsOf(shapes, (s) => s.id === "cut1")).toHaveLength(2);
  });

  test("splitSegments extracts several spans of one open shape", () => {
    const shapes = crossed();
    const refs = segmentsOf(shapes).filter((s) => s.shapeId === "target");
    const { shapes: next, extracted } = splitSegments(shapes, [refs[0], refs[2]]);
    expect(extracted).toHaveLength(2);
    const kept = next.find((s) => s.id === "target")!;
    expect(kept.points).toEqual([p(10, 0), p(20, 0)]);
    const pieces = next.filter((s) => extracted.includes(s.id));
    expect(pieces.map((s) => s.points)).toEqual([
      [p(0, 0), p(10, 0)],
      [p(20, 0), p(30, 0)],
    ]);
    expect(length(next.filter((s) => s.id === "target" || extracted.includes(s.id)))).toBeCloseTo(30, 9);
  });

  test("rectangle sides are segments; extraction keeps the outline length", () => {
    const rect = shape("rect", "rectangle", [p(0, 0), p(40, 20)]);
    const all = segmentsOf([rect]);
    expect(all).toHaveLength(4);
    const side = segmentAt([rect], p(20, 0.5), 2)!;
    const { shapes: next, extracted } = splitSegments([rect], [side]);
    expect(extracted).toHaveLength(1);
    expect(next.find((s) => s.id === "rect")!.kind).toBe("polyline");
    expect(length(next)).toBeCloseTo(120, 9);
    expect(length(next.filter((s) => extracted.includes(s.id)))).toBeCloseTo(40, 9);
  });

  test("an uncut circle is one segment that keeps its id when extracted", () => {
    const circle = shape("circle", "circle", [p(0, 0), p(10, 0)]);
    const ref = segmentAt([circle], p(10, 0), 1)!;
    expect(ref).not.toBeNull();
    const { shapes: next, extracted } = splitSegments([circle], [ref]);
    expect(extracted).toEqual(["circle"]);
    expect(length(next)).toBeCloseTo(2 * Math.PI * 10, 6);
  });

  test("a crossed circle splits into arcs that sum to the circumference", () => {
    const shapes = [
      shape("circle", "circle", [p(0, 0), p(10, 0)]),
      shape("cut", "line", [p(-20, 0), p(20, 0)]),
    ];
    const arcs = segmentsOf(shapes, (s) => s.id === "circle");
    expect(arcs).toHaveLength(2);
    const { shapes: next, extracted } = splitSegments(shapes, [arcs[0]]);
    const circleParts = next.filter((s) => s.id === "circle" || extracted.includes(s.id));
    expect(circleParts).toHaveLength(2);
    expect(length(circleParts)).toBeCloseTo(2 * Math.PI * 10, 6);
  });

  test("copy leaves sources intact and appends segments after them", () => {
    const shapes = crossed();
    const ref = segmentAt(shapes, p(15, 1), 2)!;
    const { shapes: next, extracted } = splitSegments(shapes, [ref], { copy: true });
    expect(next.slice(0, 1)).toEqual(shapes.slice(0, 1));
    expect(next[1].id).toBe(extracted[0]);
    expect(next[1].points).toEqual([p(10, 0), p(20, 0)]);
    expect(next.filter((s) => !extracted.includes(s.id))).toEqual(shapes);
  });

  test("control curve segments are bounded by anchors", () => {
    const curve = shape("curve", "control-curve", [p(0, 0), p(10, 10), p(20, 0)], {
      handles: [
        { incoming: p(0, 0), outgoing: p(3, 0) },
        { incoming: p(-3, 0), outgoing: p(3, 0) },
        { incoming: p(-3, 0), outgoing: p(0, 0) },
      ],
    });
    const all = segmentsOf([curve]);
    expect(all).toHaveLength(2);
    const { shapes: next, extracted } = splitSegments([curve], [all[1]]);
    expect(next.find((s) => s.id === "curve")!.points).toEqual([p(0, 0), p(10, 10)]);
    expect(next.find((s) => s.id === extracted[0])!.points).toEqual([p(10, 10), p(20, 0)]);
  });

  test("text, measurements and indicators have no segments", () => {
    const shapes = [
      shape("t", "text", [p(0, 0)], { text: "x" } as Partial<Shape>),
      shape("m", "measurement", [p(0, 0), p(10, 0)]),
      shape("a", "arrow", [p(0, 0), p(10, 0)]),
    ];
    expect(segmentsOf(shapes)).toEqual([]);
    expect(segmentAt(shapes, p(5, 0), 2)).toBeNull();
  });
});
