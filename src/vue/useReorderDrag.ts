import { onBeforeUnmount, shallowRef } from "vue";
export interface ReorderDragState {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  count: number;
  valid: boolean;
  image?: string;
}
/** Shared pointer lifecycle. Preview movement never writes document state. */
export function useReorderDrag(options: {
  activate: () => void;
  move: (event: PointerEvent) => boolean;
  drop: () => void;
  end: () => void;
  current: () => boolean;
  scroll: () => HTMLElement | null;
  horizontal?: boolean;
}) {
  const state = shallowRef<ReorderDragState>();
  let startEvent: PointerEvent | undefined,
    last: PointerEvent | undefined,
    frame = 0;
  let metadata: Omit<ReorderDragState, "x" | "y" | "valid">;
  let previousCursor = "",
    previousSelect = "";
  function cancel() {
    const active = !!state.value,
      hadSession = !!startEvent;
    startEvent = last = undefined;
    state.value = undefined;
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("keydown", key);
    if (active) {
      delete document.documentElement.dataset.reorderDrag;
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    }
    if (hadSession) options.end();
  }
  function tick() {
    if (!startEvent) return;
    if (!options.current()) {
      cancel();
      return;
    }
    if (state.value && last) {
      const el = options.scroll();
      let scrolled = false;
      if (el) {
        const b = el.getBoundingClientRect(),
          p = options.horizontal ? last.clientX : last.clientY;
        const low = options.horizontal ? b.left : b.top,
          high = options.horizontal ? b.right : b.bottom;
        const cross = options.horizontal
          ? last.clientY >= b.top && last.clientY <= b.bottom
          : last.clientX >= b.left && last.clientX <= b.right;
        if (cross && p >= low - 20 && p <= high + 20) {
          const delta = p < low + 28 ? -10 : p > high - 28 ? 10 : 0;
          const before = options.horizontal ? el.scrollLeft : el.scrollTop;
          if (options.horizontal) el.scrollLeft += delta;
          else el.scrollTop += delta;
          scrolled =
            before !== (options.horizontal ? el.scrollLeft : el.scrollTop);
        }
      }
      if (scrolled) state.value = { ...state.value, valid: options.move(last) };
      document.body.style.cursor = state.value.valid
        ? "grabbing"
        : "not-allowed";
      document.documentElement.dataset.reorderDrag = state.value.valid
        ? "valid"
        : "invalid";
    }
    frame = requestAnimationFrame(tick);
  }
  function move(event: PointerEvent) {
    if (!startEvent || event.pointerId !== startEvent.pointerId) return;
    if (!options.current()) {
      cancel();
      return;
    }
    last = event;
    if (!state.value) {
      if (
        Math.hypot(
          event.clientX - startEvent.clientX,
          event.clientY - startEvent.clientY,
        ) < 6
      )
        return;
      previousCursor = document.body.style.cursor;
      previousSelect = document.body.style.userSelect;
      state.value = {
        ...metadata,
        x: event.clientX,
        y: event.clientY,
        valid: true,
      };
      document.body.style.userSelect = "none";
      options.activate();
    }
    event.preventDefault();
    const valid = options.move(event);
    state.value = {
      ...state.value!,
      x: event.clientX,
      y: event.clientY,
      valid,
    };
    document.documentElement.dataset.reorderDrag = valid ? "valid" : "invalid";
  }
  function up(event: PointerEvent) {
    if (!startEvent || event.pointerId !== startEvent.pointerId) return;
    try {
      if (state.value && options.current()) {
        // Keep the previewed destination under a stationary pointer until release.
        const unchanged =
          last?.clientX === event.clientX && last?.clientY === event.clientY;
        if (unchanged ? state.value.valid : options.move(event)) options.drop();
      }
    } finally {
      cancel();
    }
  }
  function key(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }
  function start(event: PointerEvent, value: typeof metadata) {
    cancel();
    if (event.button !== 0) return;
    metadata = value;
    startEvent = last = event;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    frame = requestAnimationFrame(tick);
  }
  onBeforeUnmount(cancel);
  return { state, start, cancel };
}
