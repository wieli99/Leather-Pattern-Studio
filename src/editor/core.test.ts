import { afterEach, expect, test, vi } from "vitest";
import { Core } from "./core";
class WorkerStub {
  static current: WorkerStub;
  onmessage: any;
  onerror: any;
  onmessageerror: any;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    WorkerStub.current = this;
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
test("startup timeout rejects pending and future requests", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", WorkerStub);
  const core = new Core();
  const pending = expect(core.request("snapshot", 0)).rejects.toThrow(
    "15 seconds",
  );
  await vi.advanceTimersByTimeAsync(15000);
  await pending;
  expect(WorkerStub.current.terminate).toHaveBeenCalled();
  await expect(core.request("snapshot", 0)).rejects.toThrow("15 seconds");
});
test("worker import errors retain their diagnostic", async () => {
  vi.stubGlobal("Worker", WorkerStub);
  const core = new Core();
  const pending = expect(core.request("snapshot", 0)).rejects.toThrow(
    "missing Wasm export",
  );
  WorkerStub.current.onerror({ message: "missing Wasm export" });
  await pending;
  core.dispose();
});
