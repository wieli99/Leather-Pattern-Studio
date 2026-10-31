<script setup lang="ts">
import { computed, ref } from "vue";
import { editor } from "../editor/instance";
const props = defineProps<{
  sectionKey: string;
  title: string;
  level?: 2 | 3;
  disabled?: boolean;
}>();
const storageKey = computed(() => `inspector-section-${props.sectionKey}`);
function initial() {
  try { return localStorage.getItem(storageKey.value) !== "false"; }
  catch { return true; }
}
const expanded = ref(initial());
const contentId = computed(() => `inspector-content-${props.sectionKey}`);
function toggle() {
  if (expanded.value) void editor.finishProperty();
  expanded.value = !expanded.value;
  try { localStorage.setItem(storageKey.value, String(expanded.value)); }
  catch { /* Disclosure remains usable when storage is unavailable. */ }
}
</script>
<template>
  <section :aria-label="title">
    <component :is="level === 3 ? 'h3' : 'h2'" class="disclosure-heading">
      <button type="button" :aria-expanded="expanded" :aria-controls="contentId" @click="toggle">
        <span>{{ title }}</span>
        <span aria-hidden="true">{{ expanded ? "⌄" : "›" }}</span>
      </button>
    </component>
    <div :id="contentId" v-show="expanded">
      <fieldset v-if="disabled !== undefined" :disabled="disabled" class="section-fields">
        <slot />
      </fieldset>
      <slot v-else />
    </div>
  </section>
</template>
<style scoped>
.section-fields { border: 0; margin: 0; padding: 0; min-width: 0; }
.disclosure-heading { margin: 0; }
.disclosure-heading button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 4px 0;
  background: transparent;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  text-align: left;
}
.disclosure-heading button:hover { color: var(--accent); }
.disclosure-heading:has(button[aria-expanded="true"]) { margin-bottom: 12px; }
</style>
