import { expect, test } from "vitest";
import { segmentLabelPoint } from "./constructionLabels";
test.each([
  [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
  ],
  [
    { x: 100, y: 100 },
    { x: 0, y: 0 },
  ],
  [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ],
])("distance and direction labels have separate screen rows", (a, b) => {
  const length = segmentLabelPoint(a, b, false);
  const angle = segmentLabelPoint(a, b, true);
  expect(angle.y - length.y).toBe(72);
  expect(angle.x).toBe(length.x);
});
