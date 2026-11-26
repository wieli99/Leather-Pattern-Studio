<script setup lang="ts">
import { openHelp, openExternal } from "../platform";
import { desktopOpenRequestPump } from "../desktopOpenRequests";
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
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import Viewport from "./Viewport.vue";
import ModeIcon from "./ModeIcon.vue";
import ToolButton from "./ToolButton.vue";
import RailHistoryButtons from "./RailHistoryButtons.vue";
import EdgeTabs from "./EdgeTabs.vue";
import SnapToggles from "./SnapToggles.vue";
import HeaderActions from "./HeaderActions.vue";
import { usePanelVisibility } from "./useCompactLayout";
import ObjectPanel from "./ObjectPanel.vue";
import Inspector from "./Inspector.vue";
import PanelSection from "./PanelSection.vue";
import Settings from "./Settings.vue";
import Variables from "./Variables.vue";
import StatusBar from "./StatusBar.vue";
import BugReport from "./BugReport.vue";
import ImageImport from "./ImageImport.vue";

import { tools } from "./tools";
import { handleShortcut, handleClipboard } from "./shortcuts";
const printActive = ref(false);
const appVersion = __APP_VERSION__;
const printWorkspace = ref<InstanceType<typeof PrintWorkspace>>();
const importReviewOpen = ref(false);
let allowDesktopClose = false;
const desktopBridgeReady = ref(!isTauri());
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
const numericEditing = ref(false);
const hint = computed(() =>
  editorHint(e.value, editing.value, numericEditing.value),
);
function hintFocus(event: FocusEvent) {
  const target = event.target as HTMLElement;
  const editable =
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable ||
    (target instanceof HTMLInputElement &&
      ["text", "number"].includes(target.type) &&
      !target.readOnly);
  editing.value = editable
    ? (target.closest<HTMLElement>("[data-hint-edit]")?.dataset.hintEdit ?? "")
    : "";
  numericEditing.value =
    editable &&
    !!target.dataset.wheelMode &&
    target.dataset.wheelMode !== "false";
}
watch(
  [
    () => e.value.array?.kind,
    () => e.value.transformTool,
    () => e.value.offsetActive,
    () => e.value.alignActive,
    () => e.value.calibrationActive,
    () => e.value.stitch.tool,
    () => e.value.mode,
    () => e.value.revision,
    () => e.value.name,
  ],
  () => {
    if (
      !(document.activeElement instanceof HTMLElement) ||
      !document.activeElement.closest("[data-hint-edit]")
    ) {
      editing.value = "";
      numericEditing.value = false;
    }
  },
  { flush: "post" },
);
const { panel, left, bottom } = usePanelVisibility();
const update = ref<ServiceWorker | null>(null);
const gridSnap = computed({
  get: () => e.value.grid,
  set: (value: boolean) => { editor.grid = value; editor.preferences(); },
});
const objectSnap = computed({
  get: () => e.value.objects,
  set: (value: boolean) => { editor.objects = value; editor.preferences(); },
});
watch(
  () => e.value.theme,
  (theme) => {
    document.documentElement.dataset.theme = theme;
    editor.notify();
  },
  { immediate: true },
);
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
  const openPending = desktopOpenRequestPump({
    available: () => desktopBridgeReady.value && editor.ready && !editor.fileBusy,
    pending: () => invoke<number | null>("pending_files"),
    open: requestId => editor.open(requestId),
    acknowledge: requestId => invoke<void>("clear_pending", { requestId }),
    fail: error => editor.fail(error),
  });
  const timer = setInterval(() => void openPending(), 500);
  let cleanupDesktop = () => {};
  onUnmounted(() => { clearInterval(timer); cleanupDesktop(); });
  const unerror = await listen<string>("desktop-error", event => { editor.message = event.payload; editor.notify(); });
  const unlisten = await listen("project-open", () => void openPending());
  const desktopWindow = getCurrentWindow();
  const requestClose = desktopCloseHandler({
    busy: () => editor.fileBusy,
    confirm: () => editor.confirmReplacement(),
    destroy: async quit => {
      allowDesktopClose = true;
      try { await invoke("close_editor", { quit }); }
      catch (error) { allowDesktopClose = false; throw error; }
    },
    fail: error => editor.fail(error),
  });
  const unclose = await desktopWindow.onCloseRequested(requestClose);
  const unquit = await listen("app-quit-requested", () => {
    void requestClose({ preventDefault() {}, quit: true });
  });
  const links = (event: MouseEvent) => {
    const anchor = (event.target as Element)?.closest?.("a");
    if (!anchor) return;
    if (anchor.pathname === "/manual/index.html") { event.preventDefault(); void openHelp(); }
    else if (/^https?:/.test(anchor.href)) { event.preventDefault(); void openExternal(anchor.href); }
  };
  document.addEventListener("click", links);
  cleanupDesktop = () => { unerror(); unlisten(); unclose(); unquit(); document.removeEventListener("click", links); };
  await invoke("desktop_ready");
  desktopBridgeReady.value = true;
  await nextTick();
  document.querySelector<HTMLCanvasElement>('[aria-label="Pattern drawing canvas"]')?.focus();
});
onMounted(() => {
  const key = (event: KeyboardEvent) =>
    !printActive.value && !importReviewOpen.value && handleShortcut(event, () => {
      void openHelp();
    });
  const clipboard = (event: ClipboardEvent) => { if (!printActive.value && !importReviewOpen.value) handleClipboard(event); };
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
  <main :inert="!desktopBridgeReady" @focusin="hintFocus" @focusout="editing = ''">
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
      <HeaderActions
        :print-active="printActive"
        :native-saving="nativeSaving"
        :export-print="() => printWorkspace?.openExport()"
      />
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
        <ImageImport v-model:review-open="importReviewOpen" />
        <div class="rail-divider" />
        <RailHistoryButtons :fit="() => editor.fit()" :fit-disabled="!e.ready" />
      </ToolRail>
      <div :class="`viewport tool-${e.tool}`">
        <TransformToolbox />
        <ConstructionMeasurements />
        <EdgeTabs
          v-model:left="left"
          v-model:panel="panel"
          v-model:bottom="bottom"
          :before-panel-toggle="() => editor.finishProperty()"
        />
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
      <span v-if="e.measurementObjectsHidden" class="measurements-hidden-notice" role="status">
        Measurements hidden
        <button type="button" title="Show all measurements (Shift+M on the canvas toggles them)" aria-keyshortcuts="Shift+M" @click="editor.toggleMeasurementObjects()">Show (Shift+M)</button>
      </span>
      <div class="center-settings">
        <SnapToggles v-model:grid="gridSnap" v-model:objects="objectSnap" />
        <Variables />
        <Settings />
      </div>
      <StatusBar coordinates />
      <span class="app-version" title="Application version">v{{ appVersion }}</span>
      <BugReport :print-active="printActive" icon-only />
    </footer>
  </main>
</template>
