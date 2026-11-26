<script setup lang="ts">
import { nextTick, onBeforeUnmount } from "vue";
import { focusModelCanvas } from "./canvasFocus";
import { handleToolEnter } from "./toolKeyboard";
/**
 * Shared frame for tool settings popovers: heading, tool-specific content and the
 * Apply / Cancel footer. Classes and aria labels fall through to the root.
 *
 * Apply runs from its button or Enter in a text field. Enter skips the button's disabled
 * state so a tool may use it for a sub-step, such as confirming an array point; each
 * tool's apply method checks its own conditions. Cancel runs from its
 * button or Escape; `back` may first undo a sub-step (such as pivot placement) and return
 * true to keep the tool open. When either ends the tool, focus returns to the canvas so
 * its shortcuts keep working.
 *
 * A panel without Apply / Cancel (such as the segment selection) passes neither and fills
 * the `footer` slot instead; Enter and Escape then keep their global meaning.
 */
const props = withDefaults(defineProps<{
  heading: string;
  applyDisabled?: boolean;
  tag?: "section" | "div";
  apply?: () => unknown;
  cancel?: () => unknown;
  back?: () => boolean;
  refocus?: () => void;
}>(), { tag: "section", refocus: focusModelCanvas });
let closed = false;
onBeforeUnmount(() => { closed = true; });
async function settle(action?: () => unknown) {
  if (!action) return;
  await action();
  await nextTick();
  if (closed) props.refocus();
}
function escape(event: KeyboardEvent) {
  if (!props.cancel) return;
  event.preventDefault();
  event.stopPropagation();
  if (props.back?.()) return;
  void settle(props.cancel);
}
</script>
<template>
  <component :is="tag" class="transform-options" @keydown.enter="props.apply && handleToolEnter($event, () => settle(props.apply))" @keydown.esc="escape">
    <strong>{{ heading }}</strong>
    <slot />
    <div class="actions tool-popup-footer">
      <slot name="footer">
        <button :disabled="applyDisabled" @click="settle(props.apply)">Apply</button>
        <button @click="settle(props.cancel)">Cancel</button>
      </slot>
    </div>
  </component>
</template>
