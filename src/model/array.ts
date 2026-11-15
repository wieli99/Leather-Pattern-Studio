import type { Bounds } from "./geometry";
import type { Affine } from "../generated/Affine";

export type ArrayKind = "rectangular" | "radial";
export interface ArraySettings {
  kind: ArrayKind;
  extent: boolean;
  vector1: { x: number; y: number };
  vector2: { x: number; y: number };
  rows: number;
  columns: number;
  count: number;
  angle: number;
  step: boolean;
  cx: number;
  cy: number;
  rotate: boolean;
  error: string;
}

/** Each matrix places the original selection; the identity placement is omitted. */
export function arrayPlacements(state: ArraySettings, box: Bounds): Affine[] {
  const n =
    state.kind === "rectangular" ? state.rows * state.columns : state.count;
  if (
    ![state.rows, state.columns, state.count].every(
      (v) => Number.isInteger(v) && v >= 1,
    ) ||
    n < 2 ||
    n > 1001
  )
    throw Error("Choose between 2 and 1,001 placements.");
  if (![state.angle, state.cx, state.cy].every(Number.isFinite))
    throw Error("Enter finite values.");

  if (state.kind === "rectangular") {
    const u = state.vector1,
      v = state.vector2;
    const d1 = state.extent && state.columns > 1 ? state.columns - 1 : 1;
    const d2 = state.extent && state.rows > 1 ? state.rows - 1 : 1;
    if (
      ![u.x, u.y, v.x, v.y].every(Number.isFinite) ||
      (state.columns > 1 && Math.hypot(u.x, u.y) < 1e-9) ||
      (state.rows > 1 && Math.hypot(v.x, v.y) < 1e-9)
    )
      throw Error("Choose nonzero array directions.");
    return Array.from({ length: n - 1 }, (_, index) => {
      const i = index + 1,
        a = i % state.columns,
        b = Math.floor(i / state.columns);
      return {
        a: 1,
        b: 0,
        c: 0,
        d: 1,
        e: (a * u.x) / d1 + (b * v.x) / d2,
        f: (a * u.y) / d1 + (b * v.y) / d2,
      };
    });
  }

  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  if (!state.rotate && Math.hypot(cx - state.cx, cy - state.cy) < 1e-9)
    throw Error(
      "Move the center away from the selection to distribute unrotated copies.",
    );
  // Total divides by item count for both full turns and partial sweeps.
  const step = state.step ? state.angle : state.angle / n;
  const angles = new Set<number>([0]);
  return Array.from({ length: n - 1 }, (_, index) => {
    const i = index + 1;
    const degrees = (((i * step) % 360) + 360) % 360;
    const key = Math.round(degrees * 1e8) % 36000000000;
    if (angles.has(key))
      throw Error("Angles must produce distinct placements.");
    angles.add(key);
    const t = (i * step * Math.PI) / 180,
      a = Math.cos(t),
      b = Math.sin(t);
    return state.rotate
      ? {
          a,
          b,
          c: -b,
          d: a,
          e: state.cx - a * state.cx + b * state.cy,
          f: state.cy - b * state.cx - a * state.cy,
        }
      : {
          a: 1,
          b: 0,
          c: 0,
          d: 1,
          e: state.cx + a * (cx - state.cx) - b * (cy - state.cy) - cx,
          f: state.cy + b * (cx - state.cx) + a * (cy - state.cy) - cy,
        };
  });
}
