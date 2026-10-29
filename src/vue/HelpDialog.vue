<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "reka-ui";
defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [open: boolean] }>();
</script>
<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="modal-backdrop">
        <DialogContent aria-label="Drawing help" aria-labelledby="">
          <DialogTitle>A focused 2D workspace</DialogTitle>
          <DialogDescription>
            Drawing shortcuts and editor behavior
          </DialogDescription>

          <p>
            Curve: click points · Control point curve: drag anchors for handles
            · Enter or double-click finishes. V Select · P Polyline · R
            Rectangle variants · C Circle/ellipse/arc variants. Repeat R/C to
            cycle. Right-click or hold a grouped tool for its menu.
          </p>
          <p>
            Ctrl-click selects interiors; Ctrl-drag selects intersecting
            outlines. Shift adds to selection. Alt-click an edge in Select to
            add an anchor. Choose Move (G), Rotate (R), or Resize (S) in the
            floating toolbox. Drag the gizmo, then Apply or press Enter. Escape
            cancels. Rotation: 1° normally, Ctrl 10°, Shift 5°, Alt free.
          </p>
          <p>
            Click points to draw, or drag a two-point shape. Polyline: Shift
            constrains 45°; right-click or Enter finishes; double-click closes
            with at least three anchors. Backspace removes an anchor. Escape
            cancels and selects.
          </p>
          <p>
            Alt bypasses positional snapping. Space + drag or middle-drag pans.
            Scroll pans; Ctrl/⌘ + scroll zooms. F fits all; Shift+F fits
            selection. Ctrl/⌘+Z undoes; Ctrl/⌘+Shift+Z redoes. Ctrl/⌘+D
            duplicates; Delete removes selection.
          </p>
          <p>
            Properties update live. Enter or leaving a field creates one undo
            step; Escape restores its starting value.
          </p>
          <p>
            Projects stay on your device. Save writes a file where supported;
            other browsers download a copy. Recovery is separate from saving.
          </p>
          <DialogClose as-child><button>Back to drawing</button></DialogClose>
        </DialogContent>
      </DialogOverlay>
    </DialogPortal>
  </DialogRoot>
</template>
