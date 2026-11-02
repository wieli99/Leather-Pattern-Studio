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
it("keeps linked children within their owner and rejects mixed-owner moves atomically", () => {
  expect(
    movePrintTree(layout, ["c"], { parent: "linked", index: 0 }).tree?.[1],
  ).toMatchObject({ children: [leaf("c"), leaf("b")] });
  expect(() =>
    movePrintTree(layout, ["b", "a"], { parent: null, index: 0 }),
  ).toThrow("linked children");
  expect(() =>
    movePrintTree(layout, ["a"], { parent: "linked", index: 0 }),
  ).toThrow("linked children");
  expect(
    movePrintTree(layout, ["linked", "b"], {
      parent: null,
      index: 2,
    }).tree?.map((n) => n.id),
  ).toEqual(["a", "d", "linked"]);
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
