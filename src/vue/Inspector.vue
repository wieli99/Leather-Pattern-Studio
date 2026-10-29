<script setup lang="ts">
import { computed } from "vue";
import { center, distance } from "../model/geometry";
import type { Shape } from "../model/project";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import Field from "./Field.vue";
const e = useEditor(),
  selected = computed(() => e.value.active),
  s = computed(() => (selected.value.length === 1 ? selected.value[0] : null)),
  a = computed(() => s.value!.points[0]),
  b = computed(() => s.value!.points.at(-1)!),
  c = computed(() => center(s.value!));
const edit = (changes: Partial<Shape>) => {
  if (s.value) void editor.edit(s.value.id, changes);
};
function position(axis: "x" | "y", v: string) {
  edit({
    points: s.value!.points.map((p) => ({
      ...p,
      [axis]: p[axis] + Number(v) - c.value[axis],
    })),
  });
}
function size(axis: "x" | "y", v: string) {
  const length = Math.abs(b.value[axis] - a.value[axis]);
  if (!length) return;
  const factor = +v / length,
    points = s.value!.points.map((p) => ({
      ...p,
      [axis]: c.value[axis] + (p[axis] - c.value[axis]) * factor,
    }));
  edit({
    points,
    radius:
      s.value!.kind === "rectangle"
        ? Math.min(
            s.value!.radius,
            Math.abs(points[1].x - points[0].x) / 2,
            Math.abs(points[1].y - points[0].y) / 2,
          )
        : s.value!.radius,
  });
}
function radius(v: string) {
  const f = +v / distance(a.value, b.value);
  edit({
    points: [
      a.value,
      {
        x: a.value.x + (b.value.x - a.value.x) * f,
        y: a.value.y + (b.value.y - a.value.y) * f,
      },
    ],
  });
}
function vertex(i: number, axis: "x" | "y", v: string) {
  edit({
    points: s.value!.points.map((p, j) => (i === j ? { ...p, [axis]: +v } : p)),
  });
}
</script>
<template>
  <template v-if="s">
    <p class="units-hint">Dimensions in mm</p>
    <Field label="Name" :value="s.name" @commit="edit({ name: $event })" />
    <div class="field-row">
      <Field
        label="Position X"
        :value="+c.x.toFixed(1)"
        @commit="position('x', $event)"
      />
      <Field
        label="Position Y"
        :value="+c.y.toFixed(1)"
        @commit="position('y', $event)"
      />
    </div>
    <div v-if="['rectangle', 'ellipse'].includes(s.kind)" class="field-row">
      <Field
        label="Width"
        :value="+Math.abs(b.x - a.x).toFixed(1)"
        :min="0.001"
        @commit="size('x', $event)"
      />
      <Field
        label="Height"
        :value="+Math.abs(b.y - a.y).toFixed(1)"
        :min="0.001"
        @commit="size('y', $event)"
      />
    </div>
    <Field
      v-if="s.kind === 'rectangle'"
      label="Corner radius"
      :value="s.radius"
      :min="0"
      :max="Math.min(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 2"
      @commit="edit({ radius: +$event })"
    />
    <Field
      v-if="s.kind === 'circle' || s.kind === 'arc'"
      label="Radius"
      :value="+distance(a, b).toFixed(1)"
      :min="0.001"
      @commit="radius"
    />
    <Field
      v-if="s.kind === 'arc'"
      label="Sweep (degrees)"
      :value="s.sweep ?? 0"
      :min="-360"
      :max="360"
      @commit="edit({ sweep: +$event })"
    />
    <Field
      label="Rotation (degrees)"
      :value="+s.rotation.toFixed(1)"
      @commit="edit({ rotation: +$event })"
    />
    <details v-if="['line', 'polyline'].includes(s.kind)">
      <summary>Vertex coordinates</summary>
      <div v-for="(point, i) in s.points" :key="i" class="field-row">
        <Field
          :label="`Vertex ${i + 1} X`"
          :value="point.x"
          @commit="vertex(i, 'x', $event)"
        />
        <Field
          :label="`Vertex ${i + 1} Y`"
          :value="point.y"
          @commit="vertex(i, 'y', $event)"
        />
      </div>
    </details>
  </template>
  <template v-else>
    <h2>Selection</h2>
    <p>
      {{
        selected.length
          ? `${selected.length} objects selected. Drag to move; use the square handle to scale uniformly and the round handle to rotate.`
          : "Click an edge or drag a box. Ctrl selects interiors or crossing outlines; Shift adds to selection."
      }}
    </p>
  </template>
  <div v-if="selected.length" class="actions">
    <button :disabled="!e.ready" @click="editor.duplicate()">Duplicate</button>
    <button :disabled="!e.ready" @click="editor.delete()">Delete</button>
  </div>
</template>
