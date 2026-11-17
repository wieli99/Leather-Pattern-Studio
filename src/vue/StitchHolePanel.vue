<script setup lang="ts">
import { computed } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { holeAppearance } from "../model/stitchLayers";
import type { StitchSettings } from "../model/stitch";
import LengthInput from "./LengthInput.vue";
const e=useEditor();
const selected=computed(()=>e.value.stitchHoleSelection.flatMap(h=>{
  const group=e.value.stitchGroups.find(g=>g.id===h.groupId);
  return group ? [{...h,group,appearance:holeAppearance(group,h.number-1)}] : [];
}));
const style=computed(()=>new Set(selected.value.map(h=>h.appearance.style)).size===1 ? selected.value[0]?.appearance.style : "");
const size=(s:StitchSettings)=>s.style==="flat" ? (s.flatLength ?? 1.4) : (s.roundDiameter ?? .8);
const mixedSize=computed(()=>new Set(selected.value.map(h=>size(h.appearance))).size>1);
async function change(changes:Partial<StitchSettings>|null) {
  const groups=editor.stitchGroups.map(group=>{
    const holes=selected.value.filter(h=>h.groupId===group.id);
    if(!holes.length)return group;
    const holeOverrides={...group.holeOverrides};
    for(const hole of holes) {
      if(changes===null)delete holeOverrides[String(hole.number)];
      else holeOverrides[String(hole.number)]={...hole.appearance,...changes};
    }
    return {...group,holeOverrides};
  });
  await editor.commit({...editor.document,stitchGroups:groups});
}
function lineSettings(){editor.editingStitchHoles=false;editor.stitchHoleSelection=[];editor.notify();}
</script>
<template>
  <div class="hole-settings" data-stitch-holes>
    <strong>{{ selected.length }} {{ selected.length===1 ? 'hole selected' : 'holes selected' }}</strong>
    <label>Hole type<select aria-label="Hole type" :value="style" :disabled="e.busy" @change="change({style:($event.target as HTMLSelectElement).value as StitchSettings['style']})"><option v-if="!style" value="" disabled>Mixed</option><option value="round">Round</option><option value="french">French</option><option value="japanese">Japanese</option><option value="flat">Flat</option></select></label>
    <label v-if="style==='round' || style==='flat'">{{ style==='round' ? 'Diameter' : 'Length' }} ({{ e.unitSymbol }})<LengthInput aria-label="Hole size" :value="selected[0] ? size(selected[0].appearance) : .8" :mixed="mixedSize" placeholder="Mixed" :min=".1" :max="5" :disabled="e.busy" @commit="change(style==='round' ? {roundDiameter:$event} : {flatLength:$event})" /></label>
    <button type="button" :disabled="e.busy" @click="change(null)">Reset to line settings</button>
    <button type="button" @click="lineSettings">Line settings</button>
  </div>
</template>
<style scoped>
.hole-settings{display:grid;gap:8px;}label{display:flex;align-items:center;justify-content:space-between;gap:8px;}select,input{width:135px;box-sizing:border-box;background-color:var(--input);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:6px;}
</style>
