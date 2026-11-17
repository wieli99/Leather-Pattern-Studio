<script setup lang="ts">
defineProps<{ shortcut?: string }>();
</script>
<template>
  <button>
    <slot />
    <small v-if="shortcut">{{ shortcut }}</small>
  </button>
</template>
