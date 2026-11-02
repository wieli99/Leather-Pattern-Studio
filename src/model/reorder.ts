export interface ReorderNode {
  id: string;
  children?: ReorderNode[];
}
export interface ReorderDestination {
  parent: string | null;
  index: number;
}
export function reorderRoots<T extends ReorderNode>(
  tree: readonly T[],
  ids: readonly string[],
): T[] {
  const picked = new Set(ids);
  return tree.flatMap((node) =>
    picked.has(node.id)
      ? [node]
      : reorderRoots((node.children ?? []) as T[], ids),
  );
}
export function reorderIds(nodes: readonly ReorderNode[]): Set<string> {
  return new Set(nodes.flatMap((n) => [n.id, ...reorderIds(n.children ?? [])]));
}
export function reorderLocation(
  tree: readonly ReorderNode[],
  id: string,
  parent: string | null = null,
): ReorderDestination | undefined {
  for (let index = 0; index < tree.length; index++) {
    const n = tree[index];
    if (n.id === id) return { parent, index };
    const found = reorderLocation(n.children ?? [], id, n.id);
    if (found) return found;
  }
}
export function reorderChildren<T extends ReorderNode>(
  tree: readonly T[],
  parent: string | null,
): readonly T[] {
  if (parent === null) return tree;
  for (const n of tree) {
    if (n.id === parent) return (n.children ?? []) as T[];
    const found = reorderChildren((n.children ?? []) as T[], parent);
    if (found.length) return found;
  }
  return [];
}
export function reorderTree<T extends ReorderNode>(
  tree: readonly T[],
  ids: readonly string[],
  destination: ReorderDestination,
): T[] {
  const roots = reorderRoots(tree, ids),
    removed = new Set(roots.map((n) => n.id));
  if (destination.parent !== null && reorderIds(roots).has(destination.parent))
    throw Error("Cannot move a group into itself");
  let inserted = false;
  function visit(nodes: readonly T[], parent: string | null): T[] {
    const remaining = nodes
      .filter((n) => !removed.has(n.id))
      .map((n) =>
        n.children ? { ...n, children: visit(n.children as T[], n.id) } : n,
      );
    if (parent === destination.parent) {
      if (
        !Number.isInteger(destination.index) ||
        destination.index < 0 ||
        destination.index > remaining.length
      )
        throw Error("Invalid insertion position");
      remaining.splice(destination.index, 0, ...roots);
      inserted = true;
    }
    return remaining;
  }
  const result = visit(tree, null);
  if (!inserted) throw Error("Unknown target group");
  return result;
}
export interface ReorderRow {
  node: ReorderNode;
  depth: number;
}
export type PreviewEntry<T> =
  | { key: string; row: T; slot: false }
  | { key: string; depth: number; slot: true };
/** Project a tree insertion into the visible flat list, preserving collapsed folders. */
export function reorderPreview<T extends ReorderRow>(
  rows: readonly T[],
  removed: Set<string>,
  destination: ReorderDestination | null,
  tree: readonly ReorderNode[],
): PreviewEntry<T>[] {
  const remaining = rows.filter((r) => !removed.has(r.node.id));
  const result: PreviewEntry<T>[] = remaining.map((row) => ({
    key: row.node.id,
    row,
    slot: false,
  }));
  if (!destination) return result;
  const siblings = reorderChildren(tree, destination.parent).filter(
    (n) => !removed.has(n.id),
  );
  const next = siblings[destination.index];
  let index = next ? remaining.findIndex((r) => r.node.id === next.id) : -1;
  const parentIndex = remaining.findIndex(
    (r) => r.node.id === destination.parent,
  );
  const depth =
    destination.parent === null ? 0 : (remaining[parentIndex]?.depth ?? 0) + 1;
  if (index < 0) {
    index = destination.parent === null ? remaining.length : parentIndex + 1;
    while (index < remaining.length && remaining[index].depth >= depth) index++;
  }
  result.splice(index, 0, { key: "__reorder-slot", depth, slot: true });
  return result;
}
