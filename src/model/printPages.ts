import type { Doc } from "./project";
import {
  resolvedPrintItems,
  printItemIntersects,
  printableSize,
  printDescendants,
  printTree,
  removePrintNodes,
  type PrintLayout,
  type PrintPage,
  type PrintNode,
} from "./printLayout";
export const pageKey = (p: PrintPage) => `${p.column},${p.row}`;
export const numberedPages = (l: PrintLayout) =>
  [...l.pages].sort((a, b) => a.row - b.row || a.column - b.column);
export function pageContents(doc: Doc, l: PrintLayout) {
  const size = printableSize(l);
  return numberedPages(l).map((page, index) => ({
    page,
    number: index + 1,
    items: resolvedPrintItems(doc, l).filter((i) =>
      printItemIntersects(doc, l, i, {
        x: page.column * size.width,
        y: page.row * size.height,
        width: size.width,
        height: size.height,
      }),
    ),
  }));
}
export function deletePrintPages(
  doc: Doc,
  l: PrintLayout,
  keys: string[],
): PrintLayout {
  const contents = pageContents(doc, l),
    picked = new Set(keys),
    removed = new Set(
      contents
        .filter((p) => picked.has(pageKey(p.page)))
        .flatMap((p) => p.items.map((i) => i.instance.id)),
    );
  const required = contents.filter(
    (p) =>
      !picked.has(pageKey(p.page)) &&
      p.items.some((i) => removed.has(i.instance.id)),
  );
  if (required.length)
    throw Error(
      `Also select pages ${required.map((p) => p.number).join(", ")} before deleting spanning objects`,
    );
  const next = removePrintNodes(l, [...removed]),
    pages = l.pages.filter((p) => !picked.has(pageKey(p)));
  return { ...next, pages: pages.length ? pages : [{ column: 0, row: 0 }] };
}
export function movePrintPage(
  doc: Doc,
  l: PrintLayout,
  source: PrintPage,
  target: PrintPage,
  axis: "x" | "y",
): PrintLayout {
  if (!l.pages.some((p) => pageKey(p) === pageKey(source)))
    throw Error("Page no longer exists");
  const contents = pageContents(doc, l),
    sourceItems = new Set(
      contents
        .find((p) => pageKey(p.page) === pageKey(source))!
        .items.map((i) => i.instance.id),
    );
  if (
    contents.some(
      (p) =>
        pageKey(p.page) !== pageKey(source) &&
        p.items.some((i) => sourceItems.has(i.instance.id)),
    )
  )
    throw Error(
      "Cannot move a page containing an object that spans other pages",
    );
  if (pageKey(source) === pageKey(target)) return l;
  const remaining = l.pages.filter((p) => pageKey(p) !== pageKey(source));
  if (
    !l.pages.some(
      (p) =>
        pageKey(p) === pageKey(target) ||
        Math.abs(p.column - target.column) + Math.abs(p.row - target.row) === 1,
    )
  )
    throw Error("Drop at a page insertion edge");
  const changes = new Map<string, PrintPage>();
  // Compact only the contiguous run following the removed sheet.
  let gap = { ...source };
  while (true) {
    const following = {
      column: gap.column + (axis === "x" ? 1 : 0),
      row: gap.row + (axis === "y" ? 1 : 0),
    };
    const index = remaining.findIndex((p) => pageKey(p) === pageKey(following));
    if (index < 0) break;
    changes.set(pageKey(following), { ...gap });
    remaining[index] = { ...gap };
    gap = following;
  }
  changes.set(pageKey(source), target);
  const compacted = new Map(
    l.pages
      .filter((p) => pageKey(p) !== pageKey(source))
      .map((p) => [pageKey(changes.get(pageKey(p)) ?? p), p]),
  );
  let cursor = { ...target };
  while (remaining.some((p) => pageKey(p) === pageKey(cursor))) {
    const original = compacted.get(pageKey(cursor))!;
    changes.set(pageKey(original), {
      column: cursor.column + (axis === "x" ? 1 : 0),
      row: cursor.row + (axis === "y" ? 1 : 0),
    });
    cursor = {
      column: cursor.column + (axis === "x" ? 1 : 0),
      row: cursor.row + (axis === "y" ? 1 : 0),
    };
  }
  const size = printableSize(l),
    deltas = new Map<string, { x: number; y: number }>();
  for (const item of l.instances) {
    const touched = contents.filter((p) =>
      p.items.some((i) => i.instance.id === item.id),
    );
    const moves = touched.map((p) => {
      const next = changes.get(pageKey(p.page)) ?? p.page;
      return {
        x: (next.column - p.page.column) * size.width,
        y: (next.row - p.page.row) * size.height,
      };
    });
    if (moves.some((m) => m.x !== moves[0].x || m.y !== moves[0].y))
      throw Error(
        "Insertion would split an object shared by neighbouring pages",
      );
    if (moves.length) deltas.set(item.id, moves[0]);
  }
  function groups(nodes: PrintNode[]): PrintNode[] {
    return nodes.map((node) => {
      if (node.kind === "instance") return node;
      const ids = printDescendants(l, [node.id]),
        moves = ids.map((id) => deltas.get(id) ?? { x: 0, y: 0 }),
        delta = moves[0];
      return {
        ...node,
        ...(delta && moves.every((m) => m.x === delta.x && m.y === delta.y)
          ? { x: node.x + delta.x, y: node.y + delta.y }
          : {}),
        children: groups(node.children),
      };
    });
  }
  return {
    ...l,
    pages: l.pages.map((p) => changes.get(pageKey(p)) ?? p),
    instances: l.instances.map((i) => {
      const d = deltas.get(i.id);
      return d ? { ...i, x: i.x + d.x, y: i.y + d.y } : i;
    }),
    tree: groups(printTree(l)),
  };
}
