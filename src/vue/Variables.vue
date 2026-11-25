<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import PinnablePopover from "./PinnablePopover.vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import { numericReaders } from "./numericWheel";
import { editableNumber, formulaReferences, parseExpression } from "../model/expression";
import { bakeFormula, bakeText, detectKind, nextVariableName, variableNameError, type Variable } from "../model/variables";
import { deleteVariable, renameVariable, variableUses } from "../model/bindings";
const e = useEditor();
const open = ref(false);
const list = computed(() => e.value.variableDocument.variables ?? []);
const values = () => e.value.variableScope.values;
const errors = ref<Record<string, string>>({});
const nameDrafts = ref<Record<string, string>>({});
const valueDrafts = ref<Record<string, string>>({});
const confirmDelete = ref<string | null>(null);

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
  for (const name of formulaReferences(text)) {
    if (name === v.name) return `${v.name} cannot refer to itself`;
    const other = list.value.find((item) => item.name === name);
    if (!other) return `Unknown variable ${name}`;
    if (other.kind === "text") return `${name} is text`;
    // It exists but cannot be resolved: report its own problem.
    const problem = e.value.variableScope.errors.get(other.id);
    if (problem) return `${name} is invalid: ${problem}`;
  }
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
/**
 * The last row is always empty. It becomes a variable as soon as it has a valid name and
 * value; it keeps its id, so the inputs being typed in stay focused, and a new empty row
 * appears below.
 */
const draftId = ref(crypto.randomUUID());
const rows = computed(() => [
  ...list.value.map((v) => ({ v, draft: false })),
  { v: { id: draftId.value, name: "", kind: "text", value: "" } as Variable, draft: true },
]);

/** Each row is edited in one property session: one undo step, Esc reverts the row. */
function rowFocus() {
  editor.beginVariableEdit();
}
function rowLeave(id: string, event: FocusEvent) {
  const row = event.currentTarget as HTMLElement;
  if (row.contains(event.relatedTarget as Node | null)) return;
  if (id !== draftId.value) {
    // A pending rename joins this row's edit, so it is committed with it right now.
    const v = list.value.find((item) => item.id === id), text = nameDrafts.value[id]?.trim();
    if (v && text && text !== v.name && !variableNameError(text, list.value, id)) {
      const message = editor.stageVariables((doc) => renameVariable(doc, id, text));
      if (message) editor.message = message;
    }
    clearDraft(nameDrafts, id);
    clearDraft(valueDrafts, id);
    setError(id, null);
  }
  // Commit before anything else can run (such as a tool chosen by this click), so the
  // whole editor sees the edited values. Leaving keeps the last valid values.
  void editor.finishProperty();
}
function rowEscape(id: string, event: KeyboardEvent) {
  event.stopPropagation();
  clearDraft(nameDrafts, id);
  clearDraft(valueDrafts, id);
  setError(id, null);
  void editor.finishProperty(true);
  (event.target as HTMLInputElement).blur();
}

let creating = false, creation: Promise<void> = Promise.resolve();
function tryCreate() {
  creation = creation.then(createDraft);
  return creation;
}
async function createDraft() {
  const id = draftId.value;
  const name = nameDrafts.value[id]?.trim() ?? "", value = valueDrafts.value[id] ?? "";
  if (creating || !name || !value.trim()) return;
  const kind = detectKind(value, list.value);
  const error = variableNameError(name, list.value) ?? (kind === "number" ? formulaError({ name }, value) : null);
  if (error) return setError(id, error);
  creating = true;
  try {
    editor.beginVariableEdit();
    const message = await editor.updateVariables((doc) => ({
      ...doc,
      variables: [...(doc.variables ?? []), { id, name, kind, value: stored(kind, value) }],
    }));
    setError(id, message);
    if (message) return;
    draftId.value = crypto.randomUUID();
  } finally {
    creating = false;
  }
  // Apply anything typed while the variable was being created; matching drafts are done.
  const created = list.value.find((v) => v.id === id);
  if (created) {
    if (nameDrafts.value[id] !== undefined && nameDrafts.value[id].trim() !== created.name) await applyName(created, nameDrafts.value[id]);
    else clearDraft(nameDrafts, id);
    if (valueDrafts.value[id] !== undefined && valueDrafts.value[id] !== created.value) await applyValue(created, valueDrafts.value[id]);
    else clearDraft(valueDrafts, id);
  }
}

async function applyName(v: Variable, text: string) {
  const error = variableNameError(text.trim(), list.value, v.id);
  if (error) return setError(v.id, error);
  await apply(v.id, (doc) => renameVariable(doc, v.id, text.trim()));
}
async function applyValue(v: Variable, text: string) {
  const kind = detectKind(text, list.value);
  const error = kind === "number" ? formulaError(v, text) : null;
  if (error) return setError(v.id, error);
  await apply(v.id, replace(v.id, { kind, value: stored(kind, text) }));
}
/** `{=name}` copies a value in once: written in as a number or as literal text. */
function stored(kind: Variable["kind"], text: string) {
  return kind === "number" ? bakeFormula(text.trim(), values()) : bakeText(text, values());
}

function nameInput(row: { v: Variable; draft: boolean }, event: Event) {
  const text = (event.target as HTMLInputElement).value;
  nameDrafts.value = { ...nameDrafts.value, [row.v.id]: text };
  if (row.draft) {
    setError(row.v.id, text.trim() ? variableNameError(text.trim(), list.value) : null);
    return tryCreate();
  }
  // Renames apply on Enter or when leaving the row, so lists never show a half-typed name.
  setError(row.v.id, variableNameError(text.trim(), list.value, row.v.id));
}
async function commitName(id: string) {
  const v = list.value.find((item) => item.id === id), text = nameDrafts.value[id];
  if (!v || text === undefined) return;
  clearDraft(nameDrafts, id);
  if (text.trim() === v.name) return;
  if (variableNameError(text.trim(), list.value, id)) return setError(id, null);
  // A rename is its own committed step, so every list shows the new name at once.
  await editor.finishProperty();
  await applyName(v, text);
  editor.beginVariableEdit();
}
function valueInput(row: { v: Variable; draft: boolean }, event: Event) {
  const input = event.target as HTMLInputElement;
  valueDrafts.value = { ...valueDrafts.value, [row.v.id]: input.value };
  if (row.draft) {
    setError(row.v.id, null);
    return tryCreate();
  }
  if (!creating) return applyValue(row.v, input.value);
}
function valueFocus(row: { v: Variable; draft: boolean }, event: FocusEvent) {
  rowFocus();
  if (!row.draft && row.v.kind === "number") (event.target as HTMLInputElement).select();
}
/** Enter moves on like a table: name → value → next row's name. */
async function enter(row: { v: Variable }, field: "name" | "value", event: KeyboardEvent) {
  event.preventDefault();
  const input = event.target as HTMLInputElement;
  // Only move focus if it did not go elsewhere while a change was being applied.
  const stillHere = () => document.activeElement === input;
  if (field === "name") {
    if (row.v.id !== draftId.value) await commitName(row.v.id);
    if (stillHere()) valueInputs.get(row.v.id)?.focus();
    return;
  }
  await creation;
  const index = rows.value.findIndex((r) => r.v.id === row.v.id);
  await nextTick();
  if (!stillHere()) return;
  const next = rows.value[index + 1]?.v.id;
  if (next) nameInputs.get(next)?.focus();
  else input.blur();
}
function valueKey(row: { v: Variable }, event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === "Enter") void enter(row, "value", event);
  else if (event.key === "Escape") rowEscape(row.v.id, event);
}
function registerValue(id: string, el: unknown) {
  if (!(el instanceof HTMLInputElement)) return;
  valueInputs.set(id, el);
  numericReaders.set(el, (text) => evaluate({ name: list.value.find((v) => v.id === id)?.name ?? "" }, text));
}
/** Text values are not stepped by arrows or Alt+wheel. */
const wheelMode = (id: string) => {
  const v = list.value.find((item) => item.id === id);
  const text = valueDrafts.value[id] ?? v?.value ?? "";
  return detectKind(text, list.value) === "number" ? "number" : false;
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
      Values are plain numbers or text. Type <code>{</code> to use a variable: <code>{card_w}</code> stays linked, <code>{=card_w}</code> copies the current value once.
    </p>
    <p v-if="e.ready && !e.canEditVariables" class="variables-paused" role="status">Apply or cancel the active tool to edit variables.</p>
    <table class="variables-table">
      <colgroup><col class="col-name" /><col /><col class="col-action" /></colgroup>
      <thead>
        <tr><th scope="col">Name</th><th scope="col">Value</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr>
      </thead>
      <tbody>
        <template v-for="row in rows" :key="row.v.id">
          <tr :class="{ 'variable-new': row.draft }" @focusin="rowFocus" @focusout="rowLeave(row.v.id, $event)">
            <td>
              <input
                :ref="(el) => el && nameInputs.set(row.v.id, el as HTMLInputElement)"
                class="variable-name"
                type="text"
                maxlength="64"
                spellcheck="false"
                :placeholder="row.draft ? 'New name' : undefined"
                :aria-label="row.draft ? 'New variable name' : `Name of ${row.v.name}`"
                :aria-invalid="row.v.id in nameDrafts && row.v.id in errors && !!variableNameError((nameDrafts[row.v.id] ?? '').trim(), list, row.draft ? undefined : row.v.id)"
                :disabled="!e.canEditVariables || (row.draft && list.length >= 500)"
                :value="nameDrafts[row.v.id] ?? row.v.name"
                @input="nameInput(row, $event)"
                @keydown.enter="enter(row, 'name', $event)"
                @keydown.esc="rowEscape(row.v.id, $event)"
              />
            </td>
            <td>
              <span class="variable-value">
                <input
                  :ref="(el) => registerValue(row.v.id, el)"
                  v-numeric-wheel="wheelMode(row.v.id)"
                  type="text"
                  step="0.1"
                  :maxlength="2000"
                  spellcheck="false"
                  :placeholder="row.draft ? 'Value' : undefined"
                  :aria-label="row.draft ? 'New variable value' : `Value of ${row.v.name}`"
                  :aria-invalid="row.v.id in valueDrafts && row.v.id in errors"
                  v-variable-hints="{ kinds: 'all', exclude: row.v.name }"
                  :disabled="!e.canEditVariables || (row.draft && list.length >= 500)"
                  :value="valueDrafts[row.v.id] ?? row.v.value"
                  @focus="valueFocus(row, $event)"
                  @input="valueInput(row, $event)"
                  @keydown="valueKey(row, $event)"
                />
                <small v-if="!row.draft && row.v.kind === 'text' && row.v.value" class="value-kind" title="Detected as text: fills {name} placeholders">text</small>
              </span>
              <small v-if="hasFormula(row.v)" class="variable-resolved">= {{ resolvedText(row.v) }}</small>
            </td>
            <td>
              <button v-if="!row.draft" type="button" class="variable-delete" :disabled="!e.canEditVariables" :aria-label="`Delete ${row.v.name}`" title="Delete variable" @click="remove(row.v)">×</button>
            </td>
          </tr>
          <tr v-if="confirmDelete === row.v.id" class="variable-message">
            <td colspan="3">
              <span role="alert">{{ row.v.name }} is used {{ variableUses(e.variableDocument, row.v.name) }}×. Delete it and keep the current values?</span>
              <span class="variable-confirm">
                <button type="button" @click="remove(row.v)">Delete and keep values</button>
                <button type="button" @click="confirmDelete = null">Cancel</button>
              </span>
            </td>
          </tr>
          <tr v-else-if="errors[row.v.id]" class="variable-message">
            <td colspan="3"><small role="alert">{{ errors[row.v.id] }}</small></td>
          </tr>
        </template>
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
.variables-paused { margin: 0 0 10px; color: var(--accent); font-size: 11px; }
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
