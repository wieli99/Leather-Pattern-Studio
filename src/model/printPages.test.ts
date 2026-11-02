import { expect, it } from "vitest";
import { deletePrintPages, movePrintPage } from "./printPages";
import type { PrintLayout } from "./printLayout";
import type { Doc } from "./project";
const doc: Doc = {
  version: 18,
  shapes: [
    {
      id: "s",
      name: "Shape",
      kind: "rectangle",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
      ],
      rotation: 0,
      radius: 0,
    },
  ],
};
const l: PrintLayout = {
  id: "l",
  name: "A4",
  width: 210,
  height: 297,
  margin: 10,
  units: "mm",
  pages: [
    { column: 0, row: 0 },
    { column: 1, row: 0 },
    { column: 0, row: 1 },
  ],
  instances: [{ id: "i", sourceId: "s", x: 95, y: 100, rotation: 0 }],
};
it("reorders adjacent sheets and closes the source gap", () => {
  const next = movePrintPage(
    doc,
    l,
    { column: 0, row: 0 },
    { column: 1, row: 0 },
    "x",
  );
  expect(next.pages).toEqual([
    { column: 1, row: 0 },
    { column: 0, row: 0 },
    { column: 0, row: 1 },
  ]);
  expect(next.instances[0].x).toBe(285);
  expect(l.instances[0].x).toBe(95);
});
it("rejects moving or partially deleting spanning objects", () => {
  const shared = { ...l, instances: [{ ...l.instances[0], x: 190 }] };
  expect(() =>
    movePrintPage(
      doc,
      shared,
      { column: 0, row: 0 },
      { column: 0, row: 2 },
      "y",
    ),
  ).toThrow("spans");
  expect(() => deletePrintPages(doc, shared, ["0,0"])).toThrow(
    "Also select pages 2",
  );
  expect(deletePrintPages(doc, shared, ["0,0", "1,0"]).instances).toEqual([]);
});
it("allows extending a single page to a negative empty edge", () => {
  const single = { ...l, pages: [{ column: 0, row: 0 }] };
  const moved = movePrintPage(
    doc,
    single,
    { column: 0, row: 0 },
    { column: -1, row: 0 },
    "x",
  );
  expect(moved.pages).toEqual([{ column: -1, row: 0 }]);
  expect(moved.instances[0].x).toBe(-95);
});
it("refuses row insertion that would tear artwork shared with a stationary row", () => {
  const shared = {
    ...l,
    pages: [
      { column: 0, row: 1 },
      { column: 1, row: 0 },
      { column: 1, row: 1 },
    ],
    instances: [{ ...l.instances[0], x: 285, y: 277 }],
  };
  expect(() =>
    movePrintPage(
      doc,
      shared,
      { column: 0, row: 1 },
      { column: 1, row: 0 },
      "x",
    ),
  ).toThrow("split");
});
it("closes a contiguous source run without changing existing gaps", () => {
  const layout = {
    ...l,
    instances: [],
    pages: [0, 1, 2, 4].map((column) => ({ column, row: 0 })),
  };
  const next = movePrintPage(
    doc,
    layout,
    { column: 0, row: 0 },
    { column: 1, row: 0 },
    "x",
  );
  expect(next.pages.map((p) => p.column)).toEqual([1, 0, 2, 4]);
});
it("closes vertical source gaps and leaves other columns untouched", () => {
  const layout = {
    ...l,
    instances: [],
    pages: [
      { column: 0, row: 0 },
      { column: 0, row: 1 },
      { column: 0, row: 2 },
      { column: 1, row: 0 },
    ],
  };
  expect(
    movePrintPage(
      doc,
      layout,
      { column: 0, row: 0 },
      { column: 0, row: 1 },
      "y",
    ).pages,
  ).toEqual([
    { column: 0, row: 1 },
    { column: 0, row: 0 },
    { column: 0, row: 2 },
    { column: 1, row: 0 },
  ]);
});
