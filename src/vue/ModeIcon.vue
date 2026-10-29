<script setup lang="ts">
import { computed } from "vue";
import type { Mode } from "../editor/construction";
const props = defineProps<{ mode: Mode }>();
const center = computed(
    () =>
      props.mode.includes("center") ||
      props.mode === "circle" ||
      props.mode === "arc",
  ),
  three = computed(() => props.mode.includes("three"));
const points = computed(() => {
  const m = props.mode;
  if (m === "select") return [];
  if (m === "polyline")
    return [
      [3, 18],
      [9, 6],
      [16, 15],
      [21, 5],
    ];
  if (m.startsWith("rectangle"))
    return three.value
      ? [
          [4, 5],
          [20, 5],
          [20, 19],
        ]
      : center.value
        ? [
            [12, 12],
            [20, 19],
          ]
        : [
            [4, 5],
            [20, 19],
          ];
  if (m.startsWith("ellipse"))
    return center.value
      ? [
          [12, 12],
          [21, 12],
          [12, 6],
        ]
      : [
          [3, 6],
          [21, 18],
        ];
  if (m.startsWith("arc"))
    return center.value
      ? [
          [12, 16],
          [4, 16],
          [20, 16],
        ]
      : [
          [4, 16],
          [20, 16],
          [12, 8],
        ];
  return three.value
    ? [
        [12, 4],
        [5, 16],
        [19, 16],
      ]
    : m === "circle-two"
      ? [
          [4, 12],
          [20, 12],
        ]
      : [
          [12, 12],
          [20, 12],
        ];
});
</script>
<template>
  <svg
    :data-mode="mode"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-if="mode === 'select'" d="M5 3L19 13L12 14L9 21Z" />
    <path v-else-if="mode === 'polyline'" d="M3 18L9 6L16 15L21 5" />
    <path v-else-if="mode.startsWith('rectangle')" d="M4 5H20V19H4Z" />
    <template v-else-if="mode.startsWith('ellipse')">
      <ellipse cx="12" cy="12" rx="9" ry="6" />
      <path
        :d="
          center
            ? 'M3 12H21M12 6V18'
            : 'M3 10V6H7M17 6H21V10M21 14V18H17M7 18H3V14'
        "
      />
    </template>
    <path v-else-if="mode.startsWith('arc')" d="M4 16A8 8 0 0 1 20 16" />
    <template v-else>
      <circle cx="12" cy="12" r="8" />
      <path v-if="mode === 'circle-two'" d="M4 12H20" />
    </template>
    <circle
      v-for="([cx, cy], i) in points"
      :key="i"
      :cx="cx"
      :cy="cy"
      r="1.6"
      fill="currentColor"
      stroke="var(--panel)"
      stroke-width=".6"
    />
    <path
      v-if="center"
      :d="mode === 'arc' ? 'M10 16H14M12 14V18' : 'M10 12H14M12 10V14'"
    />
  </svg>
</template>
