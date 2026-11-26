import type { Point } from "../model/project";

/** Screen-space touch input as the canvases see it: CSS pixels relative to the canvas. */
export interface TouchPointer {
  pointerId: number;
  pointerType: string;
  timeStamp: number;
}

export interface TouchGestureHandlers<E extends TouchPointer> {
  /** Runs the canvas's normal pointerdown handling for a finger's original pointerdown event. */
  begin(event: E): void;
  /** Cancels a single-pointer interaction already begun, keeping committed document state. */
  cancel(): void;
  /** Pans by `delta` and scales by `factor` about `center`; all values in canvas CSS pixels. */
  panZoom(center: Point, factor: number, delta: Point): void;
}

/** Movement in CSS pixels before a held finger counts as a drag rather than a tap. */
export const TOUCH_SLOP = 8;
/** A finger held this long without moving starts its interaction even before moving. */
export const TOUCH_HOLD_MS = 150;
/** Longest pause between releasing a tap and pressing the next one for a double tap. */
export const DOUBLE_TAP_MS = 300;

type State<E> =
  | { kind: "idle" }
  /** One finger is down but its interaction is deferred so a second finger can still pinch. */
  | { kind: "pending"; id: number; start: Point; event: E; timer: ReturnType<typeof setTimeout> }
  /** One finger owns the canvas's normal interaction; events pass through. */
  | { kind: "single"; id: number; start: Point; downAt: number; moved: boolean }
  /** Two or more fingers pan and zoom; further events are consumed until every finger lifts. */
  | { kind: "multi" };

/**
 * Routes touch pointers for a canvas. Mouse and pen pointers always pass through untouched, so
 * desktop behaviour is unchanged. One finger drives the canvas's usual pointer handlers; a second
 * finger cancels that interaction and pans and pinch-zooms the view instead.
 *
 * Each `down`, `move` and `up` returns true when the event was consumed and the caller must not run
 * its own handler for it. For a deferred first finger the router calls `begin`, after which the
 * caller's handlers receive later events as usual.
 */
export class TouchGestureRouter<E extends TouchPointer> {
  private state: State<E> = { kind: "idle" };
  private readonly points = new Map<number, Point>();
  private lastTap?: { at: number; pixel: Point };
  /**
   * 1 after a single tap and 2 after a second quick tap near the first, like `MouseEvent.detail`.
   * Read it in the click that follows a touch pointerup; native click counts are unreliable for touch.
   */
  tapCount = 0;

  constructor(private readonly handlers: TouchGestureHandlers<E>) {}

  /** True while two-finger navigation owns the canvas. */
  get navigating() {
    return this.state.kind === "multi";
  }

  down(event: E, pixel: Point): boolean {
    if (event.pointerType !== "touch") return false;
    this.points.set(event.pointerId, pixel);
    const state = this.state;
    if (state.kind === "idle") {
      const timer = setTimeout(() => this.commitPending(), TOUCH_HOLD_MS);
      this.state = { kind: "pending", id: event.pointerId, start: pixel, event, timer };
      return true;
    }
    if (state.kind === "pending") clearTimeout(state.timer);
    if (state.kind === "single") this.handlers.cancel();
    this.state = { kind: "multi" };
    this.lastTap = undefined;
    this.tapCount = 0;
    return true;
  }

  move(event: TouchPointer, pixel: Point): boolean {
    if (event.pointerType !== "touch" || !this.points.has(event.pointerId)) return false;
    const state = this.state;
    if (state.kind === "pending") {
      this.points.set(event.pointerId, pixel);
      if (Math.hypot(pixel.x - state.start.x, pixel.y - state.start.y) < TOUCH_SLOP) return true;
      this.commitPending();
      return false;
    }
    if (state.kind !== "multi") {
      this.points.set(event.pointerId, pixel);
      if (state.kind === "single" && Math.hypot(pixel.x - state.start.x, pixel.y - state.start.y) >= TOUCH_SLOP)
        state.moved = true;
      return false;
    }
    const before = this.pair();
    this.points.set(event.pointerId, pixel);
    const after = this.pair();
    if (before && after) {
      const factor = before.distance > 0 && after.distance > 0 ? after.distance / before.distance : 1;
      this.handlers.panZoom(after.center, factor, {
        x: after.center.x - before.center.x,
        y: after.center.y - before.center.y,
      });
    }
    return true;
  }

  /** Handles pointerup; pointercancel uses `cancel`. */
  up(event: TouchPointer, pixel: Point): boolean {
    if (event.pointerType !== "touch" || !this.points.has(event.pointerId)) return false;
    this.points.delete(event.pointerId);
    const state = this.state;
    if (state.kind === "pending") {
      // A quick tap: run the whole interaction now; the caller then handles this pointerup.
      clearTimeout(state.timer);
      this.state = { kind: "idle" };
      this.handlers.begin(state.event);
      this.tap(state.event.timeStamp, event.timeStamp, pixel);
      return false;
    }
    if (state.kind === "single") {
      this.state = { kind: "idle" };
      // A finger held past the hold delay without moving is still a (slow) tap.
      if (state.moved) {
        this.lastTap = undefined;
        this.tapCount = 0;
      } else this.tap(state.downAt, event.timeStamp, pixel);
      return false;
    }
    if (!this.points.size) this.state = { kind: "idle" };
    return true;
  }

  cancel(event: TouchPointer): boolean {
    if (event.pointerType !== "touch" || !this.points.has(event.pointerId)) return false;
    this.points.delete(event.pointerId);
    const state = this.state;
    if (state.kind === "pending") clearTimeout(state.timer);
    if (state.kind === "multi") {
      if (!this.points.size) this.state = { kind: "idle" };
      return true;
    }
    this.state = { kind: "idle" };
    // A deferred finger never began, so there is nothing for the caller to cancel.
    return state.kind === "pending";
  }

  /**
   * Resets the router whenever the window loses focus or the page is hidden: fingers lifted while
   * another app had focus send no pointerup, which would otherwise leave stale fingers forever.
   * Returns a function that stops listening.
   */
  resetOnFocusLoss() {
    const reset = () => this.reset();
    const hidden = () => document.visibilityState === "hidden" && this.reset();
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", hidden);
    };
  }

  /** Forgets every finger, e.g. when the canvas unmounts or the window loses focus. */
  reset() {
    if (this.state.kind === "pending") clearTimeout(this.state.timer);
    this.state = { kind: "idle" };
    this.points.clear();
    this.lastTap = undefined;
    this.tapCount = 0;
  }

  private commitPending() {
    const state = this.state;
    if (state.kind !== "pending") return;
    clearTimeout(state.timer);
    // A drag commits once it leaves the slop; only a held finger commits without moving.
    const moved = Math.hypot(
      (this.points.get(state.id)?.x ?? state.start.x) - state.start.x,
      (this.points.get(state.id)?.y ?? state.start.y) - state.start.y,
    ) >= TOUCH_SLOP;
    this.state = { kind: "single", id: state.id, start: state.start, downAt: state.event.timeStamp, moved };
    this.handlers.begin(state.event);
  }

  /** Pairs taps whose second press lands within DOUBLE_TAP_MS of the first release. */
  private tap(downAt: number, upAt: number, pixel: Point) {
    const last = this.lastTap;
    if (
      last &&
      downAt - last.at <= DOUBLE_TAP_MS &&
      Math.hypot(pixel.x - last.pixel.x, pixel.y - last.pixel.y) <= TOUCH_SLOP * 3
    ) {
      this.lastTap = undefined;
      this.tapCount = 2;
      return;
    }
    this.lastTap = { at: upAt, pixel };
    this.tapCount = 1;
  }

  private pair() {
    const [a, b] = [...this.points.values()];
    if (!a || !b) return undefined;
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }
}

/** Applies a pinch step to a view where screen = world * zoom + pan. */
export function pinchView(
  view: { zoom: number; pan: Point },
  center: Point,
  factor: number,
  delta: Point,
  limits: { min: number; max: number },
) {
  const zoom = Math.max(limits.min, Math.min(limits.max, view.zoom * factor));
  // Keep the world point under the previous centre under the moved centre.
  const previous = { x: center.x - delta.x, y: center.y - delta.y };
  const world = { x: (previous.x - view.pan.x) / view.zoom, y: (previous.y - view.pan.y) / view.zoom };
  return { zoom, pan: { x: center.x - world.x * zoom, y: center.y - world.y * zoom } };
}

/** Screen-space hit areas grow by this factor for fingers; mouse and pen keep their precise sizes. */
export const TOUCH_POINTER_SCALE = 2.5;
export function pointerScaleFor(pointerType: string) {
  return pointerType === "touch" ? TOUCH_POINTER_SCALE : 1;
}
