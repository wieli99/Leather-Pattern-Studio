<script setup lang="ts">
import ToolSearch from "./ToolSearch.vue";
import SelectionHint from "./SelectionHint.vue";
import PivotSelector from "./PivotSelector.vue";
import ToolObjectPicker from "./ToolObjectPicker.vue";
import LengthInput from "./LengthInput.vue";
import StitchToolbox from "./StitchToolbox.vue";
import StitchToolbar from "./StitchToolbar.vue";
import AlignToolbox from "./AlignToolbox.vue";
import ToolPopover from "./ToolPopover.vue";
import { computed } from "vue";
import { polygonFillets } from "../model/geometry";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { focusModelCanvas } from "./canvasFocus";
const e = useEditor();
const cancel = () => editor.cancel();
const cornerShape = computed(() =>
  e.value.active.find((s) => s.id === e.value.selectedCorner?.shapeId),
);
const radii = computed(() =>
  cornerShape.value ? polygonFillets(cornerShape.value).corners.map(c => c.chamfer || c.radius) : [],
);
const selectedChamfer = computed(() => e.value.cornerStyleOverride ??
  ((cornerShape.value?.cornerChamfers?.[e.value.selectedCorner?.index ?? 0] ?? 0) > 0));
const bulkCorners = computed(() => e.value.active.flatMap(s => polygonFillets(s).corners));
const bulkValues = computed(() => bulkCorners.value.map(c => c.chamfer || c.radius));
const bulkMixed = computed(() => e.value.bulkCornerStyle === null || !bulkValues.value.every(v => Math.abs(v - bulkValues.value[0]) < 1e-9));
const transformHeading = { scale: "Resize", mirror: "Mirror", corner: "Corners", move: "Move", rotate: "Rotate" } as const;
const squareSelection = computed(() => e.value.active.some(s => s.kind === "size-square"));
</script>
<template>
  <div
    v-if="!e.printLayoutActive"
    class="transform-overlay"
  >
    <ToolPopover
      v-if="e.array"
      class="array-options"
      :heading="e.array.kind === 'rectangular' ? 'Rectangular Array' : 'Radial Array'"
      :apply-disabled="!e.canApplyArray"
      :aria-label="
        e.array.kind === 'rectangular'
          ? 'Rectangular Array settings'
          : 'Radial Array settings'
      "
      :apply="() => editor.applyArray()"
      :cancel="cancel"
      :back="() => editor.cancelArrayPoint()"
    >
      <ToolObjectPicker />
      <hr />
      <small>{{
        e.arrayStage === "review"
          ? "Review the array. Enter or right click applies."
          : e.arrayStage === "center"
            ? "Select center point."
            : "Select " +
              (e.arrayStage === "endpoint1" ? "endpoint 1" : "endpoint 2") +
              ". X/Y constrains direction."
      }}</small>
      <template v-if="e.array.kind === 'rectangular'">
        <button
          :disabled="e.objectPicker || e.arrayStage !== 'review'"
          @click="
            editor.pickArrayPoint('endpoint1');
            focusModelCanvas();
          "
        >
          Select endpoint 1
        </button>
        <button
          :disabled="e.objectPicker || e.arrayStage !== 'review'"
          @click="
            editor.pickArrayPoint('endpoint2');
            focusModelCanvas();
          "
        >
          Select endpoint 2
        </button>
        <label
          >Mode<select
            aria-label="Mode"
            :value="e.array.extent ? 'extent' : 'spacing'"
            @change="editor.setArrayExtent(($event.target as HTMLSelectElement).value === 'extent')"
          >
            <option value="extent">Extent</option>
            <option value="spacing">Spacing</option>
          </select></label
        >
        <div class="transform-inputs" data-hint-edit="array">
          <label
            v-for="(field,i) in (['vector1','vector2'] as const)"
            :key="field"
            >Distance {{ i + 1 }} ({{ e.unitSymbol }})
            <LengthInput
              :step="1"
              :min="0.01"
              :value="Math.hypot(e.array[field]?.x ?? 0, e.array[field]?.y ?? 0)"
              @invalid="editor.setArrayDistance(field, NaN)"
              @commit="editor.setArrayDistance(field, $event)"
            />
          </label>
        </div>
        <div class="transform-inputs" data-hint-edit="array">
          <label v-for="field in (['columns','rows'] as const)" :key="field"
            >{{ field === "columns" ? "Number" : "Repeat" }}
            <LengthInput
              scalar
              integer
              :min="field === 'columns' ? 2 : 1"
              :max="
                Math.floor(
                  1001 / (field === 'columns' ? e.array.rows : e.array.columns),
                )
              "
              :step="1"
              :value="e.array[field]"
              @invalid="editor.setArrayValue(field, NaN)"
              @commit="editor.setArrayValue(field, $event)"
            />
          </label>
        </div>
      </template>
      <template v-else>
        <button
          :disabled="e.objectPicker || e.arrayStage !== 'review'"
          @click="
            editor.pickArrayPoint('center');
            focusModelCanvas();
          "
        >
          Select center point
        </button>
        <label
          >Mode<select
            aria-label="Mode"
            :value="e.array.step ? 'spacing' : 'total'"
            @change="editor.setArrayDistribution(($event.target as HTMLSelectElement).value === 'spacing')"
          >
            <option value="total">Total</option>
            <option value="spacing">Spacing</option>
          </select></label
        >
        <div class="transform-inputs" data-hint-edit="array">
          <label
            >Degrees<LengthInput
              scalar
              :step="1"
              :value="e.array.angle"
              @invalid="editor.setArrayValue('angle', NaN)"
              @commit="editor.setArrayValue('angle', $event)"
          /></label>
          <label
            >Number<LengthInput
              scalar
              integer
              :min="2"
              :max="1001"
              :step="1"
              :value="e.array.count"
              @invalid="editor.setArrayValue('count', NaN)"
              @commit="editor.setArrayValue('count', $event)"
          /></label>
        </div>
        <label class="stitch-toggle"
          >Rotate copies<input
            type="checkbox"
            v-model="e.array.rotate"
            @change="editor.refreshArray()"
        /></label>
      </template>
      <small>Shift+wheel changes count. Counts include the original.</small>
      <p v-if="e.array.error" role="alert">{{ e.array.error }}</p>
    </ToolPopover>
    <ToolPopover v-if="e.pathCopy" class="path-copy-options" heading="Copy along path" aria-label="Copy along path settings"
      :apply-disabled="!e.canApplyPathCopy" :apply="() => editor.applyPathCopy()" :cancel="cancel">
      <button v-for="role in (['source', 'path'] as const)" :key="role" class="boolean-picker" :aria-pressed="e.pathCopy.picker === role" @click="e.pathCopy.picker = e.pathCopy.picker === role ? null : role; editor.refreshPathCopy()">
        <span class="boolean-picker-label">{{ role === 'source' ? 'Select Source' : 'Select Path' }}</span><span class="boolean-object-name">{{ e.pathCopy![role] ? '(1)' : 'Choose object' }}</span>
      </button>
      <hr>
      <label>Distribution<select v-model="e.pathCopy.mode" @change="editor.refreshPathCopy()"><option value="spacing">Spacing</option><option value="count">Count</option></select></label>
      <div class="transform-inputs" data-hint-edit="path-copy">
      <label v-if="e.pathCopy.mode === 'spacing'">Spacing ({{ e.unitSymbol }})<LengthInput :min="0.01" :value="e.pathCopy.spacing" @invalid="e.pathCopy.spacing = NaN; editor.refreshPathCopy()" @commit="e.pathCopy.spacing = $event; editor.refreshPathCopy()" /></label>
      <label v-else>New copies<LengthInput scalar integer :min="1" :max="1000" :step="1" :value="e.pathCopy.count" @invalid="e.pathCopy.count = NaN; editor.refreshPathCopy()" @commit="e.pathCopy.count = $event; editor.refreshPathCopy()" /></label>
      </div>
      <label class="stitch-toggle">Rotate with path<input v-model="e.pathCopy.rotate" type="checkbox" @change="editor.refreshPathCopy()" /></label>
      <small v-if="e.preview && !e.pathCopy.picker">{{ e.preview.shapes.filter(s => !e.document.shapes.some(o => o.id === s.id) && !s.stitchParentId).length }} new objects</small>
      <p v-if="e.pathCopy.error" role="alert">{{ e.pathCopy.error }}</p>
    </ToolPopover>
    <StitchToolbox />
    <StitchToolbar />
    <section v-if="e.segmentMode && !e.transformTool && e.segmentSelection.length" class="transform-options segment-options" aria-label="Segment selection">
      <strong>{{ e.segmentSelection.length === 1 ? "1 segment" : `${e.segmentSelection.length} segments` }}</strong>
      <small>Press G to move, E to rotate, S to resize or M to mirror. Transforming or separating detaches segments from their shapes.</small>
      <div class="actions tool-popup-footer">
        <button :disabled="e.busy" title="Separate (Ctrl+Shift+D)" @click="editor.separateSegments()">Separate</button>
        <button :disabled="e.busy" title="Duplicate (Ctrl+D)" @click="editor.duplicateSegments()">Duplicate</button>
        <button :disabled="e.busy" title="Delete (Delete)" @click="editor.deleteSegments()">Delete</button>
      </div>
    </section>
    <ToolPopover v-if="e.trimMode" :aria-label="e.booleanOperation ? e.booleanLabel + ' settings' : e.mergeMode ? 'Join settings' : 'Trim settings'"
      :heading="e.booleanOperation ? e.booleanLabel : e.mergeMode ? 'Join' : 'Trim'"
      :apply-disabled="!e.canApplyTrim" :apply="() => editor.applyTrim()" :cancel="cancel">
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
    </ToolPopover>
    <AlignToolbox v-if="e.alignActive" />
    <ToolPopover v-if="e.offsetActive" heading="Offset" aria-label="Offset settings"
      :apply-disabled="!e.canApplyOffset" :apply="() => editor.applyOffset()" :cancel="cancel">
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
    </ToolPopover>
    <ToolPopover
      v-if="e.transformTool && !e.stitchMode"
      tag="div"
      :heading="transformHeading[e.transformTool]"
      :apply-disabled="!e.canApplyTransform"
      :apply="() => editor.applyTransform()"
      :cancel="cancel"
      :back="() => editor.cancelPivotPlacement()"
    >
      <template v-if="e.segmentMoveActive"><small>Transforming detached segments.</small><hr></template>
      <template v-else><ToolObjectPicker /><hr></template>
      <small>{{ {
        move: "Drag the gizmo or enter X/Y distances to move the selection.",
        rotate: "Drag the rotation ring or enter an angle to rotate the selection.",
        scale: "Drag the gizmo or enter X/Y factors to resize the selection.",
        mirror: "Click an axis or straight outline edge on the canvas to mirror.",
        corner: "Drag inward to round; drag outward through zero to chamfer. Click a corner for exact values."
      }[e.transformTool] }}</small>
      <div v-if="e.transformTool === 'corner'" class="transform-inputs corner-inputs">
        <template v-if="bulkCorners.length">
          <label>All corners style <select :disabled="e.objectPicker" :value="e.bulkCornerStyle === null ? 'mixed' : e.bulkCornerStyle ? 'chamfer' : 'round'" @change="editor.setAllCornerStyle(($event.target as HTMLSelectElement).value === 'chamfer')"><option disabled value="mixed">Mixed</option><option value="round">Round</option><option value="chamfer">Chamfer</option></select></label>
          <label :title="e.bulkCornerStyle === null ? 'Choose a style first' : e.bulkCornerStyle ? 'Equal edge setback' : 'Radius'">All corners ({{ e.unitSymbol }})<LengthInput clamp placeholder="Mixed" :disabled="e.objectPicker || e.bulkCornerStyle === null" :mixed="bulkMixed" :value="bulkValues[0] ?? 0" :min="0" @invalid="editor.setAllCornerValue(NaN)" @commit="editor.setAllCornerValue($event)" /></label>
        </template>
        <template v-if="cornerShape">
          <label>Style <select :value="selectedChamfer ? 'chamfer' : 'round'" @change="editor.setCornerStyle(($event.target as HTMLSelectElement).value === 'chamfer')"><option value="round">Round</option><option value="chamfer">Chamfer</option></select></label>
          <label>{{ selectedChamfer ? 'Setback' : 'Radius' }} ({{ e.unitSymbol }})<LengthInput clamp :value="radii[e.selectedCorner!.index]" :min="0" @invalid="editor.setCornerValue(NaN)" @commit="editor.setCornerValue($event)" /></label>
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
    </ToolPopover>
    <ToolSearch v-if="!e.stitchMode" />
  </div>
</template>
