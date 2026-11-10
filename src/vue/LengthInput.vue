<script setup lang="ts">
import { editableNumber, parseExpression } from "../model/expression";
import { computed, ref, watch } from "vue";
import { useEditor } from "./useEditor";
import { editableLength, formatLength, parseLength } from "../model/units";
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  scalar?: boolean;
  precision?: number;
  integer?: boolean;
  wheel?: boolean;
  units?: import("../model/units").UnitMode;
  value: number;
  min?: number;
  max?: number;
  mixed?: boolean;
  fixed?: boolean;
  clamp?: boolean;
  step?: number;
}>(), { wheel: true });
const emit = defineEmits<{ commit: [number]; invalid: [] }>();
const e = useEditor();
const inputUnits = computed(() => props.units ?? e.value.units);
const focused = ref(false),
  draft = ref(""),
  invalid = ref(false);
let initial = "";
let lastValid = props.value;
watch(() => props.value, value => { if (Number.isFinite(value)) lastValid = value; });
const editable = (value: number) => props.scalar ? editableNumber(value) : editableLength(value, inputUnits.value);
watch(
  () => inputUnits.value,
  () => {
    invalid.value = false;
    if (focused.value)
      initial = draft.value = props.mixed
        ? ""
        : editable(props.value);
  },
);
function focus(event: FocusEvent) {
  focused.value = true;
  initial = draft.value = props.mixed
    ? ""
    : editable(props.value);
  const input = event.target as HTMLInputElement;
  input.value = draft.value;
  input.select();
}
function confirm() {
  commit();
  if (props.clamp && !invalid.value) {
    initial = draft.value =
      inputUnits.value === "mm"
        ? formatLength(props.value, "mm")
        : editable(props.value);
  }
}
function commit() {
  if (!focused.value || (draft.value === initial && !invalid.value)) return;
  const value = props.scalar ? parseExpression(draft.value) : parseLength(draft.value, inputUnits.value);
  invalid.value =
    value === null ||
    (props.integer && !Number.isInteger(value)) ||
    (props.min !== undefined && value < props.min) ||
    (props.max !== undefined && value > props.max);
  if (invalid.value) emit("invalid");
  if (!invalid.value && value !== null) {
    lastValid = value;
    emit("commit", value);
    initial = draft.value;
  }
}
function restoreInvalid() {
  if (invalid.value && Number.isFinite(lastValid)) emit("commit", lastValid);
  invalid.value = false;
}
function blur() {
  commit();
  restoreInvalid();
  focused.value = false;
}
</script>
<template>
  <input
    v-numeric-wheel="wheel === false ? false : scalar ? 'number' : inputUnits"
    v-bind="$attrs"
    type="text"
    :min="min"
    :max="max"
    :step="step ?? 0.01"
    :aria-invalid="invalid"
    :value="
      focused
        ? draft
        : mixed
          ? ''
          : scalar
            ? precision === undefined ? editableNumber(value) : value.toFixed(precision)
          : fixed && inputUnits === 'mm'
            ? value.toFixed(2)
            : formatLength(value, inputUnits)
    "
    @focus="focus"
    @input="
      draft = ($event.target as HTMLInputElement).value;
      commit();
    "
    @change="commit"
    @blur="blur"
    @keydown.enter="confirm"
    @keydown.esc="
      draft = initial;
      restoreInvalid();
    "
  />
</template>
