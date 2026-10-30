<script setup lang="ts">
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
} from "reka-ui";
defineProps<{ label: string; values: readonly number[]; disabled: boolean }>();
const emit = defineEmits<{ choose: [number] }>();
</script>
<template>
  <DropdownMenuRoot :modal="false">
    <DropdownMenuTrigger
      class="preset-arrow"
      :disabled="disabled"
      :aria-label="`${label} presets`"
      >▾</DropdownMenuTrigger
    >
    <DropdownMenuPortal
      ><DropdownMenuContent
        class="tool-menu stitch-preset-menu"
        side="top"
        align="end"
        :side-offset="4"
        @keydown.enter.stop
        @keydown.esc.stop
      >
        <DropdownMenuItem
          v-for="value in values"
          :key="value"
          class="stitch-preset-item"
          @select="emit('choose', value)"
          >{{ value.toFixed(2) }} mm</DropdownMenuItem
        >
      </DropdownMenuContent></DropdownMenuPortal
    >
  </DropdownMenuRoot>
</template>

<style scoped>
:global(.tool-menu.stitch-preset-menu) {
  position: relative;
  top: auto;
  left: auto;
  width: max-content;
  min-width: 135px;
}
:global(.stitch-preset-item) {
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}
:global(.stitch-preset-item[data-highlighted]) {
  background: color-mix(in srgb, var(--accent) 18%, var(--panel));
  outline: none;
}
.preset-arrow {
  border: 0;
  border-left: 1px solid var(--border);
  border-radius: 0;
  padding: 4px 7px;
  background: var(--panel);
  color: var(--text);
}
</style>
