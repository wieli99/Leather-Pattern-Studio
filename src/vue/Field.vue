<script setup lang="ts">
import { editableLength, formatLength, parseLength } from "../model/units";
import { ref, watch } from "vue";
import { useEditor } from "./useEditor";
import { editor } from "../editor/instance";
const e = useEditor();
const props = withDefaults(
  defineProps<{
    label: string;
    dimension?: boolean;
    value: string | number;
    min?: number;
    max?: number;
    step?: number;
    precision?: number;
  }>(),
  { step: 0.1, precision: 1 },
);
const emit = defineEmits<{ commit: [value: string] }>();
const format = (v: string | number) =>
  typeof v === "number" ? (props.dimension ? formatLength(v, e.value.units, props.precision) : String(+v.toFixed(props.precision))) : v;
const draft = ref(format(props.value)),
  invalid = ref(false);
let focused = false,
  initial = props.value,
  last = draft.value;
watch(
  () => [props.value, e.value.units] as const,
  ([value]) => {
    if (!focused) {
      draft.value = format(value);
      last = draft.value;
    }
  },
);
function change(event: Event) {
  const text = (event.target as HTMLInputElement).value;
  draft.value = text;
  const n = props.dimension ? (parseLength(text, e.value.units) ?? NaN) : Number(text);
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
    emit("commit", props.dimension ? String(n) : text);
  }
}
function focus(event: FocusEvent) {
  focused = true;
  initial = props.value;
  if (props.dimension && typeof props.value === "number") draft.value = editableLength(props.value, e.value.units);
  last = draft.value;
  const input = event.target as HTMLInputElement;
  input.value = draft.value;
  if (props.dimension) input.select();
  editor.beginProperty();
}
function blur() {
  focused = false;
  draft.value = format(props.value);
  void editor.finishProperty();
}
function key(event: KeyboardEvent) {
  if (event.isComposing) return;
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
  <label class="field" data-hint-edit="property">
    <span>{{ dimension ? label.replace(/mm/g, e.unitSymbol) : label }}</span>
    <input
      :aria-label="dimension ? label.replace(/mm/g, e.unitSymbol) : label"
      :disabled="!e.ready || !!e.transformTool || e.stitchMode"
      :aria-invalid="invalid"
      :type="typeof value === 'number' && (!dimension || e.units === 'mm') ? 'number' : 'text'"
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
      Enter a valid value{{ min !== undefined ? ` ≥ ${dimension ? formatLength(min, e.units) : min}` : "" }}.
    </small>
  </label>
</template>
