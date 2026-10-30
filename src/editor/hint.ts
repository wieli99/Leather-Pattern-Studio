import { variants, pointCount, type Mode } from "./construction";
import { groupKeys, transformShortcuts } from "../vue/tools";
export interface HintState {
  mode: Mode;
  stitchMode?: boolean;
  pending: readonly unknown[];
  selected: readonly string[];
  transformTool: "move" | "rotate" | "scale" | "mirror" | "corner" | null;
  placingPivot: boolean;
  active?: readonly { kind: string }[];
  measurementFields?: readonly string[];
  polygonSides?: number;
  measurementsVisible?: boolean;
  guideDrag?: { axis: "x" | "y" } | null;
}
export interface HintControl {
  id: string;
  gesture: string;
  action: string;
}
export interface EditorHint {
  action: string;
  controls: HintControl[];
}
export function editorHint(s: HintState, editing = ""): EditorHint {
  const controls: HintControl[] = [];
  const add = (id: string, gesture: string, action: string) =>
    controls.push({ id, gesture, action });
  let action = "Click an edge or drag to select.";
  if (editing) {
    action = editing === "text" ? "Edit the text." : "Enter a value.";
    add("confirm", editing === "text" ? "Ctrl/⌘+Enter" : "Enter", "Apply");
    add(
      "cancel",
      "Esc",
      editing === "transform" ? "Cancel transform" : "Cancel edit",
    );
    if (editing === "text") {
      add("newline", "Enter", "New line");
      add("outside", "Click outside", "Apply");
    } else if (["property", "rename"].includes(editing))
      add("blur", "Leave field", "Apply");
    add("fields", "Tab / Shift+Tab", "Next / previous field");
    return { action, controls };
  }
  if (s.stitchMode) {
    return {
      action: "Hover an edge to preview stitching; click to place or select.",
      controls: [
        {
          id: "stitch-merge",
          gesture: "Shift+click",
          action: "Select second line; first is master",
        },
        {
          id: "stitch-apply",
          gesture: "Enter",
          action: "Apply stitch session",
        },
        {
          id: "stitch-cancel",
          gesture: "Esc",
          action: "Cancel stitch session",
        },
        {
          id: "stitch-delete",
          gesture: "Delete",
          action: "Delete selected stitching",
        },
      ],
    };
  }
  const n = s.pending.length;
  if (s.guideDrag) {
    action = "Drag to position the guideline.";
    add("guide-step", "Drag", "1 mm steps");
    add("guide-coarse", "Ctrl", "10 mm steps");
    add("guide-medium", "Shift", "5 mm steps");
    add("snap", "Alt", "Free placement");
    add("guide-remove", "Drop on ruler", "Remove guideline");
    add("cancel", "Esc", "Cancel guideline drag");
  } else if (s.placingPivot) {
    action = "Click to place the pivot.";
    add("snap", "Alt", "Bypass snapping");
  } else if (s.transformTool) {
    action =
      s.transformTool === "mirror"
        ? "Click an axis or straight edge to mirror the selection."
        : s.transformTool === "corner"
        ? "Drag a corner to change its radius."
        : `Drag to ${s.transformTool === "scale" ? "resize" : s.transformTool} the selection.`;
    add("apply", "Enter / Right-click", "Apply");
    if (s.transformTool !== "mirror") add("values", "Tab", "Edit values");
    if (s.transformTool !== "corner") add("pivot", "V", "Place pivot");
    if (s.transformTool !== "mirror" && s.transformTool !== "rotate" && s.transformTool !== "corner")
      add("axis", "X / Y", "Constrain axis");
    if (s.transformTool === "corner")
      add("corner-steps", "Ctrl / Shift / Alt", "10 mm / 5 mm / all corners");
    if (s.transformTool === "rotate") {
      add("rotation", "Drag", "Rotate in 1° steps");
      add("rotation-step", "Ctrl / Shift / Alt", "10° / 5° / free rotation");
    } else if (s.transformTool === "move")
      add("snap", "Alt", "Bypass snapping");
  } else if (s.mode === "select") {
    if (s.selected.length) action = "Choose Move, Rotate or Resize.";
    add("toggle", "Shift+click", "Toggle selection");
    add("add", "Shift+drag", "Add to selection");
    add("interior", "Ctrl+click", "Select interiors");
    add("crossing", "Ctrl+drag", "Select crossing outlines");
    add("insert", "Alt+click edge", "Add anchor");
    if (s.selected.length) {
      for (const [id, label, key] of transformShortcuts) add(id, key, label);
      add("delete", "Delete / Backspace", "Delete selection");
      add("duplicate", "Ctrl/⌘+D", "Duplicate");
      add("measure", "Hold Ctrl", "Show edge measurements");
      if (s.measurementsVisible || s.measurementFields?.length)
        add("values", "Tab", "Edit measurements");
      if (s.active?.length === 1) {
        const kind = s.active[0].kind;
        if (["polyline", "curve", "control-curve", "line"].includes(kind))
          add("anchors", "Drag anchor", "Move anchor");
        if (kind === "control-curve") {
          add("handles", "Drag handle", "Shape curve");
          add("smooth", "Double-click anchor", "Toggle sharp / smooth");
        }
        if (kind === "text") add("text", "Double-click text", "Edit text");
      }
    }
  } else if (s.mode === "text") action = "Click to place text.";
  else {
    const path = ["polyline", "curve", "control-curve"].includes(s.mode);
    action = n ? "Click the next point." : "Click the first point.";
    if (s.mode === "control-curve")
      action = "Click an anchor or drag for smooth handles.";
    if (!path) {
      if (!n)
        action = [
          "rectangle-center",
          "circle",
          "ellipse-center",
          "arc",
          "polygon",
        ].includes(s.mode)
          ? "Click the center."
          : "Click the first point.";
      else if (s.mode === "rectangle-center")
        action = "Click to set width and height.";
      else if (["rectangle", "ellipse", "polygon-box"].includes(s.mode))
        action = "Click the opposite corner.";
      else if (s.mode === "polygon") action = "Click to set size and rotation.";
      else if (s.mode === "circle" || s.mode === "circle-two")
        action =
          s.mode === "circle"
            ? "Click to set the radius."
            : "Click the diameter end.";
      else if (s.mode === "arc")
        action = n === 1 ? "Click the arc start." : "Click to set the sweep.";
      else if (["rectangle-three", "ellipse-center"].includes(s.mode))
        action =
          n === 1
            ? "Click to set direction and width."
            : "Click to set height.";
      else
        action = n === 1 ? "Click the second point." : "Click the third point.";
      if (s.mode === "arc-three")
        action = [
          "Click the arc start.",
          "Click the arc end.",
          "Click to shape the arc.",
        ][Math.min(n, 2)];
    }
    if (!n && (pointCount(s.mode) === 2 || s.mode === "polyline"))
      add("draw-drag", "Drag", "Draw in one gesture");
    if (path && n) {
      add("finish", "Enter / Right-click", "Finish path");
      if (n >= 3) add("close", "Double-click", "Close path");
    }
    if (
      n &&
      ([
        "polyline",
        "curve",
        "control-curve",
        "circle",
        "circle-two",
        "polygon",
        "arc",
      ].includes(s.mode) ||
        (n === 1 && ["ellipse-center", "arc-three"].includes(s.mode)))
    )
      add("angle", "Shift", "Constrain to 45°");
    if (
      n === 1 &&
      ["rectangle", "rectangle-center", "ellipse", "polygon-box"].includes(
        s.mode,
      )
    )
      add("square", "Shift", "Equal width and height");
    if (n) add("back", "Backspace", "Remove last anchor");
    if (s.measurementFields?.length) add("values", "Tab", "Edit dimensions");
    if (s.mode.startsWith("polygon"))
      add(
        "sides",
        "↑/↓ / Shift+wheel",
        `Change sides (${s.polygonSides ?? 3})`,
      );
    add("snap", "Alt", "Bypass snapping");
    const group = Object.entries(groupKeys).find(([, group]) =>
      (variants[group] as readonly string[]).includes(s.mode),
    );
    if (group) {
      add(
        "variants",
        `${group[0].toUpperCase()} / Shift+${group[0].toUpperCase()}`,
        "Next / previous variant",
      );
      add("menu", "Right-click / hold tool", "Open variants");
    }
  }
  if (!s.guideDrag && (s.mode !== "select" || s.transformTool))
    add("cancel", "Esc", "Cancel");
  add("pan", "Space+drag / Middle-drag", "Pan");
  add("scroll", "Scroll", "Pan");
  add("zoom", "Ctrl/⌘+scroll", "Zoom");
  add("fit", "F / Shift+F", "Fit all / selection");
  return { action, controls };
}
