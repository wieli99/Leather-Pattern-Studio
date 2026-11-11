<script setup lang="ts">
import { openHelp, openExternal } from "../platform";
import { desktopCloseHandler } from "../desktopClose";
import { startDesktopUpdates, useDesktopUpdates } from "../desktopUpdates";
const desktopUpdates = useDesktopUpdates();
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import ToolRail from "./ToolRail.vue";
import RailButton from "./RailButton.vue";
import { computed } from "vue";
import PrintWorkspace from "./PrintWorkspace.vue";
import brandIcon from "../assets/leather-studio-icon.svg?no-inline";
import { editorHint } from "../editor/hint";
import { stitchLineIcon } from "../editor/stitchTools";
import ConstructionMeasurements from "./ConstructionMeasurements.vue";
import TransformToolbox from "./TransformToolbox.vue";
import { ref, watch, onMounted, onUnmounted } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import Viewport from "./Viewport.vue";
import ModeIcon from "./ModeIcon.vue";
import ToolButton from "./ToolButton.vue";
import FitIcon from "./FitIcon.vue";
import ObjectPanel from "./ObjectPanel.vue";
import Inspector from "./Inspector.vue";
import PanelSection from "./PanelSection.vue";
import Settings from "./Settings.vue";
import StatusBar from "./StatusBar.vue";
import BugReport from "./BugReport.vue";

import { decodeImageFile } from "../editor/imageImport";
import { tools } from "./tools";
import { handleShortcut, handleClipboard } from "./shortcuts";
const printActive = ref(false);
const appVersion = __APP_VERSION__;
const printWorkspace = ref<InstanceType<typeof PrintWorkspace>>();
const imagePicker = ref<HTMLInputElement | null>(null);
async function importImage(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const original = editor.document;
  try {
    const image = await decodeImageFile(file);
    if (editor.document !== original)
      throw Error("Project changed during image import; please try again");
    await editor.insertImage(image);
  } catch (error) { editor.message = String(error); editor.notify(); }
}
let allowDesktopClose = false;
const nativeSaving = isTauri() || "showSaveFilePicker" in window;
const renaming = ref(false);
const draftName = ref("");
function editableName(name: string) {
  return name.replace(/\.leather(?:\.json)?$/i, "");
}
function startRename(event: FocusEvent) {
  if (editor.fileBusy) {
    (event.target as HTMLInputElement).blur();
    return;
  }
  draftName.value = editableName(editor.name);
  renaming.value = true;
}
function finishRename() {
  if (!renaming.value) return;
  editor.rename(draftName.value);
  renaming.value = false;
  draftName.value = editableName(editor.name);
}
const e = useEditor();
watch(
  () => e.value.name,
  (name) => {
    if (!renaming.value) draftName.value = editableName(name);
  },
  { immediate: true },
);
function cancelRename(event: KeyboardEvent) {
  renaming.value = false;
  draftName.value = editableName(editor.name);
  (event.target as HTMLInputElement).blur();
}
function applyRename(event: KeyboardEvent) {
  if (event.isComposing || event.repeat) return;
  finishRename();
  (event.target as HTMLInputElement).blur();
  void editor.save();
}
const editing = ref("");
const hint = computed(() => editorHint(e.value, editing.value));
function hintFocus(event: FocusEvent) {
  const target = event.target as HTMLElement;
  editing.value =
    target.closest<HTMLElement>("[data-hint-edit]")?.dataset.hintEdit ?? "";
}
const panel = ref(localStorage.getItem("panel-right") !== "false"),
  left = ref(localStorage.getItem("panel-left") !== "false"),
  bottom = ref(localStorage.getItem("panel-bottom") !== "false"),
  update = ref<ServiceWorker | null>(null);
watch([panel, left, bottom], () => {
  localStorage.setItem("panel-right", String(panel.value));
  localStorage.setItem("panel-left", String(left.value));
  localStorage.setItem("panel-bottom", String(bottom.value));
});
watch(
  () => e.value.theme,
  (theme) => {
    document.documentElement.dataset.theme = theme;
    editor.notify();
  },
  { immediate: true },
);
function toggleInspector() {
  void editor.finishProperty();
  panel.value = !panel.value;
}
function reload() {
  if (update.value && editor.confirmReplace()) {
    update.value.postMessage("activate");
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => location.reload(),
      { once: true },
    );
  }
}
onMounted(async () => {
  if (!isTauri()) return;
  startDesktopUpdates();
  let opening = false;
  const openPending = async () => {
    if (opening || !editor.ready || editor.fileBusy) return;
    opening = true;
    try {
      const requestId = await invoke<number | null>("pending_files");
      if (requestId !== null) {
        try { await editor.open(requestId); }
        finally { await invoke("clear_pending", { requestId }); }
      }
    } catch (error) { editor.fail(error); }
    finally { opening = false; }
  };
  const timer = setInterval(() => void openPending(), 500);
  let cleanupDesktop = () => {};
  onUnmounted(() => { clearInterval(timer); cleanupDesktop(); });
  const unerror = await listen<string>("desktop-error", event => { editor.message = event.payload; editor.notify(); });
  const unlisten = await listen("project-open", () => void openPending());
  const desktopWindow = getCurrentWindow();
  const unclose = await desktopWindow.onCloseRequested(desktopCloseHandler({
    busy: () => editor.fileBusy,
    confirm: () => editor.confirmReplacement(),
    destroy: async () => {
      allowDesktopClose = true;
      try { await desktopWindow.destroy(); }
      catch (error) { allowDesktopClose = false; throw error; }
    },
    fail: error => editor.fail(error),
  }));
  const links = (event: MouseEvent) => {
    const anchor = (event.target as Element)?.closest?.("a");
    if (!anchor) return;
    if (anchor.pathname === "/manual/index.html") { event.preventDefault(); void openHelp(); }
    else if (/^https?:/.test(anchor.href)) { event.preventDefault(); void openExternal(anchor.href); }
  };
  document.addEventListener("click", links);
  cleanupDesktop = () => { unerror(); unlisten(); unclose(); document.removeEventListener("click", links); };
});
onMounted(() => {
  const key = (event: KeyboardEvent) =>
    !printActive.value && handleShortcut(event, () => {
      void openHelp();
    });
  const clipboard = (event: ClipboardEvent) => { if (!printActive.value) handleClipboard(event); };
  const up = (e: KeyboardEvent) => {
    if (e.code === "Space") editor.space = false;
  };
  const blur = () => {
    editor.space = false;
    editor.pauseGesture();
  };
  const leave = (e: BeforeUnloadEvent) => {
    if (!allowDesktopClose && editor.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  const releasePan = () => {
    editor.space = false;
  };
  window.addEventListener("focusout", releasePan);
  window.addEventListener("keydown", key);
  window.addEventListener("copy", clipboard);
  window.addEventListener("paste", clipboard);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  window.addEventListener("beforeunload", leave);
  onUnmounted(() => {
    window.removeEventListener("focusout", releasePan);
    window.removeEventListener("keydown", key);
    window.removeEventListener("copy", clipboard);
    window.removeEventListener("paste", clipboard);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
    window.removeEventListener("beforeunload", leave);
  });
});
onMounted(() => {
  if (isTauri() || !import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => {
      if (reg.waiting) update.value = reg.waiting;
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            update.value = worker;
        });
      });
    })
    .catch(() =>
      editor.fail(Error("Offline caching unavailable in this browser")),
    );
});
</script>
<template>
  <main @focusin="hintFocus" @focusout="editing = ''">
    <header>
      <div class="brand">
        <img class="brand-icon" :src="brandIcon" alt="" width="32" height="32" />
        <strong>
          LEATHER
          <span>PATTERN</span>
          <span class="brand-subtitle">STUDIO</span>
        </strong>
      </div>
      <span class="document-name">
        <input
          v-model="draftName"
          class="filename-input"
          aria-label="Project filename"
          title="Rename project"
          :disabled="!e.ready"
          :size="Math.max(12, draftName.length)"
          spellcheck="false"
          @focus="startRename"
          @keydown.enter.prevent="applyRename"
          @keydown.esc.prevent="cancelRename"
          @blur="finishRename()"
        />
        <span v-if="e.dirty"> •</span>
      </span>
      <div class="header-actions" :title="nativeSaving ? undefined : 'Save downloads a copy; click the filename to rename it. Open reopens saved JSON files.'">
        <button :disabled="!e.ready" @click="editor.newProject()">New</button>
        <button :disabled="!e.ready" @click="editor.open()">Open</button>
        <button
          :disabled="!e.ready"
          title="Save (Ctrl/⌘+S)"
          @click="editor.save()"
        >
          Save
        </button>
        <button v-if="printActive" :disabled="!e.ready" @click="printWorkspace?.openExport()">Export</button>
        <BugReport :print-active="printActive" />
        <a
          class="feedback-link"
          href="https://github.com/wieli99/Leather-Pattern-Studio/discussions"
          target="_blank"
          rel="noopener noreferrer"
          title="Share feedback on GitHub (opens in a new tab)"
        >Feedback</a>
        <a
          href="/manual/index.html"
          target="_blank"
          rel="noopener"
          aria-label="Help"
          title="User manual (? on canvas)"
          >?</a
        >
      </div>
    </header>
    <div v-if="isTauri() && desktopUpdates.url.value" class="notice" role="status">
      <span>{{ desktopUpdates.message.value }}</span>
      <button @click="openExternal(desktopUpdates.url.value)">Open GitHub release</button>
    </div>
    <PrintWorkspace
      ref="printWorkspace"
      v-model:left="left"
      v-model:panel="panel"
      v-model:bottom="bottom"
      @active="printActive = $event"
    />
    <section v-show="!printActive" class="workspace">
      <ToolRail v-if="left" aria-label="Drawing tools">
        <template v-for="tool in tools" :key="tool.id">
          <div
            v-if="tool.id === 'text'"
            class="rail-divider"
            role="separator"
            aria-label="Stitching tools"
          />
          <RailButton v-if="tool.id === 'text'" shortcut="I" title="Stitch line (I)" aria-label="Stitch line" aria-keyshortcuts="i" :aria-pressed="e.stitchMode" :disabled="!e.ready || !e.canStitch" @click="editor.activateStitch()">
            <span class="tool-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path :d="stitchLineIcon" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          </RailButton>
          <div v-if="tool.id === 'text'" class="rail-divider" role="separator" aria-label="Text and indicator tools" />
          <ToolButton :tool="tool" />
        </template>
        <input ref="imagePicker" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" hidden @change="importImage" />
        <RailButton title="Import image" aria-label="Import image" :disabled="!e.ready" @click="imagePicker?.click()"><span class="tool-icon"><ModeIcon mode="image" /></span></RailButton>
        <div class="rail-divider" />
        <RailButton
          title="Undo (Ctrl/⌘+Z)"
          aria-label="Undo"
          :disabled="!e.canUndo"
          @click="editor.transact('undo')"
        >
          ↶
        </RailButton>
        <RailButton
          title="Redo (Ctrl/⌘+Shift+Z)"
          aria-label="Redo"
          :disabled="!e.canRedo"
          @click="editor.transact('redo')"
        >
          ↷
        </RailButton>
        <RailButton
          title="Fit (F)"
          aria-label="Fit"
          :disabled="!e.ready"
          @click="editor.fit()"
        >
          <span class="tool-icon"><FitIcon /></span>
        </RailButton>
      </ToolRail>
      <div :class="`viewport tool-${e.tool}`">
        <TransformToolbox />
        <ConstructionMeasurements />
        <button
          class="edge-tab edge-left"
          :aria-label="left ? 'Hide tools' : 'Show tools'"
          :aria-expanded="left"
          @click="left = !left"
        >
          {{ left ? "‹" : "›" }}
        </button>
        <button
          class="edge-tab edge-right"
          :aria-label="panel ? 'Hide inspector' : 'Show inspector'"
          :aria-expanded="panel"
          @click="toggleInspector"
        >
          {{ panel ? "›" : "‹" }}
        </button>
        <button
          class="edge-tab edge-bottom"
          :aria-label="bottom ? 'Hide status bar' : 'Show status bar'"
          :aria-expanded="bottom"
          @click="bottom = !bottom"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              :d="bottom ? 'M3 4L6 7L9 4' : 'M3 8L6 5L9 8'"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </button>
        <Viewport />
        <div v-if="!e.ready" class="loading">{{ e.message }}</div>
      </div>
      <aside v-if="panel" aria-label="Model objects and properties">
        <section class="sidebar-section" aria-label="Model objects">
          <ObjectPanel />
        </section>
        <PanelSection v-if="e.active.length" class="sidebar-section" section-key="properties" title="Properties">
          <p class="selection-summary">{{ e.active.length === 1 ? e.active[0].kind.replaceAll("-", " ") : `${e.active.length} objects selected` }}</p>
          <Inspector />
        </PanelSection>
        <PanelSection class="inspector-hint" section-key="help" title="Tool help">
          <p>{{ hint.action }}</p>
          <dl>
            <template v-for="control in hint.controls" :key="control.id"
              ><dt>{{ control.gesture }}</dt>
              <dd>{{ control.action }}</dd></template
            >
          </dl>
        </PanelSection>
      </aside>
    </section>
    <div v-if="e.restore" class="notice" role="status">
      <span>
        Recover a project from {{ new Date(e.restore.time).toLocaleString() }}?
      </span>
      <button @click="editor.restoreProject()">Restore</button>
      <button
        @click="
          editor.restore = undefined;
          editor.notify();
        "
      >
        Dismiss
      </button>
    </div>
    <div v-if="update" class="notice">
      <span>An update is ready. Save your project before reloading.</span>
      <button @click="reload">Reload</button>
    </div>
    <footer v-if="bottom && !printActive">
      <StatusBar />
      <div class="center-settings">
        <label>
          <input
            type="checkbox"
            :checked="e.grid"
            @change="
              editor.grid = ($event.target as HTMLInputElement).checked;
              editor.preferences();
            "
          />
          Grid snap
        </label>
        <label title="Snap to object points and align with object edges and centers">
          <input
            type="checkbox"
            :checked="e.objects"
            @change="
              editor.objects = ($event.target as HTMLInputElement).checked;
              editor.preferences();
            "
          />
          Object snap
        </label>
        <Settings />
      </div>
      <StatusBar coordinates />
      <span class="app-version" title="Application version">v{{ appVersion }}</span>
      <BugReport :print-active="printActive" icon-only />
    </footer>
  </main>
</template>
