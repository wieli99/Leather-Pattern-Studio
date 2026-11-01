import { describe, expect, it } from "vitest";
import {
  pagesForBounds,
  printableSize,
  validatePrintLayouts,
} from "./printLayout";
const layout = {
  width: 210,
  height: 297,
  margin: 10,
  pages: [{ column: 0, row: 0 }],
};
describe("print page geometry", () => {
  it("tiles printable areas without creating pages at exact boundaries", () => {
    expect(printableSize(layout)).toEqual({ width: 190, height: 277 });
    expect(
      pagesForBounds(layout, { x: 0, y: 0, width: 190, height: 277 }),
    ).toEqual(layout.pages);
  });
  it("supports negative cells and stable reading order", () => {
    expect(
      pagesForBounds(layout, { x: -10, y: 0, width: 210, height: 20 }),
    ).toEqual([
      { column: -1, row: 0 },
      { column: 0, row: 0 },
      { column: 1, row: 0 },
    ]);
  });
  it("rejects excessive overflow without mutating existing pages", () => {
    expect(() =>
      pagesForBounds(layout, { x: 0, y: 0, width: 1e9, height: 1e9 }),
    ).toThrow("500");
    expect(layout.pages).toHaveLength(1);
  });
  it("rejects invalid paper dimensions and malformed persistence", () => {
    expect(() => printableSize({ ...layout, margin: 105 })).toThrow();
    expect(() => validatePrintLayouts([{}])).toThrow();
  });
});

import {
  importPrintNode,
  reconcilePrintLayouts,
  resolvePrintShape,
  removePrintNodes,
  transformPrintNodes,
  printDescendants,
  validatePrintLayouts as validate,
} from "./printLayout";
import type { PrintLayout } from "./printLayout";
import type { Doc, Shape } from "./project";
const source: Shape = {
  id: "piece",
  name: "Piece",
  kind: "rectangle",
  points: [
    { x: 10, y: 20 },
    { x: 50, y: 40 },
  ],
  rotation: 0,
  radius: 0,
};
const empty: PrintLayout = {
  ...layout,
  id: "print",
  name: "A4",
  units: "mm",
  instances: [],
  tree: [],
};
const doc: Doc = {
  version: 18,
  shapes: [source],
  objectTree: [
    {
      kind: "group",
      id: "folder",
      name: "Pattern",
      children: [{ kind: "object", id: "piece" }],
    },
  ],
};
describe("linked print instances", () => {
  it("imports repeated folders with unique instances and independent transforms", () => {
    const first = importPrintNode(doc, empty, "folder", 95, 100),
      second = importPrintNode(doc, first, "folder", 95, 100);
    expect(second.instances).toHaveLength(2);
    expect(new Set(second.instances.map((i) => i.id)).size).toBe(2);
    const changed = transformPrintNodes(
      second,
      [second.tree![0].id],
      10,
      20,
      45,
    );
    expect(changed.instances[0]).toMatchObject({
      x: 105,
      y: 120,
      rotation: 45,
    });
    expect(changed.instances[1]).toEqual(second.instances[1]);
    expect(source.points[0]).toEqual({ x: 10, y: 20 });
  });
  it("ignores master translation and rotation but follows resizing", () => {
    const instance = {
      id: "copy",
      sourceId: "piece",
      x: 100,
      y: 100,
      rotation: 0,
    };
    const original = resolvePrintShape(source, instance);
    const shifted = resolvePrintShape(
      {
        ...source,
        points: source.points.map((p) => ({ x: p.x + 200, y: p.y + 300 })),
        rotation: 90,
      },
      instance,
    );
    const bounds = geometryBounds;
    expect(bounds([shifted])).toEqual(bounds([original]));
    expect(
      bounds([
        resolvePrintShape(
          {
            ...source,
            points: [
              { x: 10, y: 20 },
              { x: 90, y: 40 },
            ],
          },
          instance,
        ),
      ]),
    ).toMatchObject({ width: 80 });
  });
  it("tracks membership and source deletion atomically; locally removed members stay suppressed", () => {
    const imported = importPrintNode(doc, empty, "folder", 95, 100);
    const added = { ...source, id: "second", name: "Second" };
    const updated: Doc = {
      ...doc,
      shapes: [source, added],
      objectTree: [
        {
          kind: "group",
          id: "folder",
          name: "Pattern",
          children: [
            { kind: "object", id: "piece" },
            { kind: "object", id: "second" },
          ],
        },
      ],
      printLayouts: [imported],
    };
    const synced = reconcilePrintLayouts(updated).printLayouts![0];
    expect(synced.instances).toHaveLength(2);
    const deleted = removePrintNodes(synced, [synced.instances[0].id]);
    expect(
      reconcilePrintLayouts({ ...updated, printLayouts: [deleted] })
        .printLayouts![0].instances,
    ).toHaveLength(1);
    const removed = reconcilePrintLayouts({
      ...updated,
      shapes: [],
      objectTree: [],
      printLayouts: [synced],
    }).printLayouts![0];
    expect(removed.instances).toHaveLength(0);
    expect(removed.tree).toHaveLength(0);
  });
  it("retains existing placement when a source changes and adds overflow pages", () => {
    const imported = importPrintNode(doc, empty, "piece", 95, 100),
      wide = {
        ...source,
        points: [
          { x: 0, y: 0 },
          { x: 500, y: 40 },
        ],
      };
    const changed = reconcilePrintLayouts({
      ...doc,
      shapes: [wide],
      printLayouts: [imported],
    }).printLayouts![0];
    expect(changed.instances[0]).toEqual(imported.instances[0]);
    expect(changed.pages.length).toBeGreaterThan(1);
  });
  it("rejects duplicate tree nodes and includes children only once for parent/child selection", () => {
    const imported = importPrintNode(doc, empty, "folder", 95, 100);
    expect(
      printDescendants(imported, [
        imported.tree![0].id,
        imported.instances[0].id,
      ]),
    ).toHaveLength(1);
    expect(() =>
      validate([{ ...imported, tree: [...imported.tree!, ...imported.tree!] }]),
    ).toThrow();
  });
});
import { bounds as geometryBounds } from "./geometry";

it("keeps nested live-folder membership unique and preserves arranged children", () => {
  const nested: Doc = {
    ...doc,
    objectTree: [
      { kind: "group", id: "outer", name: "Outer", children: doc.objectTree! },
    ],
  };
  const imported = importPrintNode(nested, empty, "outer", 95, 100);
  const extra = { ...source, id: "extra" };
  const changed: Doc = {
    ...nested,
    shapes: [source, extra],
    objectTree: [
      {
        kind: "group",
        id: "outer",
        name: "Outer",
        children: [
          {
            kind: "group",
            id: "folder",
            name: "Pattern",
            children: [
              { kind: "object", id: "piece" },
              { kind: "object", id: "extra" },
            ],
          },
        ],
      },
    ],
    printLayouts: [imported],
  };
  const first = reconcilePrintLayouts(changed).printLayouts![0];
  expect(first.instances).toHaveLength(2);
  const second = reconcilePrintLayouts({ ...changed, printLayouts: [first] })
    .printLayouts![0];
  expect(second).toEqual(first);
  expect(first.instances[0]).toEqual(imported.instances[0]);
});
it("retains an arranged instance when its source changes nested folders", () => {
  const a = {
      kind: "group" as const,
      id: "a",
      name: "A",
      children: [{ kind: "object" as const, id: "piece" }],
    },
    b = { kind: "group" as const, id: "b", name: "B", children: [] };
  const nested: Doc = {
    ...doc,
    objectTree: [
      { kind: "group", id: "outer", name: "Outer", children: [a, b] },
    ],
  };
  const imported = importPrintNode(nested, empty, "outer", 95, 100);
  const moved = transformPrintNodes(
    imported,
    [imported.instances[0].id],
    20,
    30,
    40,
  );
  const changed: Doc = {
    ...nested,
    objectTree: [
      {
        kind: "group",
        id: "outer",
        name: "Outer",
        children: [
          { ...a, children: [] },
          { ...b, children: [{ kind: "object", id: "piece" }] },
        ],
      },
    ],
    printLayouts: [moved],
  };
  const result = reconcilePrintLayouts(changed).printLayouts![0];
  expect(result.instances).toEqual(moved.instances);
  expect(validate([result])).toHaveLength(1);
});

it("adds touched cells for diagonal artwork without filling the bounding rectangle", () => {
  const line: Shape = {
    id: "line",
    name: "Diagonal",
    kind: "line",
    points: [
      { x: 0, y: 0 },
      { x: 550, y: 550 },
    ],
    rotation: 0,
    radius: 0,
  };
  const placed: PrintLayout = {
    ...empty,
    instances: [{ id: "copy", sourceId: "line", x: 275, y: 275, rotation: 0 }],
    tree: [{ kind: "instance", id: "copy" }],
  };
  const result = reconcilePrintLayouts({
    version: 18,
    shapes: [line],
    printLayouts: [placed],
  }).printLayouts![0];
  expect(result.pages.some((p) => p.column === 2 && p.row === 0)).toBe(false);
  expect(result.pages.some((p) => p.column === 1 && p.row === 1)).toBe(true);
});
