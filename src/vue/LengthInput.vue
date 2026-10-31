<script setup lang="ts">
import { ref, watch } from 'vue';
import { useEditor } from './useEditor';
import { editableLength, formatLength, parseLength } from '../model/units';
defineOptions({ inheritAttrs: false });
const props = defineProps<{ value: number; min?: number; max?: number; mixed?: boolean; fixed?: boolean; clamp?: boolean; step?: number }>();
const emit = defineEmits<{ commit: [number]; invalid: [] }>();
const e = useEditor();
const focused = ref(false), draft = ref(''), invalid = ref(false);
let initial = '';
watch(() => e.value.units, () => {
  invalid.value = false;
  if (focused.value) initial = draft.value = props.mixed ? "" : editableLength(props.value, e.value.units);
});
function focus(event: FocusEvent) {
  focused.value = true;
  initial = draft.value = props.mixed ? "" : editableLength(props.value, e.value.units);
  const input = event.target as HTMLInputElement;
  input.value = draft.value;
  input.select();
}
function confirm() {
  commit();
  if (props.clamp && !invalid.value) {
    initial = draft.value = e.value.units === "mm" ? formatLength(props.value, "mm") : editableLength(props.value, e.value.units);
  }
}
function commit() {
  if (!focused.value || (draft.value === initial && !invalid.value)) return;
  const value = parseLength(draft.value, e.value.units);
  invalid.value = value === null || (props.min !== undefined && value < props.min) || (props.max !== undefined && value > props.max);
  if (invalid.value) emit('invalid');
  if (!invalid.value && value !== null) { emit('commit', value); initial = draft.value; }
}
</script>
<template>
  <input v-bind="$attrs" :type="e.units === 'mm' ? 'number' : 'text'" :min="min" :max="max" :step="step ?? 0.01" :aria-invalid="invalid" :value="focused ? draft : (mixed ? '' : (fixed && e.units === 'mm' ? value.toFixed(2) : formatLength(value, e.units)))"
    @focus="focus" @input="draft = ($event.target as HTMLInputElement).value; commit()"
    @change="commit" @blur="commit(); focused = false"
    @keydown.enter="confirm" @keydown.esc="draft = initial; invalid = false" />
</template>
