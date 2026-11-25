<script setup lang="ts">
import { parseExpression, formulaReferences } from "../model/expression";
import { editableLength, formatLength, toMillimetres, unitSymbol, type UnitMode } from "../model/units";
import { interpolate, templateReferences } from "../model/variables";
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { useEditor } from "./useEditor";
import { editor as defaultEditor } from "../editor/instance";
import type { Controller } from "../editor/controller";
import type { Binding } from "../generated/Binding";
import LinkIcon from "./LinkIcon.vue";
import VariableSuggestions from "./VariableSuggestions.vue";
import { useVariableSuggestions } from "./variableInput";
import { numericReaders } from "./numericWheel";
const props = withDefaults(
  defineProps<{
    controller?: Controller;
    label: string;
    dimension?: boolean;
    value: string | number;
    min?: number;
    max?: number;
    step?: number;
    precision?: number;
    /** Current link of this property; its formula is shown while editing. */
    binding?: Binding | null;
  }>(),
  { step: 0.1, precision: 1, binding: null },
);
const editor = props.controller ?? defaultEditor;
const e = useEditor(editor);
/** `formula` is the typed text when it uses variables, otherwise null. */
const emit = defineEmits<{ commit: [value: string, formula: string | null, unit: UnitMode] }>();
const numeric = computed(() => typeof props.value === "number");
const values = () => e.value.variableScope.values;
/**
 * A linked formula keeps the unit it was typed in; plain numbers (including Alt+wheel and
 * arrow-key results) always use the display unit.
 */
function unitsFor(text: string): UnitMode {
  if (!props.binding || !formulaReferences(text).length) return e.value.units;
  return props.binding.unit === "mm" ? "mm" : e.value.units === "mm" ? "in-decimal" : e.value.units;
}
const format = (v: string | number) =>
  typeof v === "number"
    ? props.dimension ? formatLength(v, e.value.units, props.precision) : String(+v.toFixed(props.precision))
    : interpolate(v, values()).text;
const draft = ref(format(props.value)),
  invalid = ref(false),
  editing = ref(false);
const unitTag = computed(() => {
  const symbol = unitSymbol(unitsFor(editing.value ? draft.value : props.binding?.expression ?? ""));
  return props.binding && symbol !== e.value.unitSymbol ? symbol : "";
});
let focused = false,
  pristine = false,
  initial = props.value,
  last = draft.value;
/** What a focused field shows: the formula, editable precision, or the template. */
function focusedDraft() {
  if (props.binding) return props.binding.expression;
  if (props.dimension && typeof props.value === "number") return editableLength(props.value, e.value.units);
  return typeof props.value === "string" ? props.value : draft.value;
}
const missing = computed(() =>
  typeof props.value === "string" ? templateReferences(props.value).filter((name) => !values().has(name)) : [],
);
watch(
  () => [props.value, e.value.units, e.value.variableScope] as const,
  ([value]) => {
    if (!focused) {
      draft.value = format(value);
      last = draft.value;
    } else if (pristine) {
      // A change from elsewhere (e.g. a variable rename) before the user types.
      initial = value;
      draft.value = last = focusedDraft();
    }
  },
);
/** Millimetres for dimensions, plain numbers otherwise. */
function evaluate(text: string): number | null {
  const mode = unitsFor(text);
  const result = parseExpression(text, !!props.dimension && mode !== "mm", (name) => {
    const v = values().get(name);
    return v && v.kind === "number" ? v.value : null;
  });
  if (result === null) return null;
  return props.dimension ? toMillimetres(result, mode) : result;
}
const variables = useVariableSuggestions(values, ["number"]);
const listId = `field-variables-${useId()}`;
let inputElement: HTMLInputElement | null = null;
function register(el: unknown) {
  if (inputElement) numericReaders.delete(inputElement);
  inputElement = el as HTMLInputElement | null;
  if (inputElement && numeric.value) numericReaders.set(inputElement, evaluate);
}
onBeforeUnmount(() => { if (inputElement) numericReaders.delete(inputElement); });
function change(event: Event) {
  const input = event.target as HTMLInputElement;
  const text = input.value;
  pristine = false;
  draft.value = text;
  if (numeric.value) variables.update(input);
  const n = numeric.value ? evaluate(text) ?? NaN : NaN;
  if (
    numeric.value &&
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
    const formula = numeric.value && formulaReferences(text).length ? text : null;
    emit("commit", numeric.value ? String(n) : text, formula, unitsFor(text));
  }
}
function focus(event: FocusEvent) {
  focused = true;
  editing.value = true;
  pristine = true;
  initial = props.value;
  draft.value = focusedDraft();
  last = draft.value;
  const input = event.target as HTMLInputElement;
  input.value = draft.value;
  if (props.dimension) input.select();
  editor.beginProperty();
}
function blur() {
  focused = false;
  editing.value = false;
  invalid.value = false;
  variables.close();
  draft.value = format(props.value);
  void editor.finishProperty();
}
function key(event: KeyboardEvent) {
  if (event.isComposing || variables.key(event)) return;
  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
  if (event.key === "Escape") {
    event.stopPropagation();
    draft.value = format(initial);
    void editor.finishProperty(true);
    (event.target as HTMLInputElement).blur();
  }
}
const shownLabel = computed(() => (props.dimension ? props.label.replace(/mm/g, e.value.unitSymbol) : props.label));
</script>
<template>
  <label class="field" data-hint-edit="property">
    <span>{{ shownLabel }}<span v-if="binding" class="field-link" :title="`Linked to ${binding.expression}`"><LinkIcon /></span></span>
    <span class="field-input">
      <input
        :ref="register"
        v-numeric-wheel="typeof value === 'number' ? (dimension ? e.units : 'number') : false"
        :aria-label="shownLabel"
        :aria-description="binding ? `Linked to ${binding.expression}` : undefined"
        :title="binding ? `Linked to ${binding.expression}` : undefined"
        :disabled="!e.ready || !!e.transformTool || e.stitchMode"
        :aria-invalid="invalid"
        :aria-autocomplete="numeric ? 'list' : undefined"
        :aria-controls="variables.suggestions.value.length ? listId : undefined"
        :aria-activedescendant="variables.highlight.value >= 0 ? `${listId}-${variables.highlight.value}` : undefined"
        type="text"
        :min="min"
        :max="max"
        :maxlength="typeof value === 'string' ? 200 : undefined"
        :step="step"
        :value="draft"
        @focus="focus"
        @input="change"
        @blur="blur"
        @keydown="key"
        @click="numeric && variables.update($event.target as HTMLInputElement)"
      />
      <small v-if="unitTag" class="formula-unit" :title="`Formula typed in ${unitTag}`">{{ unitTag }}</small>
      <VariableSuggestions :id="listId" :suggestions="variables.suggestions.value" :highlight="variables.highlight.value" @choose="variables.choose" />
    </span>
    <small v-if="invalid" role="alert">
      Enter a valid value{{ min !== undefined ? ` ≥ ${dimension ? formatLength(min, e.units) : min}` : "" }}.
    </small>
    <small v-else-if="missing.length" class="field-warning" role="status">Unknown variable{{ missing.length > 1 ? "s" : "" }}: {{ missing.join(", ") }}</small>
  </label>
</template>
<style scoped>
.field > .field-input { position: relative; display: block; margin: 0; font-size: inherit; color: inherit; }
.field-link { display: inline-flex; vertical-align: middle; margin-left: 4px; color: var(--accent); }
.field-link :deep(svg) { width: 13px; height: 13px; }
.formula-unit {
  position: absolute; right: 7px; top: 50%; transform: translateY(-50%);
  color: var(--muted) !important; font-size: 10px; pointer-events: none;
}
.field-warning { color: var(--muted) !important; }
</style>
