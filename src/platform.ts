import { invoke, isTauri } from "@tauri-apps/api/core";
export { isTauri };
export async function saveArtifact(blob: Blob, filename: string): Promise<void> {
  if (isTauri()) { await invoke("save_artifact", { name: filename, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) }); return; }
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function openHelp() {
  if (isTauri()) await invoke("open_help");
  else window.open("/manual/index.html", "_blank", "noopener");
}
export async function openExternal(url: string) {
  if (isTauri()) { const { openUrl } = await import("@tauri-apps/plugin-opener"); await openUrl(url); }
  else window.open(url, "_blank", "noopener,noreferrer");
}
