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

const props = defineProps<{ shape: Shape; selected: boolean }>();
const inheritedState = useEditorSelector(
  editor,
  () =>
    `${editor.isHidden(props.shape.id)}|${editor.isLocked(props.shape.id)}|${editor.revision}|${editor.booleanOperation}|${editor.booleanCutters.join(",")}`,
);
const booleanRole = useEditorSelector(editor, () => editor.pathCopy ? editor.pathCopy.source === props.shape.id ? "target" : "other" : editor.booleanOperation ? editor.booleanTarget === props.shape.id ? "target" : "other" : null);
const booleanOperand = useEditorSelector(editor, () => editor.pathCopy ? editor.pathCopy.path === props.shape.id : !!editor.booleanOperation && editor.booleanCutters.includes(props.shape.id));
const canToggleObjectState = useEditorSelector(
  editor,
  () => editor.canToggleObjectState,
);
const hasCopiedStyling = useEditorSelector(
  editor,
  () => !!editor.copiedStyling,
);

const renaming = ref(false),
  draft = ref(props.shape.name),
  input = ref<HTMLInputElement | null>(null);
let settled = false;
async function rename() {
  if (
    editor.transformTool || editor.offsetActive || editor.trimMode ||
    editor.booleanOperation ||
    editor.pathCopy ||
    editor.stitchMode ||
    editor.isLocked(props.shape.id)
  )
    return;
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
  if (editor.objectPicker) { editor.pickToolObject(props.shape.id, event.shiftKey); return; }
  if (editor.pathCopy) { editor.pickPathCopy(props.shape.id); return; }
  if (editor.booleanOperation) { editor.pickBoolean(props.shape.id); return; }
  if (editor.transformTool || editor.offsetActive || editor.trimMode || editor.stitchMode) return;
  editor.selectedGroups = [];
  editor.panelRevision++;
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
    editor.selectedGroups = [];
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
  <div
    v-else
    class="object-row"
    :class="{ hidden: editor.isHidden(shape.id) }"
    :data-state-revision="inheritedState"
  >
    <ContextMenuRoot>
      <ContextMenuTrigger as-child @contextmenu="openMenu">
        <button
          class="object-select"
          :aria-pressed="booleanRole ? booleanRole === 'target' || booleanOperand : selected"
          :class="{ selected: booleanRole ? booleanRole === 'target' : selected, 'boolean-operand': booleanOperand }"
          @click="select"
          :title="booleanRole ? 'Use the active picker to choose this object' : 'Rename (F2 or double-click)'"
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
          <ContextMenuItem
            :disabled="!editor.canStyle"
            @select="editor.newGroup(true)"
            >Group Selection</ContextMenuItem
          >
          <ContextMenuItem
            :disabled="!editor.canStyle"
            @select="editor.duplicate()"
            >Duplicate</ContextMenuItem
          >
          <ContextMenuItem
            :disabled="!editor.canStyle || shapeArea(shape) === null"
            @select="editor.copyStyling(shape.id)"
            >Copy Styling</ContextMenuItem
          >
          <ContextMenuItem
            v-if="hasCopiedStyling"
            :disabled="
              !editor.canStyle ||
              editor.selectionLocked ||
              !editor.active.some((s) => shapeArea(s) !== null)
            "
            @select="editor.pasteStyling()"
            >Paste Styling</ContextMenuItem
          >
          <ContextMenuItem
            :disabled="!editor.canStyle || editor.isLocked(shape.id)"
            @select="rename"
            >Rename</ContextMenuItem
          >
        </ContextMenuContent>
      </ContextMenuPortal>
    </ContextMenuRoot>
    <button
      class="object-state"
      :disabled="!canToggleObjectState"
      :aria-label="`${shape.hidden ? 'Show' : 'Hide'} ${shape.name}`"
      :aria-pressed="!!shape.hidden"
      :title="
        editor.isHidden(shape.id) && !shape.hidden
          ? `Hidden by ${editor.inheritedStateSource(shape.id, 'hidden')}; toggles local visibility`
          : shape.hidden
            ? 'Show object'
            : 'Hide object'
      "
      @click="editor.toggleObjectState(shape.id, 'hidden')"
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M2 12 Q12 0 22 12 Q12 24 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        <path v-if="shape.hidden" d="M3 3L21 21" />
      </svg>
    </button>
    <button
      class="object-state"
      :disabled="!canToggleObjectState"
      :aria-label="`${shape.locked ? 'Unlock' : 'Lock'} ${shape.name}`"
      :aria-pressed="!!shape.locked"
      :title="
        editor.isLocked(shape.id) && !shape.locked
          ? `Locked by ${editor.inheritedStateSource(shape.id, 'locked')}; toggles local lock`
          : shape.locked
            ? 'Unlock object'
            : 'Lock object'
      "
      @click="editor.toggleObjectState(shape.id, 'locked')"
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="5" y="10" width="14" height="11" rx="2" :fill="shape.locked ? 'currentColor' : 'none'" />
        <path
          :d="shape.locked ? 'M8 10V6a4 4 0 018 0v4' : 'M8 10V6a4 4 0 018 0'"
        />
      </svg>
    </button>
  </div>
</template>

<style>
.objects .object-select {
  touch-action: none;
  user-select: none;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.object-row {
  display: flex;
  align-items: center;
}
.object-row.hidden {
  opacity: 0.55;
}
.objects .object-state {
  width: 30px;
  flex: 0 0 30px;
  padding: 6px;
}

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
  opacity: 0.45;
  cursor: default;
}
</style>
