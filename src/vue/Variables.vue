<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import PinnablePopover from "./PinnablePopover.vue";
import VariableSuggestions from "./VariableSuggestions.vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { useVariableSuggestions } from "./variableInput";
import { numericReaders } from "./numericWheel";
import { editableNumber, formulaReferences, parseExpression } from "../model/expression";
import { detectKind, nextVariableName, variableNameError, type Variable } from "../model/variables";
import { deleteVariable, renameVariable, variableUses } from "../model/bindings";
const e = useEditor();
const open = ref(false);
const list = computed(() => e.value.variableDocument.variables ?? []);
const values = () => e.value.variableScope.values;
const errors = ref<Record<string, string>>({});
const nameDrafts = ref<Record<string, string>>({});
const valueDrafts = ref<Record<string, string>>({});
const confirmDelete = ref<string | null>(null);
/** Key of the always-present empty row that creates a variable. */
const NEW = "new";

const hasFormula = (v: Variable) => v.kind === "number" && formulaReferences(v.value).length > 0;
function resolvedText(v: Variable) {
  const value = values().get(v.name);
  return value ? (value.kind === "text" ? value.value : editableNumber(value.value)) : "";
}
function setError(id: string, message: string | null) {
  const { [id]: _, ...rest } = errors.value;
  errors.value = message ? { ...rest, [id]: message } : rest;
}
function clearDraft(drafts: typeof nameDrafts, id: string) {
  const { [id]: _, ...rest } = drafts.value;
  drafts.value = rest;
}
/** Plain numbers; other number variables resolve, text variables do not. */
function evaluate(v: Pick<Variable, "name">, text: string): number | null {
  return parseExpression(text, true, (name) => {
    const other = values().get(name);
    return other && other.kind === "number" && name !== v.name ? other.value : null;
  });
}
function formulaError(v: Pick<Variable, "name">, text: string) {
  const unknown = formulaReferences(text).find((name) => name === v.name || values().get(name)?.kind !== "number");
  if (unknown === v.name) return `${v.name} cannot refer to itself`;
  if (unknown) return values().has(unknown) ? `${unknown} is text` : `Unknown variable ${unknown}`;
  return evaluate(v, text) === null ? "Enter a valid formula" : null;
}

async function apply(id: string, change: Parameters<typeof editor.updateVariables>[0]) {
  const message = await editor.updateVariables(change);
  setError(id, message);
  return message;
}
const replace = (id: string, patch: Partial<Variable>) => (doc: typeof e.value.document) => ({
  ...doc,
  variables: (doc.variables ?? []).map((v) => (v.id === id ? { ...v, ...patch } : v)),
});

const nameInputs = new Map<string, HTMLInputElement>();
const valueInputs = new Map<string, HTMLInputElement>();

function nameInput(id: string, event: Event) {
  const text = (event.target as HTMLInputElement).value;
  nameDrafts.value = { ...nameDrafts.value, [id]: text };
  setError(id, id === NEW && !text ? null : variableNameError(text, list.value, id === NEW ? undefined : id));
}
async function commitName(v: Variable) {
  const text = nameDrafts.value[v.id];
  clearDraft(nameDrafts, v.id);
  if (text === undefined || text === v.name) return;
  if (variableNameError(text, list.value, v.id)) return setError(v.id, null);
  await apply(v.id, (doc) => renameVariable(doc, v.id, text));
}
function cancelName(id: string, event: KeyboardEvent) {
  event.stopPropagation();
  clearDraft(nameDrafts, id);
  setError(id, null);
  (event.target as HTMLInputElement).blur();
}

/** Create a variable from the empty row once focus leaves it or Enter confirms it. */
let creating = false, queued = false;
async function commitNew(): Promise<void> {
  if (creating) {
    queued = true;
    return;
  }
  const typedName = nameDrafts.value[NEW], typedValue = valueDrafts.value[NEW];
  const name = typedName?.trim() || "", value = typedValue ?? "";
  if (!name && !value.trim()) return;
  const finalName = name || nextVariableName(list.value);
  const nameError = variableNameError(finalName, list.value);
  const kind = detectKind(value, list.value);
  const error = nameError ?? (kind === "number" ? formulaError({ name: finalName }, value) : null);
  if (error) return setError(NEW, error);
  creating = true;
  try {
    const id = crypto.randomUUID();
    const message = await editor.updateVariables((doc) => ({
      ...doc,
      variables: [...(doc.variables ?? []), { id, name: finalName, kind, value: value.trim() }],
    }));
    if (message) return setError(NEW, message);
    // Keep anything typed into the empty row while this one was being saved.
    if (nameDrafts.value[NEW] === typedName) clearDraft(nameDrafts, NEW);
    if (valueDrafts.value[NEW] === typedValue) clearDraft(valueDrafts, NEW);
    setError(NEW, null);
  } finally {
    creating = false;
  }
  if (queued) {
    queued = false;
    return commitNew();
  }
  await nextTick();
  if (!nameDrafts.value[NEW] && !valueDrafts.value[NEW]) nameInputs.get(NEW)?.focus();
}
function leaveNewRow(event: FocusEvent) {
  const row = event.currentTarget as HTMLElement;
  if (!row.contains(event.relatedTarget as Node | null)) void commitNew();
}
function newKey(event: KeyboardEvent, field: "name" | "value") {
  if (event.isComposing || (field === "value" && suggestions.key(event))) return;
  if (event.key === "Enter") {
    event.preventDefault();
    if (field === "name" && !valueDrafts.value[NEW]) valueInputs.get(NEW)?.focus();
    else void commitNew();
  } else if (event.key === "Escape") {
    event.stopPropagation();
    clearDraft(nameDrafts, NEW);
    clearDraft(valueDrafts, NEW);
    setError(NEW, null);
  }
}
function newValueInput(event: Event) {
  const input = event.target as HTMLInputElement;
  valueDrafts.value = { ...valueDrafts.value, [NEW]: input.value };
  suggestions.update(input);
  setError(NEW, null);
}

function valueFocus(v: Variable, event: FocusEvent) {
  const input = event.target as HTMLInputElement;
  valueDrafts.value = { ...valueDrafts.value, [v.id]: v.value };
  input.value = v.value;
  if (v.kind === "number") input.select();
  editor.beginProperty();
}
async function valueInput(v: Variable, event: Event) {
  const input = event.target as HTMLInputElement;
  const text = input.value;
  valueDrafts.value = { ...valueDrafts.value, [v.id]: text };
  suggestions.update(input);
  const kind = detectKind(text, list.value, v.name);
  const error = kind === "number" ? formulaError(v, text) : null;
  if (error) return setError(v.id, error);
  await apply(v.id, replace(v.id, { kind, value: kind === "number" ? text.trim() : text }));
}
async function valueBlur(v: Variable) {
  suggestions.close();
  clearDraft(valueDrafts, v.id);
  setError(v.id, null);
  // Leaving keeps the last valid value; an invalid draft is discarded.
  await editor.finishProperty();
}
function valueKey(v: Variable, event: KeyboardEvent) {
  if (event.isComposing || suggestions.key(event)) return;
  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
  if (event.key === "Escape") {
    event.stopPropagation();
    clearDraft(valueDrafts, v.id);
    setError(v.id, null);
    void editor.finishProperty(true);
    (event.target as HTMLInputElement).blur();
  }
}
const suggestions = useVariableSuggestions(values, ["number"]);
const activeSuggestions = ref<string | null>(null);
function registerValue(id: string, el: unknown) {
  if (!(el instanceof HTMLInputElement)) return;
  valueInputs.set(id, el);
  const name = id === NEW ? "" : list.value.find((v) => v.id === id)?.name ?? "";
  numericReaders.set(el, (text) => evaluate({ name }, text));
}
/** Text values are not stepped by arrows or Alt+wheel. */
const wheelMode = (id: string) => {
  const v = list.value.find((item) => item.id === id);
  const text = valueDrafts.value[id] ?? v?.value ?? "";
  return detectKind(text, list.value, v?.name) === "number" ? "number" : false;
};

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
      Values are plain numbers or text. Use names in number fields, such as <code>card_w + 2*t</code>, and <code>{name}</code> in names and labels.
    </p>
    <table class="variables-table">
      <colgroup><col class="col-name" /><col /><col class="col-action" /></colgroup>
      <thead>
        <tr><th scope="col">Name</th><th scope="col">Value</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr>
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
                @input="nameInput(v.id, $event)"
                @blur="commitName(v)"
                @keydown.enter="($event.target as HTMLInputElement).blur()"
                @keydown.esc="cancelName(v.id, $event)"
              />
            </td>
            <td>
              <span class="variable-value">
                <input
                  :ref="(el) => registerValue(v.id, el)"
                  v-numeric-wheel="wheelMode(v.id)"
                  type="text"
                  step="0.1"
                  :maxlength="2000"
                  spellcheck="false"
                  :aria-label="`Value of ${v.name}`"
                  :aria-invalid="v.id in valueDrafts && v.id in errors"
                  aria-autocomplete="list"
                  :value="valueDrafts[v.id] ?? v.value"
                  @focus="activeSuggestions = v.id; valueFocus(v, $event)"
                  @input="valueInput(v, $event)"
                  @blur="valueBlur(v)"
                  @keydown="valueKey(v, $event)"
                />
                <small v-if="v.kind === 'text' && v.value && !(v.id in valueDrafts)" class="value-kind" title="Detected as text: fills {name} placeholders">text</small>
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
            <td colspan="3">
              <span role="alert">{{ v.name }} is used {{ variableUses(e.variableDocument, v.name) }}×. Delete it and keep the current values?</span>
              <span class="variable-confirm">
                <button type="button" @click="remove(v)">Delete and keep values</button>
                <button type="button" @click="confirmDelete = null">Cancel</button>
              </span>
            </td>
          </tr>
          <tr v-else-if="errors[v.id]" class="variable-message">
            <td colspan="3"><small role="alert">{{ errors[v.id] }}</small></td>
          </tr>
        </template>
        <tr class="variable-new" @focusout="leaveNewRow">
          <td>
            <input
              :ref="(el) => el && nameInputs.set(NEW, el as HTMLInputElement)"
              class="variable-name"
              type="text"
              maxlength="64"
              spellcheck="false"
              placeholder="New name"
              aria-label="New variable name"
              :aria-invalid="NEW in errors"
              :disabled="!e.ready || list.length >= 500"
              :value="nameDrafts[NEW] ?? ''"
              @input="nameInput(NEW, $event)"
              @keydown="newKey($event, 'name')"
            />
          </td>
          <td>
            <span class="variable-value">
              <input
                :ref="(el) => registerValue(NEW, el)"
                v-numeric-wheel="wheelMode(NEW)"
                type="text"
                step="0.1"
                :maxlength="2000"
                spellcheck="false"
                placeholder="Value"
                aria-label="New variable value"
                aria-autocomplete="list"
                :disabled="!e.ready || list.length >= 500"
                :value="valueDrafts[NEW] ?? ''"
                @focus="activeSuggestions = NEW"
                @input="newValueInput"
                @keydown="newKey($event, 'value')"
              />
              <VariableSuggestions
                v-if="activeSuggestions === NEW"
                id="variable-suggestions-new"
                :suggestions="suggestions.suggestions.value"
                :highlight="suggestions.highlight.value"
                @choose="suggestions.choose"
              />
            </span>
          </td>
          <td></td>
        </tr>
        <tr v-if="errors[NEW]" class="variable-message">
          <td colspan="3"><small role="alert">{{ errors[NEW] }}</small></td>
        </tr>
      </tbody>
    </table>
  </PinnablePopover>
</template>
<style scoped>
.variable-count {
  margin-left: 2px; padding: 0 5px; border-radius: 8px; background: var(--border); color: var(--text); font-size: 10px;
}
.variables-help { margin: 0 0 10px; color: var(--muted); font-size: 11px; line-height: 1.4; }
.variables-help code { color: var(--text); }
.variables-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.col-name { width: 38%; }
.col-action { width: 28px; }
.variables-table th { text-align: left; font-weight: normal; font-size: 10px; color: var(--muted); padding: 0 4px 4px 0; }
.variables-table td { padding: 0 4px 6px 0; vertical-align: top; }
.variables-table input { margin: 0 !important; width: 100%; min-width: 0; font: inherit; font-size: 12px; font-family: monospace; padding: 6px !important; }
.variable-new input:not(:focus):placeholder-shown { border-style: dashed; }
.variable-value { position: relative; display: block; }
.variable-value input { padding-right: 30px !important; }
.value-kind { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 10px; pointer-events: none; }
.variable-resolved { display: block; margin-top: 2px; color: var(--muted); font-size: 10px; }
.variable-delete { width: 24px; height: 28px; padding: 0; background: transparent; color: var(--muted); font-size: 16px; }
.variable-delete:hover { color: var(--accent); }
.variable-message td { padding-top: 0; font-size: 11px; color: #ed907f; }
.variable-confirm { display: flex; gap: 6px; margin-top: 6px; }
.variable-confirm button { font-size: 11px; padding: 4px 8px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
