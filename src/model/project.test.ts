import { test, expect } from "vitest";
import { parseProject } from "./project";
test("empty project round-trips", () =>
  expect(parseProject('{"version":3,"shapes":[]}')).toEqual({
    version: 4,
    shapes: [],
  }));
test("migrates old pieces and preserves stitching metadata", () => {
  const d = parseProject(
    JSON.stringify({
      version: 1,
      pieces: [
        {
          id: "a",
          x: 2,
          y: 3,
          width: 50,
          height: 20,
          radius: 4,
          stitch: 2,
          spacing: 3,
        },
      ],
    }),
  );
  expect(d.shapes[0].points[1]).toEqual({ x: 52, y: 23 });
  expect(d.shapes[0].legacyStitch).toEqual({ offset: 2, spacing: 3 });
  expect(d.shapes[0].rotation).toBe(0);
});
const line = {
  id: "a",
  name: "Line",
  kind: "line",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
  radius: 0,
  rotation: 0,
};
test("migrates v2 without changing coordinates", () => {
  const d = parseProject(JSON.stringify({ version: 2, shapes: [line] }));
  expect(d.version).toBe(4);
  expect(d.shapes[0].points).toEqual(line.points);
});
test.each([
  null,
  { version: 9, shapes: [] },
  { version: 4, shapes: [null] },
  { version: 4, shapes: [line, line] },
  { version: 4, shapes: [{ ...line, rotation: null }] },
  {
    version: 4,
    shapes: [
      {
        ...line,
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      },
    ],
  },
  { version: 4, shapes: [{ ...line, kind: "rectangle" }] },
])("rejects malformed project %#", (value) =>
  expect(() => parseProject(JSON.stringify(value))).toThrow(),
);
test("v3 migration retains precision, rotation, and inactive stitch metadata", () => {
  const shape = {
    ...line,
    rotation: 12.345,
    points: [
      { x: 0.123456789, y: 0 },
      { x: 10, y: 0 },
    ],
    legacyStitch: { offset: 3, spacing: 2 },
  };
  const project = parseProject(JSON.stringify({ version: 3, shapes: [shape] }));
  expect(project.version).toBe(4);
  expect(project.shapes[0].points).toEqual(shape.points);
  expect(project.shapes[0].rotation).toBeCloseTo(shape.rotation);
  expect(project.shapes[0].legacyStitch).toEqual(shape.legacyStitch);
});
test.each([undefined, 0, 361, -361, null])(
  "rejects invalid arc sweep %s",
  (sweep) =>
    expect(() =>
      parseProject(
        JSON.stringify({
          version: 4,
          shapes: [{ ...line, kind: "arc", sweep }],
        }),
      ),
    ).toThrow(),
);
