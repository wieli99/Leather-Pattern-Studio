<script setup lang="ts">
import StitchPresets from "./StitchPresets.vue";
import { computed, ref, watch } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import {
  stitchSpacingPresets,
  stitchInsetPresets,
  type StitchSettings,
} from "../model/stitch";
import { stitchGeometry } from "../model/stitchGeometry";
const e = useEditor();
const selected = computed(() =>
  e.value.stitchGroups.find((g) => g.id === e.value.stitchSelected[0]),
);
const settings = computed(
  () =>
    e.value.stitchDraft?.settings ??
    selected.value?.settings ??
    e.value.stitchSettings,
);
const junction = ref(1);
watch(selected, () => {
  junction.value = selected.value?.closed ? 0 : 1;
});
type NumericField = "spacing" | "inset" | "startClearance" | "endClearance";
const focused = ref<NumericField | null>(null);
const drafts = ref({
  spacing: "",
  inset: "",
  startClearance: "",
  endClearance: "",
});
function focusNumber(key: NumericField, event: Event) {
  focused.value = key;
  drafts.value[key] = (event.target as HTMLInputElement).value;
}
function draftNumber(key: NumericField, event: Event) {
  drafts.value[key] = (event.target as HTMLInputElement).value;
}
function cancelDraft() {
  focused.value = null;
  editor.cancel();
}
function edgeLabel(key: string) {
  const parts = key.split(":");
  return `${parts.at(-2) === "corner" ? "Rounded corner" : "Edge"} ${Number(parts.at(-1)) + 1}`;
}
function chooseNumber(key: "spacing" | "inset", value: number) {
  focused.value = null;
  drafts.value[key] = value.toFixed(2);
  editor.setStitchSettings({ ...settings.value, [key]: value });
}
function update(key: keyof StitchSettings, event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  editor.setStitchSettings({
    ...settings.value,
    [key]:
      key === "roundDiameter" ||
      key === "flatLength" ||
      key === "spacing" ||
      key === "inset" ||
      key === "startClearance" ||
      key === "endClearance"
        ? raw.trim()
          ? Number(raw)
          : NaN
        : raw,
  });
}
const warnings = computed(() =>
  e.value.stitchGroups.flatMap((g) => {
    try {
      stitchGeometry(
        e.value.document.shapes.find((s) => s.id === g.shapeId)!,
        g,
      );
      return [];
    } catch (error) {
      return [
        {
          id: g.id,
          name: g.edges.map(edgeLabel).join(", "),
          message: String(error),
        },
      ];
    }
  }),
);
</script>
<template>
  <section
    v-if="e.stitchMode"
    class="transform-options stitch-options"
    aria-label="Stitch line settings"
    data-hint-edit="stitch"
    @keydown.esc.stop.prevent="cancelDraft()"
    @keydown.enter.prevent="editor.applyStitch()"
  >
    <strong>Stitch line</strong>
    <button
      v-if="e.convertiblePath"
      :disabled="
        e.busy ||
        !!e.stitchDraft ||
        e.stitchGroups.some((g) => g.shapeId === e.convertiblePath?.id)
      "
      @click="editor.convertPathToStitch()"
    >
      Convert to stitching line
    </button>
    <small
      >Hover an edge; click to place. Shift-click two lines to merge.</small
    >
    <label
      >Style
      <select
        :disabled="e.busy"
        aria-label="Stitch style"
        :value="settings.style"
        @change="update('style', $event)"
      >
        <option value="french">French</option>
        <option value="japanese">Japanese</option>
        <option value="round">Round</option>
        <option value="flat">Flat</option>
      </select></label
    >
    <label v-if="settings.style === 'round' || settings.style === 'flat'">
      {{ settings.style === 'round' ? 'Diameter (mm)' : 'Length (mm)' }}
      <input
        type="range"
        min="0.1"
        max="5"
        step="0.1"
        :aria-label="settings.style === 'round' ? 'Stitch diameter' : 'Stitch length'"
        :disabled="e.busy"
        :value="settings.style === 'round' ? (settings.roundDiameter ?? 0.8) : (settings.flatLength ?? 1.4)"
        @input="update(settings.style === 'round' ? 'roundDiameter' : 'flatLength', $event)" />
      <output>{{ (settings.style === 'round' ? (settings.roundDiameter ?? 0.8) : (settings.flatLength ?? 1.4)).toFixed(1) }} mm</output>
    </label>
    <label
      >Spacing (mm)
      <span class="stitch-value"
        ><input
          aria-label="Stitch spacing"
          :disabled="e.busy"
          type="text"
          inputmode="decimal"
          min="0.01"
          step="0.01"
          :value="
            focused === 'spacing'
              ? drafts.spacing
              : Number.isFinite(settings.spacing)
                ? settings.spacing.toFixed(2)
                : ''
          "
          @focus="focusNumber('spacing', $event)"
          @input="draftNumber('spacing', $event)"
          @blur="focused = null"
          @change="update('spacing', $event)"
          @keydown.enter="update('spacing', $event)" /><StitchPresets
          label="Spacing"
          :values="stitchSpacingPresets"
          :disabled="e.busy"
          @choose="chooseNumber('spacing', $event)" /></span
    ></label>

    <label
      >Inset (mm)
      <span class="stitch-value"
        ><input
          aria-label="Stitch inset"
          :disabled="e.busy"
          type="text"
          inputmode="decimal"
          min="0"
          step="0.01"
          :value="
            focused === 'inset'
              ? drafts.inset
              : Number.isFinite(settings.inset)
                ? settings.inset.toFixed(2)
                : ''
          "
          @focus="focusNumber('inset', $event)"
          @input="draftNumber('inset', $event)"
          @blur="focused = null"
          @change="update('inset', $event)"
          @keydown.enter="update('inset', $event)" /><StitchPresets
          label="Inset"
          :values="stitchInsetPresets"
          :disabled="e.busy"
          @choose="chooseNumber('inset', $event)" /></span
    ></label>

    <label
      >Alignment
      <select
        :disabled="e.busy"
        aria-label="Stitch alignment"
        :value="settings.alignment"
        @change="update('alignment', $event)"
      >
        <option value="center">Center</option>
        <option value="start">Start</option>
        <option value="end">End</option>
      </select></label
    >
    <label
      v-for="field in ['startClearance', 'endClearance'] as const"
      :key="field"
      >{{
        field === "startClearance"
          ? "Start clearance (mm)"
          : "End clearance (mm)"
      }}<input
        type="number"
        min="0"
        step="0.01"
        :disabled="e.busy"
        :value="
          focused === field
            ? drafts[field]
            : Number.isFinite(settings[field] ?? 0)
              ? (settings[field] ?? 0).toFixed(2)
              : ''
        "
        @focus="focusNumber(field, $event)"
        @input="draftNumber(field, $event)"
        @blur="focused = null"
        @change="update(field, $event)"
        @keydown.enter="update(field, $event)"
    /></label>
    <p v-if="selected">
      {{ e.stitchSelected.length }} selected. Master:
      {{ selected.edges.map(edgeLabel).join(", ") }}
    </p>
    <div class="actions">
      <button
        :disabled="e.stitchSelected.length !== 2 || !!e.stitchDraft || e.busy"
        @click="editor.mergeStitches()"
      >
        Merge
      </button>
      <button
        :disabled="
          !selected || selected.edges.length < 2 || !!e.stitchDraft || e.busy
        "
        @click="editor.splitStitches()"
      >
        Split all
      </button>
      <button
        :disabled="!selected || !!e.stitchDraft || e.busy"
        @click="editor.deleteStitches()"
      >
        Delete stitching
      </button>
    </div>
    <template v-if="selected && selected.edges.length > 1">
      <label
        >Junction
        <select aria-label="Stitch split junction" v-model.number="junction">
          <option
            v-for="(_, i) in selected.edges.slice(selected.closed ? 0 : 1)"
            :key="i"
            :value="selected.closed ? i : i + 1"
          >
            Before {{ edgeLabel(selected.edges[selected.closed ? i : i + 1]) }}
          </option>
        </select></label
      >
      <button
        :disabled="!!e.stitchDraft || e.busy"
        @click="
          editor.splitStitches(Math.min(junction, selected.edges.length - 1))
        "
      >
        Split at junction
      </button>
    </template>
    <p v-if="e.stitchError" role="alert">{{ e.stitchError }}</p>
    <p v-for="warning in warnings" :key="warning.id" role="alert">
      {{ warning.name }}: {{ warning.message }}
      <button
        @click="
          editor.stitchSelected = [warning.id];
          editor.notify();
        "
      >
        Select
      </button>
    </p>

    <div class="actions tool-popup-footer">
      <button
        :disabled="!!e.stitchError || e.busy"
        @click="editor.applyStitch()"
      >
        Apply</button
      ><button @click="cancelDraft()">Cancel</button>
    </div>
  </section>
</template>
<style scoped>
label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
}
input,
select {
  width: 135px;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px;
}
p {
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.stitch-value {
  display: flex;
  width: 135px;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.stitch-value input {
  width: 0;
  min-width: 0;
  flex: 1;
  border: 0;
  border-radius: 0;
}
</style>
