import type { Doc, Point } from "../model/project";
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
