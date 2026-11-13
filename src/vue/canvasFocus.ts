/** Return tool commands to the editor's established keyboard focus target. */
export function focusModelCanvas() {
  document
    .querySelector<HTMLCanvasElement>('[aria-label="Pattern drawing canvas"]')
    ?.focus({ preventScroll: true });
}
