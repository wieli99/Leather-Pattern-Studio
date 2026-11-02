import { describe, it, expect } from "vitest";
import { reorderRoots, reorderTree, reorderPreview } from "./reorder";
const tree = [
  { id: "a" },
  { id: "g", children: [{ id: "b" }, { id: "c" }] },
  { id: "d" },
];
describe("tree reordering", () => {
  it("normalizes nested selections in tree order and moves the subtree once", () => {
    expect(reorderRoots(tree, ["c", "g", "a"]).map((n) => n.id)).toEqual([
      "a",
      "g",
    ]);
    const next = reorderTree(tree, ["c", "g"], { parent: null, index: 2 });
    expect(next.map((n) => n.id)).toEqual(["a", "d", "g"]);
    expect(tree.map((n) => n.id)).toEqual(["a", "g", "d"]);
  });
  it("supports nested insertion and rejects cycles and invalid destinations", () => {
    expect(
      reorderTree(tree, ["d"], { parent: "g", index: 1 })[1].children?.map(
        (n) => n.id,
      ),
    ).toEqual(["b", "d", "c"]);
    expect(() => reorderTree(tree, ["g"], { parent: "c", index: 0 })).toThrow();
    expect(() =>
      reorderTree(tree, ["a"], { parent: null, index: 9 }),
    ).toThrow();
  });
  it("projects an end slot and a collapsed group insertion without revealing children", () => {
    const rows = tree.map((node) => ({ node, depth: 0 }));
    expect(
      reorderPreview(
        rows,
        new Set(["a"]),
        { parent: null, index: 2 },
        tree,
      ).map((r) => r.key),
    ).toEqual(["g", "d", "__reorder-slot"]);
    const preview = reorderPreview(
      rows,
      new Set(["a"]),
      { parent: "g", index: 2 },
      tree,
    );
    expect(preview.map((r) => r.key)).toEqual(["g", "__reorder-slot", "d"]);
    expect(preview[1]).toMatchObject({ slot: true, depth: 1 });
  });
});
