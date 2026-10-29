import { test, expect } from "vitest";
import { effectScope, isProxy } from "vue";
import { useEditorSelector } from "./useEditorSelector";
test("selectors ignore unrelated updates and dispose their subscriptions", () => {
  const listeners = new Set<() => void>();
  const source = {
    value: 1,
    other: 0,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  const scope = effectScope();
  const selected = scope.run(() =>
    useEditorSelector(source, () => source.value),
  )!;
  expect(isProxy(source)).toBe(false);
  source.other++;
  for (const fn of listeners) fn();
  expect(selected.value).toBe(1);
  source.value = 2;
  for (const fn of listeners) fn();
  expect(selected.value).toBe(2);
  scope.stop();
  expect(listeners.size).toBe(0);
});
test("object selections retain raw identity without deep Vue proxies", () => {
  const document = { shapes: [{ name: "Raw geometry" }] };
  const source = {
    subscribe(_fn: () => void) {
      return () => {};
    },
  };
  const scope = effectScope();
  const selected = scope.run(() => useEditorSelector(source, () => document))!;
  expect(selected.value).toBe(document);
  expect(isProxy(selected.value)).toBe(false);
  expect(isProxy(selected.value.shapes)).toBe(false);
  scope.stop();
});
