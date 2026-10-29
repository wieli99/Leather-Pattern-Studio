<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import Viewport from "./Viewport.vue";
import ToolButton from "./ToolButton.vue";
import ObjectRow from "./ObjectRow.vue";
import Inspector from "./Inspector.vue";
import Settings from "./Settings.vue";
import StatusBar from "./StatusBar.vue";
import HelpDialog from "./HelpDialog.vue";
import { tools } from "./tools";
const e = useEditor();
const panel = ref(localStorage.getItem("panel-right") !== "false"),
  left = ref(localStorage.getItem("panel-left") !== "false"),
  bottom = ref(localStorage.getItem("panel-bottom") !== "false"),
  help = ref(false),
  update = ref<ServiceWorker | null>(null),
  helpTrigger = ref<HTMLButtonElement | null>(null);
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
watch(help, async (value) => {
  if (!value) {
    await nextTick();
    helpTrigger.value?.focus();
  }
});
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
  const key = (e: KeyboardEvent) => {
    const typing = (e.target as HTMLElement).closest(
      "input,textarea,[contenteditable=true]",
    );
    if (
      typing ||
      document.querySelector("[role=dialog]") ||
      (e.target as HTMLElement).closest("[role=menu]")
    )
      return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.code === "Space") {
      e.preventDefault();
      editor.space = true;
    }
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void editor.save(e.shiftKey);
      return;
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      editor.cancel();
      void editor.transact(e.shiftKey ? "redo" : "undo");
      return;
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      editor.duplicate();
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      editor.selected = editor.document.shapes.map((s) => s.id);
      editor.notify();
      return;
    }
    if (e.key === "Escape") {
      editor.setMode("select");
    }
    if (e.key === "Enter") {
      editor.finish();
    }
    if (e.key === "Backspace" && editor.pending.length) {
      e.preventDefault();
      editor.pending = editor.pending.slice(0, -1);
      editor.notify();
    } else if (["Delete", "Backspace"].includes(e.key)) {
      e.preventDefault();
      editor.delete();
    }
    if (e.key === "f" || e.key === "F") editor.fit(e.shiftKey);
    if (!mod && !e.repeat) {
      if (e.key.toLowerCase() === "r" || e.key.toLowerCase() === "c") {
        editor.cycle(e.key.toLowerCase() === "r" ? "rectangle" : "circle");
        return;
      }
      const tool = tools.find(
        (t) => t.key.toLowerCase() === e.key.toLowerCase(),
      );
      if (tool) editor.setTool(tool.id);
    }
  };
  const up = (e: KeyboardEvent) => {
    if (e.code === "Space") editor.space = false;
  };
  const blur = () => {
    editor.space = false;
    editor.cancel();
  };
  const leave = (e: BeforeUnloadEvent) => {
    if (editor.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("keydown", key);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  window.addEventListener("beforeunload", leave);
  onUnmounted(() => {
    window.removeEventListener("keydown", key);
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
  <main>
    <header>
      <div class="brand">
        <span class="brand-icon">⌑</span>
        <strong>
          LEATHER
          <span>STUDIO</span>
        </strong>
      </div>
      <span class="document-name">{{ e.name }}{{ e.dirty ? " •" : "" }}</span>
      <div class="header-actions">
        <button :disabled="!e.ready" @click="editor.newProject()">New</button>
        <button :disabled="!e.ready" @click="editor.open()">Open</button>
        <button :disabled="!e.ready" @click="editor.save()">Save</button>
        <button :disabled="!e.ready" @click="editor.save(true)">Save as</button>
        <button ref="helpTrigger" aria-label="Help" @click="help = true">
          ?
        </button>
      </div>
    </header>
    <section class="workspace">
      <nav v-if="left" aria-label="Drawing tools">
        <ToolButton v-for="tool in tools" :key="tool.id" :tool="tool" />
        <div class="rail-divider" />
        <button
          title="Undo (Ctrl/⌘ Z)"
          aria-label="Undo"
          :disabled="!e.canUndo"
          @click="editor.transact('undo')"
        >
          ↶
        </button>
        <button
          title="Redo (Ctrl/⌘ Shift Z)"
          aria-label="Redo"
          :disabled="!e.canRedo"
          @click="editor.transact('redo')"
        >
          ↷
        </button>
      </nav>
      <div :class="`viewport tool-${e.tool}`">
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
        <div class="viewport-top">
          <span>
            TOP
            <small>2D / mm</small>
          </span>
          <div>
            <button @click="editor.fit()">
              Fit all
              <kbd>F</kbd>
            </button>
            <button :disabled="!e.selected.length" @click="editor.fit(true)">
              Fit selection
            </button>
          </div>
        </div>
        <div
          v-if="!e.document.shapes.length && !e.pending.length"
          class="empty"
        >
          <span>DESIGN WITH PRECISION</span>
          <h1>Start with a shape.</h1>
          <p>
            Choose a tool, then click points or drag a shape.
            <br />
            Refine dimensions in Properties.
          </p>
          <button @click="editor.setTool('rectangle')">
            Draw a rectangle
            <kbd>R</kbd>
          </button>
        </div>
        <div class="construction-hint">
          {{ e.pending.length ? e.instruction : "" }}
        </div>
        <div v-if="!e.ready" class="loading">{{ e.message }}</div>
      </div>
      <aside v-if="panel">
        <h2>Objects</h2>
        <div class="objects">
          <ObjectRow
            v-for="shape in e.document.shapes"
            :key="shape.id"
            :shape="shape"
            :selected="e.selected.includes(shape.id)"
          />
          <p v-if="!e.document.shapes.length">Your shapes will appear here.</p>
        </div>
        <h2>Properties</h2>
        <Inspector />
        <div class="inspector-hint">
          Square handle · Scale uniformly
          <br />
          Round handle · Rotate
          <br />
          Shift + click · Multiple selection
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
        <label>
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
    <HelpDialog v-model:open="help" />
  </main>
</template>
