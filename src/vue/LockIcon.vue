<script setup lang="ts">
/** Padlock icon of object lock toggles; filled and closed while locked. */
defineProps<{ locked?: boolean }>();
</script>
<template>
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <rect x="5" y="10" width="14" height="11" rx="2" :fill="locked ? 'currentColor' : 'none'" />
    <path :d="locked ? 'M8 10V6a4 4 0 018 0v4' : 'M8 10V6a4 4 0 018 0'" />
  </svg>
</template>
