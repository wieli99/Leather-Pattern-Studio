import { stitchGeometry, type StitchGroup } from "./stitchGeometry";
import { stitchMarks } from "./stitch";
import {
  bounds,
  shapeMatrix,
  localCenter,
  multiply,
  center,
  intersectsBox,
  contains,
  worldCubics,
} from "./geometry";
import type { Doc, Shape } from "./project";
import type { ObjectNode } from "./objectTree";
import { isIndicator, indicatorGeometry } from "./indicators";
import { measurementGeometry } from "./measurement";
import { flattenCubic, isCurve } from "./curves";

export const MAX_PRINT_PAGES = 500;
export const paperFormats = {
  A5: [148, 210],
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
  Tabloid: [279.4, 431.8],
} as const;

export type { PrintPage } from "../generated/PrintPage";
import type { PrintPage } from "../generated/PrintPage";
export type { PrintPlacement } from "../generated/PrintPlacement";
export type { PrintNode } from "../generated/PrintNode";
export type { PrintLayout } from "../generated/PrintLayout";
import type { PrintPlacement } from "../generated/PrintPlacement";
import type { PrintNode } from "../generated/PrintNode";
import type { PrintLayout } from "../generated/PrintLayout";

/** Page coordinates describe adjoining printable areas, independent of screen gutters. */
export function printableSize(
  layout: Pick<PrintLayout, "width" | "height" | "margin">,
) {
  const { width, height, margin } = layout;
  if (
    ![width, height, margin].every(Number.isFinite) ||
    margin < 0 ||
    width <= margin * 2 ||
    height <= margin * 2 ||
    width > 5000 ||
    height > 5000
  ) {
    throw Error("Paper must have a positive printable area");
  }
  return { width: width - 2 * margin, height: height - 2 * margin };
}

/** Return a new page collection; exact contact with a boundary is not overflow. */
export function pagesForBounds(
  layout: Pick<PrintLayout, "width" | "height" | "margin" | "pages">,
  bounds: { x: number; y: number; width: number; height: number },
  touched?: (page: PrintPage) => boolean,
): PrintPage[] {
  const size = printableSize(layout);
  if (
    !Object.values(bounds).every(Number.isFinite) ||
    bounds.width < 0 ||
    bounds.height < 0
  ) {
    throw Error("Invalid print bounds");
  }
  const left = Math.floor(bounds.x / size.width);
  const top = Math.floor(bounds.y / size.height);
  const right = Math.max(
    left,
    Math.ceil((bounds.x + bounds.width) / size.width) - 1,
  );
  const bottom = Math.max(
    top,
    Math.ceil((bounds.y + bounds.height) / size.height) - 1,
  );
  if (
    (right - left + 1) * (bottom - top + 1) >
    (touched ? 50000 : MAX_PRINT_PAGES)
  ) {
    throw Error("Print layout exceeds 500 pages");
  }
  const pages = new Map(
    layout.pages.map((page) => [`${page.column}:${page.row}`, page]),
  );
  for (let row = top; row <= bottom; row++) {
    for (let column = left; column <= right; column++) {
      const page = { column, row };
      if (!touched || touched(page)) pages.set(`${column}:${row}`, page);
      if (pages.size > MAX_PRINT_PAGES)
        throw Error("Print layout exceeds 500 pages");
    }
  }
  if (pages.size > MAX_PRINT_PAGES)
    throw Error("Print layout exceeds 500 pages");
  return [...pages.values()].sort(
    (a, b) => a.row - b.row || a.column - b.column,
  );
}

export function validatePrintLayouts(value: unknown): PrintLayout[] {
  if (!Array.isArray(value) || value.length > 100)
    throw Error("Invalid print layouts");
  const ids = new Set<string>();
  for (const layout of value) {
    if (
      !layout ||
      typeof layout.id !== "string" ||
      !layout.id ||
      ids.has(layout.id) ||
      typeof layout.name !== "string" ||
      !layout.name.trim() ||
      layout.name.length > 200 ||
      !["mm", "in-decimal", "in-fractional"].includes(layout.units)
    )
      throw Error("Invalid print layout");
    ids.add(layout.id);
    printableSize(layout);
    if (
      !Array.isArray(layout.pages) ||
      !layout.pages.length ||
      layout.pages.length > MAX_PRINT_PAGES ||
      layout.pages.some(
        (p: PrintPage) =>
          !p ||
          !Number.isSafeInteger(p.column) ||
          !Number.isSafeInteger(p.row) ||
          Math.abs(p.column) > 2147483647 ||
          Math.abs(p.row) > 2147483647,
      ) ||
      new Set(layout.pages.map((p: PrintPage) => `${p.column}:${p.row}`))
        .size !== layout.pages.length
    )
      throw Error("Invalid print pages");
    const instances = new Set<string>();
    if (!Array.isArray(layout.instances) || layout.instances.length > 10000)
      throw Error("Invalid print instances");
    for (const item of layout.instances) {
      if (
        !item ||
        typeof item.id !== "string" ||
        !item.id ||
        instances.has(item.id) ||
        typeof item.sourceId !== "string" ||
        !item.sourceId ||
        ![item.x, item.y, item.rotation].every(Number.isFinite) ||
        (item.mirrored !== undefined && typeof item.mirrored !== "boolean") ||
        (item.hidden !== undefined && typeof item.hidden !== "boolean") ||
        (item.locked !== undefined && typeof item.locked !== "boolean") ||
        (item.snapshot !== undefined && (!item.snapshot || !item.snapshot.shape ||
          item.snapshot.shape.id !== item.sourceId || !Array.isArray(item.snapshot.stitchGroups)))
      )
        throw Error("Invalid print instance");
      if (
        item.name !== undefined &&
        (typeof item.name !== "string" ||
          !item.name.trim() ||
          item.name.length > 200)
      )
        throw Error("Invalid print name");
      instances.add(item.id);
    }
    const seen = new Set<string>();
    function tree(nodes: unknown, depth = 0) {
      if (!Array.isArray(nodes) || depth > 100)
        throw Error("Invalid print tree");
      for (const node of nodes) {
        if (
          !node ||
          typeof node.id !== "string" ||
          !node.id ||
          seen.has(node.id)
        )
          throw Error("Invalid print tree ID");
        seen.add(node.id);
        if (node.kind === "instance") {
          if (!instances.has(node.id)) throw Error("Unknown print instance");
        } else if (node.kind === "group") {
          if (
            instances.has(node.id) ||
            typeof node.name !== "string" ||
            !node.name.trim() ||
            node.name.length > 200 ||
            ![node.x, node.y, node.rotation].every(Number.isFinite) ||
            (node.sourceId !== undefined &&
              typeof node.sourceId !== "string") ||
            (node.excludedSourceIds !== undefined &&
              (!Array.isArray(node.excludedSourceIds) ||
                node.excludedSourceIds.some(
                  (id: unknown) => typeof id !== "string",
                ))) ||
            (node.mirrored !== undefined &&
              typeof node.mirrored !== "boolean") ||
            (node.unlinked !== undefined && typeof node.unlinked !== "boolean") ||
            (node.hidden !== undefined && typeof node.hidden !== "boolean") ||
            (node.locked !== undefined && typeof node.locked !== "boolean")
          )
            throw Error("Invalid print group");
          tree(node.children, depth + 1);
        } else throw Error("Invalid print tree kind");
      }
    }
    if (layout.tree !== undefined) {
      tree(layout.tree);
      if ([...instances].some((id) => !seen.has(id)))
        throw Error("Print instance missing from tree");
    }
  }
  return structuredClone(value);
}

export function resolvePrintShape(source: Shape, item: PrintPlacement): Shape {
  const origin = localCenter(source),
    m = shapeMatrix(source);
  const angle = Math.atan2(m.b, m.a),
    c = Math.cos(angle),
    s = Math.sin(angle);
  const a = c * m.a + s * m.b,
    b = -s * m.a + c * m.b;
  const cc = c * m.c + s * m.d,
    d = -s * m.c + c * m.d;
  const t = (item.rotation * Math.PI) / 180;
  return {
    ...source,
    id: item.id,
    hidden: item.hidden,
    locked: item.locked,
    rotation: 0,
    transform: multiply(
      {
        a: Math.cos(t),
        b: Math.sin(t),
        c: -Math.sin(t) * (item.mirrored ? -1 : 1),
        d: Math.cos(t) * (item.mirrored ? -1 : 1),
        e: item.x,
        f: item.y,
      },
      {
        a,
        b,
        c: cc,
        d,
        e: -a * origin.x - cc * origin.y,
        f: -b * origin.x - d * origin.y,
      },
    ),
  };
}
export const printTree = (layout: PrintLayout): PrintNode[] =>
  layout.tree ?? layout.instances.map((i) => ({ kind: "instance", id: i.id }));
export function printRows(layout: PrintLayout) {
  const rows: {
    node: PrintNode;
    depth: number;
    hidden: boolean;
    locked: boolean;
  }[] = [];
  function visit(
    nodes: PrintNode[],
    depth = 0,
    hidden = false,
    locked = false,
  ) {
    for (const node of nodes) {
      const instance = layout.instances.find((i) => i.id === node.id);
      const h =
        hidden || !!(node.kind === "group" ? node.hidden : instance?.hidden);
      const l =
        locked || !!(node.kind === "group" ? node.locked : instance?.locked);
      rows.push({ node, depth, hidden: h, locked: l });
      if (node.kind === "group") visit(node.children, depth + 1, h, l);
    }
  }
  visit(printTree(layout));
  return rows;
}
export function resolvedPrintItems(doc: Doc, layout: PrintLayout) {
  // Like Grid, panel rows run front-to-back and painting runs back-to-front.
  return [...printRows(layout)].reverse().flatMap((row) => {
    if (row.node.kind !== "instance") return [];
    const instance = layout.instances.find((i) => i.id === row.node.id);
    const source = instance?.snapshot
      ? { ...instance.snapshot.shape, id: snapshotSourceId(instance.id) }
      : doc.shapes.find((s) => s.id === instance?.sourceId);
    return instance && source
      ? [
          {
            ...row,
            instance,
            source,
            shape: resolvePrintShape(source, instance),
          },
        ]
      : [];
  });
}
export function sourceNodes(doc: Doc): ObjectNode[] {
  return (
    doc.objectTree ?? doc.shapes.map((s) => ({ kind: "object", id: s.id }))
  );
}
export function findSource(
  nodes: ObjectNode[],
  id: string,
): ObjectNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.kind === "group") {
      const found = findSource(node.children, id);
      if (found) return found;
    }
  }
}
export function sourceShapeIds(node: ObjectNode): string[] {
  return node.kind === "object"
    ? [node.id]
    : node.children.flatMap(sourceShapeIds);
}
export function importPrintNode(
  doc: Doc,
  layout: PrintLayout,
  sourceId: string,
  x: number,
  y: number,
): PrintLayout {
  const source = findSource(sourceNodes(doc), sourceId);
  if (!source) throw Error("Source no longer exists");
  const instances = [...layout.instances];
  const shapes = doc.shapes.filter((s) =>
    sourceShapeIds(source).includes(s.id),
  );
  const box = shapes.length
    ? bounds(shapes, layout.units)
    : { x: 0, y: 0, width: 0, height: 0 };
  const origin = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  function build(node: ObjectNode): PrintNode {
    const id = crypto.randomUUID();
    if (node.kind === "object") {
      const shape = doc.shapes.find((s) => s.id === node.id)!;
      const p = center(shape),
        m = shapeMatrix(shape);
      instances.push({
        id,
        sourceId: node.id,
        x: x + p.x - origin.x,
        y: y + p.y - origin.y,
        rotation: (Math.atan2(m.b, m.a) * 180) / Math.PI,
      });
      return { kind: "instance", id };
    }
    const members = doc.shapes.filter((s) =>
      sourceShapeIds(node).includes(s.id),
    );
    const groupBox = members.length ? bounds(members, layout.units) : box;
    return {
      kind: "group",
      id,
      name: node.name,
      sourceId: node.id,
      x: x + groupBox.x + groupBox.width / 2 - origin.x,
      y: y + groupBox.y + groupBox.height / 2 - origin.y,
      rotation: 0,
      children: node.children.map(build),
    };
  }
  const node = build(source);
  return { ...layout, instances, tree: [...printTree(layout), node] };
}
/** Snapshot source IDs are local to a print placement, including duplicated placements. */
const snapshotSourceId = (id: string) => `print-snapshot:${id}`;

export function printStitchGroups(
  doc: Doc,
  layout: PrintLayout,
  sourceId: string,
): StitchGroup[] {
  const item = layout.instances.find(
    (i) => i.snapshot && snapshotSourceId(i.id) === sourceId,
  );
  return item?.snapshot
    ? item.snapshot.stitchGroups.map((g): StitchGroup => {
        if (g.side !== 1 && g.side !== -1)
          throw Error("Invalid snapshot stitch side");
        return { ...g, side: g.side, shapeId: sourceId };
      })
    : (doc.stitchGroups ?? []).filter((g) => g.shapeId === sourceId);
}

export function unlinkPrintNode(
  doc: Doc,
  layout: PrintLayout,
  id: string,
): PrintLayout {
  const node = printRows(layout).find((r) => r.node.id === id)?.node;
  if (!node || (node.kind === "group" && (!node.sourceId || node.unlinked)))
    return layout;
  const affected = new Set(printDescendants(layout, [id]));
  const instances = layout.instances.map((item) => {
    if (!affected.has(item.id) || item.snapshot) return item;
    const shape = doc.shapes.find((s) => s.id === item.sourceId);
    if (!shape) throw Error("Source no longer exists");
    return {
      ...item,
      snapshot: structuredClone({
        shape,
        stitchGroups: (doc.stitchGroups ?? []).filter((g) => g.shapeId === shape.id),
      }),
    };
  });
  function detach(nodes: PrintNode[]): PrintNode[] {
    return nodes.map((n) => n.kind === "instance" ? n : {
      ...n,
      ...(n.sourceId ? { unlinked: true } : {}),
      children: detach(n.children),
    });
  }
  return {
    ...layout,
    instances,
    tree: editPrintTree(printTree(layout), id, (n) => detach([n])[0]),
  };
}

/** Run once in the source transaction: no follow-up watcher commits or extra history entries. */
export function reconcilePrintLayouts(doc: Doc): Doc {
  if (!doc.printLayouts?.length) return doc;
  return {
    ...doc,
    printLayouts: doc.printLayouts.map((original) => {
      let layout = {
        ...original,
        instances: original.instances.filter((i) =>
          !!i.snapshot || doc.shapes.some((s) => s.id === i.sourceId),
        ),
      };
      function detachedOnly(nodes: PrintNode[]): PrintNode[] {
        return nodes.flatMap<PrintNode>((n) => {
          if (n.kind === "instance") return layout.instances.some((i) => i.id === n.id && i.snapshot) ? [n] : [];
          if (n.unlinked) return [n];
          const children = detachedOnly(n.children);
          return children.length ? [{ ...n, sourceId: undefined, children }] : [];
        });
      }
      function sync(
        nodes: PrintNode[],
        inheritedPool?: Map<string, PrintPlacement>,
        allowedSources?: Set<string>,
        inheritedExcluded?: Set<string>,
      ): PrintNode[] {
        return nodes.flatMap<PrintNode>((node) => {
          if (node.kind === "instance")
            return layout.instances.some(
              (i) =>
                i.id === node.id &&
                (!!i.snapshot || !allowedSources || allowedSources.has(i.sourceId)),
            )
              ? [node]
              : [];
          if (node.unlinked) return [node];
          if (!node.sourceId)
            return [
              {
                ...node,
                children: sync(
                  node.children,
                  inheritedPool,
                  allowedSources,
                  inheritedExcluded,
                ),
              },
            ];
          const source = findSource(sourceNodes(doc), node.sourceId);
          if (!source || source.kind !== "group") {
            const children = detachedOnly(node.children);
            return children.length ? [{ ...node, sourceId: undefined, children }] : [];
          }
          const excluded = new Set([
            ...(inheritedExcluded ?? []),
            ...(node.excludedSourceIds ?? []),
          ]);
          // Detached branches must never be reimported or moved by source membership changes.
          function excludeDetached(nodes: PrintNode[]) {
            for (const n of nodes) {
              if (n.kind === "instance") {
                const item = layout.instances.find((i) => i.id === n.id);
                if (item?.snapshot) excluded.add(item.sourceId);
              } else {
                if (n.unlinked && n.sourceId) {
                  excluded.add(n.sourceId);
                  const current = findSource(sourceNodes(doc), n.sourceId);
                  if (current) for (const id of sourceShapeIds(current)) excluded.add(id);
                }
                excludeDetached(n.children);
              }
            }
          }
          excludeDetached(node.children);
          const allowed = new Set(sourceShapeIds(source));
          const descendants = (items: PrintNode[]): string[] =>
            items.flatMap((n) =>
              n.kind === "instance" ? [n.id] : descendants(n.children),
            );
          const oldIds = new Set(descendants(node.children));
          const pool =
            inheritedPool ??
            new Map(
              original.instances
                .filter((i) => oldIds.has(i.id))
                .map((i) => [i.sourceId, i]),
            );
          const allowedGroups = new Set<string>();
          function collectSourceGroups(nodes: ObjectNode[]) {
            for (const child of nodes)
              if (child.kind === "group") {
                allowedGroups.add(child.id);
                collectSourceGroups(child.children);
              }
          }
          collectSourceGroups(source.children);
          function prune(nodes: PrintNode[]): PrintNode[] {
            return nodes.flatMap<PrintNode>((child) =>
              child.kind === "group"
                ? child.sourceId && !allowedGroups.has(child.sourceId)
                  ? detachedOnly([child])
                  : child.unlinked ? [child] : [{ ...child, children: prune(child.children) }]
                : [child],
            );
          }
          const children = sync(prune(node.children), pool, allowed, excluded);
          // Import newly added source folders as nested live groups, not flattened copies.
          const representedGroups = new Set<string>();
          function collectGroups(nodes: PrintNode[]) {
            for (const n of nodes)
              if (n.kind === "group") {
                if (n.sourceId) representedGroups.add(n.sourceId);
                collectGroups(n.children);
              }
          }
          collectGroups(children);
          const sourceShapes = doc.shapes.filter((s) => allowed.has(s.id));
          const box = sourceShapes.length
            ? bounds(sourceShapes)
            : { x: 0, y: 0, width: 0, height: 0 };
          for (const child of source.children) {
            if (
              child.kind !== "group" ||
              representedGroups.has(child.id) ||
              excluded.has(child.id)
            )
              continue;
            const members = doc.shapes.filter((s) =>
              sourceShapeIds(child).includes(s.id),
            );
            const b = members.length ? bounds(members) : box;
            const dx = b.x + b.width / 2 - box.x - box.width / 2,
              dy =
                (b.y + b.height / 2 - box.y - box.height / 2) *
                (node.mirrored ? -1 : 1),
              angle = (node.rotation * Math.PI) / 180;
            const imported = importPrintNode(
              doc,
              { ...layout, instances: [], tree: [] },
              child.id,
              node.x + dx * Math.cos(angle) - dy * Math.sin(angle),
              node.y + dx * Math.sin(angle) + dy * Math.cos(angle),
            );
            const oriented = node.mirrored
              ? mirrorPrintNodes(
                  imported,
                  [printTree(imported)[0].id],
                  {
                    x: node.x + dx * Math.cos(angle) - dy * Math.sin(angle),
                    y: node.y + dx * Math.sin(angle) + dy * Math.cos(angle),
                  },
                  0,
                )
              : imported;
            const rotated = transformPrintNodes(
              oriented,
              [printTree(imported)[0].id],
              0,
              0,
              node.rotation,
            );
            const replacements = new Map<string, string>();
            const removedIds = new Set(
              rotated.instances
                .filter((i) => excluded.has(i.sourceId))
                .map((i) => i.id),
            );
            for (const item of rotated.instances) {
              if (removedIds.has(item.id)) continue;
              const previous = pool.get(item.sourceId);
              if (previous) {
                replacements.set(item.id, previous.id);
                const clean = editPrintTree(children, previous.id, () => null);
                children.splice(0, children.length, ...clean);
                if (!layout.instances.some((i) => i.id === previous.id))
                  layout.instances.push(previous);
              } else layout.instances.push(item);
            }
            function replace(nodes: PrintNode[]): PrintNode[] {
              return nodes.flatMap<PrintNode>((n) =>
                removedIds.has(n.id)
                  ? []
                  : [
                      n.kind === "instance"
                        ? { ...n, id: replacements.get(n.id) ?? n.id }
                        : { ...n, children: replace(n.children) },
                    ],
              );
            }
            children.push(...replace(printTree(rotated)));
          }
          const presentIds = new Set(descendants(children));
          const present = new Set(
            layout.instances
              .filter((i) => presentIds.has(i.id))
              .map((i) => i.sourceId),
          );
          const missing = [...allowed].filter(
            (id) => !present.has(id) && !excluded.has(id),
          );
          for (const sourceId of missing) {
            const previous = pool.get(sourceId);
            if (previous) {
              if (!layout.instances.some((i) => i.id === previous.id))
                layout.instances.push(previous);
              children.push({ kind: "instance", id: previous.id });
              continue;
            }
            const shape = doc.shapes.find((s) => s.id === sourceId)!;
            const p = center(shape),
              angle = (node.rotation * Math.PI) / 180;
            const dx = p.x - box.x - box.width / 2,
              dy = (p.y - box.y - box.height / 2) * (node.mirrored ? -1 : 1);
            const id = crypto.randomUUID(),
              m = shapeMatrix(shape);
            layout.instances.push({
              id,
              sourceId,
              x: node.x + dx * Math.cos(angle) - dy * Math.sin(angle),
              y: node.y + dx * Math.sin(angle) + dy * Math.cos(angle),
              rotation:
                ((Math.atan2(m.b, m.a) * 180) / Math.PI) *
                  (node.mirrored ? -1 : 1) +
                node.rotation,
              mirrored: node.mirrored,
            });
            children.push({ kind: "instance", id });
          }
          return [{ ...node, children }];
        });
      }
      const tree = sync(printTree(layout));
      layout = { ...layout, tree };
      const referenced = new Set(
        printRows(layout)
          .filter((r) => r.node.kind === "instance")
          .map((r) => r.node.id),
      );
      layout.instances = layout.instances.filter((i) => referenced.has(i.id));
      for (const item of resolvedPrintItems(doc, layout)) {
        if (!item.hidden)
          layout.pages = pagesForBounds(
            layout,
            printArtworkBounds(doc, layout, item),
            (page) => {
              const size = printableSize(layout);
              return printItemIntersects(doc, layout, item, {
                x: page.column * size.width,
                y: page.row * size.height,
                width: size.width,
                height: size.height,
              });
            },
          );
      }
      return layout;
    }),
  };
}

export function printDescendants(layout: PrintLayout, ids: string[]): string[] {
  const selected = new Set(ids),
    result = new Set<string>();
  function visit(nodes: PrintNode[], included = false) {
    for (const node of nodes) {
      const active = included || selected.has(node.id);
      if (node.kind === "instance") {
        if (active) result.add(node.id);
      } else visit(node.children, active);
    }
  }
  visit(printTree(layout));
  return [...result];
}
export function editPrintTree(
  nodes: PrintNode[],
  id: string,
  edit: (node: PrintNode) => PrintNode | null,
): PrintNode[] {
  return nodes.flatMap<PrintNode>((node) => {
    if (node.id === id) {
      const result = edit(node);
      return result ? [result] : [];
    }
    return [
      node.kind === "group"
        ? { ...node, children: editPrintTree(node.children, id, edit) }
        : node,
    ];
  });
}
export function removePrintNodes(
  layout: PrintLayout,
  ids: string[],
): PrintLayout {
  const removed = new Set(printDescendants(layout, ids));
  const deletedSources = layout.instances
    .filter((i) => removed.has(i.id))
    .map((i) => i.sourceId);
  for (const row of printRows(layout))
    if (
      ids.includes(row.node.id) &&
      row.node.kind === "group" &&
      row.node.sourceId
    )
      deletedSources.push(row.node.sourceId);
  function remove(nodes: PrintNode[]): PrintNode[] {
    return nodes.flatMap<PrintNode>((node) => {
      if (ids.includes(node.id)) return [];
      if (node.kind === "instance") return removed.has(node.id) ? [] : [node];
      return [
        {
          ...node,
          excludedSourceIds: node.sourceId
            ? [
                ...new Set([
                  ...(node.excludedSourceIds ?? []),
                  ...deletedSources,
                ]),
              ]
            : node.excludedSourceIds,
          children: remove(node.children),
        },
      ];
    });
  }
  return {
    ...layout,
    tree: remove(printTree(layout)),
    instances: layout.instances.filter((i) => !removed.has(i.id)),
  };
}
export function transformPrintNodes(
  layout: PrintLayout,
  ids: string[],
  dx: number,
  dy: number,
  angle: number,
  pivot?: { x: number; y: number },
): PrintLayout {
  const affected = new Set(printDescendants(layout, ids));
  const selected = layout.instances.filter((i) => affected.has(i.id));
  const x = pivot
    ? pivot.x
    : selected.length
      ? selected.reduce((s, i) => s + i.x, 0) / selected.length
      : 0;
  const y = pivot
    ? pivot.y
    : selected.length
      ? selected.reduce((s, i) => s + i.y, 0) / selected.length
      : 0;
  const t = (angle * Math.PI) / 180,
    c = Math.cos(t),
    s = Math.sin(t);
  const move = (p: { x: number; y: number; rotation: number }) => ({
    x: x + (p.x - x) * c - (p.y - y) * s + dx,
    y: y + (p.x - x) * s + (p.y - y) * c + dy,
    rotation: p.rotation + angle,
  });
  function groups(nodes: PrintNode[], inherited = false): PrintNode[] {
    return nodes.map((node) =>
      node.kind === "instance"
        ? node
        : {
            ...node,
            ...(inherited || ids.includes(node.id) ? move(node) : {}),
            children: groups(node.children, inherited || ids.includes(node.id)),
          },
    );
  }
  return {
    ...layout,
    instances: layout.instances.map((i) =>
      affected.has(i.id) ? { ...i, ...move(i) } : i,
    ),
    tree: groups(printTree(layout)),
  };
}

/** Reflect linked placements without changing their source geometry. */
export function mirrorPrintNodes(
  layout: PrintLayout,
  ids: string[],
  pivot: { x: number; y: number },
  angle: number,
): PrintLayout {
  const affected = new Set(printDescendants(layout, ids));
  const t = (angle * Math.PI) / 180,
    c = Math.cos(2 * t),
    s = Math.sin(2 * t);
  const reflect = (p: {
    x: number;
    y: number;
    rotation: number;
    mirrored?: boolean;
  }) => ({
    x: pivot.x + c * (p.x - pivot.x) + s * (p.y - pivot.y),
    y: pivot.y + s * (p.x - pivot.x) - c * (p.y - pivot.y),
    rotation: 2 * angle - p.rotation,
    mirrored: !p.mirrored,
  });
  function visit(nodes: PrintNode[], inherited = false): PrintNode[] {
    return nodes.map((n) =>
      n.kind === "instance"
        ? n
        : {
            ...n,
            ...(inherited || ids.includes(n.id) ? reflect(n) : {}),
            children: visit(n.children, inherited || ids.includes(n.id)),
          },
    );
  }
  return {
    ...layout,
    instances: layout.instances.map((i) =>
      affected.has(i.id) ? { ...i, ...reflect(i) } : i,
    ),
    tree: visit(printTree(layout)),
  };
}

/** Include physical strokes, unit-aware labels, and stitch markers in tiling decisions. */
export function printArtworkBounds(
  doc: Doc,
  layout: PrintLayout,
  item: { shape: Shape; source: Shape },
) {
  const geometry =
    item.shape.kind === "text"
      ? { ...item.shape, kind: "rectangle" as const, radius: 0 }
      : item.shape;
  const box = bounds([geometry], layout.units),
    m = shapeMatrix(item.shape);
  const stroke =
    ((item.shape.strokeWidth ?? 0.35) / 2) *
    Math.max(1, Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
  let left = box.x - stroke,
    top = box.y - stroke,
    right = box.x + box.width + stroke,
    bottom = box.y + box.height + stroke;
  for (const group of printStitchGroups(doc, layout, item.source.id)) {
    try {
      const base = stitchMarks[group.settings.style];
      const radius =
        Math.hypot(
          group.settings.style === "round"
            ? (group.settings.roundDiameter ?? base.width)
            : group.settings.style === "flat"
              ? (group.settings.flatLength ?? base.width)
              : base.width,
          base.height,
        ) / 2;
      for (const { point } of stitchGeometry(item.shape, group).holes) {
        left = Math.min(left, point.x - radius);
        right = Math.max(right, point.x + radius);
        top = Math.min(top, point.y - radius);
        bottom = Math.max(bottom, point.y + radius);
      }
    } catch {
      /* Invalid source stitching is reported by the print renderer rather than dropping artwork silently. */
    }
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Test real artwork against a printable cell rather than filling its entire bounding rectangle. */
export function printItemIntersects(
  doc: Doc,
  layout: PrintLayout,
  item: { shape: Shape; source: Shape },
  box: { x: number; y: number; width: number; height: number },
) {
  const original = item.shape;
  const shape =
    original.kind === "text"
      ? { ...original, kind: "rectangle" as const, radius: 0 }
      : original;
  const padding = (shape.strokeWidth ?? 0.35) / 2;
  const region = {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + 2 * padding,
    height: box.height + 2 * padding,
  };
  if (
    intersectsBox(shape, region, 0.01, layout.units) ||
    contains(shape, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  )
    return true;
  const overlaps = (points: import("./project").Point[]) => {
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    return (
      Math.min(...xs) < box.x + box.width &&
      Math.max(...xs) > box.x &&
      Math.min(...ys) < box.y + box.height &&
      Math.max(...ys) > box.y
    );
  };
  if (
    isIndicator(shape.kind) &&
    indicatorGeometry(shape, layout.units).labels.some((l) =>
      overlaps(l.bounds),
    )
  )
    return true;
  if (
    shape.kind === "measurement" &&
    overlaps(measurementGeometry(shape, layout.units).labelBounds)
  )
    return true;
  if (
    isCurve(shape) &&
    shape.points.length > 2 &&
    Math.hypot(
      shape.points[0].x - shape.points.at(-1)!.x,
      shape.points[0].y - shape.points.at(-1)!.y,
    ) < 1e-9
  ) {
    const points = worldCubics(shape).flatMap((c) => flattenCubic(c, 0.05));
    if (
      points.length &&
      contains(
        {
          ...shape,
          kind: "polyline",
          radius: 0,
          rotation: 0,
          transform: undefined,
          cornerRadii: undefined,
          points: [...points, points[0]],
        },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      )
    )
      return true;
  }
  for (const group of printStitchGroups(doc, layout, item.source.id)) {
    try {
      const radius =
        Math.max(
          group.settings.roundDiameter ?? 0,
          group.settings.flatLength ?? 0,
          stitchMarks[group.settings.style].width,
        ) / 2;
      if (
        stitchGeometry(shape, group).holes.some(
          ({ point }) =>
            point.x + radius > box.x &&
            point.x - radius < box.x + box.width &&
            point.y + radius > box.y &&
            point.y - radius < box.y + box.height,
        )
      )
        return true;
    } catch {}
  }
  return false;
}
