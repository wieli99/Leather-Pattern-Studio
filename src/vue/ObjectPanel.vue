<script setup lang="ts">
import ObjectPreview from "./ObjectPreview.vue";
const hoverPreview = ref<{ id?: string; x: number; y: number }>({ x: 0, y: 0 });
function previewRow(event: PointerEvent, id: string) {
  if (event.buttons) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  hoverPreview.value = { id, x: rect.left, y: rect.top };
}
import { computed, ref, onBeforeUnmount, watch } from "vue";
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuPortal,
  ContextMenuContent,
  ContextMenuItem,
} from "reka-ui";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import {
  findObjectNode,
  nodeLocation,
  type ObjectNode,
} from "../model/objectTree";
import ObjectRow from "./ObjectRow.vue";
import { PanelSelection } from "../model/panelSelection";
import { flattenObjectTree } from "../model/objectTree";
const panelSelection = new PanelSelection();
const e = useEditor();
watch(()=>e.value.projectEpoch,()=>{panelSelection.anchor=undefined;hoverPreview.value.id=undefined;});
const naming = ref<string | null>(null),
  draft = ref("");
const rows = computed(() => {
  const result: { node: ObjectNode; depth: number }[] = [];
  function visit(nodes: ObjectNode[], depth: number) {
    for (const node of nodes) {
      result.push({ node, depth });
      if (node.kind === "group" && !e.value.collapsedGroups.has(node.id))
        visit(node.children, depth + 1);
    }
  }
  visit(e.value.tree, 0);
  return result;
});
async function create(
  selection = !!(editor.selected.length || editor.selectedGroups.length),
) {
  const id = await editor.newGroup(selection);
  if (id) {
    naming.value = id;
    draft.value = "Group";
  }
}
function rename(node: ObjectNode) {
  if (
    node.kind !== "group" ||
    editor.isLocked(node.id) ||
    !editor.canToggleObjectState
  )
    return;
  naming.value = node.id;
  draft.value = node.name;
}
function finish(cancel = false) {
  const id = naming.value;
  naming.value = null;
  if (id && !cancel) void editor.renameGroup(id, draft.value);
}
function children(parent: string | null): ObjectNode[] {
  const node = parent ? findObjectNode(editor.tree, parent) : null;
  return node?.kind === "group" ? node.children : editor.tree;
}
function selected(id: string) {
  return e.value.selectedGroups.includes(id);
}
const drag = ref<{
  ids: string[];
  revision: number;
  x: number;
  y: number;
  active: boolean;
} | null>(null);
let frame: number | null = null;
let lastPointer: PointerEvent | null = null;
function scrollFrame() {
  if (drag.value?.active && lastPointer) move(lastPointer);
  if (drag.value) frame = requestAnimationFrame(scrollFrame);
}
const target = ref<{
  id: string;
  parent: string | null;
  index: number;
  kind: "before" | "after" | "inside";
} | null>(null);
function down(event: PointerEvent, id: string) {
  hoverPreview.value.id = undefined;
  if (
    event.button !== 0 ||
    !editor.canToggleObjectState ||
    !(event.target as HTMLElement).closest(".object-select,.group-select")
  )
    return;
  drag.value = {
    ids: editor.panelSelection(id),
    revision: editor.revision,
    x: event.clientX,
    y: event.clientY,
    active: false,
  };
  lastPointer = event;
  frame = requestAnimationFrame(scrollFrame);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", escape);
}
function move(event: PointerEvent) {
  lastPointer = event;
  const d = drag.value;
  if (!d) return;
  if (!d.active && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 6)
    return;
  d.active = true;
  event.preventDefault();
  const panel = document.querySelector<HTMLElement>(".object-tree-list");
  if (panel) {
    const b = panel.getBoundingClientRect();
    if (event.clientY < b.top + 28) panel.scrollTop -= 12;
    if (event.clientY > b.bottom - 28) panel.scrollTop += 12;
    // Keep outdent available while auto-scrolling changes the row under the pointer.
    if (
      event.clientX >= b.left &&
      event.clientX < b.left + 16 &&
      event.clientY >= b.top &&
      event.clientY <= b.bottom &&
      d.ids.some((id) => nodeLocation(editor.tree, id)?.parent != null)
    ) {
      target.value = {
        id: "root",
        parent: null,
        index: editor.tree.filter((n) => !d.ids.includes(n.id)).length,
        kind: "inside",
      };
      return;
    }
  }
  const element = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>("[data-tree-id]");
  target.value = null;
  if (!element) {
    if (
      document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest(".tree-root-drop")
    )
      target.value = {
        id: "root",
        parent: null,
        index: editor.tree.filter((n) => !d.ids.includes(n.id)).length,
        kind: "inside",
      };
    return;
  }
  const id = element.dataset.treeId!;
  const node = findObjectNode(editor.tree, id),
    location = nodeLocation(editor.tree, id);
  if (!node || !location) return;
  const b = element.getBoundingClientRect();
  if (
    location.parent !== null &&
    event.clientX < b.left + parseFloat(getComputedStyle(element).paddingLeft)
  ) {
    target.value = {
      id: "root",
      parent: null,
      index: editor.tree.filter((n) => !d.ids.includes(n.id)).length,
      kind: "inside",
    };
    return;
  }
  // Reject descendant targets as well as the dragged rows themselves.
  if (
    d.ids.some(
      (x) =>
        x === id ||
        (findObjectNode(editor.tree, x)?.kind === "group" &&
          !!findObjectNode(
            (
              findObjectNode(editor.tree, x) as Extract<
                ObjectNode,
                { kind: "group" }
              >
            ).children,
            id,
          )),
    )
  )
    return;
  const fraction = (event.clientY - b.top) / b.height;
  const inside =
    node.kind === "group" &&
    (!!document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest(".tree-empty-drop") ||
      (fraction >= 0.25 && fraction <= 0.75));
  const after = fraction > 0.5;
  let parent = inside ? id : location.parent;
  let index = inside ? children(id).length : location.index + (after ? 1 : 0);
  // Model insertion indices address the list after removing the moved roots.
  index -= children(parent)
    .slice(0, index)
    .filter((n) => d.ids.includes(n.id)).length;
  target.value = {
    id,
    parent,
    index,
    kind: inside ? "inside" : after ? "after" : "before",
  };
}
function up() {
  const d = drag.value,
    t = target.value;
  if (d?.active) {
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
    if (t) void editor.movePanelItems(d.ids, t.parent, t.index, d.revision);
  }
  cancel();
}
let suppressClick = false;
function capture(event: MouseEvent) {
  if (suppressClick) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLElement>(".object-select,.group-select");
  const id = button?.closest<HTMLElement>("[data-tree-id]")?.dataset.treeId;
  if (!id || !editor.canToggleObjectState) return;
  event.stopPropagation();
  button?.focus();
  const current = rows.value
    .filter((r) =>
      r.node.kind === "group"
        ? editor.selectedGroups.includes(r.node.id)
        : editor.selected.includes(r.node.id) &&
          !editor.selectedGroups.some((groupId) => {
            const group = findObjectNode(editor.tree, groupId);
            return (
              group?.kind === "group" &&
              flattenObjectTree(group.children).includes(r.node.id)
            );
          }),
    )
    .map((r) => r.node.id);
  const picked = panelSelection.select(
    rows.value.map((r) => r.node.id),
    current,
    id,
    event,
  );
  editor.cancel();
  editor.selectedGroups = picked.filter((id) =>
    rows.value.some((r) => r.node.id === id && r.node.kind === "group"),
  );
  editor.selected = [
    ...new Set(
      picked.flatMap((id) => {
        const node = findObjectNode(editor.tree, id);
        return node?.kind === "group" ? flattenObjectTree(node.children) : [id];
      }),
    ),
  ];
  editor.panelRevision++;
  editor.notify();
}
function cancel() {
  drag.value = null;
  target.value = null;
  lastPointer = null;
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  window.removeEventListener("pointermove", move);
  window.removeEventListener("pointerup", up);
  window.removeEventListener("pointercancel", cancel);
  window.removeEventListener("keydown", escape);
}
function escape(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
  }
}
onBeforeUnmount(cancel);
function keyboardMove(event: KeyboardEvent, id: string) {
  if (
    !event.altKey ||
    !event.shiftKey ||
    !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  const loc = nodeLocation(editor.tree, id);
  if (!loc) return;
  let parent = loc.parent,
    index = loc.index;
  const siblings = children(parent);
  if (event.key === "ArrowUp") index = Math.max(0, index - 1);
  if (event.key === "ArrowDown")
    index = Math.min(siblings.length - 1, index + 1);
  if (event.key === "ArrowRight") {
    const previous = siblings[index - 1];
    if (previous?.kind !== "group") return;
    parent = previous.id;
    index = previous.children.length;
  }
  if (event.key === "ArrowLeft") {
    if (!parent) return;
    const outer = nodeLocation(editor.tree, parent)!;
    parent = outer.parent;
    index = outer.index + 1;
  }
  void editor.movePanelItems([id], parent, index);
}
</script>
<template>
  <ObjectPreview v-bind="hoverPreview" />
  <div class="objects-heading">
    <h2>Objects</h2>
    <button
      :disabled="!e.canToggleObjectState"
      aria-label="New Group"
      title="New Group"
      @click="create()"
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        aria-hidden="true"
      >
        <path d="M3 20V5a1 1 0 0 1 1-1h6l2 3h8a1 1 0 0 1 1 1v12Z" />
        <path d="M12 10v7M8.5 13.5h7" />
      </svg>
    </button>
  </div>
  <div class="objects object-tree-list" @click.capture="capture">
    <div
      v-for="row in rows"
      :key="row.node.id"
      :data-tree-id="row.node.id"
      @pointerenter="previewRow($event, row.node.id)"
      @pointerleave="hoverPreview.id = undefined"
      class="tree-row"
      :style="{ paddingLeft: `${row.depth * 16}px` }"
      :class="target?.id === row.node.id ? `drop-${target.kind}` : ''"
      @pointerdown="down($event, row.node.id)"
      @keydown="keyboardMove($event, row.node.id)"
    >
      <ObjectRow
        v-if="row.node.kind === 'object'"
        :shape="e.document.shapes.find((s) => s.id === row.node.id)!"
        :selected="e.selected.includes(row.node.id)"
      />
      <div
        v-else
        class="group-row"
        :class="{
          'group-selected': selected(row.node.id),
          'inherited-hidden': e.isHidden(row.node.id),
        }"
      >
        <button
          class="group-disclosure"
          :aria-label="`${e.collapsedGroups.has(row.node.id) ? 'Expand' : 'Collapse'} ${row.node.name}`"
          :aria-expanded="!e.collapsedGroups.has(row.node.id)"
          @click="editor.toggleGroupExpanded(row.node.id)"
        >
          {{ e.collapsedGroups.has(row.node.id) ? "▸" : "▾" }}
        </button>
        <input
          v-if="naming === row.node.id"
          v-model="draft"
          aria-label="Rename group"
          maxlength="200"
          :ref="(el) => (el as HTMLInputElement | null)?.focus()"
          @blur="finish()"
          @keydown.stop
          @keydown.enter.prevent="finish()"
          @keydown.esc.prevent="finish(true)"
        />
        <ContextMenuRoot v-else>
          <ContextMenuTrigger
            as-child
            @contextmenu="
              !selected(row.node.id) && editor.selectGroup(row.node.id)
            "
          >
            <button
              class="group-select"
              :aria-pressed="selected(row.node.id)"
              @click="editor.selectGroup(row.node.id, $event.shiftKey)"
              @dblclick="rename(row.node)"
              @keydown.f2.prevent="rename(row.node)"
            >
              {{ row.node.name }}
            </button>
          </ContextMenuTrigger>
          <ContextMenuPortal
            ><ContextMenuContent class="object-context-menu">
              <ContextMenuItem
                :disabled="!e.canToggleObjectState"
                @select="editor.duplicate()"
                >Duplicate</ContextMenuItem
              >
              <ContextMenuItem
                :disabled="!e.canToggleObjectState || e.isLocked(row.node.id)"
                @select="rename(row.node)"
                >Rename</ContextMenuItem
              >
              <ContextMenuItem
                :disabled="!e.canToggleObjectState"
                @select="create(true)"
                >Group Selection</ContextMenuItem
              >
              <ContextMenuItem
                :disabled="!e.canToggleObjectState"
                @select="editor.ungroup(row.node.id)"
                >Ungroup</ContextMenuItem
              >
              <ContextMenuItem
                :disabled="
                  !e.canToggleObjectState ||
                  e.selectionLocked ||
                  e.isLocked(row.node.id)
                "
                @select="editor.delete()"
                >Delete Group and Contents</ContextMenuItem
              >
            </ContextMenuContent></ContextMenuPortal
          >
        </ContextMenuRoot>
        <button
          class="object-state"
          :disabled="!e.canToggleObjectState"
          :aria-label="`${row.node.hidden ? 'Show' : 'Hide'} ${row.node.name}`"
          :aria-pressed="!!row.node.hidden"
          :title="
            e.isHidden(row.node.id) && !row.node.hidden
              ? `Hidden by ${e.inheritedStateSource(row.node.id, 'hidden')}; toggles local visibility`
              : 'Toggle group visibility'
          "
          @click="editor.toggleGroupState(row.node.id, 'hidden')"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M2 12 Q12 0 22 12 Q12 24 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            <path v-if="row.node.hidden" d="M3 3L21 21" />
          </svg>
        </button>
        <button
          class="object-state"
          :disabled="!e.canToggleObjectState"
          :aria-label="`${row.node.locked ? 'Unlock' : 'Lock'} ${row.node.name}`"
          :aria-pressed="!!row.node.locked"
          :title="
            e.isLocked(row.node.id) && !row.node.locked
              ? `Locked by ${e.inheritedStateSource(row.node.id, 'locked')}; toggles local lock`
              : 'Toggle group lock'
          "
          @click="editor.toggleGroupState(row.node.id, 'locked')"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect
              x="5"
              y="10"
              width="14"
              height="11"
              rx="2"
              :fill="row.node.locked ? 'currentColor' : 'none'"
            />
            <path
              :d="
                row.node.locked
                  ? 'M8 10V6a4 4 0 018 0v4'
                  : 'M8 10V6a4 4 0 018 0'
              "
            />
          </svg>
        </button>
      </div>
      <div
        v-if="
          row.node.kind === 'group' &&
          !e.collapsedGroups.has(row.node.id) &&
          !row.node.children.length
        "
        class="tree-empty-drop"
        role="group"
        :aria-label="`Drop into ${row.node.name}`"
      ></div>
    </div>
    <p v-if="!rows.length">Your shapes and groups will appear here.</p>
  </div>
  <div
    v-if="drag?.active"
    class="tree-root-drop"
    role="group"
    aria-label="Move to top level"
    :class="{ 'drop-inside': target?.id === 'root' }"
  ></div>
</template>
<style scoped>
.objects-heading,
.group-row {
  display: flex;
  align-items: center;
}
.objects-heading {
  justify-content: space-between;
}
.objects-heading button {
  font-size: 11px;
  padding: 4px;
}
.tree-row {
  position: relative;
}
.group-row {
  min-width: 0;
}
.objects .group-select {
  touch-action: none;
  user-select: none;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.objects .group-disclosure {
  flex: 0 0 22px;
  width: 22px;
  padding: 4px;
}
.objects .object-state {
  flex: 0 0 30px;
  width: 30px;
  padding: 6px;
}
.inherited-hidden {
  opacity: 0.55;
}
.group-selected {
  background: #e7b27a18;
}
.drop-inside {
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.drop-before::before,
.drop-after::after {
  content: "";
  height: 2px;
  background: var(--accent);
  position: absolute;
  left: 0;
  right: 0;
  z-index: 2;
}
.drop-before::before {
  top: 0;
}
.drop-after::after {
  bottom: 0;
}
.tree-empty-drop {
  min-height: 24px;
}
.tree-root-drop {
  min-height: 28px;
  margin-top: 4px;
  margin-bottom: 0;
}
</style>
