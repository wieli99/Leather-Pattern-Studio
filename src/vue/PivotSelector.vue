<script setup lang="ts">
import type { PivotMode } from "../model/pivot";
defineProps<{ mode: PivotMode; placing: boolean; disabled?: boolean }>();
const emit = defineEmits<{ change: [mode: PivotMode]; cancel: [] }>();
const modes: { id: PivotMode; label: string; icon: string }[] = [
  { id: "bounding-box", label: "Bounding box", icon: "M3 3h18v18H3ZM9 12h6m-3-3v6" },
  { id: "median", label: "Median", icon: "M5.5 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 1 1 3 0ZM21.5 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 1 1 3 0ZM5.5 20a1.5 1.5 0 1 1-3 0 1.5 1.5 0 1 1 3 0ZM21.5 20a1.5 1.5 0 1 1-3 0 1.5 1.5 0 1 1 3 0ZM6 6l4 4m4 4 4 4M18 6l-4 4m-4 4-4 4M14 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0Z" },
  { id: "custom", label: "Custom", icon: "M12 8a4 4 0 1 1-8 0 4 4 0 1 1 8 0ZM8 1v2m0 10v2M1 8h2m10 0h2M8 7v2m-1-1h2M12 12l9 4-4 1-1 4Z" },
];
function escape(event: KeyboardEvent, placing: boolean) {
  if (!placing) return;
  event.stopPropagation();
  event.preventDefault();
  emit("cancel");
}
</script>
<template>
  <div class="pivot-control" @keydown.enter.stop @keydown.space.stop @keydown.esc="escape($event, placing)">
    <span>Pivot</span>
    <div class="pivot-modes" role="group" aria-label="Pivot">
      <button v-for="item in modes" :key="item.id" type="button" :title="item.label"
        :disabled="disabled" :aria-label="item.label" :aria-pressed="mode === item.id" @click="$emit('change', item.id)">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
          stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="item.icon" />
        </svg>
      </button>
    </div>
  </div>
  <small v-if="placing && !disabled" role="status">Click to place the custom pivot. Escape cancels placement.</small>
  <small v-else-if="mode === 'custom' && !disabled">Click Custom or press V to reposition the pivot.</small>
</template>
<style scoped>
.pivot-control { display:flex; align-items:center; gap:8px; }
.pivot-modes { display:flex; gap:2px; }
.pivot-modes button { display:grid; place-items:center; width:36px; height:36px; padding:6px; }
.pivot-modes button[aria-pressed="true"] {
  background:color-mix(in srgb, var(--accent) 12%, var(--panel));
  border-color:var(--accent);
  color:var(--accent);
}
.pivot-modes button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
</style>
