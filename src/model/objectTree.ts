import type { Shape } from "./project";

/** Panel order is front to back; geometry remains in drawing order. */
export type { ObjectNode } from "../generated/ObjectNode";
import type { ObjectNode } from "../generated/ObjectNode";

export function objectTreeFromShapes(shapes: readonly Shape[]): ObjectNode[] {
  return [...shapes]
    .reverse()
    .map((shape) => ({ kind: "object", id: shape.id }));
}

export function validateObjectTree(
  value: unknown,
  shapes: readonly Shape[],
): ObjectNode[] {
  const shapeIds = new Set(shapes.map((s) => s.id));
  const seen = new Set<string>();
  let count = 0;
  function visit(nodes: unknown, depth: number): ObjectNode[] {
    if (!Array.isArray(nodes) || depth > 100)
      throw Error("Invalid object tree");
    return nodes.map((node) => {
      if (
        !node ||
        typeof node !== "object" ||
        typeof node.id !== "string" ||
        !node.id ||
        seen.has(node.id) ||
        ++count > 100000
      )
        throw Error("Invalid or duplicate tree item");
      seen.add(node.id);
      if (node.kind === "object") {
        if (!shapeIds.has(node.id)) throw Error("Unknown tree object");
        return { kind: "object", id: node.id };
      }
      if (
        node.kind !== "group" ||
        shapeIds.has(node.id) ||
        typeof node.name !== "string" ||
        !node.name.trim() ||
        node.name.length > 200 ||
        (node.hidden !== undefined && typeof node.hidden !== "boolean") ||
        (node.locked !== undefined && typeof node.locked !== "boolean")
      )
        throw Error("Invalid object group");
      return {
        kind: "group",
        id: node.id,
        name: node.name,
        ...(node.hidden !== undefined ? { hidden: node.hidden } : {}),
        ...(node.locked !== undefined ? { locked: node.locked } : {}),
        children: visit(node.children, depth + 1),
      };
    });
  }
  const tree = visit(value, 0);
  if ([...shapeIds].some((id) => !seen.has(id)))
    throw Error("Object missing from tree");
  return tree;
}

export function flattenObjectTree(tree: readonly ObjectNode[]): string[] {
  return tree.flatMap((node) =>
    node.kind === "object" ? [node.id] : flattenObjectTree(node.children),
  );
}

export function effectiveObjectStates(tree: readonly ObjectNode[]) {
  const states = new Map<string, { hidden: boolean; locked: boolean }>();
  function visit(nodes: readonly ObjectNode[], hidden = false, locked = false) {
    for (const node of nodes) {
      const state = {
        hidden: hidden || (node.kind === "group" && !!node.hidden),
        locked: locked || (node.kind === "group" && !!node.locked),
      };
      states.set(node.id, state);
      if (node.kind === "group")
        visit(node.children, state.hidden, state.locked);
    }
  }
  visit(tree);
  return states;
}

/** Move a block without mutating the original; nested selections move only once. */
export function moveObjectNodes(
  tree: readonly ObjectNode[],
  ids: readonly string[],
  parentId: string | null,
  index: number,
): ObjectNode[] {
  const selected = new Set(ids);
  const moved: ObjectNode[] = [];
  function remove(nodes: readonly ObjectNode[]): ObjectNode[] {
    return nodes.flatMap<ObjectNode>((node) => {
      if (selected.has(node.id)) {
        moved.push(node);
        return [];
      }
      return [
        node.kind === "group"
          ? { ...node, children: remove(node.children) }
          : node,
      ];
    });
  }
  const result = remove(tree);
  if (!moved.length) return [...tree];
  if (
    parentId !== null &&
    moved.some(
      (node) =>
        node.id === parentId ||
        (node.kind === "group" && containsNode(node.children, parentId)),
    )
  )
    throw Error("Cannot move a group into itself");
  let inserted = false;
  function insert(nodes: ObjectNode[], parent: string | null): ObjectNode[] {
    if (parent === parentId) {
      if (!Number.isInteger(index) || index < 0 || index > nodes.length)
        throw Error("Invalid insertion position");
      inserted = true;
      return [...nodes.slice(0, index), ...moved, ...nodes.slice(index)];
    }
    return nodes.map((node) =>
      node.kind === "group"
        ? { ...node, children: insert(node.children, node.id) }
        : node,
    );
  }
  const next = insert(result, null);
  if (!inserted) throw Error("Unknown target group");
  return next;
}
function containsNode(nodes: readonly ObjectNode[], id: string): boolean {
  return nodes.some(
    (node) =>
      node.id === id ||
      (node.kind === "group" && containsNode(node.children, id)),
  );
}

export function findObjectNode(
  tree: readonly ObjectNode[],
  id: string,
): ObjectNode | undefined {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.kind === "group") {
      const found = findObjectNode(node.children, id);
      if (found) return found;
    }
  }
}
export function mapObjectTree(
  tree: readonly ObjectNode[],
  update: (node: ObjectNode) => ObjectNode,
): ObjectNode[] {
  return tree.map((node) =>
    update(
      node.kind === "group"
        ? { ...node, children: mapObjectTree(node.children, update) }
        : node,
    ),
  );
}
export function filterObjectTree(
  tree: readonly ObjectNode[],
  ids: Set<string>,
  groups = new Set<string>(),
): ObjectNode[] {
  return tree.flatMap<ObjectNode>((node) => {
    if (node.kind === "object") return ids.has(node.id) ? [node] : [];
    if (groups.has(node.id)) return [node];
    const children = filterObjectTree(node.children, ids, groups);
    return children.length ? [{ ...node, children }] : [];
  });
}
/** Only for trusted editor mutations; imported trees are strictly validated. */
export function reconcileObjectTree(
  tree: readonly ObjectNode[],
  shapes: readonly Shape[],
): ObjectNode[] {
  const ids = new Set(shapes.map((s) => s.id)),
    seen = new Set<string>();
  function prune(nodes: readonly ObjectNode[]): ObjectNode[] {
    return nodes.flatMap<ObjectNode>((node) => {
      if (node.kind === "group")
        return [{ ...node, children: prune(node.children) }];
      if (!ids.has(node.id)) return [];
      seen.add(node.id);
      return [node];
    });
  }
  const next = prune(tree);
  return [
    ...shapes
      .filter((s) => !seen.has(s.id))
      .reverse()
      .map((s) => ({ kind: "object" as const, id: s.id })),
    ...next,
  ];
}
export function nodeLocation(
  tree: readonly ObjectNode[],
  id: string,
  parent: string | null = null,
): { parent: string | null; index: number } | undefined {
  for (let index = 0; index < tree.length; index++) {
    const node = tree[index];
    if (node.id === id) return { parent, index };
    if (node.kind === "group") {
      const found = nodeLocation(node.children, id, node.id);
      if (found) return found;
    }
  }
}
export function treeInDrawingOrder(
  tree: readonly ObjectNode[],
  shapes: readonly Shape[],
): Shape[] {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  return flattenObjectTree(tree)
    .reverse()
    .map((id) => byId.get(id)!);
}

const stateCache = new WeakMap<
  object,
  Map<string, { hidden: boolean; locked: boolean }>
>();
export function objectState(
  doc: { shapes: Shape[]; objectTree?: ObjectNode[] },
  id: string,
) {
  let states = stateCache.get(doc);
  if (!states) {
    states = effectiveObjectStates(doc.objectTree ?? []);
    for (const shape of doc.shapes) {
      const inherited = states.get(shape.id);
      states.set(shape.id, {
        hidden: !!shape.hidden || !!inherited?.hidden,
        locked: !!shape.locked || !!inherited?.locked,
      });
    }
    stateCache.set(doc, states);
  }
  return states.get(id) ?? { hidden: false, locked: false };
}

export function inheritedStateSource(
  tree: readonly ObjectNode[],
  id: string,
  field: "hidden" | "locked",
  source?: string,
): string | undefined {
  for (const node of tree) {
    if (node.id === id) return source;
    if (node.kind === "group" && findObjectNode(node.children, id))
      return inheritedStateSource(
        node.children,
        id,
        field,
        node[field] ? node.name : source,
      );
  }
}
