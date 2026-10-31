<script setup lang="ts">
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuPortal,
  ContextMenuContent,
  ContextMenuItem,
} from "reka-ui";
import { shapeArea } from "../model/area";
import { ref, nextTick } from "vue";
import type { Shape } from "../model/project";
import { editor } from "../editor/instance";
import { useEditorSelector } from "./useEditorSelector";
import ModeIcon from "./ModeIcon.vue";

const hasCopiedStyling = useEditorSelector(editor, () => !!editor.copiedStyling);
const props = defineProps<{ shape: Shape; selected: boolean }>();
const renaming = ref(false),
  draft = ref(props.shape.name),
  input = ref<HTMLInputElement | null>(null);
let settled = false;
async function rename() {
  if (editor.transformTool || editor.stitchMode) return;
  settled = false;
  draft.value = props.shape.name;
  renaming.value = true;
  await nextTick();
  input.value?.focus();
  input.value?.select();
}
function finish(cancel = false) {
  if (settled) return;
  settled = true;
  renaming.value = false;
  const name = draft.value.trim();
  if (!cancel && name && name !== props.shape.name)
    void editor.edit(props.shape.id, { name });
}
function select(event: MouseEvent) {
  if (editor.transformTool || editor.stitchMode) return;
  (event.currentTarget as HTMLButtonElement).focus();
  editor.cancel();
  editor.selected = event.shiftKey
    ? editor.selected.includes(props.shape.id)
      ? editor.selected.filter((id) => id !== props.shape.id)
      : [...editor.selected, props.shape.id]
    : [props.shape.id];
  editor.notify();
}
function openMenu() {
  if (!editor.canStyle) return;
  if (!editor.selected.includes(props.shape.id)) {
    editor.selected = [props.shape.id];
    editor.notify();
  }
}
</script>
<template>
  <div v-if="renaming" class="object-rename" data-hint-edit="rename">
    <ModeIcon :mode="shape.kind === 'line' ? 'polyline' : shape.kind" />
    <input
      ref="input"
      v-model="draft"
      aria-label="Rename object"
      maxlength="200"
      @blur="finish()"
      @keydown.stop
      @keydown.enter.prevent="finish()"
      @keydown.esc.prevent="finish(true)"
    />
  </div>
  <ContextMenuRoot v-else>
    <ContextMenuTrigger as-child @contextmenu="openMenu">
    <button
      :class="{ selected }"
      @click="select"
      title="Rename (F2 or double-click)"
      @dblclick="rename"
      @keydown.f2.prevent="rename"
    >
      <span>
        <ModeIcon :mode="shape.kind === 'line' ? 'polyline' : shape.kind" />
      </span>
      {{ shape.name }}
    </button>
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent class="object-context-menu" @keydown.esc.stop>
      <ContextMenuItem :disabled="!editor.canStyle" @select="editor.duplicate()">Duplicate</ContextMenuItem>
      <ContextMenuItem :disabled="!editor.canStyle || shapeArea(shape) === null" @select="editor.copyStyling(shape.id)">Copy Styling</ContextMenuItem>
      <ContextMenuItem v-if="hasCopiedStyling" :disabled="!editor.canStyle || !editor.active.some(s => shapeArea(s) !== null)" @select="editor.pasteStyling()">Paste Styling</ContextMenuItem>
      <ContextMenuItem :disabled="!editor.canStyle" @select="rename">Rename</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<style>
.object-context-menu {
  z-index: 100;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px;
  min-width: 160px;
}
.object-context-menu [role="menuitem"] {
  padding: 8px 12px;
  cursor: pointer;
  outline: none;
}
.object-context-menu [data-highlighted] {
  background: color-mix(in srgb, var(--accent) 18%, var(--panel));
}
.object-context-menu [data-disabled] {
  opacity: .45;
  cursor: default;
}
</style>
