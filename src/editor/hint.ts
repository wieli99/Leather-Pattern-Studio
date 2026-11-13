import { isIndicator } from "../model/indicators";
import { variants, pointCount, type Mode } from "./construction";
import { groupKeys, transformShortcuts } from "../vue/tools";
export interface HintState {
  mode: Mode;
  units?: string;
  stitchMode?: boolean;
  stitchTool?: string | null;
  stitchTransferPlacement?: {phase?:"hover"|"placed"} | null;
  editingStitchHoles?: boolean;
  addingStitchRun?: boolean;

  pending: readonly unknown[];
  selected: readonly string[];
  transformTool: "move" | "rotate" | "scale" | "mirror" | "corner" | null;
  offsetActive?: boolean;
  pathCopy?: { picker: 'source' | 'path' | null } | null;
  booleanOperation?: string | null;
  booleanPicker?: "target" | "cutters" | null;
  placingPivot: boolean;
  active?: readonly { kind: string }[];
  measurementFields?: readonly string[];
  polygonSides?: number;
  measurementSections?: number;
  measurementsVisible?: boolean;
  gesture?: { kind: string; handleSide?: string } | null;
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
  if (s.pathCopy) {
    action = s.pathCopy.picker ? `Choose ${s.pathCopy.picker} on the canvas or in Model objects.` : 'Review copies along the path.';
    add('apply', 'Enter on canvas / Right-click', 'Apply');
    add('cancel', 'Esc', 'Discard preview');
    add('fields', 'Tab / Shift+Tab', 'Next / previous control');
    return { action, controls };
  }
  if (s.booleanOperation) {
    action = s.booleanPicker === "target"
      ? "Choose a target from the original objects on the canvas or in Model objects."
      : s.booleanPicker === "cutters"
      ? "Click objects on the canvas or in Model objects to add or remove them."
      : "Review the result, or activate a picker to change the objects.";
    if (s.booleanPicker !== "target") add("apply", "Enter on canvas / Right-click", "Apply");
    add("buttons", "Enter / Space on a button", "Activate button");
    add("fields", "Tab / Shift+Tab", "Next / previous control");
    add("cancel", "Esc", "Discard preview");
    return {action, controls};
  }
  if (s.stitchMode) {
    if(s.stitchTool===null)return {action:"Select a stitching tool below, or click a line to edit it.",controls:[{id:"stitch-exit",gesture:"Esc",action:"Return to Select"},{id:"stitch-select",gesture:"Shift+click",action:"Toggle stitch line selection"},{id:"stitch-all",gesture:"Alt+click / Alt+Shift+click",action:"Select all stitching of a piece / add it"},{id:"stitch-holes",gesture:"Ctrl+click / Ctrl+Shift+click",action:"Select hole / toggle holes"},{id:"stitch-delete",gesture:"Delete",action:"Delete selected stitching (Undo available)"}]};
    if(s.stitchTool && ["link","unlink","merge","split","delete"].includes(s.stitchTool))return {action:"Click lines to select the operation’s targets; review the preview before applying.",controls:[{id:"stitch-select",gesture:"Shift+click",action:"Add or remove lines"},{id:"stitch-apply",gesture:"Enter / Right-click",action:"Apply operation"},{id:"stitch-cancel",gesture:"Esc",action:"Discard preview"}]};
    if(s.stitchTool==="continue")return {action:"Continue the selected section; adjust count, gap and end clearance.",controls:[{id:"continue-apply",gesture:"Enter / Right-click",action:"Apply continuation"},{id:"continue-cancel",gesture:"Esc",action:"Discard continuation"},{id:"continue-fields",gesture:"Tab / Shift+Tab",action:"Next / previous field"}]};
    if(s.stitchTransferPlacement) return {action:"Place the master preview over receiving pieces; left-click to place, then Apply or right-click to confirm.",controls:[{id:"transfer-apply",gesture:"Enter / Right-click",action:"Confirm placed transfer"},{id:"transfer-rotate",gesture:"Wheel / Shift / Alt",action:"Rotate 1° / 5° / free"},{id:"transfer-zoom",gesture:"Ctrl/⌘+wheel",action:"Zoom"},{id:"transfer-cancel",gesture:"Esc",action:"Cancel transfer"},{id:"transfer-viewport",gesture:"Space",action:"Navigate viewport"}]};
    return {
      action: (s.editingStitchHoles ? "Ctrl-click a hole; Ctrl+Shift-click to add or remove holes." : s.addingStitchRun ? "Click the edge where the new run starts." : "Hover an edge to preview stitching; click to place or select."),
      controls: [
        {id:"stitch-all",gesture:"Alt+click / Alt+Shift+click",action:"Select all stitching of a piece / add it"},
        {id:"stitch-holes",gesture:"Ctrl+click / Ctrl+Shift+click",action:"Select hole / toggle holes"},
        {id:"stitch-place",gesture:"Shift+click new adjacent edge",action:"Place and merge compatible neighboring stitching"},
        {
          id: "stitch-merge",
          gesture: s.editingStitchHoles ? "Ctrl+Shift+click" : "Shift+click",
          action: s.editingStitchHoles ? "Add or remove holes from the selection" : "Toggle lines; Shift-click a free part of the same edge to continue",
        },
        {
          id: "stitch-apply",
          gesture: "Enter",
          action: "Apply operation",
        },
        {
          id: "stitch-cancel",
          gesture: "Esc",
          action: "Cancel operation",
        },
        {
          id: "stitch-delete",
          gesture: "Delete",
          action: "Delete selected lines (Undo available)",
        },
      ],
    };
  }
  const n = s.pending.length;
  if (s.guideDrag) {
    action = "Drag to position the guideline.";
    add("guide-step", "Drag", s.units && s.units !== "mm" ? "1/16 in steps" : "1 mm steps");
    add("guide-coarse", "Ctrl", s.units && s.units !== "mm" ? "1 in steps" : "10 mm steps");
    add("guide-medium", "Shift", s.units && s.units !== "mm" ? "1/4 in steps" : "5 mm steps");
    add("snap", "Alt", "Free placement");
    add("guide-remove", "Drop on ruler", "Remove guideline");
    add("cancel", "Esc", "Cancel guideline drag");
  } else if (s.gesture?.kind === "vertex" && !s.gesture.handleSide) {
    action = "Drag to move the anchor.";
    add("angle", "Shift", "Constrain movement to 45°");
    add("snap", "Alt", "Bypass grid/object snapping");
    add("cancel", "Esc", "Cancel edit");
  } else if (s.placingPivot) {
    action = "Click to place the pivot.";
    add("snap", "Alt", "Bypass snapping");
  } else if (s.offsetActive) {
    action = "Enter a signed distance and choose Sharp or Rounded corners.";
    add("apply", "Enter / Right-click", "Create offset outlines");
    add("values", "Tab", "Edit distance");
    add("cancel", "Esc", "Discard offset preview");
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
      add("corner-steps", "Ctrl / Shift / Alt", s.units && s.units !== "mm" ? "1 in / 1/4 in / all corners" : "10 mm / 5 mm / all corners");
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
  } else if (isIndicator(s.mode)) {
    action = n === 0
      ? s.mode === "crosshair" ? "Click or drag from the center." : "Click the first point or drag."
      : s.mode === "crosshair" ? "Click to set arm radius and direction." : "Click the second point to finish the indicator.";
    add("snap", "Alt", "Bypass snapping");
    if (s.mode !== "size-square") add("angle", "Shift", "Constrain to 45°");
  } else if (s.mode === "measurement") {
    add("sections", "Up / Down / Shift+wheel", "Add / remove equal sections");
    if (!n) add("draw-drag", "Drag", "Set measurement endpoints");
    if (n === 1) add("angle", "Shift", "Constrain to 45°");
    action = n === 0 ? "Click point A." : n === 1 ? "Click point B."
      : "Click to place the dimension line; Tab edits its offset.";
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
