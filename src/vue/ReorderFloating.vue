<script setup lang="ts">
import { computed } from "vue";
import type { ReorderDragState } from "./useReorderDrag";
const props = defineProps<{ state?: ReorderDragState }>();
const position = computed(() => {
  const s = props.state;
  if (!s) return {};
  const width = Math.min(s.width, 300, window.innerWidth - 16);
  return {
    left: `${Math.max(8, Math.min(s.x + 14, window.innerWidth - width - 8))}px`,
    top: `${Math.max(8, Math.min(s.y + 14, window.innerHeight - (s.image ? 250 : 50)))}px`,
    width: `${width}px`,
  };
});
</script>
<template>
  <Teleport to="body"
    ><div
      v-if="state"
      class="reorder-floating"
      :class="{ stacked: state.count > 1 }"
      aria-hidden="true"
      :style="position"
    >
      <img v-if="state.image" :src="state.image" alt="" />
      {{ state.label }}
      <span v-if="state.count > 1">{{ state.count }} items</span>
    </div></Teleport
  >
</template>
<style scoped>
.reorder-floating {
  position: fixed;
  pointer-events: none;
  z-index: 10000;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--panel, #252525);
  color: var(--text, white);
  box-shadow: 0 5px 16px #0005;
  opacity: 0.9;
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reorder-floating img {
  display: block;
  width: 100%;
  margin-bottom: 6px;
}
.reorder-floating.stacked {
  box-shadow:
    3px 3px 0 var(--panel, #252525),
    4px 4px 0 var(--accent),
    7px 7px 0 var(--panel, #252525),
    8px 8px 0 var(--accent);
}
.reorder-floating span {
  float: right;
  margin-left: 8px;
  font-size: 11px;
}
</style>
