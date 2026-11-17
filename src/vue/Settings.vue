<script setup lang="ts">
import DesktopUpdates from "./DesktopUpdates.vue";
import { isTauri } from "../platform";
import StitchPresets from "./StitchPresets.vue";
import LengthInput from "./LengthInput.vue";
import type { UnitMode } from "../model/units";
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
          Axis rulers
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
        <label>Units
          <select aria-label="Units" :value="e.units" @change="editor.units = ($event.target as HTMLSelectElement).value as UnitMode; editor.preferences()">
            <option value="mm">Millimetres</option><option value="in-fractional">Inches (fractional)</option><option value="in-decimal">Inches (decimal)</option>
          </select>
        </label>
        <label>Grid spacing ({{ e.unitSymbol }})
          <span class="grid-spacing-value">
            <LengthInput :step=".1" :aria-label="`Grid spacing (${e.unitSymbol})`" :value="e.gridSize" :min=".001" @commit="editor.gridSize = $event; editor.preferences()" />
            <StitchPresets label="Grid spacing" :values="e.units === 'mm' ? [0.5, 1, 5, 10, 50, 100] : [1/64, 1/32, 1/16, 1/8, 1/4, 1/2, 1].map(n => n * 25.4)" :disabled="false" @choose="editor.gridSize = $event; editor.preferences()" />
          </span>
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
        <DesktopUpdates v-if="isTauri()" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.grid-spacing-value { display: flex; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
.grid-spacing-value :deep(input) { width: 0; min-width: 0; flex: 1; border: 0; border-radius: 0; }
</style>
