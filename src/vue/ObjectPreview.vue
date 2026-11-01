<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import {
  findSource,
  sourceNodes,
  sourceShapeIds,
  type PrintLayout,
} from "../model/printLayout";
import { bounds } from "../model/geometry";
import { printShapeSvg } from "../editor/printScene";
import { selfContainedSvg } from "../editor/printExport";
import type { UnitMode } from "../model/units";
const props = defineProps<{
  id?: string;
  x: number;
  y: number;
  units?: UnitMode;
}>();
const viewportHeight = window.innerHeight;
const e = useEditor(),
  url = ref(""),
  title = ref("");
let timer: ReturnType<typeof setTimeout> | undefined,
  generation = 0;
function clear() {
  generation++;
  clearTimeout(timer);
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = "";
}
watch(
  () => [props.id, e.value.revision, props.units],
  () => {
    clear();
    if (!props.id) return;
    const token = generation;
    timer = setTimeout(async () => {
      const doc = editor.document,
        node = findSource(sourceNodes(doc), props.id!);
      if (!node) return;
      const shapes = doc.shapes.filter((s) =>
        sourceShapeIds(node).includes(s.id),
      );
      if (!shapes.length) return;
      try {
        const box = bounds(shapes, props.units ?? editor.units),
          padding = Math.max(box.width, box.height) * 0.06 + 3;
        const layout: PrintLayout = {
          id: "preview",
          name: "Preview",
          width: 210,
          height: 297,
          margin: 10,
          units: props.units ?? editor.units,
          pages: [],
          instances: [],
        };
        const svg = await selfContainedSvg(
          `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="${box.x - padding} ${box.y - padding} ${box.width + 2 * padding} ${box.height + 2 * padding}"><defs></defs>${shapes.map((s) => printShapeSvg(doc, s, s.id, layout)).join("")}</svg>`,
        );
        if (token !== generation) return;
        title.value = node.kind === "group" ? node.name : shapes[0].name;
        url.value = URL.createObjectURL(
          new Blob([svg], { type: "image/svg+xml" }),
        );
      } catch {
        clear();
      }
    }, 200);
  },
  { immediate: true },
);
onUnmounted(clear);
</script>
<template>
  <Teleport to="body"
    ><div
      v-if="url"
      class="object-hover-preview"
      role="tooltip"
      :style="{
        left: `${Math.max(8, x - 332)}px`,
        top: `${Math.max(8, Math.min(y, viewportHeight - 258))}px`,
      }"
    >
      <strong>{{ title }}</strong
      ><img :src="url" alt="" width="320" height="220" /></div
  ></Teleport>
</template>
<style scoped>
.object-hover-preview {
  position: fixed;
  z-index: 80;
  width: 320px;
  background: white;
  color: #111;
  box-shadow: 0 5px 24px #0006;
  border: 1px solid #777;
  border-radius: 5px;
  pointer-events: none;
  overflow: hidden;
}
.object-hover-preview strong {
  display: block;
  padding: 6px 10px;
  font-size: 12px;
}
.object-hover-preview img {
  display: block;
  max-width: 100%;
}
</style>
