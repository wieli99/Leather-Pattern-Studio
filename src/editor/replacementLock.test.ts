import { expect, test, vi } from "vitest";
import { Controller } from "./controller";

for (const operation of ["newProject", "restoreProject"] as const) {
  test(`${operation} blocks file opens during confirmation and unlocks after cancellation`, async () => {
    const editor = Object.create(Controller.prototype) as Controller;
    let confirm!: (value: boolean) => void;
    editor.fileBusy = false;
    editor.restore = {} as NonNullable<Controller["restore"]>;
    editor.confirmReplacement = vi.fn(() => new Promise<boolean>(resolve => { confirm = resolve; }));
    const pending = editor[operation]();
    expect(editor.fileBusy).toBe(true);
    await editor.open(42);
    expect(editor.confirmReplacement).toHaveBeenCalledTimes(1);
    confirm(false);
    await pending;
    expect(editor.fileBusy).toBe(false);
  });

  test(`${operation} unlocks if confirmation fails`, async () => {
    const editor = Object.create(Controller.prototype) as Controller;
    editor.fileBusy = false;
    editor.restore = {} as NonNullable<Controller["restore"]>;
    editor.confirmReplacement = vi.fn().mockRejectedValue(new Error("dialog failed"));
    await expect(editor[operation]()).rejects.toThrow("dialog failed");
    expect(editor.fileBusy).toBe(false);
  });
}
