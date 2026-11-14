<script setup lang="ts">
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { transformShortcuts } from "./tools";
defineProps<{ id: string; label?: string; shortcut?: string }>();
const emit = defineEmits<{ activated: [] }>();
const e = useEditor();
</script>
<template>
  <button
    v-for="item in transformShortcuts.filter((t) => t[0] === id)"
    :key="item[0]"
    :disabled="!e.canStartTransform(item[0])"
    :aria-label="item[1]"
    :title="`${item[1]} (${item[2]})`"
    :aria-pressed="e.transformTool === item[0]"
    :aria-keyshortcuts="item[2].toLowerCase()"
    @click="
      emit('activated');
      editor.activateTransform(item[0]);
    "
  >
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      aria-hidden="true"
    >
      <path v-if="item[0] === 'rotate'" d="M20 10a8 8 0 1 0-2 8M20 4v6h-6" />
      <path
        v-else-if="item[0] === 'move'"
        d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"
      />
      <path
        v-else-if="item[0] === 'mirror'"
        d="M12 2v20M9 6 3 18h6ZM15 6l6 12h-6Z"
      />
      <path
        v-else-if="item[0] === 'corner'"
        d="M4 20V12a8 8 0 0 1 8-8h8M4 4h4M4 4v4"
      />
      <path
        v-else
        d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M4 4l6 6M20 20l-6-6M20 4l-6 6M4 20l6-6"
      />
    </svg>
    <template v-if="label"
      ><span>{{ label }}</span
      ><kbd v-if="shortcut">{{ shortcut }}</kbd></template
    >
  </button>
  <button
    v-if="id === 'path-copy'"
    :disabled="!e.canCopyAlongPath"
    title="Copy along path"
    aria-label="Copy along path"
    @click="
      emit('activated');
      editor.activatePathCopy();
    "
    :aria-pressed="!!e.pathCopy"
  >
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 16c.4-2.5 1.4-4.5 3-6M12.5 7.5c1.5-1 3-1.5 4.5-1.5" />
      <rect
        x="2"
        y="16"
        width="5"
        height="5"
        rx=".5"
        fill="currentColor"
        fill-opacity=".2"
      />
      <rect x="7.5" y="6.5" width="5" height="5" rx=".5" />
      <rect x="17" y="3.5" width="5" height="5" rx=".5" />
    </svg>
    <template v-if="label"
      ><span>{{ label }}</span
      ><kbd v-if="shortcut">{{ shortcut }}</kbd></template
    >
  </button>
  <button
    v-if="id === 'offset'"
    :disabled="!e.canOffset"
    aria-label="Offset"
    title="Offset (O)"
    aria-keyshortcuts="o"
    :aria-pressed="e.offsetActive"
    @click="
      emit('activated');
      editor.activateOffset();
    "
  >
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </svg>
    <template v-if="label"
      ><span>{{ label }}</span
      ><kbd v-if="shortcut">{{ shortcut }}</kbd></template
    >
  </button>
  <button
    v-if="id === 'join'"
    aria-label="Join"
    aria-keyshortcuts="j"
    :title="
      e.canJoin
        ? 'Join (J): combine closed outlines or join compatible open paths'
        : 'Join (J) requires an unlocked closed outline or joinable path without stitches'
    "
    :disabled="!e.canJoin || e.busy"
    :aria-pressed="
      e.mergeMode && (!e.booleanOperation || e.booleanOperation === 'union')
    "
    @click="
      emit('activated');
      editor.activateMerge();
    "
  >
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      aria-hidden="true"
    >
      <path d="M3 3h11v6h7v12H9v-7H3Z" />
    </svg>
    <template v-if="label"
      ><span>{{ label }}</span
      ><kbd v-if="shortcut">{{ shortcut }}</kbd></template
    >
  </button>
  <button
    v-for="operation in (['subtract', 'intersect', 'exclude'] as const).filter(
      (t) => t === id,
    )"
    :key="operation"
    :aria-label="
      operation === 'subtract'
        ? 'Subtract'
        : operation === 'intersect'
          ? 'Intersect'
          : 'Exclude'
    "
    :title="
      e.canBoolean
        ? {
            subtract: 'Subtract: remove other objects from the target',
            intersect: 'Intersect: keep the area shared by all objects',
            exclude: 'Exclude (XOR): keep areas covered an odd number of times',
          }[operation]
        : 'Requires closed, unlocked outlines without active stitching'
    "
    :disabled="!e.canBoolean || e.busy"
    :aria-pressed="e.booleanOperation === operation"
    @click="
      emit('activated');
      editor.activateBoolean(operation);
    "
  >
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      aria-hidden="true"
    >
      <template v-if="operation === 'subtract'">
        <path d="M3 3h12v6H9v6H3Z" fill="currentColor" fill-opacity=".2" />
        <rect
          x="9"
          y="9"
          width="12"
          height="12"
          stroke-dasharray="2 2"
          stroke-dashoffset="1"
        />
      </template>
      <template v-else-if="operation === 'exclude'">
        <path
          d="M3 3h12v6H9v6H3ZM15 9h6v12H9v-6h6Z"
          fill="currentColor"
          fill-opacity=".2"
        />
        <path d="M9 9h6v6H9Z" stroke-dasharray="2 2" />
      </template>
      <template v-else>
        <rect x="3" y="3" width="12" height="12" />
        <rect x="9" y="9" width="12" height="12" />
        <path d="M9 9h6v6H9Z" fill="currentColor" />
      </template>
    </svg>
    <template v-if="label"
      ><span>{{ label }}</span
      ><kbd v-if="shortcut">{{ shortcut }}</kbd></template
    >
  </button>
  <button
    v-if="id === 'trim'"
    :disabled="!e.canTrim"
    aria-label="Trim"
    title="Trim (K)"
    aria-keyshortcuts="k"
    :aria-pressed="e.trimMode && !e.mergeMode"
    @click="
      emit('activated');
      editor.activateTrim();
    "
  >
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.2 8.2 20 20M8.2 15.8 20 4" />
    </svg>
    <template v-if="label"
      ><span>{{ label }}</span
      ><kbd v-if="shortcut">{{ shortcut }}</kbd></template
    >
  </button>
</template>
