import { expect, test, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => true }));
import { startDesktopUpdates, useDesktopUpdates } from './desktopUpdates';
vi.stubGlobal('__APP_VERSION__', '0.4.0-beta.1');
test('startup checks once and state survives repeated consumers and errors', async () => {
  invoke.mockResolvedValueOnce('linux-x86_64').mockResolvedValueOnce([]);
  startDesktopUpdates(); startDesktopUpdates();
  const state = useDesktopUpdates();
  await vi.waitFor(() => expect(state.busy.value).toBe(false));
  expect(invoke).toHaveBeenCalledTimes(2);
  invoke.mockRejectedValueOnce(Error('offline'));
  await state.check(true);
  expect(useDesktopUpdates().message.value).toContain('Could not check GitHub');
  expect(state.busy.value).toBe(false);
});
test('a pending check blocks duplicate requests and shares the available release', async () => {
  invoke.mockReset();
  let finish!: (releases: unknown[]) => void;
  const releases = new Promise<unknown[]>(resolve => { finish = resolve; });
  invoke.mockResolvedValueOnce('linux-x86_64').mockReturnValueOnce(releases);
  const state = useDesktopUpdates();
  const pending = state.check(true);
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  expect(state.busy.value).toBe(true);
  await state.check(true);
  expect(invoke).toHaveBeenCalledTimes(2);
  finish([{ draft: false, prerelease: false, tag_name: 'v99.0.0', html_url: 'https://github.com/example/releases/tag/v99.0.0', assets: [{ name: 'Studio-x86_64.flatpak' }] }]);
  await pending;
  expect(state.busy.value).toBe(false);
  expect(useDesktopUpdates().message.value).toContain('v99.0.0');
  expect(useDesktopUpdates().url.value).toContain('/releases/tag/v99.0.0');
});
async function freshUpdates(version: string) {
  vi.resetModules();
  invoke.mockReset();
  vi.stubGlobal('__APP_VERSION__', version);
  return import('./desktopUpdates');
}
const release = (tag: string, prerelease = false, asset = 'Studio-x86_64.flatpak') => ({
  draft: false, prerelease, tag_name: tag,
  html_url: `https://github.com/example/releases/tag/${tag}`,
  assets: [{ name: asset }],
});
test('launch announces a compatible update without opening Settings', async () => {
  const updates = await freshUpdates('1.0.0');
  invoke.mockResolvedValueOnce('linux-x86_64').mockResolvedValueOnce([release('v1.1.0')]);
  updates.startDesktopUpdates();
  const state = updates.useDesktopUpdates();
  await vi.waitFor(() => expect(state.busy.value).toBe(false));
  expect(state.message.value).toBe('Version v1.1.0 is available.');
  expect(state.url.value).toContain('/v1.1.0');
});
test('offline launch is silent and a later manual check can retry', async () => {
  const updates = await freshUpdates('1.0.0');
  invoke.mockRejectedValueOnce(Error('offline'));
  updates.startDesktopUpdates();
  const state = updates.useDesktopUpdates();
  await vi.waitFor(() => expect(state.busy.value).toBe(false));
  expect(state.message.value).toBe(''); expect(state.url.value).toBe('');
  invoke.mockResolvedValueOnce('linux-x86_64').mockResolvedValueOnce([]);
  await state.check(true);
  expect(state.message.value).toBe('No newer compatible release found.');
});
test.each([
  ['1.0.0', 'v1.0.1'],
  ['1.0.0-beta.1', 'v1.1.0-beta.2'],
])('release channel for %s chooses %s', async (current, expected) => {
  const updates = await freshUpdates(current);
  invoke.mockResolvedValueOnce('linux-x86_64').mockResolvedValueOnce([
    release('v1.1.0-beta.2', true), release('v1.0.1'),
    release('v3.0.0', false, 'Studio-arm64-setup.exe'),
    { ...release('v4.0.0'), draft: true },
  ]);
  await updates.useDesktopUpdates().check(true);
  expect(updates.useDesktopUpdates().url.value).toContain(`/${expected}`);
});
