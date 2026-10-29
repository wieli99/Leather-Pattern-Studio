<script setup lang="ts">
import { ref } from "vue";
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
} from "reka-ui";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
const e = useEditor(),
  open = ref(false);
function spacing(event: Event) {
  const n = +(event.target as HTMLInputElement).value;
  if (Number.isFinite(n) && n > 0) {
    editor.gridSize = n;
    editor.preferences();
  }
}
</script>
<template>
  <PopoverRoot v-model:open="open" :modal="false">
    <div class="settings">
      <PopoverTrigger class="settings-trigger" :class="{ open }">
        Settings
      </PopoverTrigger>
    </div>
    <PopoverPortal>
      <PopoverContent
        class="settings-content vue-settings-content"
        side="top"
        align="center"
        :side-offset="10"
        :collision-padding="12"
        aria-label="Settings"
      >
        <label>
          <input
            type="checkbox"
            :checked="e.rulers"
            @change="
              editor.rulers = ($event.target as HTMLInputElement).checked;
              editor.preferences();
            "
          />
          X/Y rulers
        </label>
        <label>
          Grid style
          <select
            aria-label="Grid style"
            :value="e.gridStyle"
            @change="
              editor.gridStyle = ($event.target as HTMLSelectElement).value as
                | 'dots'
                | 'lines';
              editor.preferences();
            "
          >
            <option value="dots">Dots</option>
            <option value="lines">Lines</option>
          </select>
        </label>
        <label>
          Grid spacing (mm)
          <input
            aria-label="Grid spacing (mm)"
            type="number"
            min=".001"
            step=".1"
            :value="e.gridSize"
            @input="spacing"
          />
        </label>
        <label>
          Theme
          <select
            aria-label="Theme"
            :value="e.theme"
            @change="
              editor.theme = ($event.target as HTMLSelectElement).value;
              editor.preferences();
            "
          >
            <option
              v-for="theme in [
                'dark',
                'light',
                'solarized',
                'nord',
                'contrast',
              ]"
              :key="theme"
              :value="theme"
            >
              {{
                theme === "contrast"
                  ? "High Contrast"
                  : theme[0].toUpperCase() + theme.slice(1)
              }}
            </option>
          </select>
        </label>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
