<script setup lang="ts">
import ToolSearch from "./ToolSearch.vue";
import SelectionHint from "./SelectionHint.vue";
import PivotSelector from "./PivotSelector.vue";
import ToolObjectPicker from "./ToolObjectPicker.vue";
import LengthInput from "./LengthInput.vue";
import StitchToolbox from "./StitchToolbox.vue";
import StitchToolbar from "./StitchToolbar.vue";
import { computed } from "vue";
import { cornerRadii } from "../model/geometry";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { focusModelCanvas } from "./canvasFocus";
const e = useEditor();
async function applyPathCopy() {
  await editor.applyPathCopy();
  if (!editor.pathCopy) focusModelCanvas();
}
function cancelPathCopy() { editor.cancel(); focusModelCanvas(); }
async function applyOutline() {
  await editor.applyTrim();
  if (!editor.trimMode) focusModelCanvas();
}
function cancelOutline() {
  editor.cancel();
  focusModelCanvas();
}
const cornerShape = computed(() =>
  e.value.active.find((s) => s.id === e.value.selectedCorner?.shapeId),
);
const radii = computed(() =>
  cornerShape.value ? cornerRadii(cornerShape.value) : [],
);
const squareSelection = computed(() => e.value.active.some(s => s.kind === "size-square"));
</script>
<template>
  <div
    v-if="!e.printLayoutActive"
    class="transform-overlay"
  >
    <section v-if="e.pathCopy" class="transform-options path-copy-options" aria-label="Copy along path settings" @keydown.esc.stop.prevent="cancelPathCopy()">
      <strong>Copy along path</strong>
      <button v-for="role in (['source', 'path'] as const)" :key="role" class="boolean-picker" :aria-pressed="e.pathCopy.picker === role" @click="e.pathCopy.picker = e.pathCopy.picker === role ? null : role; editor.refreshPathCopy()">
        <span class="boolean-picker-label">{{ role === 'source' ? 'Select Source' : 'Select Path' }}</span><span class="boolean-object-name">{{ e.pathCopy![role] ? '(1)' : 'Choose object' }}</span>
      </button>
      <hr>
      <label>Distribution<select v-model="e.pathCopy.mode" @change="editor.refreshPathCopy()"><option value="spacing">Spacing</option><option value="count">Count</option></select></label>
      <div class="transform-inputs" data-hint-edit="transform">
      <label v-if="e.pathCopy.mode === 'spacing'">Spacing ({{ e.unitSymbol }})<LengthInput :min="0.01" :value="e.pathCopy.spacing" @invalid="e.pathCopy.spacing = NaN; editor.refreshPathCopy()" @commit="e.pathCopy.spacing = $event; editor.refreshPathCopy()" /></label>
      <label v-else>New copies<LengthInput scalar integer :min="1" :max="1000" :step="1" :value="e.pathCopy.count" @invalid="e.pathCopy.count = NaN; editor.refreshPathCopy()" @commit="e.pathCopy.count = $event; editor.refreshPathCopy()" /></label>
      </div>
      <label class="stitch-toggle">Rotate with path<input v-model="e.pathCopy.rotate" type="checkbox" @change="editor.refreshPathCopy()" /></label>
      <small v-if="e.preview && !e.pathCopy.picker">{{ e.preview.shapes.filter(s => !e.document.shapes.some(o => o.id === s.id) && !s.stitchParentId).length }} new objects</small>
      <p v-if="e.pathCopy.error" role="alert">{{ e.pathCopy.error }}</p>
      <div class="actions tool-popup-footer"><button :disabled="!e.preview || !!e.pathCopy.error || e.busy" @click="applyPathCopy()">Apply</button><button @click="cancelPathCopy()">Cancel</button></div>
    </section>
    <StitchToolbox />
    <StitchToolbar />
    <section v-if="e.trimMode" class="transform-options" :aria-label="e.booleanOperation ? e.booleanLabel + ' settings' : e.mergeMode ? 'Join settings' : 'Trim settings'"
      @keydown.esc.stop.prevent="cancelOutline()">
      <strong>{{ e.booleanOperation ? e.booleanLabel : e.mergeMode ? "Join" : "Trim" }}</strong>
      <template v-if="!e.booleanOperation"><ToolObjectPicker /></template>
      <template v-if="e.booleanOperation">
        <button type="button" class="boolean-picker" :aria-pressed="e.booleanPicker === 'target'"
          :title="e.booleanPicker === 'target' ? 'Stop choosing a target' : 'Choose a target object'"
          @click="editor.setBooleanPicker('target')">
          <span class="boolean-picker-label">Select Target</span>
          <span>{{ e.booleanTarget ? '(1)' : 'Choose object' }}</span>
        </button>
        <button type="button" class="boolean-picker" :aria-pressed="e.booleanPicker === 'cutters'"
          :title="e.booleanPicker === 'cutters' ? 'Stop choosing other objects' : 'Choose other objects'"
          @click="editor.setBooleanPicker('cutters')">
          <span>{{ e.booleanOperation === 'subtract' ? 'Select subtract objects' : 'Select other objects' }}</span>
          <span>({{ e.booleanCutters.length }})</span>
        </button>
        <SelectionHint :active="e.booleanPicker === 'cutters'" />
        <p v-if="e.booleanError" role="alert">{{ e.booleanError }}</p>
        <p v-if="e.booleanEmpty" role="status">Result is empty. Apply removes the input objects.</p>
      </template>
      <small v-else>{{ e.mergeMode ? "Apply to join the selected objects." : "Click a highlighted outline portion to trim it." }}</small>
      <p v-if="e.transformError" role="alert">{{ e.transformError }}</p>
      <div class="actions tool-popup-footer">
        <button :disabled="e.objectPicker || (!e.booleanOperation && !!e.toolSelectionError) || !e.trimDraft || !!e.transformError || !!e.booleanError || e.busy" @click="applyOutline()">Apply</button>
        <button @click="cancelOutline()">Cancel</button>
      </div>
    </section>
    <section v-if="e.offsetActive" class="transform-options" aria-label="Offset settings"
      @keydown.enter.prevent="!$event.isComposing && editor.applyOffset()" @keydown.esc.stop.prevent="editor.cancel()">
      <strong>Offset</strong>
      <ToolObjectPicker /><hr>
      <small>Positive expands closed outlines; negative insets. On open paths, positive goes left from start to end.</small>
      <div class="transform-inputs" data-hint-edit="transform">
        <label>Distance ({{ e.unitSymbol }})<LengthInput fixed non-zero aria-label="Offset distance" :value="e.offsetDistance"
          @invalid="editor.setOffsetDistance(NaN)" @commit="editor.setOffsetDistance($event)" /></label>
      </div>
      <label>Corner style
        <select :value="e.offsetJoin" @change="editor.setOffsetJoin(($event.target as HTMLSelectElement).value as 'sharp' | 'rounded')">
          <option value="sharp">Sharp</option><option value="rounded">Rounded</option>
        </select>
      </label>
      <p v-if="e.offsetError" role="alert">{{ e.offsetError }}</p>
      <div class="actions tool-popup-footer">
        <button :disabled="e.objectPicker || !!e.toolSelectionError || !e.offsetDraft || !!e.offsetError || e.busy" @click="editor.applyOffset()">Apply</button>
        <button @click="editor.cancel()">Cancel</button>
      </div>
    </section>
    <div
      v-if="e.transformTool && !e.stitchMode"
      class="transform-options"
      @keydown.enter.prevent="!$event.isComposing && editor.applyTransform()"
      @keydown.esc.stop="editor.cancelPivotPlacement() || editor.cancel()"
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
      <ToolObjectPicker /><hr>
      <small>{{ {
        move: "Drag the gizmo or enter X/Y distances to move the selection.",
        rotate: "Drag the rotation ring or enter an angle to rotate the selection.",
        scale: "Drag the gizmo or enter X/Y factors to resize the selection.",
        mirror: "Click an axis or straight outline edge on the canvas to mirror.",
        corner: "Drag a corner to adjust its radius; click a corner to enter an exact value."
      }[e.transformTool] }}</small>
      <div v-if="e.transformTool === 'corner'" class="transform-inputs">

        <template v-if="cornerShape">
          <label>Corner radius ({{ e.unitSymbol }})<LengthInput clamp :value="radii[e.selectedCorner!.index]" :min="0" @invalid="editor.setCornerValue(NaN)" @commit="editor.setCornerValue($event)" /></label>
          <label>All corners ({{ e.unitSymbol }})<LengthInput clamp placeholder="Mixed" :mixed="!radii.every(r => r === radii[0])" :value="radii[0] ?? 0" :min="0" @invalid="editor.setCornerValue(NaN, true)" @commit="editor.setCornerValue($event, true)" /></label>
        </template>
      </div>
      <div v-else-if="e.transformTool !== 'mirror'" class="transform-inputs" data-hint-edit="transform">
        <template
          v-for="item in e.transformTool === 'move'
            ? [
                ['x', `X (${e.unitSymbol})`],
                ['y', `Y (${e.unitSymbol})`],
              ]
            : e.transformTool === 'rotate'
              ? [['angle', 'Angle (°)']]
              : [
                  ['sx', 'X factor'],
                  ['sy', 'Y factor'],
                ]"
          :key="item[0]"
        >
          <label>{{ item[1] }}
            <LengthInput fixed v-if="e.transformTool === 'move'" :aria-label="item[1]" :value="e.transformValues[item[0] as 'x' | 'y']" @invalid="editor.setTransformValues({ [item[0]]: NaN })" @commit="editor.setTransformValues({ [item[0]]: $event })" />
            <LengthInput v-else scalar :precision="e.transformTool === 'scale' ? 2 : undefined" :aria-label="item[1]" :value="e.transformValues[item[0] as 'angle' | 'sx' | 'sy']" @invalid="editor.setTransformValues({ [item[0]]: NaN })" @commit="editor.setTransformValues({ [item[0]]: $event })" />
          </label>
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
      <PivotSelector v-if="e.transformTool !== 'corner'" :disabled="e.objectPicker" :mode="e.pivotMode" :placing="e.placingPivot" @change="editor.setPivotMode($event)" @cancel="editor.cancelPivotPlacement()" />
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
    <ToolSearch v-if="!e.stitchMode" />
  </div>
</template>
