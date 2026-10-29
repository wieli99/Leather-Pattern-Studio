import { onScopeDispose, shallowRef, shallowReadonly } from "vue";
export interface Subscribable {
  subscribe: (listener: () => void) => () => void;
}
/** Project only the state a component displays; the editor itself stays unproxied. */
export function useEditorSelector<T>(
  source: Subscribable,
  select: () => T,
  equal: (a: T, b: T) => boolean = Object.is,
) {
  const selected = shallowRef<T>(select());
  const unsubscribe = source.subscribe(() => {
    const next = select();
    if (!equal(selected.value, next)) selected.value = next;
  });
  onScopeDispose(unsubscribe);
  return shallowReadonly(selected);
}
