<script setup lang="ts">
import { computed, ref } from "vue";
import { editor } from "../editor/instance";
import { bugReport } from "../editor/bugReport";
const props = defineProps<{ printActive: boolean; iconOnly?: boolean }>();
const dialog = ref<HTMLDialogElement>();
const includeProject = ref(true), includeSystem = ref(true);
const project = ref<string>(), context = ref(""), system = ref(""), error = ref("");
const report = computed(() => bugReport(context.value, includeSystem.value ? system.value : "", includeProject.value ? project.value : undefined));
function open() {
  includeProject.value = includeSystem.value = true;
  error.value = "";
  context.value = `App version: ${__APP_VERSION__}\nWorkspace: ${props.printActive ? "Print" : "Drawing"}\nTool: ${editor.mode}`;
  system.value = `Browser: ${navigator.userAgent}\nPlatform: ${navigator.platform || "Unavailable"}\nLanguage: ${navigator.language}\nViewport: ${innerWidth} × ${innerHeight}\nPixel ratio: ${devicePixelRatio}\nOnline: ${navigator.onLine}`;
  project.value = undefined;
  try {
    if (!editor.ready) throw Error("Project is not ready");
    project.value = JSON.stringify({ ...editor.document, ui: { collapsedGroupIds: [...editor.collapsedGroups] } }, null, 2);
  } catch { error.value = "Project JSON is unavailable. You can still report the bug."; }
  dialog.value?.showModal();
}
function openGitHub() {
  window.open(report.value.url, "_blank", "noopener,noreferrer");
}
function download() {
  if (!project.value) return;
  const url = URL.createObjectURL(new Blob([project.value], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = "bug-report-project.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>
<template>
  <button :class="{ 'bug-icon-button': iconOnly }" @click="open" aria-label="Report a bug" title="Report a bug">
    <svg v-if="iconOnly" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path d="m8 3 2 3m6-3-2 3M4 9l4 2m12-2-4 2M3 15h5m13 0h-5M5 21l4-3m10 3-4-3" />
      <rect x="8" y="6" width="8" height="15" rx="4" /><path d="M8 11h8m-4 0v10" />
    </svg>
    <span v-else>Report a bug</span>
  </button>
  <dialog ref="dialog" :aria-label="'Report a bug'">
    <h2>Report a bug</h2>
    <p>Choose what to include. GitHub opens a draft you can edit and submit. Submitted issues and project contents are public.</p>
    <label><input v-model="includeProject" type="checkbox"> Include current project JSON</label>
    <label><input v-model="includeSystem" type="checkbox"> Include system information</label>
    <p v-if="error" role="status">{{ error }}</p>
    <p v-if="report.attachment">The project is too large for the link. Download it and attach it on GitHub.</p>
    <button v-if="report.attachment" @click="download">Download project JSON</button>
    <div class="report-actions">
      <button @click="dialog?.close()">Close</button>
      <button @click="openGitHub">Open GitHub issue</button>
    </div>
  </dialog>
</template>
<style scoped>
dialog {
  max-width: 540px;
  width: calc(100vw - 32px);
  max-height: 90vh;
  overflow: auto;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 30px;
  font: inherit;
}
dialog::backdrop { background: #0008; }
h2 { margin: 0 0 16px; font-size: 18px; }
p { color: var(--muted); line-height: 1.5; margin: 12px 0; }
label { display: flex; align-items: center; gap: 8px; margin: 14px 0; }
input[type="checkbox"] { accent-color: var(--accent); }
.report-actions { display: flex; justify-content: flex-start; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
.bug-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 4px;
  margin-left: -12px;
  background: transparent;
  color: var(--muted);
}
.bug-icon-button:hover { background: var(--button); color: var(--text); }
.bug-icon-button:focus-visible { outline-color: var(--accent); }
svg { display: block; }
</style>
