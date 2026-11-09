import type { ObjectDirective } from "vue";
import { parseLength, fromMillimetres, type UnitMode } from "../model/units";

export function adjustedNumber(
  value: number,
  delta: number,
  shift: boolean,
  ctrl: boolean,
  min = -Infinity,
  max = Infinity,
) {
  const step = ctrl ? 10 : shift ? 5 : 1;
  const next = Number((value + (delta < 0 ? step : -step)).toPrecision(15));
  return Math.min(max, Math.max(min, next));
}

type Mode = UnitMode | "number" | false | undefined;
const handlers = new WeakMap<HTMLInputElement, EventListener>();
export const numericWheel: ObjectDirective<HTMLInputElement, Mode> = {
  mounted(el, binding) {
    el.dataset.wheelMode = String(binding.value ?? "number");
    const handler: EventListener = raw => {
      const event = raw as WheelEvent;
      const mode = el.dataset.wheelMode as UnitMode | "number" | "false";
      if (!event.altKey || !event.deltaY || mode === "false" || el.disabled || el.readOnly) return;
      const read = () => mode === "number" ? (el.value.trim() ? Number(el.value) : NaN) : parseLength(el.value, mode);
      // Focus initializes editable precision and starts the existing edit transaction.
      if (!el.value.trim() || el.getAttribute("aria-invalid") === "true") return;
      el.focus({ preventScroll: true });
      const parsed = read();
      if (parsed === null || !Number.isFinite(parsed)) return;
      const scale = mode === "number" || mode === "mm" ? 1 : 25.4;
      const current = mode === "number" ? parsed : fromMillimetres(parsed, mode);
      const min = el.min ? Number(el.min) / scale : -Infinity;
      const max = el.dataset.wheelMax ? Number(el.dataset.wheelMax) / scale : el.max ? Number(el.max) / scale : Infinity;
      event.preventDefault();
      event.stopPropagation();
      const next = adjustedNumber(current, event.deltaY, event.shiftKey, event.ctrlKey, min, max);
      if (next === current) return;
      el.value = String(next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    handlers.set(el, handler);
    el.addEventListener("wheel", handler, { passive: false });
  },
  updated(el, binding) { el.dataset.wheelMode = String(binding.value ?? "number"); },
  unmounted(el) {
    const handler = handlers.get(el);
    if (handler) el.removeEventListener("wheel", handler);
    handlers.delete(el);
  },
};
