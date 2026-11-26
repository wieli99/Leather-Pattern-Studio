<script setup lang="ts">
/** The Grid snap and Object snap checkboxes of the Model and Print status bars. */
const grid = defineModel<boolean>("grid", { required: true });
const objects = defineModel<boolean>("objects", { required: true });
</script>
<template>
  <label><input v-model="grid" type="checkbox" />Grid snap</label>
  <label title="Snap to object points and align with object edges and centers"
    ><input v-model="objects" type="checkbox" />Object snap</label
  >
</template>
