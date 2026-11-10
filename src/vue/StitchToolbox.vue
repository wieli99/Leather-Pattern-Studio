<script setup lang="ts">
import LengthInput from "./LengthInput.vue";
import StitchPresetManager from "./StitchPresetManager.vue";
import StitchTransfers from "./StitchTransfers.vue";
import StitchHolePanel from "./StitchHolePanel.vue";
import { receivingWarnings, holeAppearance, holeTouchesEdge, stitchEdgeContacts } from "../model/stitchLayers";
import StitchPresets from "./StitchPresets.vue";
import { stitchGeometry } from "../model/stitchGeometry";
import { computed, watch } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import {
  stitchSpacingPresets,
  stitchInsetPresets,
  type StitchSettings,
} from "../model/stitch";

const e = useEditor();
const selected = computed(() =>
  e.value.stitchGroups.find((g) => g.id === e.value.stitchSelected[0]),
);
const operationLines = computed(() => {
  const doc=e.value.stitchOriginal ?? e.value.document;
  return e.value.stitchOperationGroups.map(group=>{
    const shape=doc.shapes.find(s=>s.id===group.shapeId)!;
    let holes: number | null=null;
    try { holes=stitchGeometry(shape,group,doc.stitchGroups).holes.length; } catch { /* The operation reports invalid geometry. */ }
    return {id:group.id,name:shape.name,holes,edges:group.edges.map(edgeLabel).join(", ")};
  });
});
const dependentTransfers = computed(() => (e.value.stitchOriginal?.stitchTransfers ?? []).filter(t=>e.value.stitchOperationSelection.includes(t.masterId)).length);
const settings = computed(
  () =>
    e.value.stitchDraft?.settings ??
    selected.value?.settings ??
    e.value.stitchSettings,
);
// Probe the same geometry validation used by previews, including continuations.
const wheelHoleLimit = computed(() => {
  const group = e.value.stitchDraft ?? selected.value;
  if (!group) return 100000;
  const shape = e.value.document.shapes.find(s => s.id === group.shapeId);
  if (!shape) return null;
  const fits = (holeCount: number) => {
    try {
      editor.stitchGeometry(shape, { ...group, holes: undefined, settings: { ...settings.value, holeCount } });
      return true;
    } catch { return false; }
  };
  if (!fits(1)) return null;
  let low = 1, high = 100000;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  return low;
});
function fixedCount(event: Event) {
  const value=(event.target as HTMLSelectElement).value;
  let count=1;
  if (selected.value) {
    try { count=editor.stitchGeometry(e.value.document.shapes.find(s=>s.id===selected.value!.shapeId)!,selected.value).holes.length; } catch { /* A valid entered count can repair the line. */ }
  }
  editor.setStitchSettings({ ...settings.value, holeCount:value==="auto" ? undefined : Math.max(1,count) });
}
function applyFromKeyboard(event: KeyboardEvent) {
  const target=event.target as HTMLElement;
  if (target.closest("button,select,summary,form")) return;
  event.preventDefault();
  if(!editor.canApplyStitchTool)return;
  void editor.applyStitch();
}
function cancelDraft() {
  invalidFields.clear();
  editor.cancelStitchOperation();
}
function edgeLabel(key: string) {
  const parts = key.split(":");
  return `${parts.at(-2) === "corner" ? "Rounded corner" : "Edge"} ${Number(parts.at(-1)) + 1}`;
}
const invalidFields = new Set<keyof StitchSettings>();
watch(() => e.value.stitchMode, () => invalidFields.clear());
watch(() => selected.value?.id, () => invalidFields.clear());
function numberValue(key: keyof StitchSettings, value: number) {
  if (Number.isFinite(value)) invalidFields.delete(key);
  else invalidFields.add(key);
  editor.setStitchSettings({ ...settings.value, [key]: value });
  if (invalidFields.size) {
    editor.stitchError = "Enter valid stitch dimensions before applying.";
    editor.notify();
  }
}
function chooseNumber(key: "spacing" | "inset", value: number) {
  numberValue(key, value);
}
function update(key: keyof StitchSettings, event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  if (key === "roundDiameter" || key === "flatLength") {
    numberValue(key, raw.trim() ? Number(raw) : NaN);
    return;
  }
  editor.setStitchSettings({ ...settings.value, [key]: raw });
  if (invalidFields.size) {
    editor.stitchError = "Enter valid stitch dimensions before applying.";
    editor.notify();
  }
}
const warnings = computed(() =>
  [...e.value.stitchGroups.flatMap((g) => {
    try {
      const shape=e.value.document.shapes.find(s => s.id === g.shapeId)!;
      const geometry=editor.stitchGeometry(shape,g);
      const hits=stitchEdgeContacts(e.value.document,shape,g).size;
      return hits ? [{ id:g.id, key:g.id, name:g.edges.map(edgeLabel).join(", ") || "Detached holes", message:`${hits} hole(s) touch or cross the material edge. Adjust the run or geometry.` }] : [];
    } catch (error) {
      return [
        {
          id: g.id,
          key: g.id,
          name: g.edges.map(edgeLabel).join(", "),
          message: String(error),
        },
      ];
    }
  }), ...receivingWarnings(e.value.document).map(warning=>({ id:warning.masterId,key:warning.id,name:e.value.document.shapes.find(s=>s.id===warning.targetId)?.name ?? "Receiving piece",message:warning.message }))],
);
</script>
<template>
  <div id="stitch-panel-anchor" class="stitch-panel-anchor">
  <section
    v-if="e.stitchMode && e.stitchTool"
    :key="`${e.stitchTool}:${selected?.id ?? 'defaults'}`"
    class="transform-options stitch-options"
    aria-label="Stitch line settings"
    data-hint-edit="stitch"
    @keydown.esc.stop.prevent="cancelDraft()"
    @keydown.enter="applyFromKeyboard"
  >
    <strong>{{ e.stitchToolInfo?.label }}</strong>
    <div v-if="e.stitchTransferPlacement" class="transfer-guide">
      <strong>{{ e.stitchTransferPlacement.phase==='placed' ? 'Review transferred stitching' : 'Place transferred stitching' }}</strong>
      <small>{{ e.stitchTransferPlacement.phase==='placed' ? 'Review the placement, then Apply to confirm. You can reposition it before applying.' : 'Move the master preview over receiving pieces and place it before applying.' }}</small>
      <p>{{ e.stitchTransferPlacement.angle.toFixed(1) }}° · {{ e.stitchTransferPreview.results.length }} selected-line transfers ready</p>
      <small v-if="!e.stitchTransferPreview.transfers.length">No eligible receiving piece here. Reposition the preview over an unlocked closed piece.</small>
      <small v-for="result in e.stitchTransferPreview.results" :key="result.group.id">{{ result.target.name }}: {{ result.included }} holes, {{ result.excluded }} outside, {{ result.edgeHits.length }} edge contacts</small>
      <small v-for="reason in e.stitchTransferPreview.skipped" :key="reason">Skipped: {{ reason }}</small>

    </div>
    <div v-else-if="['link','unlink','merge','split','delete'].includes(e.stitchTool!)" class="operation-settings">
      <small>{{ e.stitchToolInfo?.hint }}</small>
      <p>{{ e.stitchOperationSelection.length }} line(s) selected. Select the lines to include in this operation.</p>
      <p v-for="line in operationLines" :key="line.id">{{ line.name }} · {{ line.holes ?? 'Invalid geometry' }}{{ line.holes===null ? '' : ' holes' }} · {{ line.edges }}</p>
      <template v-if="e.stitchTool==='split'">
        <label>Method<select aria-label="Stitch split method" :value="e.stitchSplitMethod" :disabled="e.stitchToolPending" @change="editor.stitchSplitMethod=($event.target as HTMLSelectElement).value as 'all'|'junction'; editor.previewStitchOperation()"><option value="all">All edges</option><option value="junction">At junction</option></select></label>
        <label v-if="e.stitchSplitMethod==='junction'">Split location<select aria-label="Stitch split junction" :value="e.stitchSplitJunction" :disabled="e.stitchToolPending" @change="editor.stitchSplitJunction=Number(($event.target as HTMLSelectElement).value); editor.previewStitchOperation()"><option v-for="(edge,index) in e.stitchOperationGroups[0]?.edges ?? []" :key="edge" :value="index" :disabled="index===0 && !e.stitchOperationGroups[0]?.closed">Before {{ edgeLabel(edge) }}</option></select></label>
      </template>
      <small v-if="e.stitchTool==='delete'">Selected stitching and its live transfers will be removed. {{ dependentTransfers }} dependent transfer(s). The material outlines stay unchanged.</small>
      <small v-else-if="e.stitchTool==='link'">The preview checks equal hole counts; it does not move holes.</small>
      <small v-else-if="e.stitchTool==='merge'">The first selected line supplies the merged settings.</small>
    </div>
    <StitchHolePanel v-else-if="e.editingStitchHoles" />
    <div v-else-if="e.selectedTransfer">
      <p>Linked transferred stitching. Edit its source or detach it for independent editing.</p>
      <button type="button" @click="editor.stitchSelected=[e.selectedTransfer!.masterId]; editor.notify()">Edit source</button>
      <StitchTransfers />
    </div>
    <template v-else>
    <small v-if="selected?.holes">Custom initial placement. Changing spacing or path geometry recalculates the holes.</small>
    <small v-else>{{ selected ? 'Edit the selected run, or click another line.' : 'Hover an edge and click to place stitching.' }}</small>
    <StitchPresetManager v-if="e.stitchTool==='line' || e.stitchTool==='convert'" :settings="settings" />
    <template v-if="e.stitchTool!=='continue'">
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
      {{ settings.style === 'round' ? `Diameter (${e.unitSymbol})` : `Length (${e.unitSymbol})` }}
      <LengthInput :value="settings.style === 'round' ? (settings.roundDiameter ?? .8) : (settings.flatLength ?? 1.4)" :min=".1" :max="5" :aria-label="settings.style === 'round' ? 'Stitch diameter' : 'Stitch length'" @invalid="numberValue(settings.style === 'round' ? 'roundDiameter' : 'flatLength', NaN)" @commit="numberValue(settings.style === 'round' ? 'roundDiameter' : 'flatLength', $event)" />
    </label>
    <label class="stitch-toggle">Reverse iron<input type="checkbox" :checked="settings.reversed" @change="editor.setStitchSettings({ ...settings, reversed: !settings.reversed })" /></label>
    </template>
    <label
      >Spacing ({{ e.unitSymbol }})
      <span class="stitch-value"
        > <LengthInput fixed aria-label="Stitch spacing" :disabled="e.busy" :value="settings.spacing" :min=".01" @invalid="numberValue('spacing', NaN)" @commit="numberValue('spacing', $event)" /><StitchPresets
          label="Spacing"
          :values="stitchSpacingPresets"
          :disabled="e.busy"
          @choose="chooseNumber('spacing', $event)" /></span
    ></label>

    <template v-if="e.stitchTool!=='continue'">
    <label
      >Inset ({{ e.unitSymbol }})
      <span class="stitch-value"
        > <LengthInput fixed aria-label="Stitch inset" :disabled="e.busy" :value="settings.inset" :min="0" @invalid="numberValue('inset', NaN)" @commit="numberValue('inset', $event)" /><StitchPresets
          label="Inset"
          :values="stitchInsetPresets"
          :disabled="e.busy"
          @choose="chooseNumber('inset', $event)" /></span
    ></label>

    <label
      >Alignment
      <select
        :disabled="e.busy || !!selected?.continuation"
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
      v-if="!selected?.continuation"
      v-for="field in ['startClearance', 'endClearance'] as const"
      :key="field"
      >{{
        field === "startClearance"
          ? `Start clearance (${e.unitSymbol})`
          : `End clearance (${e.unitSymbol})`
      }}<LengthInput fixed :value="settings[field] ?? 0" :min="0" :disabled="e.busy || !!selected?.continuation" @invalid="numberValue(field, NaN)" @commit="numberValue(field, $event)" /></label>
    </template>
    <label v-if="e.stitchTool==='continue'">End clearance ({{ e.unitSymbol }})<LengthInput :value="settings.endClearance ?? 0" :min="0" @commit="numberValue('endClearance', $event)" /></label>
    <div class="stitch-count">
      <label>Hole count<select aria-label="Stitch hole count mode" :value="settings.holeCount == null ? 'auto' : 'fixed'" :disabled="e.busy" @change="fixedCount"><option value="auto">Auto</option><option value="fixed">Fixed count</option></select></label>
      <label v-if="settings.holeCount != null">Number of holes<LengthInput scalar integer :value="settings.holeCount" :min="1" :max="100000" :step="1" :wheel="wheelHoleLimit !== null" :data-wheel-max="wheelHoleLimit" aria-label="Stitch hole count" :disabled="e.busy" @invalid="numberValue('holeCount', NaN)" @commit="numberValue('holeCount', $event)" /></label>
      <small v-if="settings.holeCount != null">Keeps your chisel spacing; the count sets the run length.</small>
    </div>
    <label v-if="selected?.continuation">Gap to next hole ({{ e.unitSymbol }})<LengthInput aria-label="Gap to next hole" :value="selected.continuation.gap" :min=".001" :disabled="e.busy" @commit="editor.setContinuationGap($event)" @invalid="editor.stitchError='Enter a positive continuation gap.'; editor.notify()" /></label>
    <small v-if="e.addingStitchRun">Click the edge where the new run starts. Its spacing stays fixed.</small>
    <StitchTransfers />
    <p v-if="selected">
      {{ e.stitchSelected.length }} selected. Master:
      {{ selected.edges.map(edgeLabel).join(", ") }} · {{ editor.stitchHoleInfo }}
    </p>
    </template>
    <p v-if="e.stitchError" role="alert">{{ e.stitchError }}</p>
    <p v-for="warning in warnings" :key="warning.key" role="alert">
      {{ warning.name }}: {{ warning.message }}
    </p>

    <div class="actions tool-popup-footer">
      <button
        :disabled="!e.canApplyStitchTool"
        @click="editor.applyStitch()"
      >
        Apply</button
      ><button @click="cancelDraft()">Cancel</button>
    </div>
  </section>
  </div>
</template>
<style scoped>
.stitch-options { max-height: min(60vh, calc(100vh - 220px)); }
details { flex-shrink:0; border-top: 1px solid var(--border); padding-top: 6px; }
.stitch-count { display:grid; gap:6px; }
.stitch-toggle { justify-content:space-between; }
.transfer-guide, .operation-settings {display:grid;gap:8px;}
summary { cursor:pointer; padding:4px 0; font-size:12px; font-weight:600; }
summary:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
fieldset { border:0; padding:4px 0; margin:0; display:grid; gap:6px; min-width:0; }
legend { font-size:12px; }
label { align-items:center; }
input[type="checkbox"] { width:auto; }

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
