import { afterEach, expect, test, vi } from "vitest";
import { prepareDevelopmentStartup } from "./developmentStartup";
afterEach(() => vi.unstubAllGlobals());
function setup(controlled: boolean, attempted = false) {
  const unregister = vi.fn().mockResolvedValue(true),
    reload = vi.fn();
  const worker = { scriptURL: "http://localhost/sw.js" };
  vi.stubGlobal("location", { href: "http://localhost/", reload });
  vi.stubGlobal("sessionStorage", {
    getItem: () => (attempted ? "1" : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
  vi.stubGlobal("navigator", {
    serviceWorker: {
      controller: controlled ? worker : null,
      getRegistrations: async () => [
        { scope: "http://localhost/", active: worker, unregister },
      ],
    },
  });
  return { unregister, reload };
}
test("unregisters app worker and reloads before loading editor", async () => {
  const { unregister, reload } = setup(true);
  expect(await prepareDevelopmentStartup()).toBe(false);
  expect(unregister).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
});
test("uncontrolled startup proceeds", async () => {
  setup(false);
  expect(await prepareDevelopmentStartup()).toBe(true);
});
test("persistent control reports error without reload loop", async () => {
  const { reload } = setup(true, true);
  await expect(prepareDevelopmentStartup()).rejects.toThrow("Close all tabs");
  expect(reload).not.toHaveBeenCalled();
});
