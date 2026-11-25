<script setup lang="ts">
import { editableNumber } from "../model/expression";
import { editableLength } from "../model/units";
import { parseFieldValue } from "../model/variables";
import { segmentLabelPoint } from "../editor/constructionLabels";
import { computed, nextTick, ref } from "vue";
import { editor as defaultEditor } from "../editor/instance";
import type { Controller } from "../editor/controller";
import { useEditorSelector } from "./useEditorSelector";
import { edgeMeasurements } from "../model/edgeMeasurements";
import { editEdge } from "../model/editEdge";
import { segmentKey } from "../model/trim";
import { bounds, transformShape } from "../model/geometry";
const props = defineProps<{ controller?: Controller }>();
const editor = props.controller ?? defaultEditor;
const revision = useEditorSelector(editor, editor.snapshot);
const active = ref<string>();
const root = ref<HTMLElement>();
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
        p =
          key === "Width"
            ? { x: a.x, y: Math.min(end.y, 2 * a.y - end.y) }
            : { x: Math.max(end.x, 2 * a.x - end.x), y: a.y };
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
        angle: segmentFields
          ? 0
          : editor.mode === "rectangle-center"
            ? key === "Width"
              ? 0
              : Math.PI / 2
            : (edge?.angle ?? 0),
        shape: undefined,
        index: i,
      };
    });
  }
  if (editor.transformTool === "corner") return [];
  if (!editor.measurementsVisible && !active.value) return [];
  if (editor.segmentMode && !editor.transformTool) return segmentItems();
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
// Segment lengths; a segment covering a whole edge edits that edge like object selection does.
function segmentItems() {
  return editor.segmentSelection.flatMap((segment) => {
    const points = segment.points;
    const steps = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    const length = steps.reduce((sum, step) => sum + step, 0);
    if (!(length > 1e-9)) return [];
    let walked = 0, i = 0;
    while (i < steps.length - 1 && walked + steps[i] < length / 2) walked += steps[i++];
    const t = steps[i] ? (length / 2 - walked) / steps[i] : 0;
    const a = points[i], b = points[i + 1];
    const middle = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const shape = editor.document.shapes.find((s) => s.id === segment.shapeId);
    const index = shape
      ? edgeMeasurements(shape).findIndex((edge) =>
          Math.abs(edge.length - length) < 1e-6 &&
          Math.hypot(edge.point.x - middle.x, edge.point.y - middle.y) < 1e-6)
      : -1;
    return [{
      id: segmentKey(segment),
      key: "",
      value: length,
      point: editor.screen(middle),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      shape: index >= 0 ? shape : undefined,
      index,
    }];
  });
}
async function focus(item: (typeof items.value)[number], event: FocusEvent) {
  const field = event.target as HTMLInputElement;
  active.value = item.id;
  pinned.value = item.point;
  pinnedAngle.value = item.angle;
  draft.value = ["Angle", "Sweep"].includes(item.key) ? editableNumber(item.value) : editableLength(item.value, editor.units);
  // Wheel handlers read immediately after focus, before Vue renders the draft.
  field.value = draft.value;
  error.value = "";
  // Select after Vue replaces the display value with the editable draft.
  await nextTick();
  if (document.activeElement !== field) return;
  const canvas = field.closest(".viewport")?.querySelector("canvas");
  const label = field.closest("label");
  if (canvas && label) {
    const view = canvas.getBoundingClientRect();
    const box = label.getBoundingClientRect();
    const displacement = (start: number, end: number, low: number, high: number) =>
      end - start > high - low ? (low + high - start - end) / 2
        : start < low ? low - start : end > high ? high - end : 0;
    const insetX = Math.min(120, view.width / 4);
    const insetY = Math.min(120, view.height / 4);
    const dx = displacement(box.left, box.right, view.left + insetX, view.right - insetX);
    const dy = displacement(box.top, box.bottom, view.top + insetY, view.bottom - insetY);
    if (dx || dy) {
      editor.pan = { x: editor.pan.x + dx, y: editor.pan.y + dy };
      pinned.value = { x: pinned.value.x + dx, y: pinned.value.y + dy };
      editor.notify();
      await nextTick();
    }
  }
  // Set the selection without select() asking Firefox to scroll the field.
  if (document.activeElement === field) field.setSelectionRange(0, field.value.length);
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
      editor.measurementLocks[item.key] = (parseFieldValue(draft.value, ["Angle", "Sweep"].includes(item.key) ? "number" : editor.units, editor.variableScope.values) ?? NaN);
    }
    editor.notify();
  }
}
async function confirm(item: (typeof items.value)[number]) {
  const value = (parseFieldValue(draft.value, ["Angle", "Sweep"].includes(item.key) ? "number" : editor.units, editor.variableScope.values) ?? NaN);
  const signedHeight = item.key === "Height" &&
    ["rectangle-three", "ellipse-center"].includes(editor.mode) &&
    editor.pending.length === 2;
  const signed = ["Angle", "Sweep", "Offset"].includes(item.key);
  if (
    !draft.value.trim() ||
    !Number.isFinite(value) ||
    (signedHeight ? value === 0 : !signed && value <= 0)
  ) {
    error.value = signedHeight
      ? "Enter a nonzero finite measurement"
      : signed
        ? "Enter a finite measurement"
        : "Enter a positive finite measurement";
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
  // Return focus to the canvas this overlay edits; print views also contain hidden canvases.
  const canvas = Array.from(
    root.value?.parentElement?.querySelectorAll<HTMLCanvasElement>("canvas[tabindex]") ?? [],
  ).find((el) => el.getClientRects().length) ??
    document.querySelector<HTMLCanvasElement>("canvas");
  canvas?.focus({ preventScroll: true });
}
function cycleField(event: KeyboardEvent) {
  if (
    event.isComposing || event.ctrlKey ||
    event.metaKey || event.altKey
  ) return;
  const input = event.target as HTMLInputElement;
  const fields = Array.from(
    input.closest(".construction-measurements")!
      .querySelectorAll<HTMLInputElement>("input"),
  );
  const index = fields.indexOf(input);
  if (index < 0 || !fields.length) return;
  event.preventDefault();
  const next =
    fields[(index + (event.shiftKey ? -1 : 1) + fields.length) % fields.length];
  next.focus({ preventScroll: true });
  if (next === input) next.setSelectionRange(0, next.value.length);
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
  <div ref="root" class="construction-measurements" data-hint-edit="measurement">
    <label v-for="item in items" :key="item.id" :style="style(item)">
      <span v-if="item.key" class="measurement-name">{{
        item.key === "Angle" ? "Direction" : item.key
      }}</span>
      <input
        v-numeric-wheel="['Angle', 'Sweep'].includes(item.key) ? 'number' : editor.units"
        :readonly="!!editor.gesture || (!item.key && !item.shape)"
        type="text"
        step="any"
        :aria-label="item.key || 'Edge length'"
        :value="active === item.id ? draft : (['Angle', 'Sweep'].includes(item.key) ? Number(item.value.toFixed(2)) : editor.formatLength(item.value))"
        @focus="focus(item, $event)"
        @input="input(item, $event)"
        @keydown.tab="cycleField"
        @keydown.enter.prevent="!$event.isComposing && confirm(item)"
        @keydown.esc.prevent="cancel()"
      />
      <span>{{ ["Angle", "Sweep"].includes(item.key) ? "°" : editor.unitSymbol }}</span>
      <small v-if="active === item.id && error" role="alert">{{ error }}</small>
    </label>
  </div>
</template>
