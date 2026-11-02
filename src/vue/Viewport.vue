<script setup lang="ts">
import { measureText } from "../model/text";
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from "vue";
import { editor as defaultEditor } from "../editor/instance";
import type { Controller } from "../editor/controller";
import { attachRenderer } from "../editor/renderer";
import { useEditorSelector } from "./useEditorSelector";
import { useEditor } from "./useEditor";
import { shapeMatrix, inverse, applyMatrix } from "../model/geometry";
import type { Point, Shape } from "../model/project";
const props = defineProps<{ controller?: Controller; textOnly?: boolean }>();
const editor = props.controller ?? defaultEditor;
const e = useEditor(editor);
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
function focusCanvas() {
  if (props.textOnly) (canvas.value?.parentElement?.querySelector('canvas[aria-label="Print layout canvas"]') as HTMLCanvasElement | null)?.focus();
  else canvas.value?.focus();
}
function cancelText() {
  editor.editingTextId = undefined;
  draft.value = null;
  focusCanvas();
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
      if (draft.value === d) cancelText();
      return;
    }
    if (d.original?.text === d.text) {
      cancelText();
      return;
    }
    const size = d.original?.fontSize ?? 5;
    const layout = measureText(d.text, size);
    const shape: Shape = {
      ...(d.original ?? {}),
      id: d.original?.id ?? crypto.randomUUID(),
      name: d.original?.name ?? "Text",
      kind: "text",
      text: layout.text,
      fontSize: size,
      radius: 0,
      rotation: d.original?.rotation ?? 0,
      points: [
        d.point,
        { x: d.point.x + layout.width, y: d.point.y + layout.height },
      ],
    };
    if (d.original) {
      shape.transform = shapeMatrix(d.original);
      shape.rotation = 0;
    }
    const success = await editor.commit({
      ...editor.document,
      shapes: d.original
        ? editor.document.shapes.map((s) => (s.id === shape.id ? shape : s))
        : [...editor.document.shapes, shape],
    });
    if (!success || draft.value !== d) return;
    editor.editingTextId = undefined;
    draft.value = null;
    editor.selected = [shape.id];
    editor.setTool("select");
    focusCanvas();
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
  const size = d.original?.fontSize ?? 5;
  const layout = measureText(d.text, size);
  return {
    width: `${layout.width * state.zoom}px`,
    height: `${layout.height * state.zoom}px`,
    left: `${editor.screen(p).x}px`,
    top: `${editor.screen(p).y}px`,
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
  const onCanvas = event.target === canvas.value || (props.textOnly && event.target instanceof HTMLElement && event.target.getAttribute("aria-label") === "Print layout canvas");
  if (onCanvas) {
    event.preventDefault();
    event.stopPropagation();
  }
  void saveText();
}
function doubleClick(event: MouseEvent) {
  if (
    editor.tool === "select" &&
    !editor.gesture &&
    !editor.transformTool &&
    editor.active.length === 1
  ) {
    const shape = editor.active[0];
    if (["rectangle", "polyline", "control-curve"].includes(shape.kind)) {
      const handle = editor.handleAt(editor.world(pixel(event)));
      if (
        handle?.kind === "vertex" &&
        !handle.handleSide &&
        handle.vertex !== undefined
      ) {
        void editor.toggleAnchorSmooth(shape.id, handle.vertex);
        return;
      }
    }
  }
  editText(event);
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
  if (e.value.transformTool === "mirror" && e.value.mirrorHover) return "pointer";
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
  editor.setMeasurementModifier(event.ctrlKey);
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
function updateModifiers(event: KeyboardEvent) {
  editor.updateGuideModifiers(event.altKey, event.ctrlKey, event.shiftKey);
  editor.setAnchorModifier(event.altKey);
  editor.setDrawingModifier(event.shiftKey);
  editor.setMeasurementModifier(event.ctrlKey);
  editor.updateCornerModifiers(event.altKey, event.ctrlKey, event.shiftKey);
}
function clearModifiers() {
  editor.setAnchorModifier(false);
  editor.setDrawingModifier(false);
  editor.setMeasurementModifier(false);
}
let detach: (() => void) | undefined;
onMounted(() => {
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("keydown", updateModifiers);
  window.addEventListener("keyup", updateModifiers);
  window.addEventListener("blur", clearModifiers);
  editor.onTextRequested = beginText;
  if (!props.textOnly) detach = attachRenderer(canvas.value!, editor);
  canvas.value!.addEventListener("wheel", wheel, { passive: false });
});
onUnmounted(() => {
  document.removeEventListener("pointerdown", outside, true);
  window.removeEventListener("keydown", updateModifiers);
  window.removeEventListener("keyup", updateModifiers);
  window.removeEventListener("blur", clearModifiers);
  editor.editingTextId = undefined;
  editor.onTextRequested = undefined;
  detach?.();
  canvas.value?.removeEventListener("wheel", wheel);
});
defineExpose({ beginText, cancelText });
</script>
<template>
  <canvas
    ref="canvas"
    v-show="!textOnly"
    :style="{ cursor }"
    aria-label="Pattern drawing canvas"
    tabindex="0"
    @pointerdown="down"
    @dblclick="doubleClick"
    @pointermove="
      editor.setMeasurementModifier($event.ctrlKey);
      editor.pointerMove(
        pixel($event),
        $event.altKey,
        $event.ctrlKey,
        $event.shiftKey,
      );
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
    :class="{ 'print-text-editor': textOnly }"
    data-hint-edit="text"
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
.print-text-editor textarea {
  color: #000;
}
</style>
