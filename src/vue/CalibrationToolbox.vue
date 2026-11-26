<script setup lang="ts">
import ToolField from "./ToolField.vue";
import ToolPopover from "./ToolPopover.vue";
import LengthInput from "./LengthInput.vue";
import { computed, watch } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { focusModelCanvas } from "./canvasFocus";
const e = useEditor();
// Read the session through `e` each time: it is mutated in place, so a computed holding it would stay stale.
const run = computed(() => e.value.calibration && { ...e.value.calibration });
const measured = computed(() => e.value.calibrationMeasured);
const stageText = computed(() => {
  switch (run.value?.stage) {
    case "point1": return run.value?.confirmed ? "Click point 1 on the image. Shift keeps 45° steps." : "Click point 1 on the image.";
    case "point2": return "Click point 2 on the image. Shift keeps 45° steps.";
    default: return run.value?.distance === null
      ? "Enter the real distance between the points."
      : "Review the scale. Enter or right click applies.";
  }
});
function pick(stage: "point1" | "point2") {
  editor.pickCalibrationPoint(stage);
  focusModelCanvas();
}
// After both points are first picked, the distance is the only thing left to enter.
// The canvas takes focus on the mousedown that confirms the point, so focus the field afterwards.
watch(() => run.value?.stage, (stage, previous) => {
  if (stage !== "review" || previous !== "point2" || run.value?.distance !== null) return;
  setTimeout(() => document.querySelector<HTMLInputElement>(".calibration-options input[aria-label='Known distance']")?.focus());
});
</script>
<template>
  <ToolPopover
    v-if="run"
    class="calibration-options"
    heading="Calibrate image"
    aria-label="Calibrate image settings"
    :apply-disabled="!e.canApplyCalibration"
    :apply="() => editor.applyCalibration()"
    :cancel="() => editor.cancel()"
    :back="() => editor.cancelCalibrationPoint()"
  >
    <small>{{ stageText }}</small>
    <button type="button" :disabled="run.stage !== 'review'" @click="pick('point1')">Pick point 1</button>
    <button type="button" :disabled="run.stage !== 'review'" @click="pick('point2')">Pick point 2</button>
    <ToolField :label="`Measured (${e.unitSymbol})`">
      <output aria-label="Measured distance">{{ measured === null ? "–" : e.formatLength(measured) }}</output>
    </ToolField>
    <ToolField :label="`Known distance (${e.unitSymbol})`" data-hint-edit="transform">
      <LengthInput aria-label="Known distance" :disabled="!run.p1 || !run.p2" :min="0.001" :step="0.1" :value="run.distance ?? 0" :mixed="run.distance === null" placeholder="Enter distance"
        @invalid="editor.setCalibrationDistance(NaN)" @commit="editor.setCalibrationDistance($event)" />
    </ToolField>
    <ToolField label="Scale">
      <output aria-label="Scale factor">{{ e.calibrationFactor === null ? "–" : `${+(e.calibrationFactor * 100).toFixed(2)} %` }}</output>
    </ToolField>
    <p v-if="run.error" role="alert">{{ run.error }}</p>
  </ToolPopover>
</template>
