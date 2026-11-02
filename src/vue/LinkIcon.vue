<script setup lang="ts">
defineProps<{ broken?: boolean }>();
</script>

<template>
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
    stroke="currentColor" stroke-width="2" aria-hidden="true">
    <!-- Match the two tilted links drawn by stitchRenderer. -->
    <g transform="translate(8 14)">
      <ellipse rx="5" ry="3" transform="rotate(-34.377)" />
      <ellipse cx="7" cy="-4" rx="5" ry="3" transform="rotate(-34.377 7 -4)" />
      <path v-if="broken" d="M0 -9L8 5" />
    </g>
  </svg>
</template>
