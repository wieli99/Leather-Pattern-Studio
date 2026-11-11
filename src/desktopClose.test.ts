import { expect, test, vi } from 'vitest';
import { desktopCloseHandler } from './desktopClose';
function setup() {
  const options = { busy: vi.fn(() => false), confirm: vi.fn(async () => true), destroy: vi.fn(async () => {}), fail: vi.fn() };
  return { ...options, handle: desktopCloseHandler(options), event: { preventDefault: vi.fn() } };
}
test('OK cancels the original event immediately then destroys the window once', async () => {
  const s = setup(); const pending = s.handle(s.event);
  expect(s.event.preventDefault).toHaveBeenCalledOnce();
  expect(s.destroy).not.toHaveBeenCalled();
  await pending; expect(s.destroy).toHaveBeenCalledOnce();
});
test('Cancel leaves the window open and permits a later confirmed attempt', async () => {
  const s = setup(); s.confirm.mockResolvedValueOnce(false);
  await s.handle(s.event); expect(s.destroy).not.toHaveBeenCalled();
  await s.handle(s.event); expect(s.destroy).toHaveBeenCalledOnce();
});
test('busy operations block closing before and after confirmation', async () => {
  const s = setup(); s.busy.mockReturnValueOnce(true);
  await s.handle(s.event); expect(s.confirm).not.toHaveBeenCalled();
  s.busy.mockReturnValueOnce(false).mockReturnValueOnce(true);
  await s.handle(s.event); expect(s.destroy).not.toHaveBeenCalled();
});
test('repeated requests share one pending decision', async () => {
  const s = setup(); let resolve!: (answer: boolean) => void;
  s.confirm.mockReturnValueOnce(new Promise<boolean>(r => { resolve = r; }));
  const pending = s.handle(s.event); await s.handle(s.event);
  expect(s.confirm).toHaveBeenCalledOnce(); resolve(true);
  await pending; expect(s.destroy).toHaveBeenCalledOnce();
});
test('errors leave the window open and permit retry', async () => {
  const s = setup(); s.confirm.mockRejectedValueOnce(Error('dialog failed'));
  await s.handle(s.event); expect(s.fail).toHaveBeenCalledOnce(); expect(s.destroy).not.toHaveBeenCalled();
  s.destroy.mockRejectedValueOnce(Error('close failed'));
  await s.handle(s.event); expect(s.fail).toHaveBeenCalledTimes(2);
  await s.handle(s.event); expect(s.destroy).toHaveBeenCalledTimes(2);
});
test('native Quit uses the same confirmation and completes the whole-app action', async () => {
  const s = setup();
  s.confirm.mockResolvedValueOnce(false);
  await s.handle({ preventDefault: vi.fn(), quit: true });
  expect(s.destroy).not.toHaveBeenCalled();
  await s.handle({ preventDefault: vi.fn(), quit: true });
  expect(s.destroy).toHaveBeenCalledWith(true);
});
test('ordinary window close does not request whole-app Quit', async () => {
  const s = setup(); await s.handle(s.event);
  expect(s.destroy).toHaveBeenCalledWith(false);
});
