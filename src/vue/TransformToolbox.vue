<script setup lang="ts">
import ToolField from "./ToolField.vue";
import ToolFieldPair from "./ToolFieldPair.vue";
import ObjectPickButton from "./ObjectPickButton.vue";
import ToolSearch from "./ToolSearch.vue";
import PathDrawingActions from "./PathDrawingActions.vue";
import SelectionHint from "./SelectionHint.vue";
import PivotSelector from "./PivotSelector.vue";
import ToolObjectPicker from "./ToolObjectPicker.vue";
import LengthInput from "./LengthInput.vue";
import StitchToolbox from "./StitchToolbox.vue";
import StitchToolbar from "./StitchToolbar.vue";
import AlignToolbox from "./AlignToolbox.vue";
import CalibrationToolbox from "./CalibrationToolbox.vue";
import ToolPopover from "./ToolPopover.vue";
import TransformFields from "./TransformFields.vue";
import { transformHeading, transformHelp } from "./transformText";
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
        <ToolField label="Mode"><select
            aria-label="Mode"
            :value="e.array.extent ? 'extent' : 'spacing'"
            @change="editor.setArrayExtent(($event.target as HTMLSelectElement).value === 'extent')"
          >
            <option value="extent">Extent</option>
            <option value="spacing">Spacing</option>
          </select></ToolField>
        <ToolFieldPair v-slot="{ field }" hint="array"
          :fields="([['vector1', `Distance 1 (${e.unitSymbol})`], ['vector2', `Distance 2 (${e.unitSymbol})`]] as const)">
          <LengthInput
            :step="1"
            :min="0.01"
            :value="Math.hypot(e.array[field]?.x ?? 0, e.array[field]?.y ?? 0)"
            @invalid="editor.setArrayDistance(field, NaN)"
            @commit="editor.setArrayDistance(field, $event)"
          />
        </ToolFieldPair>
        <ToolFieldPair v-slot="{ field }" hint="array" :fields="([['columns', 'Number'], ['rows', 'Repeat']] as const)">
          <LengthInput
            scalar
            integer
            :min="field === 'columns' ? 2 : 1"
            :max="Math.floor(1001 / (field === 'columns' ? e.array.rows : e.array.columns))"
            :step="1"
            :value="e.array[field]"
            @invalid="editor.setArrayValue(field, NaN)"
            @commit="editor.setArrayValue(field, $event)"
          />
        </ToolFieldPair>
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
        <ToolField label="Mode"><select
            aria-label="Mode"
            :value="e.array.step ? 'spacing' : 'total'"
            @change="editor.setArrayDistribution(($event.target as HTMLSelectElement).value === 'spacing')"
          >
            <option value="total">Total</option>
            <option value="spacing">Spacing</option>
          </select></ToolField>
        <ToolFieldPair v-slot="{ field }" hint="array" :fields="([['angle', 'Degrees'], ['count', 'Number']] as const)">
          <LengthInput v-if="field === 'angle'" scalar :step="1" :value="e.array.angle"
            @invalid="editor.setArrayValue('angle', NaN)" @commit="editor.setArrayValue('angle', $event)" />
          <LengthInput v-else scalar integer :min="2" :max="1001" :step="1" :value="e.array.count"
            @invalid="editor.setArrayValue('count', NaN)" @commit="editor.setArrayValue('count', $event)" />
        </ToolFieldPair>
        <ToolField label="Rotate copies"><input
            type="checkbox"
            v-model="e.array.rotate"
            @change="editor.refreshArray()"
        /></ToolField>
      </template>
      <small>Shift+wheel changes count. Counts include the original.</small>
      <p v-if="e.array.error" role="alert">{{ e.array.error }}</p>
    </ToolPopover>
    <ToolPopover v-if="e.pathCopy" class="path-copy-options" heading="Copy along path" aria-label="Copy along path settings"
      :apply-disabled="!e.canApplyPathCopy" :apply="() => editor.applyPathCopy()" :cancel="cancel">
      <ObjectPickButton v-for="role in (['source', 'path'] as const)" :key="role" :pressed="e.pathCopy.picker === role"
        :label="role === 'source' ? 'Select Source' : 'Select Path'" :value="e.pathCopy[role] ? '(1)' : 'Choose object'"
        @toggle="e.pathCopy.picker = e.pathCopy.picker === role ? null : role; editor.refreshPathCopy()" />
      <hr>
      <ToolField label="Distribution"><select v-model="e.pathCopy.mode" @change="editor.refreshPathCopy()"><option value="spacing">Spacing</option><option value="count">Count</option></select></ToolField>
      <ToolField v-if="e.pathCopy.mode === 'spacing'" :label="`Spacing (${e.unitSymbol})`" data-hint-edit="path-copy"><LengthInput :min="0.01" :value="e.pathCopy.spacing" @invalid="e.pathCopy.spacing = NaN; editor.refreshPathCopy()" @commit="e.pathCopy.spacing = $event; editor.refreshPathCopy()" /></ToolField>
      <ToolField v-else label="New copies" data-hint-edit="path-copy"><LengthInput scalar integer :min="1" :max="1000" :step="1" :value="e.pathCopy.count" @invalid="e.pathCopy.count = NaN; editor.refreshPathCopy()" @commit="e.pathCopy.count = $event; editor.refreshPathCopy()" /></ToolField>
      <ToolField label="Rotate with path"><input v-model="e.pathCopy.rotate" type="checkbox" @change="editor.refreshPathCopy()" /></ToolField>
      <small v-if="e.preview && !e.pathCopy.picker">{{ e.preview.shapes.filter(s => !e.document.shapes.some(o => o.id === s.id) && !s.stitchParentId).length }} new objects</small>
      <p v-if="e.pathCopy.error" role="alert">{{ e.pathCopy.error }}</p>
    </ToolPopover>
    <StitchToolbox />
    <StitchToolbar />
    <ToolPopover v-if="e.segmentMode && !e.transformTool && e.segmentSelection.length" class="segment-options" aria-label="Segment selection"
      :heading="e.segmentSelection.length === 1 ? '1 segment' : `${e.segmentSelection.length} segments`">
      <small>Press G to move, E to rotate, S to resize or M to mirror. Transforming or separating detaches segments from their shapes.</small>
      <template #footer>
        <button :disabled="e.busy" title="Separate (Ctrl+Shift+D)" @click="editor.separateSegments()">Separate</button>
        <button :disabled="e.busy" title="Duplicate (Ctrl+D)" @click="editor.duplicateSegments()">Duplicate</button>
        <button :disabled="e.busy" title="Delete (Delete)" @click="editor.deleteSegments()">Delete</button>
      </template>
    </ToolPopover>
    <ToolPopover v-if="e.trimMode" :aria-label="e.booleanOperation ? e.booleanLabel + ' settings' : e.mergeMode ? 'Join settings' : 'Trim settings'"
      :heading="e.booleanOperation ? e.booleanLabel : e.mergeMode ? 'Join' : 'Trim'"
      :apply-disabled="!e.canApplyTrim" :apply="() => editor.applyTrim()" :cancel="cancel">
      <template v-if="!e.booleanOperation"><ToolObjectPicker /></template>
      <template v-if="e.booleanOperation">
        <ObjectPickButton :pressed="e.boolean?.picker === 'target'" label="Select Target" :value="e.boolean?.target ? '(1)' : 'Choose object'"
          :title="e.boolean?.picker === 'target' ? 'Stop choosing a target' : 'Choose a target object'"
          @toggle="editor.setBooleanPicker('target')" />
        <ObjectPickButton :pressed="e.boolean?.picker === 'cutters'" :value="`(${e.boolean?.cutters.length ?? 0})`"
          :label="e.booleanOperation === 'subtract' ? 'Select subtract objects' : 'Select other objects'"
          :title="e.boolean?.picker === 'cutters' ? 'Stop choosing other objects' : 'Choose other objects'"
          @toggle="editor.setBooleanPicker('cutters')" />
        <SelectionHint :active="e.boolean?.picker === 'cutters'" />
        <p v-if="e.boolean?.error" role="alert">{{ e.boolean.error }}</p>
        <p v-if="e.boolean?.empty" role="status">Result is empty. Apply removes the input objects.</p>
      </template>
      <small v-else>{{ e.mergeMode ? "Apply to join the selected objects." : "Click a highlighted outline portion to trim it." }}</small>
      <p v-if="e.transformError" role="alert">{{ e.transformError }}</p>
    </ToolPopover>
    <AlignToolbox v-if="e.alignActive" />
    <CalibrationToolbox v-if="e.calibrationActive" />
    <ToolPopover v-if="e.offsetActive" heading="Offset" aria-label="Offset settings"
      :apply-disabled="!e.canApplyOffset" :apply="() => editor.applyOffset()" :cancel="cancel">
      <ToolObjectPicker /><hr>
      <small>Positive expands closed outlines; negative insets. On open paths, positive goes left from start to end.</small>
      <ToolField :label="`Distance (${e.unitSymbol})`" data-hint-edit="transform"><LengthInput fixed non-zero aria-label="Offset distance" :value="e.offsetDistance"
          @invalid="editor.setOffsetDistance(NaN)" @commit="editor.setOffsetDistance($event)" /></ToolField>
      <ToolField label="Corner style">
        <select :value="e.offsetJoin" @change="editor.setOffsetJoin(($event.target as HTMLSelectElement).value as 'sharp' | 'rounded')">
          <option value="sharp">Sharp</option><option value="rounded">Rounded</option>
        </select>
      </ToolField>
      <p v-if="e.offset?.error" role="alert">{{ e.offset.error }}</p>
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
      <small>{{ transformHelp[e.transformTool] }}</small>
      <div v-if="e.transformTool === 'corner'" class="corner-inputs" data-hint-edit="transform">
        <template v-if="bulkCorners.length">
          <ToolField label="All corners style"><select :disabled="e.objectPicker" :value="e.bulkCornerStyle === null ? 'mixed' : e.bulkCornerStyle ? 'chamfer' : 'round'" @change="editor.setAllCornerStyle(($event.target as HTMLSelectElement).value === 'chamfer')"><option disabled value="mixed">Mixed</option><option value="round">Round</option><option value="chamfer">Chamfer</option></select></ToolField>
          <ToolField :title="e.bulkCornerStyle === null ? 'Choose a style first' : e.bulkCornerStyle ? 'Equal edge setback' : 'Radius'" :label="`All corners (${e.unitSymbol})`"><LengthInput clamp placeholder="Mixed" :disabled="e.objectPicker || e.bulkCornerStyle === null" :mixed="bulkMixed" :value="bulkValues[0] ?? 0" :min="0" @invalid="editor.setAllCornerValue(NaN)" @commit="editor.setAllCornerValue($event)" /></ToolField>
        </template>
        <template v-if="cornerShape">
          <ToolField label="Style"><select :value="selectedChamfer ? 'chamfer' : 'round'" @change="editor.setCornerStyle(($event.target as HTMLSelectElement).value === 'chamfer')"><option value="round">Round</option><option value="chamfer">Chamfer</option></select></ToolField>
          <ToolField :label="`${selectedChamfer ? 'Setback' : 'Radius'} (${e.unitSymbol})`"><LengthInput clamp :value="radii[e.selectedCorner!.index]" :min="0" @invalid="editor.setCornerValue(NaN)" @commit="editor.setCornerValue($event)" /></ToolField>
        </template>
      </div>
      <TransformFields
        v-if="e.transformTool !== 'corner' && (e.transformTool !== 'mirror' || e.active.length === 1)"
        :tool="e.transformTool === 'mirror' ? null : e.transformTool"
        :values="e.transformValues"
        :unit-symbol="e.unitSymbol"
        :orientation="e.active.length === 1 ? e.transformOrientation : undefined"
        @commit="(field, value) => editor.setTransformValues({ [field]: value })"
        @invalid="(field) => editor.setTransformValues({ [field]: NaN })"
        @orientation="editor.setOrientation($event)"
      />
      <PivotSelector v-if="e.transformTool !== 'corner'" :disabled="e.objectPicker" :mode="e.pivotMode" :placing="e.placingPivot" @change="editor.setPivotMode($event)" @cancel="editor.cancelPivotPlacement()" />
      <p v-if="e.transformError" role="alert">{{ e.transformError }}</p>
    </ToolPopover>
    <PathDrawingActions />
    <ToolSearch v-if="!e.stitchMode" />
  </div>
</template>
