import { expect, test, vi } from "vitest";
import { desktopOpenRequestPump } from "./desktopOpenRequests";

function setup() {
  const options = {
    available: vi.fn(() => true),
    pending: vi.fn(async (): Promise<number | null> => 17),
    open: vi.fn(async (_id: number) => {}),
    acknowledge: vi.fn(async (_id: number) => {}),
    fail: vi.fn(),
  };
  return { ...options, pump: desktopOpenRequestPump(options) };
}

test("manual file operation starting during IPC preserves the queued request for retry", async () => {
  const s = setup();
  let respond!: (id: number) => void;
  s.pending.mockReturnValueOnce(new Promise<number>(resolve => { respond = resolve; }));
  const inFlight = s.pump();
  s.available.mockReturnValue(false);
  respond(17);
  await inFlight;
  expect(s.open).not.toHaveBeenCalled();
  expect(s.acknowledge).not.toHaveBeenCalled();
  s.available.mockReturnValue(true);
  await s.pump();
  expect(s.open).toHaveBeenCalledExactlyOnceWith(17);
  expect(s.acknowledge).toHaveBeenCalledExactlyOnceWith(17);
});

test("concurrent polls do not duplicate processing or acknowledge before Open finishes", async () => {
  const s = setup();
  let finish!: () => void;
  s.open.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  const first = s.pump();
  await vi.waitFor(() => expect(s.open).toHaveBeenCalledOnce());
  await s.pump();
  expect(s.pending).toHaveBeenCalledOnce();
  expect(s.acknowledge).not.toHaveBeenCalled();
  finish(); await first;
  expect(s.acknowledge).toHaveBeenCalledExactlyOnceWith(17);
});

test("a failed IPC lookup does not acknowledge a request and can be retried", async () => {
  const s = setup(); s.pending.mockRejectedValueOnce(Error("IPC failed"));
  await s.pump();
  expect(s.fail).toHaveBeenCalledOnce();
  expect(s.acknowledge).not.toHaveBeenCalled();
  await s.pump();
  expect(s.open).toHaveBeenCalledExactlyOnceWith(17);
});
