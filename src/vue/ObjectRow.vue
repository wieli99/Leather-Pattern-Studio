<script setup lang="ts">
import { ref, nextTick } from "vue";
import type { Shape } from "../model/project";
import { editor } from "../editor/instance";
import ModeIcon from "./ModeIcon.vue";
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
  editor.cancel();
  editor.selected = event.shiftKey
    ? editor.selected.includes(props.shape.id)
      ? editor.selected.filter((id) => id !== props.shape.id)
      : [...editor.selected, props.shape.id]
    : [props.shape.id];
  editor.notify();
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
  <button
    v-else
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
</template>
