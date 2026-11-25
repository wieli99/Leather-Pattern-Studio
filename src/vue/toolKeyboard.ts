/**
 * Text fields may submit a tool; native controls and nested forms (such as naming a
 * preset) keep their own Enter behavior.
 */
export function handleToolEnter(event: KeyboardEvent, apply: () => unknown) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    !(event.target instanceof HTMLInputElement) ||
    event.target.type !== "text" ||
    event.target.closest("form")
  )
    return;
  event.preventDefault();
  return apply();
}
