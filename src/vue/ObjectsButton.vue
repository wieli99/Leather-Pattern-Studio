<script setup lang="ts">
import ObjectPickButton from "./ObjectPickButton.vue";
import SelectionHint from "./SelectionHint.vue";
withDefaults(defineProps<{ count: number; choosing: boolean; error?: string; multiple?: boolean }>(), {multiple:true});
defineEmits<{ toggle: [] }>();
</script>
<template>
  <div @keydown.enter.stop @keydown.space.stop>
    <ObjectPickButton class="objects-confirm" :pressed="choosing" :disabled="choosing && !!error"
      :title="choosing ? 'Confirm selection' : 'Change selection'"
      :label="choosing ? 'Confirm Selection' : 'Select Objects'" :value="count ? `(${count})` : 'Choose object'" @toggle="$emit('toggle')" />
    <SelectionHint :active="choosing" :multiple="multiple" />
    <small v-if="choosing && multiple">Right-click canvas to confirm.</small>
    <small v-if="error" aria-live="polite">{{ error }}</small>
  </div>
</template>
<style scoped>
.objects-confirm {width:100%;}
</style>
