<script setup lang="ts">
import { editor } from "../editor/instance";
import { stitchTools } from "../editor/stitchTools";
import { useEditor } from "./useEditor";
const e=useEditor();
</script>
<template>
  <div v-if="e.stitchMode" class="transform-toolbox stitch-toolbar" role="toolbar" aria-label="Stitching tools">
    <template v-for="item in stitchTools" :key="item.id">
      <span v-if="item.separator" class="tool-separator" role="separator" aria-orientation="vertical" />
      <span class="tool-slot" :title="`${item.label}: ${editor.stitchToolReason(item.id) || item.hint}`">
        <button type="button" :aria-label="item.id==='line' ? 'Place or edit stitching' : item.label" :aria-description="editor.stitchToolReason(item.id) || item.hint" :aria-pressed="e.stitchTool===item.id" :disabled="!!editor.stitchToolReason(item.id)" @click="editor.activateStitchTool(item.id)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" :stroke-width="item.strokeWidth ?? 1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="item.icon" /></svg>
        </button>
      </span>
    </template>
  </div>
</template>
<style scoped>
.stitch-toolbar {max-width:100%;box-sizing:border-box;overflow-x:auto;align-items:center;flex-shrink:0;}
.tool-slot {display:flex;flex-shrink:0;}
.tool-separator {width:1px;height:24px;background:var(--border);margin-inline:2px;flex-shrink:0;}
button {display:grid;place-items:center;}
</style>
