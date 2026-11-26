<script setup lang="ts">
/**
 * Project actions in the header. The compact layout keeps Save visible and moves the rest into a
 * More menu, built from the same action list as the inline buttons.
 */
import { computed, ref } from "vue";
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "reka-ui";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import BugReport from "./BugReport.vue";
const props = defineProps<{ printActive: boolean; nativeSaving: boolean; exportPrint: () => unknown }>();
const e = useEditor();
const feedbackUrl = "https://github.com/wieli99/Leather-Pattern-Studio/discussions";
const bugReport = ref<InstanceType<typeof BugReport>>();
interface Action { id: string; label: string; title?: string; run: () => unknown }
const actions = computed<Action[]>(() => [
  { id: "new", label: "New", run: () => editor.newProject() },
  { id: "open", label: "Open", run: () => editor.open() },
  { id: "save", label: "Save", title: "Save (Ctrl/⌘+S)", run: () => editor.save() },
  ...(props.printActive ? [{ id: "export", label: "Export", run: props.exportPrint }] : []),
]);
const menuActions = computed(() => actions.value.filter((action) => action.id !== "save"));
</script>
<template>
  <div class="header-actions" :title="nativeSaving ? undefined : 'Save downloads a copy; click the filename to rename it. Open reopens saved JSON files.'">
    <button
      v-for="action in actions"
      :key="action.id"
      :class="`header-${action.id}`"
      :disabled="!e.ready"
      :title="action.title"
      @click="action.run()"
    >
      {{ action.label }}
    </button>
    <BugReport ref="bugReport" :print-active="printActive" />
    <a
      class="feedback-link"
      :href="feedbackUrl"
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
    <DropdownMenuRoot :modal="false">
      <DropdownMenuTrigger class="header-more" aria-label="More actions" title="More actions">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="object-context-menu header-menu" align="end" :side-offset="6" :collision-padding="8">
          <DropdownMenuItem
            v-for="action in menuActions"
            :key="action.id"
            :disabled="!e.ready"
            @select="action.run()"
          >
            {{ action.label }}
          </DropdownMenuItem>
          <DropdownMenuSeparator class="menu-separator" />
          <DropdownMenuItem @select="bugReport?.open()">Report a bug</DropdownMenuItem>
          <DropdownMenuItem as-child>
            <a :href="feedbackUrl" target="_blank" rel="noopener noreferrer">Feedback</a>
          </DropdownMenuItem>
          <DropdownMenuItem as-child>
            <a href="/manual/index.html" target="_blank" rel="noopener">User manual</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
</template>
