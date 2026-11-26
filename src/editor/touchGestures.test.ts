import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pinchView, TOUCH_HOLD_MS, TouchGestureRouter, type TouchPointer } from "./touchGestures";

const touch = (pointerId: number, timeStamp = 0): TouchPointer => ({ pointerId, pointerType: "touch", timeStamp });

function setup() {
  const handlers = { begin: vi.fn(), cancel: vi.fn(), panZoom: vi.fn() };
  return { handlers, router: new TouchGestureRouter<TouchPointer>(handlers) };
}

describe("TouchGestureRouter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("passes mouse and pen pointers through untouched", () => {
    const { router, handlers } = setup();
    for (const pointerType of ["mouse", "pen"]) {
      const event = { pointerId: 1, pointerType, timeStamp: 0 };
      expect(router.down(event, { x: 0, y: 0 })).toBe(false);
      expect(router.move(event, { x: 50, y: 0 })).toBe(false);
      expect(router.up(event, { x: 50, y: 0 })).toBe(false);
    }
    expect(handlers.begin).not.toHaveBeenCalled();
  });

  it("runs a tap as a deferred pointerdown followed by the caller's pointerup", () => {
    const { router, handlers } = setup();
    const down = touch(1);
    expect(router.down(down, { x: 10, y: 10 })).toBe(true);
    expect(handlers.begin).not.toHaveBeenCalled();
    expect(router.up(touch(1), { x: 11, y: 10 })).toBe(false);
    expect(handlers.begin).toHaveBeenCalledWith(down);
  });

  it("begins a drag once the finger leaves the slop, then passes moves through", () => {
    const { router, handlers } = setup();
    router.down(touch(1), { x: 0, y: 0 });
    expect(router.move(touch(1), { x: 3, y: 0 })).toBe(true);
    expect(handlers.begin).not.toHaveBeenCalled();
    expect(router.move(touch(1), { x: 20, y: 0 })).toBe(false);
    expect(handlers.begin).toHaveBeenCalledTimes(1);
    expect(router.move(touch(1), { x: 30, y: 0 })).toBe(false);
    expect(router.up(touch(1), { x: 30, y: 0 })).toBe(false);
  });

  it("begins a held finger after the hold delay", () => {
    const { router, handlers } = setup();
    router.down(touch(1), { x: 0, y: 0 });
    vi.advanceTimersByTime(TOUCH_HOLD_MS);
    expect(handlers.begin).toHaveBeenCalledTimes(1);
    expect(router.up(touch(1), { x: 0, y: 0 })).toBe(false);
  });

  it("never begins a deferred finger when a second finger arrives", () => {
    const { router, handlers } = setup();
    router.down(touch(1), { x: 0, y: 0 });
    expect(router.down(touch(2), { x: 100, y: 0 })).toBe(true);
    vi.advanceTimersByTime(TOUCH_HOLD_MS * 2);
    expect(handlers.begin).not.toHaveBeenCalled();
    expect(handlers.cancel).not.toHaveBeenCalled();
    expect(router.navigating).toBe(true);
  });

  it("cancels a begun interaction when a second finger arrives", () => {
    const { router, handlers } = setup();
    router.down(touch(1), { x: 0, y: 0 });
    router.move(touch(1), { x: 40, y: 0 });
    expect(router.down(touch(2), { x: 100, y: 0 })).toBe(true);
    expect(handlers.cancel).toHaveBeenCalledTimes(1);
  });

  it("pinches about the centroid and pans with it", () => {
    const { router, handlers } = setup();
    router.down(touch(1), { x: 0, y: 0 });
    router.down(touch(2), { x: 100, y: 0 });
    expect(router.move(touch(2), { x: 200, y: 0 })).toBe(true);
    expect(handlers.panZoom).toHaveBeenLastCalledWith({ x: 100, y: 0 }, 2, { x: 50, y: 0 });
    router.move(touch(1), { x: 0, y: 30 });
    const [center, factor, delta] = handlers.panZoom.mock.lastCall!;
    expect(center).toEqual({ x: 100, y: 15 });
    expect(factor).toBeCloseTo(Math.hypot(200, 30) / 200);
    expect(delta).toEqual({ x: 0, y: 15 });
  });

  it("consumes remaining fingers until every finger lifts", () => {
    const { router, handlers } = setup();
    router.down(touch(1), { x: 0, y: 0 });
    router.down(touch(2), { x: 100, y: 0 });
    expect(router.up(touch(2), { x: 100, y: 0 })).toBe(true);
    expect(router.move(touch(1), { x: 50, y: 50 })).toBe(true);
    expect(router.up(touch(1), { x: 50, y: 50 })).toBe(true);
    expect(handlers.begin).not.toHaveBeenCalled();
    expect(router.navigating).toBe(false);
    // The next single finger behaves normally again.
    router.down(touch(3), { x: 0, y: 0 });
    expect(router.up(touch(3), { x: 0, y: 0 })).toBe(false);
    expect(handlers.begin).toHaveBeenCalledTimes(1);
  });

  it("reports double taps close in time and space", () => {
    const { router } = setup();
    const tap = (id: number, at: number, x: number) => {
      router.down(touch(id, at), { x, y: 10 });
      router.up(touch(id, at + 50), { x, y: 10 });
      return router.tapCount;
    };
    expect(tap(1, 0, 10)).toBe(1);
    expect(tap(2, 200, 14)).toBe(2);
    // A third tap starts a new sequence; slow or distant taps never pair.
    expect(tap(3, 400, 14)).toBe(1);
    expect(tap(4, 1000, 14)).toBe(1);
    expect(tap(5, 1100, 200)).toBe(1);
    // A drag resets the count.
    router.down(touch(6, 1200), { x: 200, y: 10 });
    router.move(touch(6, 1210), { x: 260, y: 10 });
    router.up(touch(6, 1250), { x: 260, y: 10 });
    expect(router.tapCount).toBe(0);
  });

  it("drops cancelled fingers without beginning them", () => {
    const { router, handlers } = setup();
    router.down(touch(1), { x: 0, y: 0 });
    expect(router.cancel(touch(1))).toBe(true);
    vi.advanceTimersByTime(TOUCH_HOLD_MS);
    expect(handlers.begin).not.toHaveBeenCalled();
    // A begun finger's cancel is left to the caller's own pointercancel handling.
    router.down(touch(2), { x: 0, y: 0 });
    vi.advanceTimersByTime(TOUCH_HOLD_MS);
    expect(router.cancel(touch(2))).toBe(false);
  });

  it("ignores stale pointers it never saw go down", () => {
    const { router } = setup();
    expect(router.move(touch(9), { x: 0, y: 0 })).toBe(false);
    expect(router.up(touch(9), { x: 0, y: 0 })).toBe(false);
  });
});

describe("pinchView", () => {
  it("keeps the world point under the fingers while zooming and panning", () => {
    const view = { zoom: 2, pan: { x: 10, y: 20 } };
    const center = { x: 110, y: 120 }, delta = { x: 10, y: -5 };
    const world = { x: (center.x - delta.x - view.pan.x) / view.zoom, y: (center.y - delta.y - view.pan.y) / view.zoom };
    const next = pinchView(view, center, 1.5, delta, { min: 0.01, max: 100 });
    expect(next.zoom).toBe(3);
    expect(world.x * next.zoom + next.pan.x).toBeCloseTo(center.x);
    expect(world.y * next.zoom + next.pan.y).toBeCloseTo(center.y);
  });

  it("clamps zoom to the view's limits", () => {
    expect(pinchView({ zoom: 90, pan: { x: 0, y: 0 } }, { x: 0, y: 0 }, 2, { x: 0, y: 0 }, { min: 0.01, max: 100 }).zoom).toBe(100);
  });
});
