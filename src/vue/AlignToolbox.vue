<script setup lang="ts">
import ToolObjectPicker from "./ToolObjectPicker.vue";
import ToolPopover from "./ToolPopover.vue";
import AlignFields from "./AlignFields.vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { focusModelCanvas } from "./canvasFocus";
import type { AlignAction } from "../model/align";
const e = useEditor();
/**
 * Pointer choices return focus to the canvas so Enter applies, as the tool hint says.
 * Keyboard activation (detail 0) keeps focus on the button for further choices.
 */
function choose(action: AlignAction, event: MouseEvent) {
  editor.toggleAlign(action);
  if (event.detail > 0) focusModelCanvas();
}
</script>
<template>
  <ToolPopover
    class="align-options"
    heading="Align and distribute"
    aria-label="Align and distribute settings"
    :apply-disabled="!e.canApplyAlign"
    :apply="() => editor.applyAlign()"
    :cancel="() => editor.cancel()"
  >
    <ToolObjectPicker /><hr />
    <AlignFields
      :reference="e.alignReference"
      :gap="e.alignGap"
      :units="e.units"
      :unit-symbol="e.unitSymbol"
      :chosen="(action) => e.isAlignChosen(action)"
      :available="(action) => e.alignAvailable(action)"
      :gaps-fit="e.align?.gapsFit"
      :disabled="e.objectPicker"
      @toggle="choose"
      @reference="editor.setAlignReference($event)"
      @gap="editor.setAlignGap($event)"
    />
    <small v-if="(e.align?.x || e.align?.y) && !e.align?.draft && !e.objectPicker" role="status">Already arranged this way.</small>
  </ToolPopover>
</template>
