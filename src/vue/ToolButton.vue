<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import {
  Primitive,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "reka-ui";
import { editor as defaultEditor } from "../editor/instance";
import type { Controller } from "../editor/controller";
import { variants, labels, type Mode } from "../editor/construction";
import type { tools } from "./tools";
import { useEditor } from "./useEditor";
import ModeIcon from "./ModeIcon.vue";
const props = defineProps<{ tool: (typeof tools)[number]; controller?: Controller }>(),
  editor = props.controller ?? defaultEditor,
  e = useEditor(editor),
  open = ref(false),
  trigger = ref<HTMLButtonElement | null>(null);
const group = computed(() =>
    props.tool.id === "measurement" ? "indicator" :
    props.tool.id === "polygon" ||
    props.tool.id === "rectangle" ||
    props.tool.id === "circle" ||
    props.tool.id === "polyline"
      ? props.tool.id
      : null,
  ),
  current = computed(() =>
    group.value === "indicator" ? e.value.lastIndicator :
    group.value === "rectangle"
      ? e.value.lastRectangle
      : group.value === "circle"
        ? e.value.lastCircle
        : group.value === "polyline"
          ? e.value.lastPolyline
          : group.value === "polygon"
            ? e.value.lastPolygon
            : props.tool.id,
  ),
  active = computed(() =>
    !e.value.stitchMode && (group.value
      ? (variants[group.value] as readonly string[]).includes(e.value.mode)
      : e.value.mode === props.tool.id),
  );
let timer: ReturnType<typeof setTimeout> | undefined,
  long = false;
function down() {
  long = false;
  if (group.value)
    timer = setTimeout(() => {
      long = true;
      open.value = true;
    }, 500);
}
function release() {
  clearTimeout(timer);
}
function click(event: MouseEvent) {
  if (long) {
    event.preventDefault();
    return;
  }
  editor.setMode(current.value);
  open.value = false;
}
function choose(value: unknown) {
  if (typeof value === "string") editor.setMode(value as Mode);
  open.value = false;
}
onUnmounted(release);
</script>
<template>
  <div class="tool-group">
    <DropdownMenuRoot v-model:open="open" :modal="false">
      <component :is="group ? DropdownMenuTrigger : Primitive" as-child>
        <button
          ref="trigger"
          :disabled="!e.ready"
          :title="tool.key ? `${tool.label} (${tool.key})` : tool.label"
          :aria-label="tool.key ? `${tool.label} (${tool.key})` : tool.label"
          :aria-pressed="active"
          :aria-keyshortcuts="tool.key.toLowerCase()"
          @pointerdown.capture.prevent="down"
          @pointerup="release"
          @pointerleave="release"
          @pointercancel="release"
          @click.capture.prevent="click"
          @contextmenu.prevent="group && (open = !open)"
          @keydown.down.prevent="group && (open = true)"
        >
          <span class="tool-icon"><ModeIcon :mode="current" /></span>
          <small>{{ tool.key }}{{ group ? " ▾" : "" }}</small>
        </button>
      </component>
      <DropdownMenuPortal>
        <DropdownMenuContent
          v-if="group"
          class="tool-menu vue-tool-menu"
          side="right"
          align="start"
          :side-offset="6"
          :aria-label="`${tool.label} variants`"
          aria-labelledby=""
        >
          <DropdownMenuRadioGroup
            :model-value="e.mode"
            @update:model-value="choose"
          >
            <DropdownMenuRadioItem
              v-for="mode in variants[group]"
              :key="mode"
              :value="mode"
              as-child
            >
              <button>
                <ModeIcon :mode="mode" />
                {{ labels[mode] }}
              </button>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
</template>
