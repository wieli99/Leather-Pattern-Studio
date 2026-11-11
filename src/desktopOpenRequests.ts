/** Drain one OS request only while the editor can take ownership of it. */
export function desktopOpenRequestPump(options: {
  available: () => boolean;
  pending: () => Promise<number | null>;
  open: (requestId: number) => Promise<void>;
  acknowledge: (requestId: number) => Promise<void>;
  fail: (error: unknown) => void;
}) {
  let opening = false;
  return async () => {
    if (opening || !options.available()) return;
    opening = true;
    try {
      const requestId = await options.pending();
      // A manual Open/Save can acquire the editor while IPC is in flight.
      if (requestId !== null && options.available()) {
        try { await options.open(requestId); }
        finally { await options.acknowledge(requestId); }
      }
    } catch (error) {
      options.fail(error);
    } finally {
      opening = false;
    }
  };
}
