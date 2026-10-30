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
        class="tool-menu"
        side="top"
        :side-offset="4"
        @keydown.enter.stop
        @keydown.esc.stop
      >
        <DropdownMenuItem
          v-for="value in values"
          :key="value"
          @select="emit('choose', value)"
          >{{ value.toFixed(2) }} mm</DropdownMenuItem
        >
      </DropdownMenuContent></DropdownMenuPortal
    >
  </DropdownMenuRoot>
</template>

<style scoped>
.preset-arrow {
  border: 0;
  border-left: 1px solid var(--border);
  border-radius: 0;
  padding: 4px 7px;
  background: var(--panel);
  color: var(--text);
}
</style>
