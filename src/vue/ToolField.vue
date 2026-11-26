<script setup lang="ts">
/**
 * One labelled tool setting: the label on the left and a fixed-width control on the right,
 * as in the stitch panel. Put one input, select or checkbox in the slot, or wrap a control
 * with extra buttons in `.tool-field-control`. Styles live in style.css so portalled panels
 * and child components share them.
 */
defineProps<{ label?: string }>();
</script>
<template>
  <label class="tool-field"><span><slot name="label">{{ label }}</slot></span><slot /></label>
</template>
