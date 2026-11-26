<script setup lang="ts">
/**
 * Touch controls for paths and curves being drawn. A mouse finishes with right-click or a double
 * click and keyboards use Enter and Backspace; fingers have neither, so touch screens show these.
 */
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
const e = useEditor();
</script>
<template>
  <div v-if="e.pathInProgress" class="transform-toolbox path-drawing-actions" role="toolbar" aria-label="Path drawing">
    <button type="button" @click="editor.removeLastPendingPoint()">Remove last point</button>
    <button type="button" :disabled="e.pending.length < 3" @click="editor.closePolyline()">Close</button>
    <button type="button" class="primary" :disabled="e.pending.length < 2" @click="editor.finish()">Finish</button>
  </div>
</template>
