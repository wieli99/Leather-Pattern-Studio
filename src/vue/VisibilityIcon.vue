<script setup lang="ts">
/** Eye icon of object hide/show toggles; struck through while hidden. */
defineProps<{ hidden?: boolean }>();
</script>
<template>
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="M2 12 Q12 0 22 12 Q12 24 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    <path v-if="hidden" d="M3 3L21 21" />
  </svg>
</template>
