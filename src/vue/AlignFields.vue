<script setup lang="ts">
import LengthInput from "./LengthInput.vue";
import type { AlignAction, AlignReference } from "../model/align";
import type { UnitMode } from "../model/units";
/** Align and distribute controls shared by the Model and Print panels. */
const props = defineProps<{
  reference: AlignReference;
  /** Exact gap in millimetres, or null for equal gaps. */
  gap: number | null;
  units: UnitMode;
  unitSymbol: string;
  chosen: (action: AlignAction) => boolean;
  available: (action: AlignAction) => boolean;
  /** Whether equal gaps fit on each axis; omitted while unknown. */
  gapsFit?: { x: boolean; y: boolean };
  disabled?: boolean;
}>();
const emit = defineEmits<{
  toggle: [action: AlignAction, event: MouseEvent];
  reference: [reference: AlignReference];
  gap: [gap: number | null];
}>();
type Item = { label: string; action: AlignAction; icon: string };
const columns: { axis: string; items: Item[] }[] = [
  { axis: "Horizontal", items: [
    { label: "Align left edges", action: { kind: "align", edge: "left" }, icon: "M3 2v20M6 5h14v5H6ZM6 14h8v5H6Z" },
    { label: "Center horizontally", action: { kind: "align", edge: "center-x" }, icon: "M12 2v20M5 5h14v5H5ZM8 14h8v5H8Z" },
    { label: "Align right edges", action: { kind: "align", edge: "right" }, icon: "M21 2v20M4 5h14v5H4ZM10 14h8v5h-8Z" },
    { label: "Distribute centers horizontally", action: { kind: "distribute", mode: "centers-x" }, icon: "M4 2v20M12 2v20M20 2v20M2 8h4v8H2ZM9 6h6v12H9ZM18.5 9h3v6h-3Z" },
    { label: "Equalize horizontal gaps", action: { kind: "distribute", mode: "gaps-x" }, icon: "M2 6h5v12H2ZM10 8h3v8h-3ZM16 6h6v12h-6ZM7.5 12h2M13.5 12h2" },
  ] },
  { axis: "Vertical", items: [
    { label: "Align top edges", action: { kind: "align", edge: "top" }, icon: "M2 3h20M5 6h5v14H5ZM14 6h5v8h-5Z" },
    { label: "Center vertically", action: { kind: "align", edge: "center-y" }, icon: "M2 12h20M5 5h5v14H5ZM14 8h5v8h-5Z" },
    { label: "Align bottom edges", action: { kind: "align", edge: "bottom" }, icon: "M2 21h20M5 4h5v14H5ZM14 10h5v8h-5Z" },
    { label: "Distribute centers vertically", action: { kind: "distribute", mode: "centers-y" }, icon: "M2 4h20M2 12h20M2 20h20M8 2h8v4H8ZM6 9h12v6H6ZM9 18.5h6v3H9Z" },
    { label: "Equalize vertical gaps", action: { kind: "distribute", mode: "gaps-y" }, icon: "M6 2h12v5H6ZM8 10h8v3H8ZM6 16h12v6H6ZM12 7.5v2M12 13.5v2" },
  ] },
];
const references: { id: AlignReference; label: string }[] = [
  { id: "selection", label: "Selection bounds" },
  { id: "first", label: "First selected" },
  { id: "last", label: "Last selected" },
  { id: "largest", label: "Largest object" },
  { id: "smallest", label: "Smallest object" },
];
function title(item: Item) {
  if (item.action.kind !== "distribute") return item.label;
  if (item.action.mode.startsWith("gaps") && props.gap !== null) return `${item.label} (2+ objects)`;
  if (item.action.mode.startsWith("gaps") && props.gapsFit?.[item.action.mode.endsWith("x") ? "x" : "y"] === false)
    return `${item.label}: objects are too wide to space between the outer ones`;
  return `${item.label} (3+ objects)`;
}
/** Last exact gap, offered again when switching back from Equal. */
let lastGap = 5;
function setGapMode(mode: string) {
  if (props.gap !== null) lastGap = props.gap;
  emit("gap", mode === "exact" ? lastGap : null);
}
</script>
<template>
  <label>Relative to
    <select
      aria-label="Align relative to"
      title="A reference object stays in place"
      :value="reference"
      @change="emit('reference', ($event.target as HTMLSelectElement).value as AlignReference)"
    >
      <option v-for="item in references" :key="item.id" :value="item.id">{{ item.label }}</option>
    </select>
  </label>
  <div class="align-axes">
    <div v-for="column in columns" :key="column.axis" class="align-axis" role="group" :aria-label="column.axis">
      <span>{{ column.axis }}</span>
      <div class="align-buttons">
        <button
          v-for="item in column.items"
          :key="item.label"
          type="button"
          :title="title(item)"
          :aria-label="item.label"
          :aria-pressed="chosen(item.action)"
          :disabled="disabled || !available(item.action)"
          @click="emit('toggle', item.action, $event)"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
            stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path :d="item.icon" /></svg>
        </button>
      </div>
    </div>
  </div>
  <div class="align-gap">
    <label>Gaps
      <select
        aria-label="Gap spacing"
        title="Equal shares the space between the outer objects; Exact places objects a set distance apart"
        :value="gap === null ? 'equal' : 'exact'"
        @change="setGapMode(($event.target as HTMLSelectElement).value)"
      >
        <option value="equal">Equal</option>
        <option value="exact">Exact</option>
      </select>
    </label>
    <label v-if="gap !== null">Gap ({{ unitSymbol }})<LengthInput
      fixed
      :units="units"
      :step=".1"
      aria-label="Exact gap"
      title="The reference object, or the first along the axis, stays in place"
      :value="gap"
      :min="0"
      @commit="emit('gap', $event)"
    /></label>
  </div>
</template>
<style scoped>
.align-axes { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; }
/* The divider shows that one horizontal and one vertical choice combine. */
.align-axes::before { content: ""; grid-column: 2; grid-row: 1; border-left: 1px solid var(--border); }
.align-axis:first-child { grid-column: 1; grid-row: 1; }
.align-axis:last-child { grid-column: 3; grid-row: 1; }
.align-axis { display: grid; gap: 4px; align-content: start; }
.align-axis > span { font-size: 12px; color: var(--muted); }
.align-buttons { display: grid; grid-template-columns: repeat(3, 36px); gap: 2px; }
.align-buttons button { display: grid; place-items: center; width: 36px; height: 36px; padding: 6px; }
.align-gap { display: flex; gap: 8px; align-items: end; }
.align-gap input { width: 7em; }
</style>
