<script setup lang="ts">
import { editor } from "../editor/instance";
import { useEditorSelector } from "./useEditorSelector";
const props = defineProps<{ coordinates?: boolean }>();
const state = useEditorSelector(editor, () =>
  props.coordinates
    ? editor.cursorSnapshot()
    : editor.busy
      ? "Processing…"
      : editor.message,
);
</script>
<template>
  <template v-if="coordinates">
    <span class="cursor-coordinates" aria-label="Cursor coordinates">
      {{ state.split("|")[0] }}
    </span>
    <span>{{ Math.round((editor.zoom / 3) * 100) }}%</span>
  </template>
  <span v-else role="status" class="status-message">{{ state }}</span>
</template>
