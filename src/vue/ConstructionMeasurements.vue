<script setup lang="ts">
import { segmentLabelPoint } from "../editor/constructionLabels";
import { computed, ref } from "vue";
import { editor } from "../editor/instance";
import { useEditorSelector } from "./useEditorSelector";
import { edgeMeasurements } from "../model/edgeMeasurements";
import { editEdge } from "../model/editEdge";
import { bounds, transformShape } from "../model/geometry";
const revision = useEditorSelector(editor, editor.snapshot);
const active = ref<string>();
const draft = ref("");
const error = ref("");
const pinned = ref({ x: 0, y: 0 });
const pinnedAngle = ref(0);
const items = computed(() => {
  revision.value;
  if (editor.measurementFields.length) {
    const shape = editor.constructionPreview;
    const edges = shape ? edgeMeasurements(shape) : [];
    return editor.measurementFields.map((key, i) => {
      const edge = edges[i];
      const a = editor.pending.at(-1)!;
      const end = editor.constrainMeasurement(editor.cursor);
      const segmentFields = editor.measurementFields.includes("Angle");
      let p = edge?.point ?? { x: (a.x + end.x) / 2, y: (a.y + end.y) / 2 };
      if (editor.mode === "rectangle-center") {
        p = key === "Width" ? { x: a.x, y: Math.min(end.y, 2 * a.y - end.y) } : { x: Math.max(end.x, 2 * a.x - end.x), y: a.y };
      }
      const point = segmentFields
        ? segmentLabelPoint(
            editor.screen(a),
            editor.screen(end),
            key === "Angle",
          )
        : editor.screen(p);
      // Keep the two full-size labels apart even before the rectangle has size.
      if (editor.mode === "rectangle-center" && key === "Width") {
        point.x -= 80;
      }
      return {
        id: key,
        key,
        value: editor.measurementLocks[key] ?? editor.measurementValue(key),
        point,
        angle: segmentFields ? 0 : editor.mode === "rectangle-center" ? (key === "Width" ? 0 : Math.PI / 2) : (edge?.angle ?? 0),
        shape: undefined,
        index: i,
      };
    });
  }
  if (!editor.measurementsVisible && !active.value) return [];
  return (editor.preview ?? editor.document).shapes
    .filter((s) => editor.selected.includes(s.id))
    .flatMap((shape) =>
      edgeMeasurements(shape).map((edge, index) => ({
        id: `${shape.id}:${index}`,
        key: "",
        value: edge.length,
        point: editor.screen(edge.point),
        angle: edge.angle,
        shape,
        index,
      })),
    );
});
function focus(item: (typeof items.value)[number]) {
  active.value = item.id;
  pinned.value = item.point;
  pinnedAngle.value = item.angle;
  draft.value = String(Number(item.value.toFixed(3)));
  error.value = "";
}
function input(item: (typeof items.value)[number], event: Event) {
  draft.value = (event.target as HTMLInputElement).value;
  if (item.key) {
    if (!draft.value.trim()) {
      delete editor.measurementLocks[item.key];
      if (item.key === "Width") delete editor.measurementLocks._x;
      if (item.key === "Height") delete editor.measurementLocks._y;
    } else {
      if (
        ["Width", "Height"].includes(item.key) &&
        editor.measurementFields.length === 2
      ) {
        const axis = item.key === "Width" ? "x" : "y";
        const signKey = axis === "x" ? "_x" : "_y";
        editor.measurementLocks[signKey] ??=
          Math.sign(editor.cursor[axis] - editor.pending.at(-1)![axis]) || 1;
      }
      editor.measurementLocks[item.key] = Number(draft.value);
    }
    editor.notify();
  }
}
async function confirm(item: (typeof items.value)[number]) {
  const value = Number(draft.value);
  if (
    !draft.value.trim() ||
    !Number.isFinite(value) ||
    (!["Angle", "Sweep"].includes(item.key) && value <= 0)
  ) {
    error.value = "Enter a positive finite measurement";
    return;
  }
  if (item.key) editor.confirmMeasurement();
  else if (item.shape) {
    const shape = item.shape;
    const box = bounds([shape]);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const factor = value / item.value;
    let next;
    try {
      next = editEdge(shape, item.index, value);
    } catch (cause) {
      error.value = String(cause);
      return;
    }
    next ??= transformShape(shape, {
      a: factor,
      b: 0,
      c: 0,
      d: factor,
      e: center.x * (1 - factor),
      f: center.y * (1 - factor),
    });
    await editor.commit({
      ...editor.document,
      shapes: editor.document.shapes.map((s) => (s.id === shape.id ? next : s)),
    });
  }
  cancel();
}
function cancel() {
  active.value = undefined;
  error.value = "";
  document.querySelector<HTMLCanvasElement>("canvas")?.focus();
}
function style(item: (typeof items.value)[number]) {
  const p = active.value === item.id ? pinned.value : item.point;
  let angle = active.value === item.id ? pinnedAngle.value : item.angle;
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  const cursor = editor.screen(editor.cursor);
  // Keep short construction segments clickable; Tab can still focus these fields.
  const nearPointer =
    !!item.key && Math.hypot(cursor.x - p.x, cursor.y - p.y) < 120;
  return {
    left: `${p.x}px`,
    top: `${p.y}px`,
    pointerEvents: nearPointer ? ("none" as const) : ("auto" as const),
    transform: `translate(-50%, -50%) rotate(${angle}rad) translateY(calc(-50% - 8px))`,
  };
}
</script>
<template>
  <div class="construction-measurements" data-hint-edit="measurement">
    <label v-for="item in items" :key="item.id" :style="style(item)">
      <span v-if="item.key" class="measurement-name">{{
        item.key === "Angle" ? "Direction" : item.key
      }}</span>
      <input
        :readonly="!!editor.gesture"
        type="number"
        step="any"
        :aria-label="item.key || 'Edge length'"
        :value="active === item.id ? draft : Number(item.value.toFixed(2))"
        @focus="
          focus(item);
          ($event.target as HTMLInputElement).select();
        "
        @input="input(item, $event)"
        @keydown.enter.prevent="!$event.isComposing && confirm(item)"
        @keydown.esc.prevent="cancel()"
      />
      <span>{{ ["Angle", "Sweep"].includes(item.key) ? "°" : "mm" }}</span>
      <small v-if="active === item.id && error" role="alert">{{ error }}</small>
    </label>
  </div>
</template>
