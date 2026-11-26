import type { Doc, Point } from "../model/project";
import type { ArraySettings } from "../model/array";
import type { AlignAction, AlignUnit } from "../model/align";
/**
 * Working state of an open tool. The controller holds at most one session per tool, creates
 * it when the tool starts and drops it on Apply or Cancel, so nothing leaks into the next
 * run. Preferences that outlive a run (distances, joins, references) stay on the controller.
 */
export interface OffsetSession {
  /** Preview document with the copies inserted beside their sources. */
  draft: Doc | null;
  ids: string[];
  error: string;
  /** An offset outline dragged to change the distance. */
  drag: { start: Point; distance: number; normal: Point } | null;
}
export interface AlignSession {
  /** One horizontal and one vertical choice, previewed together from the unchanged document. */
  x: AlignAction | null;
  y: AlignAction | null;
  draft: Doc | null;
  /** Independent objects to arrange, in selection order. */
  units: AlignUnit[];
  /** Whether the units fit between the outer ones for equal gaps on each axis. */
  gapsFit: { x: boolean; y: boolean };
}
export interface ArraySession {
  settings: ArraySettings;
  /** The point being placed on the canvas, or review once all points are set. */
  stage: "endpoint1" | "endpoint2" | "center" | "review";
  /** Settings to return to when placing a point is cancelled; null before the first is placed. */
  confirmed: ArraySettings | null;
  centerCandidate: Point | null;
  pointerPixel: Point | null;
  invalidDistances: Set<"vector1" | "vector2">;
}
