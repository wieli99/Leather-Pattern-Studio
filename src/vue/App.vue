<script setup lang="ts">
import { computed } from "vue";
import { editorHint } from "../editor/hint";
import ConstructionMeasurements from "./ConstructionMeasurements.vue";
import TransformToolbox from "./TransformToolbox.vue";
import { ref, watch, onMounted, onUnmounted } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import Viewport from "./Viewport.vue";
import ToolButton from "./ToolButton.vue";
import ObjectPanel from "./ObjectPanel.vue";
import Inspector from "./Inspector.vue";
import Settings from "./Settings.vue";
import StatusBar from "./StatusBar.vue";

import { tools } from "./tools";
import { handleShortcut, handleClipboard } from "./shortcuts";
const nativeSaving = "showSaveFilePicker" in window;
const renaming = ref(false);
const draftName = ref("");
function startRename(event: FocusEvent) {
  if (editor.fileBusy) {
    (event.target as HTMLInputElement).blur();
    return;
  }
  draftName.value = editor.name;
  renaming.value = true;
}
function finishRename() {
  if (!renaming.value) return;
  editor.rename(draftName.value);
  renaming.value = false;
  draftName.value = editor.name;
}
const e = useEditor();
watch(
  () => e.value.name,
  (name) => {
    if (!renaming.value) draftName.value = name;
  },
  { immediate: true },
);
function cancelRename(event: KeyboardEvent) {
  renaming.value = false;
  draftName.value = editor.name;
  (event.target as HTMLInputElement).blur();
}
function applyRename(event: KeyboardEvent) {
  (event.target as HTMLInputElement).blur();
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
onMounted(() => {
  const key = (event: KeyboardEvent) =>
    handleShortcut(event, () => {
      window.open("/manual/index.html", "_blank", "noopener");
    });
  const up = (e: KeyboardEvent) => {
    if (e.code === "Space") editor.space = false;
  };
  const blur = () => {
    editor.space = false;
    editor.pauseGesture();
  };
  const leave = (e: BeforeUnloadEvent) => {
    if (editor.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  const releasePan = () => {
    editor.space = false;
  };
  window.addEventListener("focusout", releasePan);
  window.addEventListener("keydown", key);
  window.addEventListener("copy", handleClipboard);
  window.addEventListener("paste", handleClipboard);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  window.addEventListener("beforeunload", leave);
  onUnmounted(() => {
    window.removeEventListener("focusout", releasePan);
    window.removeEventListener("keydown", key);
    window.removeEventListener("copy", handleClipboard);
    window.removeEventListener("paste", handleClipboard);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
    window.removeEventListener("beforeunload", leave);
  });
});
onMounted(() => {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
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
        <span class="brand-icon">⌑</span>
        <strong>
          LEATHER
          <span>STUDIO</span>
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
    <section class="workspace">
      <nav v-if="left" aria-label="Drawing tools">
        <template v-for="tool in tools" :key="tool.id">
          <div
            v-if="tool.id === 'text'"
            class="rail-divider"
            role="separator"
            aria-label="Indicator tools"
          />
          <ToolButton :tool="tool" />
        </template>
        <div class="rail-divider" />
        <button
          title="Undo (Ctrl/⌘+Z)"
          aria-label="Undo"
          :disabled="!e.canUndo"
          @click="editor.transact('undo')"
        >
          ↶
        </button>
        <button
          title="Redo (Ctrl/⌘+Shift+Z)"
          aria-label="Redo"
          :disabled="!e.canRedo"
          @click="editor.transact('redo')"
        >
          ↷
        </button>
      </nav>
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
      <aside v-if="panel">
        <ObjectPanel />
        <hr class="sidebar-separator" />
        <h2>Properties</h2>
        <Inspector />
        <div class="inspector-hint">
          <p>{{ hint.action }}</p>
          <dl>
            <template v-for="control in hint.controls" :key="control.id"
              ><dt>{{ control.gesture }}</dt>
              <dd>{{ control.action }}</dd></template
            >
          </dl>
        </div>
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
    <footer v-if="bottom">
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
    </footer>
  </main>
</template>
