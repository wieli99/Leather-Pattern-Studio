<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { editor } from "../editor/instance";
import { attachRenderer } from "../editor/renderer";
import { useEditorSelector } from "./useEditorSelector";
const canvas = ref<HTMLCanvasElement | null>(null),
  hover = useEditorSelector(editor, editor.hoverSnapshot);
const cursor = computed(() => {
  hover.value;
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
  editor.wheel(
    pixel(event),
    event.deltaX,
    event.deltaY,
    event.ctrlKey || event.metaKey,
  );
}
let detach: (() => void) | undefined;
onMounted(() => {
  detach = attachRenderer(canvas.value!, editor);
  canvas.value!.addEventListener("wheel", wheel, { passive: false });
});
onUnmounted(() => {
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
    @pointercancel="editor.cancel()"
    @lostpointercapture="editor.gesture && editor.cancel()"
    @contextmenu.prevent
  />
</template>
