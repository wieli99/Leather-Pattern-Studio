<script setup lang="ts">
import { ref, watch } from "vue";
import { editor } from "../editor/instance";
const props = withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    min?: number;
    max?: number;
    step?: number;
  }>(),
  { step: 0.1 },
);
const emit = defineEmits<{ commit: [value: string] }>();
const format = (v: string | number) =>
  typeof v === "number" ? String(+v.toFixed(1)) : v;
const draft = ref(format(props.value)),
  invalid = ref(false);
let focused = false,
  initial = props.value,
  last = draft.value;
watch(
  () => props.value,
  (value) => {
    if (!focused) {
      draft.value = format(value);
      last = draft.value;
    }
  },
);
function change(event: Event) {
  const text = (event.target as HTMLInputElement).value;
  draft.value = text;
  const n = Number(text);
  if (
    typeof props.value === "number" &&
    (!text.trim() ||
      !Number.isFinite(n) ||
      (props.min !== undefined && n < props.min) ||
      (props.max !== undefined && n > props.max))
  ) {
    invalid.value = true;
    return;
  }
  invalid.value = false;
  if (text !== last) {
    last = text;
    emit("commit", text);
  }
}
function focus() {
  focused = true;
  initial = props.value;
  editor.beginProperty();
}
function blur() {
  focused = false;
  draft.value = format(props.value);
  void editor.finishProperty();
}
function key(event: KeyboardEvent) {
  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
  if (event.key === "Escape") {
    event.stopPropagation();
    draft.value = format(initial);
    void editor.finishProperty(true);
    (event.target as HTMLInputElement).blur();
  }
}
</script>
<template>
  <label class="field">
    <span>{{ label }}</span>
    <input
      :aria-label="label"
      :disabled="!editor.ready"
      :aria-invalid="invalid"
      :type="typeof value === 'number' ? 'number' : 'text'"
      :min="min"
      :max="max"
      :maxlength="typeof value === 'string' ? 200 : undefined"
      :step="step"
      :value="draft"
      @focus="focus"
      @input="change"
      @blur="blur"
      @keydown="key"
    />
    <small v-if="invalid" role="alert">
      Enter a valid value{{ min !== undefined ? ` ≥ ${min}` : "" }}.
    </small>
  </label>
</template>
