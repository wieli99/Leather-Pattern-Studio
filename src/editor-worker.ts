import init, { Editor } from "./wasm/leather_document";
let core: Editor;
const ready = init().then(() => {
  core = new Editor();
  if (
    typeof core.capabilities !== "function" ||
    !JSON.parse(core.capabilities()).documentVersions.includes(6)
  ) {
    throw Error(
      "Application and geometry worker versions do not match. Save any existing work and reload the page (Ctrl+Shift+R).",
    );
  }
});
self.onmessage = async (event: MessageEvent) => {
  const { id, operation, document, revision } = event.data;
  try {
    await ready;
    const result =
      operation === "snapshot"
        ? core.snapshot()
        : core.apply(operation, JSON.stringify(document ?? null), revision);
    self.postMessage({ id, result: JSON.parse(result) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
