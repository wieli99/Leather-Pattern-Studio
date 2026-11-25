import type { ObjectDirective } from "vue";
import { editor } from "../editor/instance";
import type { VariableValue } from "../model/variables";

/**
 * Suggest `{name}` variables while typing after `{`. Number fields list number variables;
 * names and labels list all of them. Arrow keys move through open suggestions; Enter or Tab
 * inserts the highlighted one; Esc closes the list without leaving the field.
 */
export type HintOptions = false | "number" | "all" | { kinds: "number" | "all"; exclude?: string };
type State = { list: HTMLUListElement; items: string[]; highlight: number; options: HintOptions; cleanup: () => void };
const states = new WeakMap<HTMLInputElement | HTMLTextAreaElement, State>();
let counter = 0;

function prefixAt(el: HTMLInputElement | HTMLTextAreaElement) {
  const before = el.value.slice(0, el.selectionStart ?? el.value.length);
  const match = /\{([A-Za-z0-9_]*)$/.exec(before);
  // `{{` writes a literal brace in names and labels.
  if (!match || before[match.index - 1] === "{") return null;
  return { start: match.index, typed: match[1] };
}

function candidates(options: HintOptions, typed: string) {
  if (!options) return [];
  const kinds = typeof options === "string" ? options : options.kinds;
  const exclude = typeof options === "string" ? undefined : options.exclude;
  const lower = typed.toLowerCase();
  return [...(editor.variableScope.values as Map<string, VariableValue>)]
    .filter(([name, v]) => (kinds === "all" || v.kind === "number") && name !== exclude && name.toLowerCase().startsWith(lower))
    .map(([name]) => name)
    .sort()
    .slice(0, 8);
}

function render(el: HTMLInputElement | HTMLTextAreaElement, state: State) {
  const { list } = state;
  if (!state.items.length || document.activeElement !== el) {
    list.hidden = true;
    el.setAttribute("aria-expanded", "false");
    el.removeAttribute("aria-activedescendant");
    return;
  }
  list.replaceChildren(...state.items.map((name, i) => {
    const item = document.createElement("li");
    item.id = `${list.id}-${i}`;
    item.role = "option";
    item.textContent = `{${name}}`;
    item.setAttribute("aria-selected", String(i === state.highlight));
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      choose(el, state, name);
    });
    return item;
  }));
  const rect = el.getBoundingClientRect();
  list.style.left = `${rect.left}px`;
  list.style.top = `${rect.bottom + 2}px`;
  list.style.minWidth = `${Math.min(rect.width, 240)}px`;
  list.hidden = false;
  el.setAttribute("aria-expanded", "true");
  if (state.highlight >= 0) el.setAttribute("aria-activedescendant", `${list.id}-${state.highlight}`);
  else el.removeAttribute("aria-activedescendant");
}

function update(el: HTMLInputElement | HTMLTextAreaElement, state: State) {
  const prefix = prefixAt(el);
  const items = prefix ? candidates(state.options, prefix.typed) : [];
  // A complete, closed reference needs no list.
  const complete = prefix && items.length === 1 && items[0] === prefix.typed && el.value[el.selectionStart ?? 0] === "}";
  state.items = complete ? [] : items;
  if (state.highlight >= state.items.length) state.highlight = -1;
  render(el, state);
}

function choose(el: HTMLInputElement | HTMLTextAreaElement, state: State, name: string) {
  const prefix = prefixAt(el);
  if (!prefix) return;
  const caret = el.selectionStart ?? el.value.length;
  const after = el.value.slice(caret).replace(/^[A-Za-z0-9_]*\}?/, "");
  el.value = `${el.value.slice(0, prefix.start)}{${name}}${after}`;
  const position = prefix.start + name.length + 2;
  el.setSelectionRange(position, position);
  state.items = [];
  state.highlight = -1;
  render(el, state);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function key(el: HTMLInputElement | HTMLTextAreaElement, state: State, event: KeyboardEvent) {
  if (!state.items.length || event.isComposing) return;
  const count = state.items.length;
  if (event.key === "ArrowDown") state.highlight = (state.highlight + 1) % count;
  else if (event.key === "ArrowUp") state.highlight = (state.highlight - 1 + count) % count;
  else if ((event.key === "Enter" || event.key === "Tab") && state.highlight >= 0) choose(el, state, state.items[state.highlight]);
  else if (event.key === "Tab" && count === 1) choose(el, state, state.items[0]);
  else if (event.key === "Escape") state.items = [];
  else return;
  // Runs in the capture phase so field and numeric-step handlers do not see these keys.
  event.preventDefault();
  event.stopImmediatePropagation();
  render(el, state);
}

export const variableHints: ObjectDirective<HTMLInputElement | HTMLTextAreaElement, HintOptions> = {
  mounted(el, binding) {
    const list = document.createElement("ul");
    list.id = `variable-hints-${++counter}`;
    list.className = "variable-hints";
    list.role = "listbox";
    list.setAttribute("aria-label", "Variables");
    list.hidden = true;
    document.body.append(list);
    const state: State = { list, items: [], highlight: -1, options: binding.value, cleanup: () => {} };
    const refresh = () => update(el, state);
    const keydown = (event: Event) => key(el, state, event as KeyboardEvent);
    const close = () => {
      state.items = [];
      render(el, state);
    };
    el.addEventListener("input", refresh);
    el.addEventListener("click", refresh);
    el.addEventListener("keyup", (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes((event as KeyboardEvent).key)) refresh();
    });
    el.addEventListener("keydown", keydown, true);
    el.addEventListener("blur", close);
    el.setAttribute("aria-autocomplete", "list");
    el.setAttribute("aria-controls", list.id);
    state.cleanup = () => {
      list.remove();
      el.removeEventListener("keydown", keydown, true);
    };
    states.set(el, state);
  },
  updated(el, binding) {
    const state = states.get(el);
    if (state) state.options = binding.value;
  },
  unmounted(el) {
    states.get(el)?.cleanup();
    states.delete(el);
  },
};
