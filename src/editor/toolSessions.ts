import type { Doc, Point, Shape } from "../model/project";
import type { StitchSettings } from "../model/stitch";
import type { StitchGroup } from "../model/stitchGeometry";
import type { StitchTool } from "./stitchTools";
import type { BooleanOperation } from "../model/boolean";
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
export interface TrimSession {
  draft: Doc | null;
  /** The outline portion a click would cut. */
  highlight: Point[] | null;
  /** Pieces cut so far, mapped to the selected outline they came from. */
  owners: Map<string, string>;
  /** Set for Join and the boolean operations, which reuse the trim preview and Apply. */
  boolean: BooleanSession | null;
}
export interface BooleanSession {
  operation: BooleanOperation;
  target: string;
  cutters: string[];
  picker: "target" | "cutters" | null;
  error: string;
  empty: boolean;
  /** Selection restored on Cancel. */
  selection: string[];
  cache: { key: string; result: Shape | null } | null;
}
export type TransformTool = "move" | "rotate" | "scale" | "mirror" | "corner";
export interface TransformSession {
  tool: TransformTool;
  /** Document the preview is computed from; rebased when the pivot or orientation changes. */
  original: Doc;
  draft: Doc | null;
  /** Numeric inputs are absolute within this basis. */
  numericBasis: { document: Doc; values: { x: number; y: number; angle: number; sx: number; sy: number }; pivot: Point; angle: number } | null;
  mirror: {
    /** Chosen axis, or "edge" for a picked straight edge in `line`. */
    axis: string | null;
    line: [Point, Point] | null;
    hover: { axis: string; line: [Point, Point] } | null;
  };
}
/** State of one stitch operation (placing, linking, transferring, editing holes, ...). */
export interface StitchOperation {
  tool: StitchTool | null;
  /** Lines selected when the operation started; restored when it is cancelled. */
  operationSelection: string[];
  draft: StitchGroup | null;
  hover: StitchGroup | null;
  /** Lines a placement preview would merge into the new one. */
  absorbed: string[];
  transferPlacement: { placementId: string; groupIds: string[]; center: Point; angle: number; rawAngle: number; phase?: "hover" | "placed" } | null;
  editingHoles: boolean;
  holeSelection: { groupId: string; number: number }[];
  addingRun: boolean;
  error: string;
}
export interface StitchSession extends StitchOperation {
  /** Stitch mode is open. Outside it the fields keep their idle values. */
  active: boolean;
  /** Document and settings restored when stitch mode is cancelled. */
  original: Doc | null;
  originalSettings: StitchSettings | null;
}
export function idleStitchOperation(): StitchOperation {
  return {
    tool: null, operationSelection: [], draft: null, hover: null, absorbed: [], transferPlacement: null,
    editingHoles: false, holeSelection: [], addingRun: false, error: "",
  };
}
export function idleStitchSession(): StitchSession {
  return { ...idleStitchOperation(), active: false, original: null, originalSettings: null };
}
