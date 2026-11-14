export function objectSelection(current: readonly string[], id: string | undefined, shift = false): string[] {
  if (!id) return shift ? [...current] : [];
  if (!shift) return [id];
  return current.includes(id) ? current.filter(value => value !== id) : [...current, id];
}
