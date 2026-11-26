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
/** A finger must rest this long on a row before dragging reorders instead of scrolling the list. */
export const TOUCH_DRAG_HOLD_MS = 350;
/** A resting finger may drift this far, in CSS pixels, before the press counts as a scroll. */
const TOUCH_HOLD_SLOP = 8;
/**
 * Shared pointer lifecycle. Preview movement never writes document state.
 *
 * Mouse and pen drag at once. Touch drags after a press and hold, so a swipe still scrolls the
 * list; rows let the browser pan (touch-action) and the hold blocks that pan once armed.
 */
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
  /** Touch only: undefined while the hold is pending, true once the finger may drag. */
  let armed: boolean | undefined,
    holdTimer: ReturnType<typeof setTimeout> | undefined;
  /** Once armed, keeps the browser from scrolling the list under the dragged row. */
  function blockScroll(event: TouchEvent) {
    if (armed && event.cancelable) event.preventDefault();
  }
  /**
   * Android fires contextmenu at its long-press timeout, shortly after the hold arms. While armed
   * the press belongs to the drag, so the platform event is swallowed; a row's own context menu
   * still opens from its longer touch timer if the finger keeps still.
   */
  function holdContextMenu(event: Event) {
    if (!armed) {
      cancel();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  function cancel() {
    clearTimeout(holdTimer);
    holdTimer = undefined;
    armed = undefined;
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
    window.removeEventListener("touchmove", blockScroll);
    window.removeEventListener("contextmenu", holdContextMenu, true);
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
    if (armed === false) {
      // The finger moved before the hold elapsed: this is a scroll, not a drag.
      if (Math.hypot(event.clientX - startEvent.clientX, event.clientY - startEvent.clientY) > TOUCH_HOLD_SLOP)
        cancel();
      return;
    }
    if (!state.value) {
      // Holding still until a row's context menu opened chose the menu, not a drag.
      if (armed && document.querySelector("[role='menu']")) {
        cancel();
        return;
      }
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
    if (event.pointerType === "touch") {
      armed = false;
      holdTimer = setTimeout(() => {
        armed = true;
        navigator.vibrate?.(10);
      }, TOUCH_DRAG_HOLD_MS);
      window.addEventListener("touchmove", blockScroll, { passive: false });
      window.addEventListener("contextmenu", holdContextMenu, true);
    }
    frame = requestAnimationFrame(tick);
  }
  onBeforeUnmount(cancel);
  return { state, start, cancel };
}
