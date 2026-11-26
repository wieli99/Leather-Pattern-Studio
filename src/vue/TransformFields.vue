<script setup lang="ts">
import { computed } from "vue";
import LengthInput from "./LengthInput.vue";
import ToolField from "./ToolField.vue";
import type { UnitMode } from "../model/units";
/**
 * Numeric fields of a Move, Rotate or Resize popover and the Axes choice; Mirror has only
 * the Axes choice. The owner keeps the values; Model and Print supply their own units and state.
 */
type Field = "x" | "y" | "angle" | "sx" | "sy";
const props = defineProps<{
  tool: "move" | "rotate" | "scale" | null;
  values: Record<Field, number>;
  unitSymbol: string;
  units?: UnitMode;
  /** Accessible names that differ from the visible labels. */
  ariaLabels?: Partial<Record<Field, string>>;
  orientation?: "world" | "local";
}>();
const emit = defineEmits<{ commit: [Field, number]; invalid: [Field]; orientation: ["world" | "local"] }>();
const fields = computed((): [Field, string][] =>
  props.tool === "move" ? [["x", `X (${props.unitSymbol})`], ["y", `Y (${props.unitSymbol})`]]
  : props.tool === "rotate" ? [["angle", "Angle (°)"]]
  : props.tool === "scale" ? [["sx", "X factor"], ["sy", "Y factor"]]
  : []);
</script>
<template>
  <!-- A single value sits on one row like other tool settings; X/Y pairs stay side by side. -->
  <ToolField v-if="fields.length === 1" :label="fields[0][1]" data-hint-edit="transform">
    <LengthInput scalar :step="1" :aria-label="ariaLabels?.[fields[0][0]] ?? fields[0][1]" :value="values[fields[0][0]]" @invalid="emit('invalid', fields[0][0])" @commit="emit('commit', fields[0][0], $event)" />
  </ToolField>
  <div v-else-if="fields.length" class="transform-inputs" data-hint-edit="transform">
    <label v-for="[field, label] in fields" :key="field">{{ label }}
      <LengthInput v-if="tool === 'move'" fixed :units="units" :aria-label="ariaLabels?.[field] ?? label" :value="values[field]" @invalid="emit('invalid', field)" @commit="emit('commit', field, $event)" />
      <LengthInput v-else scalar :step="field === 'angle' ? 1 : undefined" :precision="tool === 'scale' ? 2 : undefined" :aria-label="ariaLabels?.[field] ?? label" :value="values[field]" @invalid="emit('invalid', field)" @commit="emit('commit', field, $event)" />
    </label>
  </div>
  <ToolField v-if="orientation" label="Axes">
    <select :value="orientation" @change="emit('orientation', ($event.target as HTMLSelectElement).value as 'world' | 'local')">
      <option value="world">World</option>
      <option value="local">Local</option>
    </select>
  </ToolField>
</template>
