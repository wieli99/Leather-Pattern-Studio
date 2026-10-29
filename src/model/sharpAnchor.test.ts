import { expect, test } from "vitest";
import { sharpAnchor, toggleAnchor } from "./sharpAnchor";
import type { Shape } from "./project";
const s: Shape = {
  id: "a",
  name: "A",
  kind: "control-curve",
  rotation: 20,
  radius: 0,
  points: [
    { x: 0, y: 0 },
    { x: 20, y: 10 },
    { x: 0, y: 0 },
  ],
  handles: Array.from({ length: 3 }, () => ({
    incoming: { x: -2, y: 0 },
    outgoing: { x: 2, y: 0 },
  })),
};
test("sharp anchor synchronizes seam and preserves other geometry", () => {
  const next = sharpAnchor(s, 0);
  expect(next.points).toBe(s.points);
  expect(next.rotation).toBe(20);
  expect(next.handles![0]).toEqual({
    incoming: { x: 0, y: 0 },
    outgoing: { x: 0, y: 0 },
  });
  expect(next.handles![2]).toEqual(next.handles![0]);
  expect(next.handles![1]).toBe(s.handles![1]);
  expect(sharpAnchor(next, 0)).toBe(next);
});

test("double click toggles sharp seam to smooth and back", () => {
  const sharp = sharpAnchor(s, 0);
  const smooth = toggleAnchor(sharp, 0);
  const h = smooth.handles![0];
  expect(Math.hypot(h.outgoing.x, h.outgoing.y)).toBeGreaterThan(0);
  expect(h.incoming).toEqual({ x: -h.outgoing.x, y: -h.outgoing.y });
  expect(smooth.handles![2]).toEqual(h);
  expect(smooth.points).toBe(s.points);
  expect(smooth.handles![1]).toBe(s.handles![1]);
  expect(toggleAnchor(smooth, 0).handles).toEqual(sharp.handles);
});
test("smooth endpoints have finite handles and coincident neighbours are a no-op", () => {
  const open = {
    ...sharpAnchor(s, 0),
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 0 },
    ],
  };
  expect(toggleAnchor(open, 0).handles![0].outgoing.x).toBeCloseTo(20 / 3);
  const flat = { ...open, points: open.points.map(() => ({ x: 0, y: 0 })) };
  expect(toggleAnchor(flat, 0)).toBe(flat);
});
