<script setup lang="ts" generic="K extends string">
/**
 * Two (or more) related tool values side by side, each with its label above the control,
 * such as Move X/Y or array distances. The slot renders the control for each field.
 * `.transform-inputs` is also what the numeric-entry shortcuts focus, so keep the class.
 */
defineProps<{ fields: readonly (readonly [K, string])[]; hint?: string }>();
defineSlots<{ default(props: { field: K; label: string; index: number }): unknown }>();
</script>
<template>
  <div class="transform-inputs" :data-hint-edit="hint">
    <label v-for="([field, label], index) in fields" :key="field">{{ label }}<slot :field="field" :label="label" :index="index" /></label>
  </div>
</template>
