<script setup lang="ts">
defineProps<{
  height: number;
  width?: number;
  depth?: number;
  indent?: number;
}>();
</script>
<template>
  <div
    class="reorder-slot"
    data-reorder-slot
    aria-hidden="true"
    :style="{
      height: `${height}px`,
      width: width === undefined ? undefined : `${width}px`,
      marginLeft: `${(depth ?? 0) * (indent ?? 16)}px`,
    }"
  />
</template>
<style scoped>
.reorder-slot {
  position: relative;
  z-index: 2;
  box-sizing: border-box;
  flex-shrink: 0;
  min-height: 24px;
  border: 2px dashed var(--accent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  margin-block: 0;
}
</style>
<style>
html[data-reorder-drag="valid"] * {
  cursor: grabbing !important;
}
html[data-reorder-drag="invalid"] * {
  cursor: not-allowed !important;
}
/* Destination slots stay still while neighboring rows animate into place. */
.reorder-slot.reorder-move {
  transition: none;
  transform: none !important;
}
.reorder-move {
  transition: transform 140ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .reorder-move {
    transition: none;
  }
}
</style>
