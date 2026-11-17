<script setup lang="ts">
defineProps<{ adding?: boolean; disabled?: boolean }>();
</script>
<template>
  <button :disabled="disabled">
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      :fill="adding ? 'none' : 'currentColor'"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" />
    </svg>
    {{
      adding
        ? disabled
          ? "Favorites limit (10)"
          : "Add to favorites"
        : "Remove from favorites"
    }}
  </button>
</template>
