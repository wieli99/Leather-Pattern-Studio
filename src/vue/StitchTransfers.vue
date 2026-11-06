<script setup lang="ts">
import { computed } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { receivingStitches } from "../model/stitchLayers";
const e=useEditor();
const rows=computed(()=>(e.value.document.stitchTransfers ?? []).filter(t=>e.value.stitchSelected.includes(t.masterId)||e.value.stitchSelected.includes(t.id)).map(t=>{
  const target=e.value.document.shapes.find(s=>s.id===t.targetId);
  try{return {transfer:t,name:target?.name ?? "Missing piece",result:receivingStitches(e.value.document,t),error:""};}
  catch(reason){return {transfer:t,name:target?.name ?? "Missing piece",result:undefined,error:String(reason)};}
}));
</script>
<template>
  <details v-if="rows.length" class="transfer-list">
    <summary>Transfers ({{ rows.length }})</summary>
    <article v-for="(row,index) in rows" :key="row.transfer.id" @mouseenter="editor.stitchTransferHighlight=row.transfer.id; editor.notify()" @mouseleave="editor.stitchTransferHighlight=null; editor.notify()" @focusin="editor.stitchTransferHighlight=row.transfer.id; editor.notify()" @focusout="editor.stitchTransferHighlight=null; editor.notify()">
      <strong>Transfer ={{ row.transfer.number }} · {{ row.name }}</strong>
      <p v-if="row.error" role="alert">{{ row.error }}</p>
      <small v-else>{{ row.result!.included }} holes · {{ row.result!.excluded }} outside · {{ row.result!.edgeHits.length }} edge contacts</small>
      <div class="actions"><button type="button" :disabled="e.busy || !row.result?.included || editor.isLocked(row.transfer.targetId)" @click="editor.removeStitchTransfer(row.transfer.id,true)">Detach</button><button type="button" :disabled="e.busy || editor.isLocked(row.transfer.targetId)" @click="editor.removeStitchTransfer(row.transfer.id)">Remove transfer</button></div>
    </article>
  </details>
</template>
<style scoped>
article{display:grid;gap:6px;padding-block:8px;border-top:1px solid var(--border);}summary{cursor:pointer;font-size:12px;font-weight:600;padding-block:4px;}.actions{display:flex;gap:6px;flex-wrap:wrap;}
</style>
