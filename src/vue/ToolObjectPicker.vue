<script setup lang="ts">
import { computed } from "vue";
import ObjectsButton from "./ObjectsButton.vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
const props=withDefaults(defineProps<{ count?:number; choosing?:boolean; error?:string; multiple?:boolean }>(), {multiple:true});
const emit=defineEmits<{toggle:[]}>();
const e=useEditor();
const external=computed(()=>props.count !== undefined);
const count=computed(()=>props.count ?? e.value.selected.length);
const choosing=computed(()=>external.value ? !!props.choosing : e.value.objectPicker);
const error=computed(()=>external.value ? props.error : choosing.value ? e.value.toolSelectionError : undefined);
function toggle() { if(external.value) emit("toggle"); else editor.toggleObjectPicker(); }
</script>
<template>
  <div class="tool-object-picker" @keydown.enter.stop @keydown.space.stop>
    <ObjectsButton :multiple="multiple" :count="count" :choosing="choosing" :error="error" @toggle="toggle" />
  </div>
</template>
