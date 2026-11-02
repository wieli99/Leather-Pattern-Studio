import { emptyDocument, type Doc, type Shape } from "./project";
import { applyMatrix, localCenter, shapeMatrix } from "./geometry";
import { printTree, printRows, printStitchGroups, resolvedPrintItems, type PrintLayout, type PrintNode } from "./printLayout";
import type { ObjectNode } from "./objectTree";

/** An editable scene in physical layout coordinates. No source references escape it. */
export function printDocument(document: Doc, layout: PrintLayout): Doc {
  const items = resolvedPrintItems(document, layout);
  const tree = (nodes: PrintNode[]): ObjectNode[] => nodes.map(node => node.kind === "instance"
    ? { kind: "object", id: node.id }
    : { kind: "group", id: node.id, name: node.name, hidden: node.hidden, locked: node.locked, children: tree(node.children) });
  return {
    ...emptyDocument(),
    shapes: items.map(item => ({ ...item.shape, name: item.instance.name ?? item.source.name })),
    objectTree: tree(printTree(layout)),
    stitchGroups: items.flatMap(item => printStitchGroups(document, layout, item.source.id)
      .map((group, index) => ({ ...group, id: `${item.instance.id}:stitch:${index}`, shapeId: item.instance.id }))),
  };
}

/** Keep untouched linked placements; materialize edits and additions as local snapshots. */
export function applyPrintDocument(layout: PrintLayout, original: Doc, next: Doc): PrintLayout {
  const groups = new Map(printRows(layout).filter(row => row.node.kind === "group").map(row => [row.node.id, row.node]));
  const tree = (nodes: ObjectNode[]): PrintNode[] => nodes.map(node => node.kind === "object"
    ? { kind: "instance", id: node.id }
    : { x: 0, y: 0, rotation: 0, ...groups.get(node.id), ...node, children: tree(node.children) });
  return {
    ...layout,
    tree: tree(next.objectTree ?? next.shapes.map(shape => ({ kind: "object", id: shape.id }))),
    instances: next.shapes.map((shape: Shape) => {
      const old = layout.instances.find(item => item.id === shape.id);
      const groups = (next.stitchGroups ?? []).filter(group => group.shapeId === shape.id);
      if (old && JSON.stringify(original.shapes.find(item => item.id === shape.id)) === JSON.stringify(shape)
        && JSON.stringify((original.stitchGroups ?? []).filter(group => group.shapeId === shape.id)) === JSON.stringify(groups)) return old;
      const matrix = shapeMatrix(shape);
      const position = applyMatrix(matrix, localCenter(shape));
      return {
        id: shape.id, sourceId: shape.id, x: position.x, y: position.y,
        rotation: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI,
        name: shape.name, hidden: shape.hidden, locked: shape.locked,
        snapshot: { shape: structuredClone(shape), stitchGroups: structuredClone(groups) },
      };
    }),
  };
}
