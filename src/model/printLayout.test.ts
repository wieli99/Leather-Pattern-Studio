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
import type { PrintLayout, PrintNode } from "./printLayout";
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
  it("tracks membership and source deletion atomically; removing a member keeps the rest individually linked", () => {
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
    expect(deleted.tree![0]).not.toHaveProperty("sourceId");
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

describe("linked print reflection", () => {
  it("composes reflections and rotation without changing the source", async () => {
    const { mirrorPrintNodes, transformPrintNodes, resolvePrintShape } =
      await import("./printLayout");
    const l = {
      ...layout,
      id: "l",
      name: "A4",
      units: "mm" as const,
      instances: [{ id: "i", sourceId: "s", x: 30, y: 40, rotation: 20 }],
    };
    const pivot = { x: 10, y: 10 };
    const reflected = mirrorPrintNodes(l, ["i"], pivot, 0);
    expect(reflected.instances[0]).toMatchObject({
      x: 30,
      y: -20,
      rotation: -20,
      mirrored: true,
    });
    const twice = mirrorPrintNodes(reflected, ["i"], pivot, 0);
    expect(twice.instances[0]).toMatchObject({
      ...l.instances[0],
      mirrored: false,
    });
    expect(
      transformPrintNodes(reflected, ["i"], 0, 0, 35).instances[0].rotation,
    ).toBe(15);
    const source = {
      id: "s",
      name: "Source",
      kind: "rectangle" as const,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 10 },
      ],
      rotation: 0,
      radius: 0,
    };
    const shape = resolvePrintShape(source, reflected.instances[0]);
    expect(
      shape.transform!.a * shape.transform!.d -
        shape.transform!.b * shape.transform!.c,
    ).toBeCloseTo(-1);
    expect(source).not.toHaveProperty("transform");
    expect(validatePrintLayouts([reflected])[0].instances[0].mirrored).toBe(
      true,
    );
    expect(() =>
      validatePrintLayouts([
        {
          ...reflected,
          instances: [{ ...reflected.instances[0], mirrored: "yes" }],
        },
      ]),
    ).toThrow();
  });
});

it("new source members inherit a mirrored linked folder", async () => {
  const { mirrorPrintNodes } = await import("./printLayout");
  const imported = importPrintNode(doc, empty, "folder", 95, 100);
  const mirrored = mirrorPrintNodes(
    imported,
    [imported.tree![0].id],
    { x: 95, y: 100 },
    0,
  );
  const added = {
    ...source,
    id: "second",
    rotation: 30,
    points: source.points.map((p) => ({ x: p.x, y: p.y + 20 })),
  };
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
    printLayouts: [mirrored],
  };
  const synced = reconcilePrintLayouts(updated).printLayouts![0];
  const member = synced.instances.find((i) => i.sourceId === "second")!;
  expect(member.mirrored).toBe(true);
  expect(member.rotation).toBeCloseTo(-30);
  expect(member.y).toBeLessThan(100);
  expect(synced.instances.find((i) => i.sourceId === "piece")).toEqual(
    mirrored.instances[0],
  );
});

import { unlinkPrintNode, resolvedPrintItems, printStitchGroups, printRows } from "./printLayout";
import { parseProject } from "./project";

describe("unlinked print copies", () => {
  it("freezes geometry, styles, names and stitching independently of other imports", () => {
    const stitched: Doc = { ...doc, stitchGroups: [{ id: "st", shapeId: source.id,
      edges: ["rectangle:2:edge:0"], side: 1, closed: false,
      settings: { style: "round", spacing: 4, inset: 2, alignment: "center", startClearance: 0, endClearance: 0 } }] };
    const imported = importPrintNode(stitched, importPrintNode(stitched, empty, source.id, 80, 80), source.id, 120, 80);
    const id = imported.instances[0].id;
    const detached = unlinkPrintNode(stitched, imported, id);
    expect(resolvedPrintItems(stitched, detached).find((i) => i.instance.id === id)?.shape)
      .toEqual(resolvedPrintItems(stitched, imported).find((i) => i.instance.id === id)?.shape);
    const changed = { ...stitched, shapes: [{ ...source, name: "Changed", strokeColor: "#ff0000", radius: 3 }], stitchGroups: [] };
    const items = resolvedPrintItems(changed, detached);
    const frozen = items.find((i) => i.instance.id === id)!;
    expect(frozen.source.name).toBe("Piece");
    expect(frozen.shape.radius).toBe(0);
    expect(printStitchGroups(changed, detached, frozen.source.id)).toHaveLength(1);
    expect(items.find((i) => i.instance.id !== id)?.shape.radius).toBe(3);
    expect(imported.instances[0].snapshot).toBeUndefined();
    expect(parseProject(JSON.stringify({ ...changed, printLayouts: [detached] })).printLayouts?.[0].instances[0].snapshot).toEqual(detached.instances[0].snapshot);
  });

  it("keeps detached children and their containers after source deletion", () => {
    const imported = importPrintNode(doc, empty, "folder", 80, 80);
    const detached = unlinkPrintNode(doc, imported, imported.instances[0].id);
    const deleted = reconcilePrintLayouts({ ...doc, shapes: [], objectTree: [], printLayouts: [detached] });
    expect(deleted.printLayouts?.[0].instances).toHaveLength(1);
    expect(printRows(deleted.printLayouts![0])).toHaveLength(2);
    expect(resolvedPrintItems(deleted, deleted.printLayouts![0])).toHaveLength(1);
    expect(parseProject(JSON.stringify(deleted)).printLayouts?.[0].instances).toHaveLength(1);
  });

  it("freezes folder membership and nested source folders", () => {
    const imported = importPrintNode(doc, empty, "folder", 80, 80);
    const detached = unlinkPrintNode(doc, imported, imported.tree![0].id);
    const extra: Shape = { ...source, id: "extra" };
    const changed: Doc = { ...doc, shapes: [extra, source], objectTree: [{ kind: "group", id: "folder", name: "Changed",
      children: [{ kind: "object", id: "piece" }, { kind: "object", id: "extra" }] }], printLayouts: [detached] };
    expect(reconcilePrintLayouts(changed).printLayouts?.[0]).toEqual(detached);
    const deleted = reconcilePrintLayouts({ ...changed, shapes: [], objectTree: [] });
    expect(deleted.printLayouts?.[0]).toEqual(detached);
    expect(parseProject(JSON.stringify(deleted)).printLayouts?.[0].tree?.[0]).toMatchObject({ unlinked: true });
  });

  it("does not restore or relocate an unlinked child after source regrouping", () => {
    const imported = importPrintNode(doc, empty, "folder", 80, 80);
    const id = imported.instances[0].id;
    const detached = unlinkPrintNode(doc, imported, id);
    const changed: Doc = { ...doc, objectTree: [{ kind: "group", id: "folder", name: "Pattern", children: [
      { kind: "group", id: "nested", name: "Nested", children: [{ kind: "object", id: source.id }] },
    ] }], printLayouts: [detached] };
    const reconciled = reconcilePrintLayouts(changed).printLayouts![0];
    expect(reconciled.instances).toHaveLength(1);
    expect(reconciled.tree?.[0]).toMatchObject({ children: expect.arrayContaining([{ kind: "instance", id }]) });
  });

  it("rejects malformed snapshot geometry and stitching on load", () => {
    const imported = importPrintNode(doc, empty, source.id, 80, 80);
    const detached = unlinkPrintNode(doc, imported, imported.instances[0].id);
    detached.instances[0].snapshot!.shape.points = [];
    expect(() => parseProject(JSON.stringify({ ...doc, printLayouts: [detached] }))).toThrow();
  });
});

it("keeps a detached nested folder frozen and stops syncing its parent's membership", () => {
  const nested: Doc = { ...doc, objectTree: [{ kind: "group", id: "folder", name: "Pattern", children: [
    { kind: "group", id: "nested", name: "Nested", children: [{ kind: "object", id: source.id }] },
  ] }] };
  const imported = importPrintNode(nested, empty, "folder", 80, 80);
  const child = printRows(imported).find((r) => r.node.kind === "group" && r.node.sourceId === "nested")!.node;
  const detached = unlinkPrintNode(nested, imported, child.id);
  const inner: Shape = { ...source, id: "inner" };
  const sibling: Shape = { ...source, id: "sibling" };
  const changed: Doc = { ...nested, shapes: [sibling, inner, source], objectTree: [
    { kind: "group", id: "folder", name: "Pattern", children: [
      { kind: "group", id: "nested", name: "Nested", children: [
        { kind: "object", id: source.id }, { kind: "object", id: inner.id },
      ] },
      { kind: "object", id: sibling.id },
    ] },
  ], printLayouts: [detached] };
  const reconciled = reconcilePrintLayouts(changed).printLayouts![0];
  expect(reconciled.instances.map((i) => i.sourceId).sort()).toEqual(["piece"]);
  expect(reconciled.tree?.[0]).not.toHaveProperty("sourceId");
  expect(printRows(reconciled).find((r) => r.node.id === child.id)?.node)
    .toEqual(printRows(detached).find((r) => r.node.id === child.id)?.node);
});


it("prints detached guide stitches with their piece once and freezes them in snapshots",async()=>{
 const {detachTransfer,makeTransfer}=await import("./stitchLayers");
 const {defaultStitchSettings}=await import("./stitch");
 const {stitchEdges,stitchGeometry}=await import("./stitchGeometry");
 const {parseProject}=await import("./project");
 const master:Shape={...source,id:"master",points:[{x:100,y:20},{x:140,y:40}]};
 const run={id:"run",shapeId:master.id,side:1 as const,closed:false,edges:[stitchEdges(master)[0].key],settings:{...defaultStitchSettings,spacing:4,inset:3}};
 const baseline:Doc={version:21,shapes:[master,source],stitchGroups:[run]};
 const data=detachTransfer(baseline,makeTransfer(baseline,run.id,source,{x:30,y:30},0,"placement"));
 const doc:Doc={...baseline,shapes:[...baseline.shapes,...data.shapes],stitchGroups:[run,...data.groups]};
 let layout=importPrintNode(doc,empty,source.id,90,90);
 layout=importPrintNode(doc,layout,data.shapes[0].id,90,90);
 expect(printStitchGroups(doc,layout,data.shapes[0].id)).toEqual([]);
 const groups=printStitchGroups(doc,layout,source.id);
 expect(groups).toHaveLength(1);
 const holes=stitchGeometry(source,groups[0]).holes;
 expect(holes.map(h=>h.point)).toEqual(stitchGeometry(data.shapes[0],data.groups[0]).holes.map(h=>h.point));
 const frozen=unlinkPrintNode(doc,layout,layout.instances[0].id);
 const loaded=parseProject(JSON.stringify({...doc,printLayouts:[frozen]}));
 const snapshot=loaded.printLayouts![0].instances[0].snapshot!;
 expect(snapshot.stitchGroups).toHaveLength(1);
 expect(snapshot.shape.stitchParentId).toBeUndefined();
});

it.each([0, 45])("reselection reconciles folder pivots and placements at %s degrees", async angle => {
  const { reconcilePrintTargets } = await import("./printLayout");
  const original = importPrintNode(doc, importPrintNode(doc, empty, "folder", 95, 100), "folder", 180, 100);
  const [first, second] = original.tree!;
  const previous = transformPrintNodes(original, [first.id], 12, 8, angle, {x:0,y:0});
  const candidate = transformPrintNodes(original, [second.id], 12, 8, angle, {x:0,y:0});
  const result = reconcilePrintTargets(original, previous, candidate, [first.id], [second.id]);
  expect(result.tree![0]).toEqual(original.tree![0]);
  expect(result.instances[0]).toEqual(original.instances[0]);
  expect(result.tree![1]).toEqual(candidate.tree![1]);
  expect(result.instances[1]).toEqual(candidate.instances[1]);
  const retained = reconcilePrintTargets(original, previous, candidate, [first.id], [first.id,second.id]);
  expect(retained.tree![0]).toEqual(previous.tree![0]);
  expect(retained.instances[0]).toEqual(previous.instances[0]);
  expect(retained.tree![1]).toEqual(candidate.tree![1]);
});

type GroupNode = Extract<PrintNode, { kind: "group" }>;
describe("whole-folder print links", () => {
  const shape = (id: string): Shape => ({ ...source, id, name: id });
  const folder = (...ids: string[]): Doc => ({
    ...doc,
    shapes: ids.map(shape),
    objectTree: [{ kind: "group", id: "folder", name: "Pattern", children: ids.map((id) => ({ kind: "object" as const, id })) }],
  });
  const sources = (l: PrintLayout) => l.instances.map((i) => i.sourceId).sort();

  it("applies source additions, edits and deletions to every intact folder import", () => {
    let l = importPrintNode(folder("a", "b"), empty, "folder", 80, 80);
    l = importPrintNode(folder("a", "b"), l, "folder", 150, 80);
    const added = reconcilePrintLayouts({ ...folder("a", "b", "c"), printLayouts: [l] }).printLayouts![0];
    expect(sources(added)).toEqual(["a", "a", "b", "b", "c", "c"]);
    const removed = reconcilePrintLayouts({ ...folder("a", "c"), printLayouts: [added] }).printLayouts![0];
    expect(sources(removed)).toEqual(["a", "a", "c", "c"]);
    const edited = { ...folder("a", "c"), shapes: [{ ...shape("a"), radius: 4 }, shape("c")], printLayouts: [removed] };
    expect(resolvedPrintItems(edited, removed).filter((i) => i.instance.sourceId === "a").map((i) => i.shape.radius)).toEqual([4, 4]);
  });

  it("imports a folder member again individually as separate links", () => {
    const d = folder("a", "b");
    let l = importPrintNode(d, empty, "folder", 80, 80);
    l = importPrintNode(d, l, "a", 120, 80);
    l = importPrintNode(d, l, "a", 160, 80);
    const synced = reconcilePrintLayouts({ ...folder("a", "b", "c"), printLayouts: [l] }).printLayouts![0];
    expect(synced.tree).toHaveLength(3);
    expect(synced.tree![0]).toMatchObject({ sourceId: "folder" });
    expect(sources(synced)).toEqual(["a", "a", "a", "b", "c"]);
    expect(new Set(synced.instances.map((i) => i.id)).size).toBe(5);
    // Deleting an individual import does not touch the folder link.
    const single = synced.tree![1].id;
    const removed = removePrintNodes(synced, [single]);
    expect(removed.tree![0]).toMatchObject({ sourceId: "folder" });
    const gone = reconcilePrintLayouts({ ...folder("a", "b"), printLayouts: [removed] }).printLayouts![0];
    expect(sources(gone)).toEqual(["a", "a", "b"]);
  });

  it("stops folder membership sync once one member is removed or unlinked, keeping members live", () => {
    const d = folder("a", "b");
    const l = importPrintNode(d, empty, "folder", 80, 80);
    const b = l.instances.find((i) => i.sourceId === "b")!.id;
    for (const next of [removePrintNodes(l, [b]), unlinkPrintNode(d, l, b)]) {
      expect(next.tree![0]).not.toHaveProperty("sourceId");
      const changed = { ...folder("a", "b", "c"), shapes: [{ ...shape("a"), radius: 2 }, shape("b"), shape("c")], printLayouts: [next] };
      const synced = reconcilePrintLayouts(changed).printLayouts![0];
      expect(sources(synced)).not.toContain("c");
      expect(resolvedPrintItems(changed, synced).find((i) => i.instance.sourceId === "a")?.shape.radius).toBe(2);
    }
  });

  it("keeps intact nested folders linked when their parent link breaks", () => {
    const nested: Doc = { ...doc, shapes: [shape("a"), shape("b")], objectTree: [{ kind: "group", id: "outer", name: "Outer", children: [
      { kind: "group", id: "inner", name: "Inner", children: [{ kind: "object", id: "a" }] },
      { kind: "object", id: "b" },
    ] }] };
    const l = importPrintNode(nested, empty, "outer", 80, 80);
    const b = l.instances.find((i) => i.sourceId === "b")!.id;
    const next = removePrintNodes(l, [b]);
    const changed: Doc = { ...nested, shapes: [shape("a"), shape("b"), shape("c")], objectTree: [{ kind: "group", id: "outer", name: "Outer", children: [
      { kind: "group", id: "inner", name: "Inner", children: [{ kind: "object", id: "a" }, { kind: "object", id: "c" }] },
      { kind: "object", id: "b" },
    ] }], printLayouts: [next] };
    const synced = reconcilePrintLayouts(changed).printLayouts![0];
    expect(synced.tree![0]).not.toHaveProperty("sourceId");
    expect(sources(synced)).toEqual(["a", "c"]);
  });

  it("converts legacy locally excluded members into individual links", () => {
    const d = folder("a", "b");
    const l = importPrintNode(d, empty, "folder", 80, 80);
    const b = l.instances.find((i) => i.sourceId === "b")!.id;
    const legacy: PrintLayout = {
      ...l,
      instances: l.instances.filter((i) => i.id !== b),
      tree: [{ ...(l.tree![0] as GroupNode), excludedSourceIds: ["b"], children: [{ kind: "instance", id: l.instances.find((i) => i.sourceId === "a")!.id }] }],
    };
    const synced = reconcilePrintLayouts({ ...folder("a", "b", "c"), printLayouts: [legacy] }).printLayouts![0];
    expect(sources(synced)).toEqual(["a"]);
    expect(synced.tree![0]).not.toHaveProperty("sourceId");
    expect(synced.tree![0]).not.toHaveProperty("excludedSourceIds");
    const stale: PrintLayout = { ...l, tree: [{ ...(l.tree![0] as GroupNode), excludedSourceIds: ["b"] }] };
    const kept = reconcilePrintLayouts({ ...folder("a", "b", "c"), printLayouts: [stale] }).printLayouts![0];
    expect(kept.tree![0]).toMatchObject({ sourceId: "folder" });
    expect(sources(kept)).toEqual(["a", "b", "c"]);
  });
});
