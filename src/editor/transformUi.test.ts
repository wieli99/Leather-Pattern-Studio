import { expect, test } from "vitest";
import { hitsTransformShaft } from "./transformUi";
test("shaft hit tolerance stays eight screen pixels across zoom levels", () => {
  for (const zoom of [0.5, 1, 4]) {
    expect(
      hitsTransformShaft(
        { x: 30 / zoom, y: 7 / zoom },
        { x: 0, y: 0 },
        { x: 72 / zoom, y: 0 },
        zoom,
      ),
    ).toBe(true);
    expect(
      hitsTransformShaft(
        { x: 30 / zoom, y: 9 / zoom },
        { x: 0, y: 0 },
        { x: 72 / zoom, y: 0 },
        zoom,
      ),
    ).toBe(false);
  }
});
