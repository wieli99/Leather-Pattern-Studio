<script setup lang="ts">
/** Icon for a tool catalog entry (see `toolCatalog.ts`). */
withDefaults(defineProps<{ id: string; size?: number }>(), { size: 22 });
</script>
<template>
  <svg
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    :stroke-linecap="id === 'path-copy' ? 'round' : undefined"
    :stroke-linejoin="id === 'path-copy' ? 'round' : undefined"
    aria-hidden="true"
  >
    <path v-if="id === 'rectangular-array'" d="M3 3h6v6H3ZM15 3h6v6h-6ZM3 15h6v6H3ZM15 15h6v6h-6Z" />
    <template v-else-if="id === 'radial-array'">
      <circle cx="12" cy="12" r="7.5" stroke-dasharray="2 3" stroke-width="1" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <path d="M10 2h4v4h-4Z" fill="currentColor" />
      <path d="M18 10h4v4h-4ZM10 18h4v4h-4ZM2 10h4v4H2Z" />
    </template>
    <path v-else-if="id === 'rotate'" d="M20 10a8 8 0 1 0-2 8M20 4v6h-6" />
    <path v-else-if="id === 'move'" d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4" />
    <path v-else-if="id === 'mirror'" d="M12 2v20M9 6 3 18h6ZM15 6l6 12h-6Z" />
    <path v-else-if="id === 'corner'" d="M4 20V12a8 8 0 0 1 8-8h8M4 4h4M4 4v4" />
    <path v-else-if="id === 'scale'" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M4 4l6 6M20 20l-6-6M20 4l-6 6M4 20l6-6" />
    <template v-else-if="id === 'path-copy'">
      <path d="M4.5 16c.4-2.5 1.4-4.5 3-6M12.5 7.5c1.5-1 3-1.5 4.5-1.5" />
      <rect x="2" y="16" width="5" height="5" rx=".5" fill="currentColor" fill-opacity=".2" />
      <rect x="7.5" y="6.5" width="5" height="5" rx=".5" />
      <rect x="17" y="3.5" width="5" height="5" rx=".5" />
    </template>
    <template v-else-if="id === 'offset'">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </template>
    <template v-else-if="id === 'align'">
      <path d="M3 2v20" />
      <rect x="6" y="5" width="14" height="5" rx="1" />
      <rect x="6" y="14" width="8" height="5" rx="1" />
    </template>
    <path v-else-if="id === 'join'" d="M3 3h11v6h7v12H9v-7H3Z" />
    <template v-else-if="id === 'subtract'">
      <path d="M3 3h12v6H9v6H3Z" fill="currentColor" fill-opacity=".2" />
      <rect x="9" y="9" width="12" height="12" stroke-dasharray="2 2" stroke-dashoffset="1" />
    </template>
    <template v-else-if="id === 'exclude'">
      <path d="M3 3h12v6H9v6H3ZM15 9h6v12H9v-6h6Z" fill="currentColor" fill-opacity=".2" />
      <path d="M9 9h6v6H9Z" stroke-dasharray="2 2" />
    </template>
    <template v-else-if="id === 'intersect'">
      <rect x="3" y="3" width="12" height="12" />
      <rect x="9" y="9" width="12" height="12" />
      <path d="M9 9h6v6H9Z" fill="currentColor" />
    </template>
    <template v-else-if="id === 'calibrate-image'">
      <rect x="3" y="3" width="18" height="13" rx="1" />
      <path d="m3 14 5-5 4 4 3-3 6 6" stroke-width="1.3" />
      <path d="M3 21h18M3 19v4M21 19v4" />
    </template>
    <template v-else-if="id === 'trim'">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.2 8.2 20 20M8.2 15.8 20 4" />
    </template>
  </svg>
</template>
