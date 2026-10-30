import type { Point } from "./project";

import type { StitchSettings as CoreStitchSettings } from "../generated/StitchSettings";
export type StitchSettings = CoreStitchSettings;
export type StitchStyle = StitchSettings["style"];
export type StitchAlignment = StitchSettings["alignment"];
export const defaultStitchSettings: Readonly<StitchSettings> = Object.freeze({
  startClearance: 0,
  endClearance: 0,
  style: "french",
  spacing: 3.85,
  inset: 3,
  alignment: "center",
});
export const stitchSpacingPresets = [3, 3.38, 3.85, 4, 5] as const;
export const stitchInsetPresets = [2.5, 2, 3, 4, 5] as const;
export const stitchMarks = {
  french: { width: 1.4, height: 0.2, angle: Math.PI / 4 },
  japanese: { width: 1.4, height: 0.6, angle: Math.PI / 4 },
  round: { width: 0.8, height: 0.8, angle: 0 },
  flat: { width: 1.4, height: 0.3, angle: 0 },
} as const;

export function validateStitchSettings(settings: StitchSettings): void {
  if (
    [settings.startClearance ?? 0, settings.endClearance ?? 0].some(
      (n) =>
        !Number.isFinite(n) ||
        n < 0 ||
        Math.abs(n * 100 - Math.round(n * 100)) > 1e-7,
    ) ||
    !Object.hasOwn(stitchMarks, settings.style) ||
    !["center", "start", "end"].includes(settings.alignment) ||
    !Number.isFinite(settings.spacing) ||
    settings.spacing < 0.01 ||
    !Number.isFinite(settings.inset) ||
    settings.inset < 0 ||
    [settings.spacing, settings.inset].some(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) > 1e-7,
    )
  ) {
    throw new Error(
      "Stitch spacing must be at least 0.01 mm and inset non-negative, with at most two decimals.",
    );
  }
}

/** Distances along the inset path; closed paths never repeat the seam hole. */
export function stitchDistances(
  length: number,
  settings: StitchSettings,
  closed = false,
): number[] {
  validateStitchSettings(settings);
  if (!Number.isFinite(length) || length <= 0)
    throw new Error("Stitch path must have positive finite length.");
  const start = settings.startClearance ?? 0,
    end = settings.endClearance ?? 0;
  length -= start + end;
  if (length <= 0)
    throw Error("Start and end clearances leave no usable stitch length.");
  if (start || end) closed = false;
  const ratio = length / settings.spacing;
  const whole =
    Math.abs(ratio - Math.round(ratio)) < 1e-10
      ? Math.round(ratio)
      : Math.floor(ratio);
  const count = closed ? Math.max(1, whole) : whole + 1;
  if (count > 100000) throw new Error("Stitch path exceeds 100000 holes.");
  const remainder = Math.max(0, length - (count - 1) * settings.spacing);
  const offset =
    settings.alignment === "start"
      ? 0
      : settings.alignment === "end"
        ? remainder
        : remainder / 2;
  return Array.from({ length: count }, (_, index) => {
    const distance = offset + index * settings.spacing;
    return start + (closed ? distance % length : Math.min(length, distance));
  });
}

/** Exact straight-edge offset in world millimetres. Side is relative to traversal. */
export function offsetStitchSegment(
  a: Point,
  b: Point,
  inset: number,
  side: 1 | -1,
): [Point, Point] {
  if (
    ![a.x, a.y, b.x, b.y, inset].every(Number.isFinite) ||
    inset < 0 ||
    (side !== 1 && side !== -1)
  )
    throw new Error("Invalid stitch offset.");
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length <= 1e-9) throw new Error("Cannot stitch a collapsed edge.");
  const x = (-(b.y - a.y) / length) * inset * side;
  const y = ((b.x - a.x) / length) * inset * side;
  return [
    { x: a.x + x, y: a.y + y },
    { x: b.x + x, y: b.y + y },
  ];
}
