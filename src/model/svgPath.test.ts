import { expect, test } from "vitest";
import { parseSvgPath, svgArc } from "./svgPath";

test("all path commands retain open/closed subpaths and exact quadratic conversion", () => {
  const paths = parseSvgPath(
    "M1 2 l10 0 h5 v5 c1 2 3 4 5 6 s3 4 5 6 q3 6 9 0 t9 0 a5 5 0 0110 0 z M100 100L110 100",
  );
  expect(paths).toHaveLength(2);
  expect(paths[0].closed).toBe(true);
  expect(paths[0].curves[0]).toEqual([
    { x: 1, y: 2 },
    { x: 1, y: 2 },
    { x: 11, y: 2 },
    { x: 11, y: 2 },
  ]);
  expect(paths[1].closed).toBe(false);
  const q = parseSvgPath("M0 0Q3 6 9 0T18 0")[0].curves;
  expect(q[0][1]).toEqual({ x: 2, y: 4 });
  expect(q[0][2]).toEqual({ x: 5, y: 4 });
  expect(q[1][1]).toEqual({ x: 13, y: -4 });
});

test("rejects invalid and incomplete path data without silently losing geometry", () => {
  for (const value of [
    "L1 2",
    "M0 0 C1 2",
    "M0 0A5 5 0 2 1 10 0",
    "M0 0L1e999 2",
    "M0 0?",
    "M0 0 R2 3",
  ])
    expect(() => parseSvgPath(value)).toThrow();
});

test("elliptical arcs stay below 0.01 mm error after extreme scaling", () => {
  for (const radius of [0.1, 10, 1000])
    for (const factor of [0.01, 1, 100]) {
      const curves = svgArc(
        { x: radius, y: 0 },
        { x: -radius, y: 0 },
        radius,
        radius / 2,
        0,
        0,
        1,
        factor,
      );
      for (const [p, a, b, q] of curves)
        for (let i = 0; i <= 20; i++) {
          const t = i / 20,
            u = 1 - t;
          const x =
            u ** 3 * p.x +
            3 * u * u * t * a.x +
            3 * u * t * t * b.x +
            t ** 3 * q.x;
          const y =
            u ** 3 * p.y +
            3 * u * u * t * a.y +
            3 * u * t * t * b.y +
            t ** 3 * q.y;
          const normalized = Math.hypot(x / radius, y / (radius / 2));
          expect(Math.abs(normalized - 1) * radius * factor).toBeLessThan(0.01);
        }
    }
});

test("arc degeneracies, corrected radii, rotation, and sweep stay finite", () => {
  expect(svgArc({ x: 0, y: 0 }, { x: 0, y: 0 }, 10, 10, 0, 0, 1, 1)).toEqual(
    [],
  );
  expect(
    svgArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, 10, 0, 0, 1, 1),
  ).toHaveLength(1);
  for (const large of [0, 1])
    for (const sweep of [0, 1]) {
      const curves = svgArc(
        { x: 0, y: 0 },
        { x: 100, y: 20 },
        1,
        2,
        45,
        large,
        sweep,
        1,
      );
      expect(curves[0][0]).toEqual({ x: 0, y: 0 });
      expect(curves.at(-1)![3]).toEqual({ x: 100, y: 20 });
      expect(
        curves
          .flat(2)
          .every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      ).toBe(true);
    }
});

test("drawing after closepath begins another open contour", () => {
  const contours = parseSvgPath("M0 0h10v10zL20 20");
  expect(contours.map((c) => c.closed)).toEqual([true, false]);
  expect(contours[1].curves[0][0]).toEqual({ x: 0, y: 0 });
});

test("rejects misplaced commas without rejecting compact arc flags", () => {
  for (const path of ["M0 0 L10 0 L,20 20", "M0 0,L10 10", "M0 0 L10,,10", "M0 0 L10 10,", ",M0 0"]) {
    expect(() => parseSvgPath(path)).toThrow("Invalid SVG path separator");
  }
  expect(parseSvgPath("M0,0 A10,10,0,0110,10")[0].curves.length).toBeGreaterThan(0);
});

test("omits collapsed segments and retains curves that return to their start", () => {
  const [contour] = parseSvgPath("M0 0H0C0 0 0 0 0 0C10 0 10 10 0 0Z");
  expect(contour.closed).toBe(true);
  expect(contour.curves).toEqual([[
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 },
  ]]);
});
