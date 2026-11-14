<script setup lang="ts">
import SelectionHint from "./SelectionHint.vue";
withDefaults(defineProps<{ count: number; choosing: boolean; error?: string; multiple?: boolean }>(), {multiple:true});
defineEmits<{ toggle: [] }>();
</script>
<template>
  <div @keydown.enter.stop @keydown.space.stop>
    <button type="button" class="boolean-picker objects-confirm" :aria-pressed="choosing"
      :disabled="choosing && !!error" :title="choosing ? 'Confirm selection' : 'Change selection'" @click="$emit('toggle')">
      <span>{{ choosing ? "Confirm Selection" : "Select Objects" }}</span><span>{{ count ? `(${count})` : "Choose object" }}</span>
    </button>
    <SelectionHint :active="choosing" :multiple="multiple" />
    <small v-if="error" aria-live="polite">{{ error }}</small>
  </div>
</template>
<style scoped>
.objects-confirm {width:100%;}
.objects-confirm[aria-pressed="true"] {border-color:var(--accent);color:var(--accent);}
</style>
