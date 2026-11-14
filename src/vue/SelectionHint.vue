<script setup lang="ts">
withDefaults(defineProps<{ active: boolean; multiple?: boolean }>(), {multiple:true});
</script>
<template>
  <small v-if="active && multiple">Shift-click on the canvas to add or remove objects.</small>
</template>
