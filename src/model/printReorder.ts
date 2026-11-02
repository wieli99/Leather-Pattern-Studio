import {
  printTree,
  printRows,
  type PrintLayout,
  type PrintNode,
} from "./printLayout";
import {
  reorderRoots,
  reorderIds,
  reorderTree,
  type ReorderDestination,
} from "./reorder";
export function movePrintTree(
  layout: PrintLayout,
  ids: string[],
  destination: ReorderDestination,
): PrintLayout {
  const tree = printTree(layout),
    roots = reorderRoots(tree, ids),
    moved = reorderIds(roots);
  if (!roots.length) throw Error("No objects to move");
  const rows = printRows(layout);
  if (
    rows.some(
      (r) =>
        r.locked && (moved.has(r.node.id) || r.node.id === destination.parent),
    )
  )
    throw Error("Locked objects cannot move");
  function owner(
    nodes: PrintNode[],
    id: string,
    current = "",
  ): string | undefined {
    for (const n of nodes) {
      if (n.id === id) return current;
      if (n.kind === "group") {
        const found = owner(n.children, id, n.sourceId ? n.id : current);
        if (found !== undefined) return found;
      }
    }
  }
  const parent = rows.find((r) => r.node.id === destination.parent)?.node;
  const destinationOwner =
    parent?.kind === "group" && parent.sourceId
      ? parent.id
      : destination.parent === null
        ? ""
        : owner(tree, destination.parent);
  if (roots.some((n) => owner(tree, n.id) !== destinationOwner))
    throw Error(
      "Move linked children within their imported folder; duplicate to make a separate copy.",
    );
  return {
    ...layout,
    tree: reorderTree(
      tree,
      roots.map((n) => n.id),
      destination,
    ),
  };
}
