<script setup lang="ts">
/**
 * Shared frame for tool settings popovers: heading, tool-specific content and the
 * Apply / Cancel footer. Classes, aria labels and key handlers fall through to the root.
 */
withDefaults(defineProps<{ heading: string; applyDisabled?: boolean; tag?: "section" | "div" }>(), { tag: "section" });
const emit = defineEmits<{ apply: []; cancel: [] }>();
</script>
<template>
  <component :is="tag" class="transform-options">
    <strong>{{ heading }}</strong>
    <slot />
    <div class="actions tool-popup-footer">
      <button :disabled="applyDisabled" @click="emit('apply')">Apply</button>
      <button @click="emit('cancel')">Cancel</button>
    </div>
  </component>
</template>
