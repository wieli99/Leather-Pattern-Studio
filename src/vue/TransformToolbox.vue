<script setup lang="ts">
import StitchToolbox from "./StitchToolbox.vue";
import { computed, ref } from "vue";
import { cornerRadii } from "../model/geometry";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { transformShortcuts } from "./tools";
const e = useEditor();
const cornerShape = computed(() =>
  e.value.active.find((s) => s.id === e.value.selectedCorner?.shapeId),
);
const radii = computed(() =>
  cornerShape.value ? cornerRadii(cornerShape.value) : [],
);
const squareSelection = computed(() => e.value.active.some(s => s.kind === "size-square"));
const uniformRadius = computed(() =>
  radii.value.length && radii.value.every((r) => r === radii.value[0])
    ? +radii.value[0].toFixed(2)
    : "",
);
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
    v-if="(e.selected.length || e.trimMode) && !e.pending.length && !e.drawingDown"
    class="transform-overlay"
  >
    <StitchToolbox />
    <section v-if="e.trimMode" class="transform-options" :aria-label="e.mergeMode ? 'Merge settings' : 'Trim settings'"
      @keydown.enter.prevent="editor.applyTrim()" @keydown.esc.stop.prevent="editor.cancel()">
      <strong>{{ e.mergeMode ? "Merge" : "Trim" }}</strong>
      <small>{{ e.mergeMode ? "Apply to merge the selected objects." : "Click a highlighted outline portion to trim it." }}</small>
      <p v-if="e.transformError" role="alert">{{ e.transformError }}</p>
      <div class="actions tool-popup-footer">
        <button :disabled="!e.trimDraft || !!e.transformError || e.busy" @click="editor.applyTrim()">Apply</button>
        <button @click="editor.cancel()">Cancel</button>
      </div>
    </section>
    <div
      v-if="e.transformTool && !e.stitchMode"
      class="transform-options"
      @keydown.enter.prevent="!$event.isComposing && editor.applyTransform()"
      @keydown.esc.stop="editor.cancel()"
    >
      <strong>{{
        e.transformTool === "scale"
          ? "Resize"
          : e.transformTool === "mirror" ? "Mirror"
          : e.transformTool === "corner"
            ? "Corner radius"
            : e.transformTool === "move"
              ? "Move"
              : "Rotate"
      }}</strong>
      <small>{{ {
        move: "Drag the gizmo or enter X/Y distances to move the selection.",
        rotate: "Drag the rotation ring or enter an angle to rotate the selection.",
        scale: "Drag the gizmo or enter X/Y factors to resize the selection.",
        mirror: "Click an axis or straight outline edge on the canvas to mirror.",
        corner: "Drag a corner to adjust its radius; click a corner to enter an exact value."
      }[e.transformTool] }}</small>
      <div v-if="e.transformTool === 'corner'" class="transform-inputs">

        <template v-if="cornerShape">
          <label
            >Corner radius (mm)<input
              type="number"
              :aria-invalid="!!e.transformError"
              min="0"
              step="0.01"
              :value="+radii[e.selectedCorner!.index].toFixed(2)"
              @input="
                editor.setCornerValue(
                  +($event.target as HTMLInputElement).value,
                )
              "
          /></label>
          <label
            >All corners (mm)<input
              type="number"
              :aria-invalid="!!e.transformError"
              min="0"
              step="0.01"
              placeholder="Mixed"
              :value="uniformRadius"
              @input="
                editor.setCornerValue(
                  +($event.target as HTMLInputElement).value,
                  true,
                )
              "
          /></label>
        </template>
      </div>
      <div v-else-if="e.transformTool !== 'mirror'" class="transform-inputs" data-hint-edit="transform">
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
              :title="squareSelection && e.transformTool === 'scale' ? 'Square guides require uniform resizing; both factors change together.' : undefined"
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
      <label v-if="e.active.length === 1 && e.transformTool !== 'corner'"
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
      <div v-if="e.transformTool !== 'corner'" class="actions">
        <button
          :aria-pressed="e.placingPivot"
          @click="
            editor.placingPivot = true;
            editor.notify();
          "
        >
          Set pivot (V)</button
        ><button @click="editor.resetPivot()">Reset pivot</button>
      </div>
      <p v-if="e.transformError" role="alert">{{ e.transformError }}</p>
      <div class="actions tool-popup-footer">
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
        v-for="item in transformShortcuts"
        :key="item[0]"
        :disabled="e.selectionLocked || (item[0] === 'corner' && !e.canEditCorners)"
        :aria-label="item[1]"
        :title="`${item[1]} (${item[2]})`"
        :aria-pressed="e.transformTool === item[0]"
        :aria-keyshortcuts="item[2].toLowerCase()"
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
            v-else-if="item[0] === 'mirror'"
            d="M12 2v20M9 6 3 18h6ZM15 6l6 12h-6Z"
          />
          <path
            v-else-if="item[0] === 'corner'"
            d="M4 20V12a8 8 0 0 1 8-8h8M4 4h4M4 4v4"
          />
          <path
            v-else
            d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M4 4l6 6M20 20l-6-6M20 4l-6 6M4 20l6-6"
          />
        </svg>
      </button>
      <button
        aria-label="Merge"
        aria-keyshortcuts="j"
        :title="e.mergeResult ? 'Merge (J)' : 'Merge (J) requires connected straight outlines or endpoint-connected paths of the same family, without stitches'"
        :disabled="e.selectionLocked || !e.mergeResult || e.busy"
        :aria-pressed="e.mergeMode"
        @click="editor.activateMerge()"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
          <path d="M3 3h11v6h7v12H9v-7H3Z" />
        </svg>
      </button>
      <button :disabled="!e.canTrim" aria-label="Trim" title="Trim (K)" aria-keyshortcuts="k" :aria-pressed="e.trimMode && !e.mergeMode" @click="editor.activateTrim()">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M8.2 8.2 20 20M8.2 15.8 20 4" />
        </svg>
      </button>
      <button
        :disabled="!e.canStitch"
        aria-label="Stitch line"
        title="Stitch line (I)"
        aria-keyshortcuts="i"
        :aria-pressed="e.stitchMode"
        @click="editor.activateStitch()"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          aria-hidden="true"
        >
          <path d="M4 5h16M5 14l3-4m3 4 3-4m3 4 3-4M4 20h16" />
        </svg>
      </button>
    </div>
  </div>
</template>
