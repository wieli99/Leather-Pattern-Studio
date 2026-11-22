import { expect, it } from "vitest";
import { movePrintTree } from "./printReorder";
import type { PrintLayout, PrintNode } from "./printLayout";
const group = (
  id: string,
  children: PrintNode[],
  sourceId?: string,
): PrintNode => ({
  kind: "group",
  id,
  name: id,
  x: 0,
  y: 0,
  rotation: 0,
  children,
  ...(sourceId ? { sourceId } : {}),
});
const leaf = (id: string): PrintNode => ({ kind: "instance", id });
const layout: PrintLayout = {
  id: "layout",
  name: "Test",
  units: "mm",
  width: 210,
  height: 297,
  margin: 10,
  pages: [{ column: 0, row: 0 }],
  instances: [],
  tree: [
    leaf("a"),
    group("linked", [leaf("b"), leaf("c")], "source"),
    leaf("d"),
  ],
};
it("moves selected roots together and leaves input unchanged", () => {
  const next = movePrintTree(layout, ["d", "a"], { parent: null, index: 1 });
  expect(next.tree?.map((n) => n.id)).toEqual(["linked", "a", "d"]);
  expect(layout.tree?.map((n) => n.id)).toEqual(["a", "linked", "d"]);
});
it("reorders inside a live folder without breaking its link", () => {
  expect(
    movePrintTree(layout, ["c"], { parent: "linked", index: 0 }).tree?.[1],
  ).toMatchObject({ children: [leaf("c"), leaf("b")], sourceId: "source" });
  expect(
    movePrintTree(layout, ["linked", "b"], {
      parent: null,
      index: 2,
    }).tree?.map((n) => n.id),
  ).toEqual(["a", "d", "linked"]);
});
it("turns a live folder into individual links when members move across it", () => {
  const out = movePrintTree(layout, ["b", "a"], { parent: null, index: 0 });
  expect(out.tree?.map((n) => n.id)).toEqual(["a", "b", "linked", "d"]);
  expect(out.tree?.[2]).not.toHaveProperty("sourceId");
  const into = movePrintTree(layout, ["a"], { parent: "linked", index: 0 });
  expect(into.tree?.[0]).toMatchObject({ children: [leaf("a"), leaf("b"), leaf("c")] });
  expect(into.tree?.[0]).not.toHaveProperty("sourceId");
  const nested: PrintLayout = {
    ...layout,
    tree: [group("outer", [group("inner", [leaf("b")], "in"), leaf("c")], "out"), leaf("a")],
  };
  const moved = movePrintTree(nested, ["a"], { parent: "outer", index: 0 });
  expect(moved.tree?.[0]).not.toHaveProperty("sourceId");
  expect((moved.tree?.[0] as { children: PrintNode[] }).children[1]).toMatchObject({ sourceId: "in" });
});
it("rejects locked descendants and locked destination folders", () => {
  const locked: PrintLayout = {
    ...layout,
    tree: [
      leaf("a"),
      { ...group("g", [leaf("b")]), locked: true } as PrintNode,
    ],
  };
  expect(() =>
    movePrintTree(locked, ["g"], { parent: null, index: 0 }),
  ).toThrow("Locked");
  expect(() => movePrintTree(locked, ["a"], { parent: "g", index: 0 })).toThrow(
    "Locked",
  );
});
