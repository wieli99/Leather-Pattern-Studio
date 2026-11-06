<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import type { StitchSettings } from "../model/stitch";
import { validateStitchSettings } from "../model/stitch";
import { readStitchPresets, writeStitchPresets, parseStitchPresetBackup, exportStitchPresetBackup, mergeStitchPresets } from "../editor/stitchPresets";
import type { StitchPreset } from "../generated/StitchPreset";
const props = defineProps<{ settings: StitchSettings }>();
const e = useEditor(), chosen = ref(""), name = ref(""), action = ref<"save" | "rename" | null>(null), error = ref("");
const nameInput=ref<HTMLInputElement>();
watch(action, value => { if(value) void nextTick(() => nameInput.value?.focus()); });
function escape(event: KeyboardEvent) { if(action.value) { event.preventDefault(); event.stopPropagation(); action.value=null; error.value=""; } }
const scope = ref<"project" | "browser">("browser");
const library = ref<StitchPreset[]>([]);
try { library.value = readStitchPresets(); } catch { error.value = "My presets could not be loaded from this browser."; }
watch(scope, () => { chosen.value=""; action.value=null; error.value=""; });
const presets = computed(() => library.value);
async function store(presets: StitchPreset[]) {

  try {
    writeStitchPresets(presets);
    library.value=presets;
    return true;
  } catch { error.value="My presets could not be saved. Check this browser’s storage permissions."; return false; }
}
const signature=(s:StitchSettings)=>JSON.stringify([s.style,s.roundDiameter ?? .8,s.flatLength ?? 1.4,s.spacing,s.inset,s.alignment,s.reversed ?? false]);
const modified=computed(()=>selected.value && signature(props.settings)!==signature(selected.value.settings));
const selected = computed(() => presets.value.find(p => p.name === chosen.value));
function snapshot(): StitchSettings {
  const { holeCount: _, ...settings } = props.settings;
  return { ...settings, startClearance: 0, endClearance: 0 };
}
function apply(event: Event) {
  chosen.value = (event.target as HTMLSelectElement).value;
  if (selected.value) editor.setStitchSettings({ ...selected.value.settings, holeCount: props.settings.holeCount, startClearance: props.settings.startClearance, endClearance: props.settings.endClearance });
}
async function save(replace = false) {
  error.value = "";
  const nextName = replace ? chosen.value : name.value.trim();
  if (!nextName || nextName.length > 200) { error.value = "Use a preset name of 1–200 characters."; return; }
  if (!replace && presets.value.some(p => p.name === nextName)) { error.value = "That name is already used. Choose another name or use Update."; return; }
  try {
    validateStitchSettings(props.settings);
    const next = action.value === "rename" && selected.value ? { ...selected.value, name:nextName } : { name:nextName, settings:snapshot() };
    const previousName = replace || action.value === "rename" ? chosen.value : "";
    if (await store([...presets.value.filter(p => p.name !== previousName),next])) {
      chosen.value=nextName; action.value=null; name.value="";
    }
  } catch (reason) { error.value=String(reason); }
}
async function remove() {
  if (await store(presets.value.filter(p => p.name !== chosen.value))) chosen.value="";
}
const picker=ref<HTMLInputElement>();
const incoming=ref<StitchPreset[]|null>(null);
const importMode=ref("merge");
const status=ref("");
async function importFile(event:Event) {
  const input=event.target as HTMLInputElement;
  try {if(input.files?.[0])incoming.value=parseStitchPresetBackup(await input.files[0].text());}
  catch(reason){error.value=String(reason);}finally{input.value="";}
}
async function confirmImport() {
  if(!incoming.value)return;
  const next=importMode.value==="replace" ? incoming.value : mergeStitchPresets(library.value,incoming.value);
  if(await store(next)){status.value=`Loaded ${incoming.value.length} preset entries; library now contains ${next.length} presets.`;incoming.value=null;chosen.value="";error.value="";}
}
function exportFile() {
  const url=URL.createObjectURL(new Blob([exportStitchPresetBackup(library.value)],{type:"application/json"}));
  const link=document.createElement("a");link.href=url;link.download="stitch-presets.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
</script>
<template>
  <div class="stitch-presets" @keydown.enter.stop @keydown.esc="escape">
    <details><summary>Presets</summary>
    <label>Load preset<select aria-label="Load stitch preset" :value="chosen" :disabled="e.busy || !presets.length" @change="apply"><option value="">Choose a preset…</option><option v-for="preset in presets" :key="preset.name">{{ preset.name }}</option></select></label>
    <small v-if="!presets.length">No saved presets. Save the current settings below or import a backup.</small>

    <div class="actions">
      <button type="button" :disabled="e.busy || !!e.stitchError || !!action" @click="action='save'; name=''; error=''">Save as…</button>
      <button type="button" :disabled="e.busy || !selected || !!e.stitchError || !!action" @click="save(true)">Update</button>
      <button type="button" :disabled="e.busy || !selected || !!action" @click="action='rename'; name=chosen; error=''">Rename</button>
      <button type="button" :disabled="e.busy || !selected || !!action" @click="remove">Delete</button>
    </div>
    <form v-if="action" @submit.prevent="save()">
      <label>{{ action === 'rename' ? 'New name' : 'Preset name' }}<input ref="nameInput" v-model="name" aria-label="Stitch preset name" maxlength="200" autofocus /></label>
      <div class="actions"><button type="submit" :disabled="e.busy || !name.trim()">{{ action === 'rename' ? 'Rename preset' : 'Save preset' }}</button><button type="button" @click="action=null; error=''">Cancel</button></div>
    </form>
    <small v-if="modified">Modified settings. Update changes the preset, leaving existing lines as they are.</small>
    <small>Saved immediately in this browser for every project. Applying a preset keeps the section’s count and clearances.</small>
    <div class="actions"><button type="button" @click="exportFile">Export presets</button><button type="button" @click="picker?.click()">Import presets</button><button v-if="e.document.stitchPresets?.length" type="button" @click="incoming=e.document.stitchPresets.map(p=>({...p,settings:{...p.settings}}))">Import legacy project presets</button></div>
    <input ref="picker" type="file" accept="application/json,.json" hidden @change="importFile" />
    <form v-if="incoming" @submit.prevent="confirmImport">
      <p>{{ incoming.length }} presets in this backup. Merge preserves existing entries; Replace removes the current library.</p>
      <label>Import mode<select v-model="importMode" aria-label="Preset import mode"><option value="merge">Merge</option><option value="replace">Replace all presets</option></select></label>
      <button type="submit">{{ importMode==='replace' ? 'Replace library' : 'Merge presets' }}</button><button type="button" @click="incoming=null">Cancel import</button>
    </form>
    </details>
    <small v-if="status" role="status">{{ status }}</small>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.stitch-presets label {display:flex;align-items:center;justify-content:space-between;gap:8px;}
.stitch-presets select,.stitch-presets input:not([type=file]) {width:135px;box-sizing:border-box;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:6px;}
.stitch-presets summary {cursor:pointer;font-size:12px;padding:4px 0;}
.stitch-presets { display:grid; gap:8px; }
.actions { display:flex; flex-wrap:wrap; gap:6px; }
form { display:grid; gap:8px; }
</style>
