import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
const message = ref(""), url = ref(""), busy = ref(false);
import { newer } from "./desktopVersion";
async function check(manual = false) {
  if (busy.value) return;
  busy.value = true;
  try {
    const target = await invoke<string>("desktop_target");
    const releases = await invoke<Array<{ draft: boolean; prerelease: boolean; tag_name: string; html_url: string; assets: Array<{ name: string }> }>>("release_list");
    const [os, arch] = target.split("-");
    const suffix = os === "linux" ? `${arch}.flatpak` : os === "windows" ? `${arch === "x86_64" ? "x64" : "arm64"}-setup.exe` : `${arch === "x86_64" ? "x64" : "aarch64"}.dmg`;
    const release = releases.filter(r => !r.draft && (!r.prerelease || __APP_VERSION__.includes("-")) && /^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(r.tag_name) && r.assets.some(a => a.name.endsWith(suffix)))
      .sort((a, b) => newer(a.tag_name, b.tag_name) ? -1 : newer(b.tag_name, a.tag_name) ? 1 : 0)[0];
    url.value = "";
    if (release && newer(release.tag_name, __APP_VERSION__)) { message.value = `Version ${release.tag_name} is available.`; url.value = release.html_url; }
    else if (manual) message.value = "No newer compatible release found.";
  } catch { if (manual) message.value = "Could not check GitHub. Check your connection and try again later."; }
  finally { busy.value = false; }
}


let started = false;
export function useDesktopUpdates() {
  return { message, url, busy, check };
}
export function startDesktopUpdates() {
  if (started) return;
  started = true;
  void check();
}
