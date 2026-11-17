import { beforeEach, expect, test, vi } from "vitest";
import { emptyDocument } from "../model/project";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke }));
import { ProjectFiles } from "./persistence";
beforeEach(() => invoke.mockReset());
test("cancelled and invalid native opens preserve the previous binding", async () => {
  const files = new ProjectFiles(); files.handle = 3;
  invoke.mockResolvedValueOnce(null);
  expect(await files.open()).toBeUndefined(); expect(files.handle).toBe(3);
  invoke.mockResolvedValueOnce(['invalid', 'bad.leather', 4]);
  await expect(files.open()).rejects.toThrow(); expect(files.handle).toBe(3);
});
test("native open parses projects and save reuses only the selected token", async () => {
  const files = new ProjectFiles();
  invoke.mockResolvedValueOnce([JSON.stringify(emptyDocument()), 'wallet.leather', 7]);
  expect((await files.open())?.name).toBe('wallet.leather');
  invoke.mockResolvedValueOnce(['wallet.leather', 8]);
  expect(await files.save(emptyDocument(), 'wallet.leather')).toEqual({ outcome: 'saved', name: 'wallet.leather' });
  expect(invoke).toHaveBeenLastCalledWith('save_project', expect.objectContaining({ token: 7 }));
});
test("cancelled and failed native saves preserve the binding", async () => {
  const files = new ProjectFiles(); files.handle = 2;
  invoke.mockResolvedValueOnce(null);
  expect((await files.save(emptyDocument(), 'wallet.leather')).outcome).toBe('cancelled');
  invoke.mockRejectedValueOnce(Error('Permission denied'));
  await expect(files.save(emptyDocument(), 'wallet.leather')).rejects.toThrow('Permission denied');
  expect(files.handle).toBe(2);
});
test("OS open targets only its request id and manual Open uses the dialog", async () => {
  const files = new ProjectFiles();
  invoke.mockResolvedValueOnce([JSON.stringify(emptyDocument()), 'requested.leather', 9]);
  await files.open(17);
  expect(invoke).toHaveBeenLastCalledWith('open_project', { requestId: 17 });
  invoke.mockResolvedValueOnce(null);
  await files.open();
  expect(invoke).toHaveBeenLastCalledWith('open_project', { requestId: null });
});
