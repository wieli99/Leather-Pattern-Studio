import { focusModelCanvas } from "./canvasFocus";
import { editor } from "../editor/instance";
import { tools, groupKeys, transformShortcuts } from "./tools";
export function handleShortcut(e: KeyboardEvent, openHelp: () => void) {
  if (
    e.defaultPrevented ||
    e.isComposing ||
    e.getModifierState("AltGraph") ||
    e.repeat
  )
    return;
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (
    !target ||
    target.closest(
      "input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=menu]",
    ) ||
    document.querySelector("[role=dialog]")
  )
    return;
  if (editor.pathCopy && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === 'Escape') { e.preventDefault(); editor.cancel(); focusModelCanvas(); return; }
    if (e.key === 'Enter' && target.tagName === 'CANVAS') { e.preventDefault(); void editor.applyPathCopy(); return; }
  }
  if (editor.booleanOperation && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === "Escape") {
      e.preventDefault();
      editor.cancel();
      focusModelCanvas();
      return;
    }
    if (e.key === "Enter" && target.tagName === "CANVAS") {
      e.preventDefault();
      void editor.applyTrim();
      return;
    }
  }
  const canvas = target.tagName === "CANVAS";
  const objectDelete =
    target.closest(".objects button") !== null &&
    ["Delete", "Backspace"].includes(e.key);
  if (!(e.ctrlKey || e.metaKey) && !canvas && !objectDelete) return;
  if (e.altKey || (e.ctrlKey && e.metaKey)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod && e.code === "Space") {
    e.preventDefault();
    editor.space = true;
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === "s") {
    e.preventDefault();
    void editor.save();
    return;
  }
  if (
    mod &&
    (e.key.toLowerCase() === "z" ||
      (!e.metaKey && !e.shiftKey && e.key.toLowerCase() === "y"))
  ) {
    e.preventDefault();
    editor.cancel();
    void editor.transact(
      e.shiftKey || e.key.toLowerCase() === "y" ? "redo" : "undo",
    );
    return;
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === "g") {
    e.preventDefault(); void editor.newGroup(true); return;
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === "d") {
    e.preventDefault();
    editor.duplicate();
    return;
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === "a") {
    if (editor.transformTool) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    editor.cancel();
    editor.selectedGroups = [];
    editor.selected = editor.document.shapes.map((s) => s.id);
    editor.notify();
    return;
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === "v" &&
      editor.stylingClipboardFallback && editor.copiedStyling &&
      (canvas || target.closest(".objects button"))) {
    e.preventDefault();
    void editor.pasteStyling();
    return;
  }
  if (mod) return;
  if (e.key === "?") {
    e.preventDefault();
    openHelp();
    return;
  }
  if (e.key === "Tab" && !e.shiftKey && canvas) {
    const field = document.querySelector<HTMLInputElement>(
      editor.stitchMode ? ".stitch-options input, .stitch-options select" : editor.offsetActive
        ? ".transform-inputs input"
        : editor.transformTool
        ? ".transform-inputs input"
        : ".construction-measurements input",
    );
    if (field) {
      e.preventDefault();
      field.focus({ preventScroll: true });
    }
    return;
  }
  if (!e.shiftKey && e.key.toLowerCase() === "i" && !editor.pending.length && !editor.drawingDown && !editor.busy) {
    e.preventDefault(); editor.activateStitch(); return;
  }
  if (!e.shiftKey && editor.selectionToolsAvailable) {
    const k = e.key.toLowerCase();
    if (k === "i" || k === "k" || k === "j") {
      e.preventDefault();
      if (k === "i") editor.activateStitch();
      else if (k === "k") editor.activateTrim();
      else editor.activateMerge();
      return;
    }
    if (k === "o") {
      e.preventDefault();
      editor.activateOffset();
      return;
    }
    if (transformShortcuts.some((item) => item[2].toLowerCase() === k)) {
      e.preventDefault();
      editor.activateTransform(
        k === "b"
          ? "corner"
          : k === "g"
            ? "move"
            : k === "e"
              ? "rotate"
              : k === "m"
                ? "mirror"
                : "scale",
      );
      return;
    }
  }
  if (
    !e.shiftKey &&
    editor.tool === "select" &&
    editor.transformTool &&
    editor.transformTool !== "corner"
  ) {
    const k = e.key.toLowerCase();
    if (k === "v") {
      editor.placingPivot = true;
      editor.notify();
      return;
    }
    if (k === "x" || k === "y") {
      editor.transformAxis = k;
      editor.notify();
      return;
    }
  }
  if (
    (editor.mode.startsWith("polygon") || editor.mode === "measurement") &&
    !mod &&
    (e.key === "ArrowUp" || e.key === "ArrowDown")
  ) {
    e.preventDefault();
    editor.adjustConstructionCount(e.key === "ArrowUp" ? 1 : -1);
    return;
  }
  if (editor.stitchMode && (e.key === "Enter" || e.key === "Escape")) {
    e.preventDefault();
    if (e.key === "Enter") void editor.applyStitch();
    else editor.escapeStitch();
    return;
  }
  if (e.key === "Escape") {
    editor.setMode("select");
  }
  if (e.key === "Enter") {
    if (editor.trimMode) void editor.applyTrim();
    else if (editor.offsetActive) void editor.applyOffset();
    else if (editor.transformTool) void editor.applyTransform();
    else editor.finish();
  }
  if (e.key === "Backspace" && editor.pending.length) {
    e.preventDefault();
    editor.pending = editor.pending.slice(0, -1);
    editor.pendingHandles = editor.pendingHandles.slice(0, -1);
    editor.notify();
  } else if (["Delete", "Backspace"].includes(e.key)) {
    e.preventDefault();
    if (editor.stitchMode && editor.stitchSelected.length)
      void editor.deleteStitchSelection();
    else editor.delete();
  }
  if (e.key.toLowerCase() === "f") {
    e.preventDefault();
    editor.fit(e.shiftKey);
    return;
  }
  if (!mod && !e.repeat) {
    if (groupKeys[e.key.toLowerCase()]) {
      e.preventDefault();
      editor.cycle(groupKeys[e.key.toLowerCase()], e.shiftKey ? -1 : 1);
      return;
    }
    const tool = tools.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
    if (tool) {
      e.preventDefault();
      editor.setTool(tool.id);
    }
  }
}


export function handleClipboard(event: ClipboardEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (event.defaultPrevented || !target || target.closest(
    "input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=menu]",
  ) || document.querySelector("[role=dialog]") || !event.clipboardData) return;
  if (event.type === "paste" && (target.tagName === "CANVAS" || target.closest(".objects button"))) {
    const text = event.clipboardData.getData("text/plain");
    if (text.includes('"leather-pattern-designer-styling"')) {
      event.preventDefault();
      void editor.pasteStyling(text);
      return;
    }
  }
  if (!editor.canUseClipboard) return;
  if (event.type === "copy") {
    const text = editor.copyObjects();
    if (text) {
      event.clipboardData.setData("text/plain", text);
      event.preventDefault();
    }
  } else {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes('"leather-pattern-designer-clipboard"')) return;
    event.preventDefault();
    void editor.pasteObjects(text);
  }
}
