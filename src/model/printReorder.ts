import {
  breakPrintLinks,
  isLinkedGroup,
  linkedPrintAncestors,
  printTree,
  printRows,
  type PrintLayout,
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
  // Moving across a live folder boundary changes that folder's membership, so
  // the folders gained or lost keep only individual links to their members.
  const origin = linkedPrintAncestors(tree, roots.map((n) => n.id));
  const parent = rows.find((r) => r.node.id === destination.parent)?.node;
  const target =
    destination.parent === null
      ? new Set<string>()
      : linkedPrintAncestors(tree, [destination.parent]);
  if (parent && isLinkedGroup(parent)) target.add(parent.id);
  const broken = new Set(
    [...origin, ...target].filter((id) => !origin.has(id) || !target.has(id)),
  );
  return {
    ...layout,
    tree: breakPrintLinks(
      reorderTree(
        tree,
        roots.map((n) => n.id),
        destination,
      ),
      broken,
    ),
  };
}
