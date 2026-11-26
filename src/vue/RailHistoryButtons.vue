<script setup lang="ts">
/** Undo, Redo and Fit at the end of the Model and Print tool rails. */
import RailButton from "./RailButton.vue";
import FitIcon from "./FitIcon.vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
const props = defineProps<{
  busy?: boolean;
  fitDisabled?: boolean;
  fit: () => unknown;
  /** Runs before undo and redo, e.g. to cancel an open print tool. */
  beforeHistory?: () => unknown;
}>();
const e = useEditor();
function history(action: "undo" | "redo") {
  props.beforeHistory?.();
  void editor.transact(action);
}
</script>
<template>
  <RailButton
    title="Undo (Ctrl/⌘+Z)"
    aria-label="Undo"
    :disabled="!e.canUndo || busy"
    @click="history('undo')"
  >
    ↶
  </RailButton>
  <RailButton
    title="Redo (Ctrl/⌘+Shift+Z)"
    aria-label="Redo"
    :disabled="!e.canRedo || busy"
    @click="history('redo')"
  >
    ↷
  </RailButton>
  <RailButton
    title="Fit (Ctrl/⌘+Shift+F)"
    aria-label="Fit"
    :disabled="fitDisabled"
    @click="fit()"
  >
    <span class="tool-icon"><FitIcon /></span>
  </RailButton>
</template>
