import { expect, test } from "vitest";
import {
  effectiveObjectStates,
  flattenObjectTree,
  moveObjectNodes,
  validateObjectTree,
  type ObjectNode,
} from "./objectTree";
const tree: ObjectNode[] = [
  {
    kind: "group",
    id: "g",
    name: "Group",
    locked: true,
    children: [
      { kind: "object", id: "a" },
      {
        kind: "group",
        id: "n",
        name: "Nested",
        hidden: true,
        children: [{ kind: "object", id: "b" }],
      },
    ],
  },
  { kind: "object", id: "c" },
];
test("inherited states preserve local flags", () => {
  expect(effectiveObjectStates(tree).get("b")).toEqual({
    hidden: true,
    locked: true,
  });
  expect(effectiveObjectStates(tree).get("a")).toEqual({
    hidden: false,
    locked: true,
  });
  expect(tree[0]).toHaveProperty("locked", true);
});
test("moving a selected ancestor moves its descendants only once", () => {
  const next = moveObjectNodes(tree, ["g", "a"], null, 1);
  expect(flattenObjectTree(next)).toEqual(["c", "a", "b"]);
  expect(flattenObjectTree(tree)).toEqual(["a", "b", "c"]);
  expect(() => moveObjectNodes(tree, ["g"], "n", 0)).toThrow();
});
test("invalid references, duplicate membership and missing objects are rejected", () => {
  expect(() => validateObjectTree(tree, [])).toThrow();
  expect(() =>
    validateObjectTree(
      [
        { kind: "object", id: "a" },
        { kind: "object", id: "a" },
      ],
      [],
    ),
  ).toThrow();
});

test("tree validation retains nesting and rejects malformed structure", () => {
  const shapes = ["a", "b", "c"].map((id) => ({ id })) as any;
  expect(flattenObjectTree(validateObjectTree(tree, shapes))).toEqual([
    "a",
    "b",
    "c",
  ]);
  expect(() =>
    validateObjectTree(
      [{ kind: "group", id: "g", name: "G", children: [] }],
      shapes,
    ),
  ).toThrow(/missing/);
  expect(() =>
    validateObjectTree(
      [{ kind: "group", id: "g", name: "G", locked: "yes", children: [] }],
      [],
    ),
  ).toThrow();
});
test("cross-parent moves preserve block order and leave the source immutable", () => {
  const next = moveObjectNodes(tree, ["b", "c"], "g", 0);
  expect(flattenObjectTree(next)).toEqual(["b", "c", "a"]);
  expect(flattenObjectTree(tree)).toEqual(["a", "b", "c"]);
  expect(() => moveObjectNodes(tree, ["a"], "unknown", 0)).toThrow();
});
