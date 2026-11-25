<script setup lang="ts">
import { ref, watch } from "vue";
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from "reka-ui";
const props = withDefaults(defineProps<{
  /** Trigger text and accessible name of the popover. */
  label: string;
  storageKey: string;
  contentClass?: string;
  align?: "start" | "center" | "end";
}>(), { align: "center" });
const open = defineModel<boolean>("open", { default: false });
const key = `popover-pinned-${props.storageKey}`;
function stored() {
  try { return localStorage.getItem(key) === "true"; }
  catch { return false; }
}
const pinned = ref(stored());
watch(pinned, (value) => {
  try { localStorage.setItem(key, String(value)); }
  catch { /* Pinning still works for this session. */ }
});
/**
 * A pinned popover closes only through its trigger. Outside clicks, focus changes and Esc
 * are not blocked (blocking them would also hold focus in the popover); their close
 * requests are ignored instead.
 */
let fromTrigger = false;
function markTrigger() {
  fromTrigger = true;
  setTimeout(() => (fromTrigger = false));
}
function openChange(value: boolean) {
  if (!value && pinned.value && !fromTrigger) return;
  fromTrigger = false;
  open.value = value;
}
</script>
<template>
  <PopoverRoot :open="open" :modal="false" @update:open="openChange">
    <div class="settings" @click.capture="markTrigger" @keydown.capture="markTrigger">
      <PopoverTrigger class="settings-trigger" :class="{ open }">
        <slot name="trigger">{{ label }}</slot>
      </PopoverTrigger>
    </div>
    <PopoverPortal>
      <PopoverContent
        class="settings-content vue-settings-content"
        :class="contentClass"
        side="top"
        :align="align"
        :side-offset="10"
        :collision-padding="12"
        :aria-label="label"
        data-nonblocking
      >
        <div class="popover-actions">
          <button
            type="button"
            class="popover-pin"
            :aria-label="`Keep ${label} open`"
            :title="pinned ? 'Unpin: close when clicking elsewhere' : `Pin: keep open while you work (click ${label} to close)`"
            :aria-pressed="pinned"
            @click="pinned = !pinned"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 4h6l-1 6 3 3H7l3-3z" :fill="pinned ? 'currentColor' : 'none'" />
              <path d="M12 13v7" />
            </svg>
          </button>
        </div>
        <slot />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
<style scoped>
.popover-actions { display: flex; justify-content: flex-end; margin: -8px -8px 2px 0; }
.popover-actions button {
  display: grid; place-items: center; width: 24px; height: 24px; padding: 0;
  background: transparent; color: var(--muted); border-radius: 4px; font-size: 16px; line-height: 1;
}
.popover-actions button:hover { color: var(--accent); }
.popover-pin[aria-pressed="true"] { color: var(--accent); }
</style>
