<script setup lang="ts">
import { ref } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
const e = useEditor();
const focusedFactor = ref<string | null>(null);
const drafts = ref<Record<string, string>>({});
function value(key: "x" | "y" | "angle" | "sx" | "sy", event: Event) {
  const text = (event.target as HTMLInputElement).value;
  drafts.value[key] = text;
  const n = text.trim() ? Number(text) : NaN;
  editor.setTransformValues({ [key]: n });
}
</script>
<template>
  <div
    v-if="e.selected.length && !e.pending.length && !e.drawingDown"
    class="transform-overlay"
  >
    <div
      v-if="e.transformTool"
      class="transform-options"
      @keydown.enter.prevent="editor.applyTransform()"
      @keydown.esc.stop="editor.cancel()"
    >
      <strong>{{
        e.transformTool === "scale"
          ? "Resize"
          : e.transformTool === "move"
            ? "Move"
            : "Rotate"
      }}</strong>
      <div class="transform-inputs">
        <template
          v-for="item in e.transformTool === 'move'
            ? [
                ['x', 'X (mm)'],
                ['y', 'Y (mm)'],
              ]
            : e.transformTool === 'rotate'
              ? [['angle', 'Angle (°)']]
              : [
                  ['sx', 'X factor'],
                  ['sy', 'Y factor'],
                ]"
          :key="item[0]"
        >
          <label
            >{{ item[1]
            }}<input
              type="number"
              :aria-label="item[1]"
              :aria-invalid="!!e.transformError"
              :step="e.transformTool !== 'rotate' ? 0.01 : 0.1"
              :value="
                focusedFactor === item[0]
                  ? drafts[item[0]]
                  : e.transformTool !== 'rotate'
                    ? e.transformValues[
                        item[0] as keyof typeof e.transformValues
                      ].toFixed(2)
                    : e.transformValues[
                        item[0] as keyof typeof e.transformValues
                      ]
              "
              @focus="
                drafts[item[0]] = ($event.target as HTMLInputElement).value;
                focusedFactor = item[0];
              "
              @blur="
                focusedFactor = null;
                ($event.target as HTMLInputElement).value =
                  e.transformTool !== 'rotate'
                    ? e.transformValues[
                        item[0] as keyof typeof e.transformValues
                      ].toFixed(2)
                    : ($event.target as HTMLInputElement).value;
              "
              @input="value(item[0] as keyof typeof e.transformValues, $event)"
          /></label>
        </template>
      </div>
      <label v-if="e.active.length === 1"
        >Axes
        <select
          :value="e.transformOrientation"
          @change="
            editor.setOrientation(
              ($event.target as HTMLSelectElement).value as 'world' | 'local',
            )
          "
        >
          <option value="world">World</option>
          <option value="local">Local</option>
        </select></label
      >
      <div class="actions">
        <button
          :aria-pressed="e.placingPivot"
          @click="
            editor.placingPivot = true;
            editor.notify();
          "
        >
          Set pivot (V)</button
        ><button @click="editor.resetPivot()">Reset center</button>
      </div>
      <small v-if="e.placingPivot">Click to place the pivot</small>
      <p v-if="e.transformError" role="alert">{{ e.transformError }}</p>
      <div class="actions">
        <button
          :disabled="!e.transformValid || e.busy"
          @click="editor.applyTransform()"
        >
          Apply</button
        ><button @click="editor.cancel()">Cancel</button>
      </div>
    </div>
    <div
      class="transform-toolbox"
      role="toolbar"
      aria-label="Transform selection"
    >
      <button
        v-for="item in [
          ['rotate', 'Rotate', 'R'],
          ['move', 'Move', 'G'],
          ['scale', 'Resize', 'S'],
        ] as const"
        :key="item[0]"
        :aria-label="item[1]"
        :title="`${item[1]} (${item[2]})`"
        :aria-pressed="e.transformTool === item[0]"
        @click="editor.activateTransform(item[0])"
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          aria-hidden="true"
        >
          <path
            v-if="item[0] === 'rotate'"
            d="M20 10a8 8 0 1 0-2 8M20 4v6h-6"
          />
          <path
            v-else-if="item[0] === 'move'"
            d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"
          />
          <path
            v-else
            d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M4 4l6 6M20 20l-6-6M20 4l-6 6M4 20l6-6"
          />
        </svg>
      </button>
    </div>
  </div>
</template>
