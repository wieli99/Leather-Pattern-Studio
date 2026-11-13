import paper from "paper";
import type { Point } from "./project";
import type { Cubic } from "./curves";

export type BooleanOperation = "union" | "subtract" | "intersect" | "exclude";
/** Closed world-space contours. Holes and nested islands use even-odd filling. */
export type BooleanOutline = Cubic[][];

// Reuse the scope: Paper.js retains every created scope in its global registry.
const scope = new paper.PaperScope();

/** Isolated geometry computation: never inserts items into the editor or history. */
export function booleanOutlines(
  operation: BooleanOperation,
  outlines: BooleanOutline[],
): BooleanOutline {
  if (outlines.length < 2) throw Error("Select at least two closed outlines");
  scope.activate();
  scope.setup(new scope.Size(1, 1));
  const point = (p: Point) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
      throw Error("Invalid outline coordinate");
    return new scope.Point(p.x, p.y);
  };
  try {
    const inputs = outlines.map((contours) => {
      const compound = new scope.CompoundPath({
        insert: false,
        fillRule: "evenodd",
      });
      for (const contour of contours) {
        if (!contour.length) throw Error("Empty contour");
        const path = new scope.Path({ insert: false });
        path.moveTo(point(contour[0][0]));
        for (let i = 0; i < contour.length; i++) {
          const [a, b, c, d] = contour[i];
          const previous =
            contour[(i + contour.length - 1) % contour.length][3];
          if (Math.hypot(a.x - previous.x, a.y - previous.y) > 1e-7)
            throw Error("Outline must be closed and continuous");
          path.cubicCurveTo(point(b), point(c), point(d));
        }
        path.closePath();
        if (path.getCrossings(path).length)
          throw Error("Self-intersecting outlines are unsupported.");
        compound.addChild(path);
      }
      return compound;
    });
    let result: paper.PathItem = inputs[0];
    for (const input of inputs.slice(1)) {
      const options = { insert: false };
      result =
        operation === "union"
          ? result.unite(input, options)
          : operation === "subtract"
            ? result.subtract(input, options)
            : operation === "intersect"
              ? result.intersect(input, options)
              : result.exclude(input, options);
    }
    const paths =
      result instanceof scope.CompoundPath
        ? (result.children as paper.Path[])
        : [result as paper.Path];
    return paths
      .filter((path) => path.curves.length > 0 && Math.abs(path.area) > 1e-12)
      .map((path) =>
        path.curves
          .filter((curve) => curve.length > 1e-9)
          .map(
            (curve) =>
              (curve.isStraight()
                ? [
                    curve.point1,
                    curve.point1.add(
                      curve.point2.subtract(curve.point1).divide(3),
                    ),
                    curve.point2.subtract(
                      curve.point2.subtract(curve.point1).divide(3),
                    ),
                    curve.point2,
                  ]
                : [
                    curve.point1,
                    curve.point1.add(curve.handle1),
                    curve.point2.add(curve.handle2),
                    curve.point2,
                  ]
              ).map((p) => ({ x: p.x, y: p.y })) as Cubic,
          ),
      );
  } finally {
    scope.project.remove();
  }
}
