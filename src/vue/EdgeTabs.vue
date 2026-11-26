<script setup lang="ts">
/** Canvas edge toggles for the tool rail, the object/property sidebar and the status bar. */
const props = defineProps<{
  /** Runs before the sidebar closes or opens, e.g. to commit a property being typed. */
  beforePanelToggle?: () => unknown;
  /** Lifts the status-bar toggle above a status bar drawn over the canvas. */
  aboveStatus?: boolean;
}>();
const left = defineModel<boolean>("left", { required: true });
const panel = defineModel<boolean>("panel", { required: true });
const bottom = defineModel<boolean>("bottom", { required: true });
function togglePanel() {
  props.beforePanelToggle?.();
  panel.value = !panel.value;
}
</script>
<template>
  <button
    class="edge-tab edge-left"
    :aria-label="left ? 'Hide tools' : 'Show tools'"
    :aria-expanded="left"
    @click="left = !left"
  >
    {{ left ? "‹" : "›" }}
  </button>
  <button
    class="edge-tab edge-right"
    :aria-label="panel ? 'Hide inspector' : 'Show inspector'"
    :aria-expanded="panel"
    @click="togglePanel"
  >
    <span class="edge-glyph">{{ panel ? "›" : "‹" }}</span>
    <!-- The compact layout shows the sidebar below the canvas; a panel icon replaces the arrow. -->
    <svg class="edge-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path :d="panel ? 'M3 14h18M9 9l3 2.5L15 9' : 'M3 14h18M9 11.5L12 9l3 2.5'" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
  <button
    class="edge-tab edge-bottom"
    :class="{ 'above-status': aboveStatus && bottom }"
    :aria-label="bottom ? 'Hide status bar' : 'Show status bar'"
    :aria-expanded="bottom"
    @click="bottom = !bottom"
  >
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        :d="bottom ? 'M3 4L6 7L9 4' : 'M3 8L6 5L9 8'"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
    </svg>
  </button>
</template>
