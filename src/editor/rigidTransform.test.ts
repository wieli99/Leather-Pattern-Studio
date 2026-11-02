import { expect, it } from "vitest";
import { snapRotation, unwrapRotation } from "./rigidTransform";
it("uses Model rotation modifiers and wraps seam crossings", () => {
  expect(snapRotation(13.3, {})).toBe(13);
  expect(snapRotation(13.3, { shiftKey: true })).toBe(15);
  expect(snapRotation(13.3, { ctrlKey: true })).toBe(10);
  expect(snapRotation(13.3, { altKey: true })).toBe(13.3);
  expect(
    unwrapRotation((179 * Math.PI) / 180, (-179 * Math.PI) / 180),
  ).toBeCloseTo(2);
});
import { snapRigidMove } from "./rigidTransform";
import type { Shape } from "../model/project";
it("snaps moving anchors to object geometry before grid points", () => {
  const a: Shape = {
      id: "a",
      name: "A",
      kind: "rectangle",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
      ],
      radius: 0,
      rotation: 0,
    },
    b: Shape = {
      ...a,
      id: "b",
      points: [
        { x: 30, y: 0 },
        { x: 50, y: 20 },
      ],
    };
  const result = snapRigidMove(
    [a, b],
    ["a"],
    { x: 8, y: 0 },
    { grid: true, objects: true, gridSize: 10, tolerance: 5 },
  );
  expect(result.delta).toEqual({ x: 10, y: 0 });
  expect(result.anchor).toBeDefined();
});
