<script setup lang="ts">
import { computed } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { toolCatalog } from "./toolCatalog";
import ToolIcon from "./ToolIcon.vue";
import type { SegmentTransformTool } from "../editor/controller";
const props = defineProps<{ id: string; label?: string; shortcut?: string }>();
const emit = defineEmits<{ activated: [] }>();
const e = useEditor();
type Transform = "move" | "rotate" | "scale" | "mirror" | "corner";
type Operation = "subtract" | "intersect" | "exclude";
const operationTitles: Record<Operation, string> = {
  subtract: "Subtract: remove other objects from the target",
  intersect: "Intersect: keep the area shared by all objects",
  exclude: "Exclude (XOR): keep areas covered an odd number of times",
};
/** How each catalog tool is enabled, shown as pressed and started. */
const behavior = computed((): { disabled: boolean; pressed: boolean; activate: () => unknown; title?: string } | null => {
  const ed = e.value, id = props.id;
  switch (id) {
    case "rectangular-array": case "radial-array": {
      const kind = id === "rectangular-array" ? "rectangular" : "radial";
      return { disabled: !ed.canStartTransform("move"), pressed: ed.array?.kind === kind, activate: () => editor.activateArray(kind) };
    }
    case "move": case "rotate": case "scale": case "mirror": case "corner": {
      const tool: Transform = id;
      return ed.segmentMode
        ? { disabled: tool === "corner" || !(ed.canEditSegments || ed.segmentMoveActive), pressed: ed.transformTool === tool, activate: () => editor.transformSegments(tool as SegmentTransformTool) }
        : { disabled: !ed.canStartTransform(tool), pressed: ed.transformTool === tool, activate: () => editor.activateTransform(tool) };
    }
    case "path-copy": return { disabled: !ed.canCopyAlongPath, pressed: !!ed.pathCopy, activate: () => editor.activatePathCopy() };
    case "offset": return { disabled: !ed.canOffset, pressed: ed.offsetActive, activate: () => editor.activateOffset() };
    case "align": return { disabled: !ed.canAlign, pressed: ed.alignActive, activate: () => editor.activateAlign() };
    case "trim": return { disabled: !ed.canTrim, pressed: ed.trimMode && !ed.mergeMode, activate: () => editor.activateTrim() };
    case "join": return {
      disabled: !ed.canJoin || ed.busy,
      pressed: ed.mergeMode && (!ed.booleanOperation || ed.booleanOperation === "union"),
      activate: () => editor.activateMerge(),
      title: ed.canJoin
        ? "Join (J): combine closed outlines or join compatible open paths"
        : "Join (J) requires an unlocked closed outline or joinable path without stitches",
    };
    case "subtract": case "intersect": case "exclude": {
      const operation: Operation = id;
      return {
        disabled: !ed.canBoolean || ed.busy,
        pressed: ed.booleanOperation === operation,
        activate: () => editor.activateBoolean(operation),
        title: ed.canBoolean ? operationTitles[operation] : "Requires closed, unlocked outlines without active stitching",
      };
    }
  }
  return null;
});
const entry = computed(() => toolCatalog.find((tool) => tool[0] === props.id));
function activate() {
  emit("activated");
  behavior.value?.activate();
}
</script>
<template>
  <button
    v-if="behavior && entry"
    :disabled="behavior.disabled"
    :aria-label="entry[1]"
    :title="behavior.title ?? (entry[2] ? `${entry[1]} (${entry[2]})` : entry[1])"
    :aria-pressed="behavior.pressed"
    :aria-keyshortcuts="entry[2] ? entry[2].toLowerCase() : undefined"
    @click="activate"
  >
    <ToolIcon :id="id" />
    <template v-if="label"><span>{{ label }}</span><kbd v-if="shortcut">{{ shortcut }}</kbd></template>
  </button>
</template>
