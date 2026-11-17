<script setup lang="ts">
import { computed } from "vue";
import { openHelp } from "../platform";
const props = defineProps<{ id: string }>();
const sections: Record<string, string> = {
  move: "move-rotate-and-resize",
  rotate: "rotation",
  scale: "resize",
  corner: "individual-corner-radii",
  "path-copy": "copy-along-path",
  subtract: "subtract-intersect-and-exclude",
  intersect: "subtract-intersect-and-exclude",
  exclude: "subtract-intersect-and-exclude",
};
const destination = computed(
  () => "transforms/" + (sections[props.id] ?? props.id),
);
</script>
<template>
  <a
    :href="'/manual/index.html#' + destination"
    target="_blank"
    rel="noopener"
    @click.prevent="openHelp(destination)"
  >
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M14 3h7v7M21 3 10 14M10 4H4v16h16v-6" />
    </svg>
    Documentation
  </a>
</template>
