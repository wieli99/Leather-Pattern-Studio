<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from "vue";
import { editor } from "../editor/instance";
import { attachRenderer } from "../editor/renderer";
import { useEditorSelector } from "./useEditorSelector";
import { useEditor } from "./useEditor";
import { shapeMatrix, inverse, applyMatrix } from "../model/geometry";
import type { Point, Shape } from "../model/project";
const e = useEditor();
const saving = ref(false);
const input = ref<HTMLTextAreaElement | null>(null);
const draft = ref<{ point: Point; text: string; original?: Shape } | null>(
  null,
);
function beginText(point: Point, original?: Shape) {
  editor.editingTextId = original?.id;
  const anchor = original ? point : { x: point.x, y: point.y - (5 * 1.2) / 2 };
  draft.value = { point: anchor, text: original?.text ?? "", original };
  void nextTick(() => {
    input.value?.focus();
    input.value?.select();
  });
}
function cancelText() {
  editor.editingTextId = undefined;
  draft.value = null;
  canvas.value?.focus();
}
async function saveText() {
  const d = draft.value;
  if (!d || saving.value) return;
  saving.value = true;
  try {
    if (!d.text.trim()) {
      if (d.original)
        await editor.commit({
          ...editor.document,
          shapes: editor.document.shapes.filter((s) => s.id !== d.original!.id),
        });
      cancelText();
      return;
    }
    if (d.original?.text === d.text) {
      cancelText();
      return;
    }
    const size = d.original?.fontSize ?? 5;
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${size}px sans-serif`;
    const lines = d.text.replace(/\r\n?/g, "\n").split("\n");
    const width = Math.max(
      size / 2,
      ...lines.map((line) => ctx.measureText(line).width),
    );
    const shape: Shape = {
      ...(d.original ?? {}),
      id: d.original?.id ?? crypto.randomUUID(),
      name: d.original?.name ?? "Text",
      kind: "text",
      text: lines.join("\n"),
      fontSize: size,
      radius: 0,
      rotation: d.original?.rotation ?? 0,
      points: [
        d.point,
        { x: d.point.x + width, y: d.point.y + lines.length * size * 1.2 },
      ],
    };
    if (d.original) {
      shape.transform = shapeMatrix(d.original);
      shape.rotation = 0;
    }
    await editor.commit({
      ...editor.document,
      shapes: d.original
        ? editor.document.shapes.map((s) => (s.id === shape.id ? shape : s))
        : [...editor.document.shapes, shape],
    });
    editor.editingTextId = undefined;
    draft.value = null;
    editor.selected = [shape.id];
    editor.setTool("select");
    canvas.value?.focus();
  } finally {
    saving.value = false;
  }
}
const textStyle = computed(() => {
  const d = draft.value;
  if (!d) return {};
  const state = e.value;
  const m = d.original
    ? shapeMatrix(d.original)
    : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const p = applyMatrix(m, d.point);
  const ctx = document.createElement("canvas").getContext("2d")!;
  const size = d.original?.fontSize ?? 5;
  ctx.font = `${size}px sans-serif`;
  const lines = d.text.split("\n");
  const width = Math.max(
    size / 2,
    ...lines.map((line) => ctx.measureText(line).width),
  );
  return {
    width: `${width * state.zoom}px`,
    height: `${lines.length * size * 1.2 * state.zoom}px`,
    left: `${state.pan.x + p.x * state.zoom}px`,
    top: `${state.pan.y + p.y * state.zoom}px`,
    fontSize: `${(d.original?.fontSize ?? 5) * state.zoom}px`,
    transform: `matrix(${m.a},${m.b},${m.c},${m.d},0,0)`,
  };
});
watch(
  () => e.value.mode,
  () => {
    if (draft.value) void saveText();
  },
);
function outside(event: PointerEvent) {
  if (
    !draft.value ||
    (event.target instanceof Element &&
      event.target.closest(".canvas-text-editor"))
  )
    return;
  const onCanvas = event.target === canvas.value;
  if (onCanvas) {
    event.preventDefault();
    event.stopPropagation();
  }
  void saveText();
}
function editText(event: MouseEvent) {
  const world = editor.world(pixel(event));
  const hit = [...editor.document.shapes].reverse().find((s) => {
    if (s.kind !== "text") return false;
    const p = applyMatrix(inverse(shapeMatrix(s)), world);
    return (
      p.x >= s.points[0].x &&
      p.x <= s.points[1].x &&
      p.y >= s.points[0].y &&
      p.y <= s.points[1].y
    );
  });
  if (hit) beginText(hit.points[0], hit);
}
const canvas = ref<HTMLCanvasElement | null>(null),
  hover = useEditorSelector(editor, editor.hoverSnapshot);
const cursor = computed(() => {
  hover.value;
  if (editor.tool === "text") return "none";
  if (editor.placingPivot) return "crosshair";
  if (editor.hoverHandle === "move") return "move";
  return editor.tool !== "select"
    ? "none"
    : editor.gesture?.kind === "rotate" || editor.hoverHandle === "rotate"
      ? "grab"
      : editor.gesture?.kind === "scale" || editor.hoverHandle === "scale"
        ? "nwse-resize"
        : editor.hoverHandle === "vertex"
          ? "move"
          : undefined;
});
const pixel = (event: MouseEvent) => {
  const r = canvas.value!.getBoundingClientRect();
  return { x: event.clientX - r.left, y: event.clientY - r.top };
};
function down(event: PointerEvent) {
  if (draft.value) return;
  if (editor.tool === "text") {
    event.preventDefault();
    editText(event);
    if (draft.value) return;
  }
  canvas.value!.focus();
  canvas.value!.setPointerCapture(event.pointerId);
  editor.pointerDown(
    pixel(event),
    event.button,
    event.shiftKey,
    event.altKey,
    event.ctrlKey,
  );
}
function wheel(event: WheelEvent) {
  event.preventDefault();
  if (editor.mode.startsWith("polygon") && event.shiftKey) {
    if (event.deltaY) editor.adjustPolygonSides(event.deltaY < 0 ? 1 : -1);
    return;
  }
  editor.wheel(
    pixel(event),
    event.deltaX,
    event.deltaY,
    event.ctrlKey || event.metaKey,
  );
}
function anchorModifier(event: KeyboardEvent) {
  editor.setAnchorModifier(event.altKey);
}
function clearAnchorModifier() {
  editor.setAnchorModifier(false);
}
let detach: (() => void) | undefined;
onMounted(() => {
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("keydown", anchorModifier);
  window.addEventListener("keyup", anchorModifier);
  window.addEventListener("blur", clearAnchorModifier);
  editor.onTextRequested = beginText;
  detach = attachRenderer(canvas.value!, editor);
  canvas.value!.addEventListener("wheel", wheel, { passive: false });
});
onUnmounted(() => {
  document.removeEventListener("pointerdown", outside, true);
  window.removeEventListener("keydown", anchorModifier);
  window.removeEventListener("keyup", anchorModifier);
  window.removeEventListener("blur", clearAnchorModifier);
  editor.editingTextId = undefined;
  editor.onTextRequested = undefined;
  detach?.();
  canvas.value?.removeEventListener("wheel", wheel);
});
</script>
<template>
  <canvas
    ref="canvas"
    :style="{ cursor }"
    aria-label="Pattern drawing canvas"
    tabindex="0"
    @pointerdown="down"
    @dblclick="editText"
    @pointermove="
      editor.pointerMove(
        pixel($event),
        $event.altKey,
        $event.ctrlKey,
        $event.shiftKey,
      )
    "
    @pointerup="
      editor.pointerUp(
        pixel($event),
        $event.altKey,
        $event.shiftKey,
        $event.ctrlKey,
      )
    "
    @click="editor.polylineClick($event.detail)"
    @pointerleave="editor.leavePointer()"
    @pointercancel="editor.pauseGesture()"
    @lostpointercapture="editor.gesture && editor.pauseGesture()"
    @contextmenu.prevent
  />
  <div
    v-if="draft"
    class="canvas-text-editor"
    :style="textStyle"
    @pointerdown.stop
    @keydown.stop
  >
    <textarea
      ref="input"
      v-model="draft.text"
      aria-label="Label text"
      maxlength="10000"
      spellcheck="false"
      @keydown.esc.prevent="!$event.isComposing && cancelText()"
      @keydown.ctrl.enter.prevent="!$event.isComposing && saveText()"
      @keydown.meta.enter.prevent="!$event.isComposing && saveText()"
    />
  </div>
</template>
<style scoped>
.canvas-text-editor {
  position: absolute;
  z-index: 10;
  transform-origin: top left;
}
textarea {
  display: block;
  box-sizing: content-box;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  font: inherit;
  font-family: sans-serif;
  line-height: 1.2;
  color: var(--text);
  background: transparent;
  border: 0;
  outline: 1px solid var(--accent);
  border-radius: 0;
  resize: none;
  overflow: hidden;
  white-space: pre;
}
</style>
