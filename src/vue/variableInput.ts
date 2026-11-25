import { ref } from "vue";
import type { VariableValue } from "../model/variables";

/**
 * Suggest variable names while typing an identifier. Arrow keys move through open
 * suggestions; Enter inserts only a highlighted one so confirmation keeps working.
 */
export function useVariableSuggestions(values: () => Map<string, VariableValue>, kinds: VariableValue["kind"][]) {
  const suggestions = ref<string[]>([]),
    highlight = ref(-1);
  let target: HTMLInputElement | null = null;
  function prefixAt(input: HTMLInputElement) {
    const before = input.value.slice(0, input.selectionStart ?? input.value.length);
    const match = /(^|[^A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_]*)$/.exec(before);
    return match ? match[2] : null;
  }
  function update(input: HTMLInputElement) {
    target = input;
    const prefix = prefixAt(input);
    const lower = prefix?.toLowerCase();
    suggestions.value = lower
      ? [...values()]
          .filter(([name, v]) => kinds.includes(v.kind) && name.toLowerCase().startsWith(lower) && name !== prefix)
          .map(([name]) => name)
          .sort()
          .slice(0, 6)
      : [];
    if (highlight.value >= suggestions.value.length) highlight.value = -1;
  }
  function close() {
    suggestions.value = [];
    highlight.value = -1;
  }
  function choose(name: string) {
    const input = target;
    if (!input) return;
    const caret = input.selectionStart ?? input.value.length;
    const prefix = prefixAt(input) ?? "";
    input.value = input.value.slice(0, caret - prefix.length) + name + input.value.slice(caret);
    const position = caret - prefix.length + name.length;
    input.setSelectionRange(position, position);
    close();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }
  /** True when the key was used by the open suggestion list. */
  function key(event: KeyboardEvent): boolean {
    if (!suggestions.value.length || event.isComposing) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const count = suggestions.value.length;
      highlight.value = event.key === "ArrowDown"
        ? (highlight.value + 1) % count
        : (highlight.value - 1 + count) % count;
    } else if (event.key === "Enter" && highlight.value >= 0) choose(suggestions.value[highlight.value]);
    else if (event.key === "Escape") close();
    else return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }
  return { suggestions, highlight, update, close, choose, key };
}
