<script setup lang="ts">
/**
 * One object-choice button in a tool popover: the role on the left and the current choice
 * (a count or "Choose object") on the right. Pressed while the canvas is choosing for it.
 * Shared by the Objects button, the boolean Target/other objects and Copy along path.
 */
defineProps<{ label: string; value: string; pressed: boolean; title?: string; disabled?: boolean }>();
defineEmits<{ toggle: [] }>();
</script>
<template>
  <button type="button" class="object-pick" :aria-pressed="pressed" :title="title" :disabled="disabled" @click="$emit('toggle')">
    <span class="object-pick-label">{{ label }}</span><span class="object-pick-value">{{ value }}</span>
  </button>
</template>
