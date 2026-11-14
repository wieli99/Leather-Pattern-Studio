<script setup lang="ts">
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuPortal,
  ContextMenuContent,
  ContextMenuItem,
} from "reka-ui";
import {
  ref,
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  watch,
} from "vue";
import FavoriteMenuAction from "./FavoriteMenuAction.vue";
import FavoriteToolButton from "./FavoriteToolButton.vue";
import ReorderSlot from "./ReorderSlot.vue";
import ReorderFloating from "./ReorderFloating.vue";
import { useReorderDrag } from "./useReorderDrag";
import ToolDocumentationAction from "./ToolDocumentationAction.vue";
import { focusModelCanvas } from "./canvasFocus";
import {
  toolCatalog as catalog,
  parseFavorites,
  defaultFavorites,
  favoritesStorageKey,
} from "./toolCatalog";
function load() {
  try {
    return parseFavorites(localStorage.getItem(favoritesStorageKey));
  } catch {
    return [...defaultFavorites];
  }
}
const favorites = ref(load()),
  open = ref(false),
  query = ref(""),
  input = ref<HTMLInputElement>(),
  root = ref<HTMLElement>(),
  bar = ref<HTMLElement>();
watch(
  favorites,
  (value) => {
    try {
      localStorage.setItem(favoritesStorageKey, JSON.stringify(value));
    } catch {}
  },
  { deep: true },
);
const results = computed(() =>
  catalog.filter((t) =>
    query.value
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .every((word) => (t[1] + " " + t[3]).toLowerCase().includes(word)),
  ),
);
async function show() {
  open.value = true;
  query.value = "";
  await nextTick();
  input.value?.focus();
}
function close() {
  open.value = false;
  focusModelCanvas();
}
function navigate(e: KeyboardEvent) {
  if (e.key === "Enter" && e.target === input.value) {
    e.preventDefault();
    document
      .querySelector<HTMLButtonElement>(".search-row > button:not(:disabled):not(.search-options)")
      ?.click();
    return;
  }

  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      ".search-row > button:not(:disabled):not(.search-options)",
    ) ?? [],
  );
  if (!buttons.length) return;
  e.preventDefault();
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[
    (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
  ].focus();
}
function toggleFavorite(id: string) {
  if (favorites.value.includes(id)) {
    favorites.value = favorites.value.filter((t) => t !== id);
    return;
  }
  add(id);
}
function add(id: string) {
  if (favorites.value.length < 10 && !favorites.value.includes(id))
    favorites.value = [...favorites.value, id];
}
const dragging = ref("");
const destination = ref(0);
let suppress = false;
const drag = useReorderDrag({
  activate() {
    suppress = true;
  },
  move(e) {
    const b = bar.value?.getBoundingClientRect();
    if (
      !b ||
      e.clientY < b.top - 20 ||
      e.clientY > b.bottom + 20 ||
      e.clientX < b.left ||
      e.clientX > b.right
    )
      return false;
    if (document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-reorder-slot]")) return true;
    const items = Array.from(
      bar.value!.querySelectorAll<HTMLElement>("[data-favorite]"),
    ).filter((el) => el.dataset.favorite !== dragging.value);
    destination.value = items.filter(
      (el) =>
        e.clientX >
        el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2,
    ).length;
    return true;
  },
  drop() {
    const ids = favorites.value.filter((id) => id !== dragging.value);
    ids.splice(destination.value, 0, dragging.value);
    favorites.value = ids;
  },
  end() {
    dragging.value = "";
    setTimeout(() => (suppress = false), 0);
  },
  current: () => !!dragging.value,
  scroll: () => bar.value ?? null,
  horizontal: true,
});
const displayedFavorites = computed(() => {
  if (!drag.state.value) return favorites.value;
  const ids = favorites.value.filter((id) => id !== dragging.value);
  ids.splice(destination.value, 0, "__slot__");
  return ids;
});
function start(e: PointerEvent, id: string) {
  if (e.button !== 0) return;
  drag.cancel();
  dragging.value = id;
  const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
  drag.start(e, {
    width: b.width,
    height: b.height,
    label: catalog.find((t) => t[0] === id)![1],
    count: 1,
  });
}
onMounted(() => {
  window.addEventListener("tool-search", show);
});
onBeforeUnmount(() => {
  window.removeEventListener("tool-search", show);
});
</script>
<template>
  <div ref="root" class="tool-search-root">
    <PopoverRoot v-model:open="open" :modal="false">
      <PopoverPortal
        ><PopoverContent
          class="tool-search-popup"
          side="top"
          align="start"
          :side-offset="10"
          :collision-padding="12"
          aria-label="Search tools"
          @open-auto-focus.prevent="input?.focus()"
          @keydown="navigate"
        >
          <input
            ref="input"
            v-model="query"
            aria-label="Search tools"
            placeholder="Search tools…"
          />
          <div class="search-results">
            <p v-if="!results.length">No tools found.</p>
            <ContextMenuRoot v-for="tool in results" :key="tool[0]"
              ><ContextMenuTrigger as-child
                ><div class="search-row">
                  <FavoriteToolButton
                    :id="tool[0]"
                    :label="tool[1]"
                    :shortcut="tool[2]"
                    @activated="close"
                  />
                  <DropdownMenuRoot :modal="false"
                    ><DropdownMenuTrigger
                      class="search-options"
                      :aria-label="'Options for ' + tool[1]"
                      >…</DropdownMenuTrigger
                    >
                    <DropdownMenuPortal
                      ><DropdownMenuContent
                        class="search-action-menu"
                        side="right"
                        align="start"
                        :side-offset="6"
                        :collision-padding="12"
                      >
                        <DropdownMenuItem as-child
                          ><ToolDocumentationAction :id="tool[0]"
                        /></DropdownMenuItem>
                        <DropdownMenuItem as-child
                          ><FavoriteMenuAction
                            :adding="!favorites.includes(tool[0])"
                            :disabled="
                              !favorites.includes(tool[0]) &&
                              favorites.length >= 10
                            "
                            @click="toggleFavorite(tool[0])"
                        /></DropdownMenuItem> </DropdownMenuContent></DropdownMenuPortal
                  ></DropdownMenuRoot></div></ContextMenuTrigger
              ><ContextMenuPortal
                ><ContextMenuContent class="search-action-menu">
                  <ContextMenuItem as-child
                    ><ToolDocumentationAction :id="tool[0]"
                  /></ContextMenuItem>
                  <ContextMenuItem as-child
                    ><FavoriteMenuAction
                      :adding="!favorites.includes(tool[0])"
                      :disabled="
                        !favorites.includes(tool[0]) && favorites.length >= 10
                      "
                      @click="
                        toggleFavorite(tool[0])
                      " /></ContextMenuItem></ContextMenuContent></ContextMenuPortal
            ></ContextMenuRoot>
          </div> </PopoverContent
      ></PopoverPortal>
      <div
        class="transform-toolbox"
        role="toolbar"
        aria-label="Transform selection"
      >
        <PopoverTrigger
          aria-label="Search tools"
          title="Search tools (F)"
          aria-keyshortcuts="f"
          @click="query = ''"
          ><svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="7" />
            <path d="m15 15 6 6" /></svg
        ></PopoverTrigger>
        <span
          class="favorite-separator"
          role="separator"
          aria-orientation="vertical"
        ></span>
        <div ref="bar" class="favorite-bar">
          <template v-for="id in displayedFavorites" :key="id"
            ><ReorderSlot
              v-if="id === '__slot__'"
              :height="40"
              :width="40" /><ContextMenuRoot v-else
              ><ContextMenuTrigger as-child
                ><span
                  :data-favorite="id"
                  @pointerdown="start($event, id)"
                  @click.capture="suppress && $event.stopImmediatePropagation()"
                >
                  <FavoriteToolButton :id="id" /> </span></ContextMenuTrigger
              ><ContextMenuPortal
                ><ContextMenuContent class="search-action-menu"
                  ><ContextMenuItem as-child
                    ><FavoriteMenuAction
                      @click="
                        toggleFavorite(id)
                      " /></ContextMenuItem></ContextMenuContent></ContextMenuPortal></ContextMenuRoot
          ></template>
        </div>
      </div>
    </PopoverRoot>
    <ReorderFloating :state="drag.state.value" />
  </div>
</template>
<style>
.tool-search-root {
  position: relative;
  align-self: center;
  max-width: 100%;
}
.favorite-bar {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}
.favorite-bar > span {
  flex-shrink: 0;
}
.favorite-bar button[aria-pressed="true"] {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.favorite-bar button[aria-pressed="true"]:not(:focus-visible) {
  outline: none;
}
.favorite-bar button:disabled {
  pointer-events: none;
}
.favorite-separator {
  border-left: 1px solid var(--border);
  height: 26px;
  align-self: center;
  margin: 0 6px;
}
.tool-search-popup {
  width: min(360px, calc(100vw - 24px));
  box-sizing: border-box;
  padding: 8px;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 25px #0005;
  z-index: 30;
}
.tool-search-popup input {
  width: 100%;
  box-sizing: border-box;
  background: var(--input);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 10px 12px;
  font: inherit;
  margin-bottom: 6px;
}
.search-results {
  max-height: min(220px, calc(100vh - 180px));
  overflow-y: auto;
}
.search-row {
  display: flex;
  align-items: center;
  gap: 2px;
}
.search-row > button:first-child {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  text-align: left;
  background: transparent;
  border: 0;
  padding: 9px 8px;
  border-radius: 4px;
  color: var(--text);
  font: inherit;
}
.search-row svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.search-row kbd {
  margin-left: auto;
  font-size: 11px;
}
.search-options {
  background: transparent;
  border: 0;
  color: var(--text);
  width: 30px;
  min-height: 36px;
  border-radius: 4px;
}
.search-row button:hover:not(:disabled),
.search-action-menu [data-highlighted] {
  background: var(--border);
}
.search-row button:disabled {
  opacity: 0.4;
  pointer-events: none;
}
.search-action-menu {
  z-index: 50;
  min-width: 200px;
  padding: 5px;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 25px #0005;
}
.search-action-menu a,
.search-action-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  padding: 9px 10px;
  text-align: left;
  color: inherit;
  text-decoration: none;
  background: transparent;
  border: 0;
  font: inherit;
  border-radius: 3px;
}
</style>
