/** Text fields may submit a tool; native controls keep their own Enter behavior. */
export function handleToolEnter(event: KeyboardEvent, apply: () => unknown) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    !(event.target instanceof HTMLInputElement) ||
    event.target.type !== "text"
  )
    return;
  event.preventDefault();
  return apply();
}
