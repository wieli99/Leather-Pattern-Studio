<script setup lang="ts">
import ToolObjectPicker from "./ToolObjectPicker.vue";
import ToolPopover from "./ToolPopover.vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { focusModelCanvas } from "./canvasFocus";
import type { AlignAction, AlignReference } from "../model/align";
const e = useEditor();
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
/**
 * Pointer choices return focus to the canvas so Enter applies, as the tool hint says.
 * Keyboard activation (detail 0) keeps focus on the button for further choices.
 */
function choose(action: AlignAction, event: MouseEvent) {
  editor.toggleAlign(action);
  if (event.detail > 0) focusModelCanvas();
}
function title(item: Item) {
  if (item.action.kind !== "distribute") return item.label;
  if (item.action.mode.startsWith("gaps") && e.value.align?.gapsFit[item.action.mode.endsWith("x") ? "x" : "y"] === false)
    return `${item.label}: objects are too wide to space between the outer ones`;
  return `${item.label} (3+ objects)`;
}
</script>
<template>
  <ToolPopover
    class="align-options"
    heading="Align and distribute"
    aria-label="Align and distribute settings"
    :apply-disabled="!e.canApplyAlign"
    :apply="() => editor.applyAlign()"
    :cancel="() => editor.cancel()"
  >
    <ToolObjectPicker /><hr />
    <label>Relative to
      <select
        aria-label="Align relative to"
        title="A reference object stays in place"
        :value="e.alignReference"
        @change="editor.setAlignReference(($event.target as HTMLSelectElement).value as AlignReference)"
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
            :aria-pressed="e.isAlignChosen(item.action)"
            :disabled="e.objectPicker || !e.alignAvailable(item.action)"
            @click="choose(item.action, $event)"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
              stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path :d="item.icon" /></svg>
          </button>
        </div>
      </div>
    </div>
    <small v-if="(e.align?.x || e.align?.y) && !e.align?.draft && !e.objectPicker" role="status">Already arranged this way.</small>
  </ToolPopover>
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
</style>
