<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import PinnablePopover from "./PinnablePopover.vue";
import VariableSuggestions from "./VariableSuggestions.vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { useVariableSuggestions } from "./variableInput";
import { numericReaders } from "./numericWheel";
import { editableNumber, formulaReferences, parseExpression } from "../model/expression";
import { editableLength, formatLength, toMillimetres, unitSymbol, type UnitMode } from "../model/units";
import { bindingUnit, nextVariableName, variableNameError, type Variable } from "../model/variables";
import { deleteVariable, renameVariable, variableUses } from "../model/bindings";
const e = useEditor();
const open = ref(false);
const list = computed(() => e.value.variableDocument.variables ?? []);
const values = () => e.value.variableScope.values;
const errors = ref<Record<string, string>>({});
const nameDrafts = ref<Record<string, string>>({});
const valueDrafts = ref<Record<string, string>>({});
const confirmDelete = ref<string | null>(null);
const kindLabels = { length: "Length", number: "Number", text: "Text" } as const;

const hasFormula = (v: Variable) => v.kind !== "text" && formulaReferences(v.value).length > 0;
/** Formulas keep the unit they were typed in; plain numbers use the display unit. */
function unitsFor(v: Variable, text: string): UnitMode {
  if (!formulaReferences(text).length) return e.value.units;
  return v.unit === "in" ? (e.value.units === "mm" ? "in-decimal" : e.value.units) : "mm";
}
function resolvedText(v: Variable) {
  const value = values().get(v.name);
  if (!value) return "";
  if (value.kind === "text") return value.value;
  return value.kind === "length" ? `${formatLength(value.value, e.value.units)} ${e.value.unitSymbol}` : editableNumber(value.value);
}
function shownValue(v: Variable) {
  if (v.id in valueDrafts.value) return valueDrafts.value[v.id];
  if (v.kind === "text" || hasFormula(v)) return v.value;
  const value = values().get(v.name);
  if (!value || value.kind === "text") return v.value;
  return value.kind === "length" ? formatLength(value.value, e.value.units) : editableNumber(value.value);
}
function editableValue(v: Variable) {
  if (v.kind === "text" || hasFormula(v)) return v.value;
  const value = values().get(v.name);
  if (!value || value.kind === "text") return v.value;
  return value.kind === "length" ? editableLength(value.value, e.value.units) : editableNumber(value.value);
}
/** Evaluate a draft against the other variables: millimetres for lengths. */
function evaluate(v: Variable, text: string): number | null {
  const mode = unitsFor(v, text);
  const result = parseExpression(text, v.kind === "length" && mode !== "mm", (name) => {
    const other = values().get(name);
    if (!other || other.kind === "text" || name === v.name) return null;
    return other.kind === "length" ? (mode === "mm" ? other.value : other.value / 25.4) : other.value;
  });
  if (result === null) return null;
  return v.kind === "length" ? toMillimetres(result, mode) : result;
}
const unitTag = (v: Variable) => {
  const symbol = unitSymbol(unitsFor(v, valueDrafts.value[v.id] ?? v.value));
  return v.kind !== "text" && hasFormula(v) && symbol !== e.value.unitSymbol ? symbol : "";
};

async function apply(id: string, change: Parameters<typeof editor.updateVariables>[0]) {
  const message = await editor.updateVariables(change);
  if (message) errors.value = { ...errors.value, [id]: message };
  else {
    const { [id]: _, ...rest } = errors.value;
    errors.value = rest;
  }
  return message;
}
const replace = (id: string, patch: Partial<Variable>) => (doc: typeof e.value.document) => ({
  ...doc,
  variables: (doc.variables ?? []).map((v) => (v.id === id ? { ...v, ...patch } : v)),
});

const nameInputs = new Map<string, HTMLInputElement>();
async function add() {
  const id = crypto.randomUUID();
  const name = nextVariableName(list.value);
  const message = await editor.updateVariables((doc) => ({
    ...doc,
    variables: [...(doc.variables ?? []), { id, name, kind: "length", value: "0" }],
  }));
  if (message) {
    editor.message = message;
    editor.notify();
    return;
  }
  await nextTick();
  nameInputs.get(id)?.focus();
  nameInputs.get(id)?.select();
}

function nameInput(v: Variable, event: Event) {
  const text = (event.target as HTMLInputElement).value;
  nameDrafts.value = { ...nameDrafts.value, [v.id]: text };
  const message = variableNameError(text, list.value, v.id);
  if (message) errors.value = { ...errors.value, [v.id]: message };
  else {
    const { [v.id]: _, ...rest } = errors.value;
    errors.value = rest;
  }
}
async function commitName(v: Variable) {
  const text = nameDrafts.value[v.id];
  const { [v.id]: _, ...rest } = nameDrafts.value;
  nameDrafts.value = rest;
  if (text === undefined || text === v.name) return;
  if (variableNameError(text, list.value, v.id)) {
    const { [v.id]: _e, ...others } = errors.value;
    errors.value = others;
    return;
  }
  await apply(v.id, (doc) => renameVariable(doc, v.id, text));
}
function cancelName(v: Variable, event: KeyboardEvent) {
  event.stopPropagation();
  const { [v.id]: _, ...rest } = nameDrafts.value;
  nameDrafts.value = rest;
  const { [v.id]: _e, ...others } = errors.value;
  errors.value = others;
  (event.target as HTMLInputElement).blur();
}

async function changeKind(v: Variable, kind: Variable["kind"], select: HTMLSelectElement) {
  // Keep what the user sees: text takes the current value, numbers keep their formula.
  const patch: Partial<Variable> =
    kind === "text"
      ? { kind, value: resolvedText(v).replace(/ (mm|in)$/, ""), unit: undefined }
      : v.kind === "text"
        ? { kind, value: parseExpression(v.value) === null ? "0" : v.value, unit: bindingUnit(e.value.units) }
        : { kind };
  const message = await apply(v.id, replace(v.id, patch));
  if (message) select.value = v.kind;
}

function valueFocus(v: Variable, event: FocusEvent) {
  const input = event.target as HTMLInputElement;
  const initial = editableValue(v);
  valueDrafts.value = { ...valueDrafts.value, [v.id]: initial };
  input.value = initial;
  if (v.kind !== "text") input.select();
  editor.beginProperty();
}
async function valueInput(v: Variable, event: Event) {
  const input = event.target as HTMLInputElement;
  const text = input.value;
  valueDrafts.value = { ...valueDrafts.value, [v.id]: text };
  if (v.kind === "text") {
    await apply(v.id, replace(v.id, { value: text }));
    return;
  }
  suggestions.update(input);
  if (!text.trim() || evaluate(v, text) === null) {
    errors.value = { ...errors.value, [v.id]: "Enter a valid formula" };
    return;
  }
  await apply(v.id, replace(v.id, { value: text.trim(), unit: bindingUnit(unitsFor(v, text)) }));
}
async function valueBlur(v: Variable) {
  suggestions.close();
  const { [v.id]: _, ...rest } = valueDrafts.value;
  valueDrafts.value = rest;
  const { [v.id]: _e, ...others } = errors.value;
  errors.value = others;
  // Leaving keeps the last valid value; an invalid draft is discarded.
  await editor.finishProperty();
}
function valueKey(v: Variable, event: KeyboardEvent) {
  if (event.isComposing || suggestions.key(event)) return;
  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
  if (event.key === "Escape") {
    event.stopPropagation();
    const { [v.id]: _, ...rest } = valueDrafts.value;
    valueDrafts.value = rest;
    const { [v.id]: _e, ...others } = errors.value;
    errors.value = others;
    void editor.finishProperty(true);
    (event.target as HTMLInputElement).blur();
  }
}
const suggestions = useVariableSuggestions(values, ["length", "number"]);
const activeSuggestions = ref<string | null>(null);
function registerValue(v: Variable, el: unknown) {
  if (el instanceof HTMLInputElement && v.kind !== "text") numericReaders.set(el, (text) => evaluate(v, text));
}

async function remove(v: Variable) {
  if (variableUses(e.value.variableDocument, v.name) && confirmDelete.value !== v.id) {
    confirmDelete.value = v.id;
    return;
  }
  confirmDelete.value = null;
  await apply(v.id, (doc) => deleteVariable(doc, v.id));
}
</script>
<template>
  <PinnablePopover v-model:open="open" label="Variables" storage-key="variables" content-class="variables-content" align="center">
    <template #trigger>Variables<span v-if="list.length" class="variable-count" aria-hidden="true" :title="`${list.length} variables`">{{ list.length }}</span></template>
    <p class="variables-help">
      Use names in any number field, such as <code>card_w + 2*t</code>, and <code>{name}</code> in names and text.
    </p>
    <table v-if="list.length" class="variables-table">
      <colgroup><col class="col-name" /><col class="col-type" /><col /><col class="col-action" /></colgroup>
      <thead>
        <tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Value</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr>
      </thead>
      <tbody>
        <template v-for="v in list" :key="v.id">
          <tr>
            <td>
              <input
                :ref="(el) => el && nameInputs.set(v.id, el as HTMLInputElement)"
                class="variable-name"
                type="text"
                maxlength="64"
                spellcheck="false"
                :aria-label="`Name of ${v.name}`"
                :aria-invalid="v.id in nameDrafts && v.id in errors"
                :value="nameDrafts[v.id] ?? v.name"
                @input="nameInput(v, $event)"
                @blur="commitName(v)"
                @keydown.enter="($event.target as HTMLInputElement).blur()"
                @keydown.esc="cancelName(v, $event)"
              />
            </td>
            <td>
              <select :aria-label="`Type of ${v.name}`" :value="v.kind" @change="changeKind(v, ($event.target as HTMLSelectElement).value as Variable['kind'], $event.target as HTMLSelectElement)">
                <option v-for="(label, kind) in kindLabels" :key="kind" :value="kind">{{ label }}</option>
              </select>
            </td>
            <td>
              <span class="variable-value">
                <input
                  :ref="(el) => registerValue(v, el)"
                  v-numeric-wheel="v.kind === 'text' ? false : v.kind === 'length' ? e.units : 'number'"
                  type="text"
                  step="0.1"
                  :maxlength="2000"
                  spellcheck="false"
                  :aria-label="`Value of ${v.name}${v.kind === 'length' ? ` (${e.unitSymbol})` : ''}`"
                  :aria-invalid="v.id in valueDrafts && v.id in errors"
                  :aria-autocomplete="v.kind === 'text' ? undefined : 'list'"
                  :value="shownValue(v)"
                  @focus="activeSuggestions = v.id; valueFocus(v, $event)"
                  @input="valueInput(v, $event)"
                  @blur="valueBlur(v)"
                  @keydown="valueKey(v, $event)"
                />
                <small v-if="unitTag(v)" class="formula-unit">{{ unitTag(v) }}</small>
                <small v-else-if="v.kind === 'length' && !(v.id in valueDrafts)" class="formula-unit">{{ e.unitSymbol }}</small>
                <VariableSuggestions
                  v-if="activeSuggestions === v.id"
                  :id="`variable-suggestions-${v.id}`"
                  :suggestions="suggestions.suggestions.value.filter((name) => name !== v.name)"
                  :highlight="suggestions.highlight.value"
                  @choose="suggestions.choose"
                />
              </span>
              <small v-if="hasFormula(v) && !(v.id in valueDrafts)" class="variable-resolved">= {{ resolvedText(v) }}</small>
            </td>
            <td>
              <button type="button" class="variable-delete" :aria-label="`Delete ${v.name}`" title="Delete variable" @click="remove(v)">×</button>
            </td>
          </tr>
          <tr v-if="confirmDelete === v.id" class="variable-message">
            <td colspan="4">
              <span role="alert">{{ v.name }} is used {{ variableUses(e.variableDocument, v.name) }}×. Delete it and keep the current values?</span>
              <span class="variable-confirm">
                <button type="button" @click="remove(v)">Delete and keep values</button>
                <button type="button" @click="confirmDelete = null">Cancel</button>
              </span>
            </td>
          </tr>
          <tr v-else-if="errors[v.id]" class="variable-message">
            <td colspan="4"><small role="alert">{{ errors[v.id] }}</small></td>
          </tr>
        </template>
      </tbody>
    </table>
    <p v-else class="variables-empty">No variables yet.</p>
    <button type="button" class="variable-add" :disabled="!e.ready || list.length >= 500" @click="add">+ Add variable</button>
  </PinnablePopover>
</template>
<style scoped>
.variable-count {
  margin-left: 2px; padding: 0 5px; border-radius: 8px; background: var(--border); color: var(--text); font-size: 10px;
}
.variables-help, .variables-empty { margin: 0 0 10px; color: var(--muted); font-size: 11px; line-height: 1.4; }
.variables-help code { color: var(--text); }
.variables-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; table-layout: fixed; }
.col-name { width: 30%; }
.col-type { width: 84px; }
.col-action { width: 28px; }
.variables-table th { text-align: left; font-weight: normal; font-size: 10px; color: var(--muted); padding: 0 4px 4px 0; }
.variables-table td { padding: 0 4px 6px 0; vertical-align: top; }
.variables-table input, .variables-table select { margin: 0 !important; width: 100%; min-width: 0; font: inherit; font-size: 12px; padding: 6px !important; }
.variables-table input { font-family: monospace; }
.variable-value { position: relative; display: block; }
.variable-value input { padding-right: 22px !important; }
.formula-unit { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 10px; pointer-events: none; }
.variable-resolved { display: block; margin-top: 2px; color: var(--muted); font-size: 10px; }
.variable-delete { width: 24px; height: 28px; padding: 0; background: transparent; color: var(--muted); font-size: 16px; }
.variable-delete:hover { color: var(--accent); }
.variable-message td { padding-top: 0; font-size: 11px; color: #ed907f; }
.variable-confirm { display: flex; gap: 6px; margin-top: 6px; }
.variable-confirm button { font-size: 11px; padding: 4px 8px; }
.variable-add { width: 100%; padding: 6px; font-size: 12px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
