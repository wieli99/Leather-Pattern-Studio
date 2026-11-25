<script setup lang="ts">
defineProps<{ id: string; suggestions: string[]; highlight: number }>();
defineEmits<{ choose: [name: string] }>();
</script>
<template>
  <ul v-if="suggestions.length" :id="id" class="variable-suggestions" role="listbox" aria-label="Variables">
    <li
      v-for="(name, i) in suggestions"
      :id="`${id}-${i}`"
      :key="name"
      role="option"
      :aria-selected="i === highlight"
      @mousedown.prevent="$emit('choose', name)"
    >{{ name }}</li>
  </ul>
</template>
<style scoped>
.variable-suggestions {
  position: absolute;
  z-index: 30;
  top: 100%;
  left: 0;
  min-width: 100%;
  margin: 2px 0 0;
  padding: 3px 0;
  list-style: none;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 4px;
  box-shadow: 0 6px 18px #0005;
  font-size: 12px;
}
.variable-suggestions li { padding: 4px 8px; cursor: pointer; color: var(--text); }
.variable-suggestions li:hover,
.variable-suggestions li[aria-selected="true"] { background: var(--accent); color: var(--panel); }
</style>
