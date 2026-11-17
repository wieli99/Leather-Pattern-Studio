/** Cancel the original close, then destroy only after the asynchronous decision. */
export function desktopCloseHandler(options: {
  busy: () => boolean;
  confirm: () => Promise<boolean>;
  destroy: (quit: boolean) => Promise<void>;
  fail: (error: unknown) => void;
}) {
  let deciding = false;
  return async (event: { preventDefault: () => void; quit?: boolean }) => {
    event.preventDefault();
    if (deciding || options.busy()) return;
    deciding = true;
    try {
      if (await options.confirm()) {
        if (!options.busy()) await options.destroy(event.quit ?? false);
      }
    } catch (error) {
      options.fail(error);
    } finally {
      deciding = false;
    }
  };
}
