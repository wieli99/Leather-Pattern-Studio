<script setup lang="ts">
import { computed } from "vue";
import type { Mode } from "../editor/construction";
const props = defineProps<{ mode: Mode | "image" | "compound" }>();
const center = computed(
    () =>
      props.mode.includes("center") ||
      props.mode === "circle" ||
      props.mode === "polygon" ||
      props.mode === "arc",
  ),
  three = computed(() => props.mode.includes("three"));
const points = computed(() => {
  const m = props.mode;
  if (
    ["arrow", "arrow-head", "crosshair", "size-square", "size-ruler"].includes(m) ||
    m === "text" ||
    m === "measurement" ||
    m === "select" ||
    m === "ellipse" ||
    m.startsWith("polygon")
  )
    return [];
  if (m === "control-curve")
    return [
      [3, 19],
      [21, 19],
    ];
  if (m === "curve")
    return [
      [3, 18],
      [21, 6],
    ];
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
    <path
      v-if="mode === 'text'"
      d="M4 4H20V9H18L17 6H14V18L17 19V21H7V19L10 18V6H7L6 9H4Z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.2"
    />
    <path v-else-if="mode === 'arrow'" d="M3 21L21 3M10 3H21V14" />
    <path v-else-if="mode === 'arrow-head'" d="M17 4L7 12L17 20" />
    <path v-else-if="mode === 'crosshair'" d="M2 12H22M12 2V22" />
    <path v-else-if="mode === 'size-square'" d="M3 3H21V21H3ZM6 8H18M6 6V10M18 6V10M8 13H16M8 16H16" />
    <path v-else-if="mode === 'size-ruler'" d="M2 6H22M2 6V18M7 6V12M12 6V16M17 6V12M22 6V18" />
    <path v-else-if="mode === 'image'" d="M3 3H21V21H3ZM4 18L9 11L13 15L17 9L20 18M7 7H8" />
    <path v-else-if="mode === 'measurement'" d="M3 7H21V17H3ZM7 7V12M10 7V10M13 7V12M16 7V10M19 7V12" />
    <path v-else-if="mode === 'select'" d="M5 3L19 13L12 14L9 21Z" />
    <path v-else-if="mode === 'curve'" d="M3 18C8 18 16 6 21 6" />
    <template v-else-if="mode === 'control-curve'">
      <path d="M3 16V7M21 16V7" stroke-width="1" />
      <path d="M3 19C3 3 21 3 21 19" />
      <rect x="1.5" y="3.5" width="3" height="3" />
      <rect x="19.5" y="3.5" width="3" height="3" />
    </template>
    <template v-else-if="mode === 'polygon-box'">
      <path d="M2 7V2H7M17 2H22V7M22 17V22H17M7 22H2V17" stroke-width="1" />
      <path d="M12 5L19 10L16.5 19H7.5L5 10Z" />
    </template>
    <path v-else-if="mode === 'polygon'" d="M12 3L21 10L18 21H6L3 10Z" />
    <path v-else-if="mode === 'polyline'" d="M3 18L9 6L16 15L21 5" />
    <path v-else-if="mode.startsWith('rectangle')" d="M4 5H20V19H4Z" />
    <template v-else-if="mode === 'ellipse'">
      <path d="M2 7V2H7M17 2H22V7M22 17V22H17M7 22H2V17" stroke-width="1" />
      <ellipse cx="12" cy="12" rx="7" ry="5" />
    </template>
    <template v-else-if="mode === 'ellipse-center'">
      <ellipse cx="12" cy="12" rx="9" ry="6" />
      <path d="M3 12H21M12 6V18" />
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
