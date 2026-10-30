import { expect, test } from "vitest";
import type { Shape } from "./project";
import { trimAt } from "./trim";
const line = (id: string, points: Shape["points"]): Shape => ({
  id,
  name: id,
  kind: "line",
  points,
  radius: 0,
  rotation: 0,
});
test("preview highlights the same crossing-bounded span that a click removes", () => {
  const shapes = [
    line("target", [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ]),
    line("cut1", [
      { x: 10, y: -5 },
      { x: 10, y: 5 },
    ]),
    line("cut2", [
      { x: 20, y: -5 },
      { x: 20, y: 5 },
    ]),
  ];
  const original = JSON.stringify(shapes);
  let span: Shape["points"] = [];
  trimAt(shapes, { x: 15, y: 1 }, 2, (value) => {
    span = value;
  });
  expect(span).toEqual([
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ]);
  expect(JSON.stringify(shapes)).toBe(original);
  const result = trimAt(shapes, { x: 15, y: 1 }, 2)!;
  expect(result.slice(0, 2).map((s) => s.points)).toEqual([
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    [
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ],
  ]);
  expect(result.slice(2)).toEqual(shapes.slice(1));
});
test("an isolated line is removed and empty clicks do nothing", () => {
  const shapes = [
    line("a", [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]),
  ];
  expect(trimAt(shapes, { x: 5, y: 0 }, 1)).toEqual([]);
  expect(trimAt(shapes, { x: 5, y: 10 }, 1)).toBeNull();
});
