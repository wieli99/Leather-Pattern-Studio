<script setup lang="ts">
import { computed } from "vue";
import {
  center,
  distance,
  moveShape,
  rotateShape,
  shapeMatrix,
  multiply,
  inverse,
  transformShape,
  worldPoints,
  applyMatrix,
  localCenter,
  rotatePoint,
} from "../model/geometry";
import type { Shape } from "../model/project";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import Field from "./Field.vue";
const e = useEditor(),
  selected = computed(() => e.value.active),
  s = computed(() => (selected.value.length === 1 ? selected.value[0] : null)),
  a = computed(() => s.value!.points[0]),
  b = computed(() => s.value!.points.at(-1)!),
  c = computed(() => center(s.value!)),
  matrix = computed(() => shapeMatrix(s.value!)),
  angle = computed(
    () => (Math.atan2(matrix.value.b, matrix.value.a) * 180) / Math.PI,
  ),
  width = computed(
    () =>
      Math.abs(b.value.x - a.value.x) *
      Math.hypot(matrix.value.a, matrix.value.b),
  ),
  height = computed(
    () =>
      Math.abs(b.value.y - a.value.y) *
      Math.hypot(matrix.value.c, matrix.value.d),
  ),
  vertices = computed(() => worldPoints(s.value!));
const edit = (changes: Partial<Shape>) => {
  if (s.value) void editor.edit(s.value.id, changes);
};
function position(axis: "x" | "y", v: string) {
  edit(
    moveShape(
      s.value!,
      axis === "x" ? +v - c.value.x : 0,
      axis === "y" ? +v - c.value.y : 0,
    ),
  );
}
function size(axis: "x" | "y", v: string) {
  if (s.value!.transform) {
    const f = +v / (axis === "x" ? width.value : height.value),
      m = matrix.value,
      local = {
        a: axis === "x" ? f : 1,
        b: 0,
        c: 0,
        d: axis === "y" ? f : 1,
        e: 0,
        f: 0,
      };
    const origin = {
      x: (a.value.x + b.value.x) / 2,
      y: (a.value.y + b.value.y) / 2,
    };
    local.e = origin.x * (1 - local.a);
    local.f = origin.y * (1 - local.d);
    edit(transformShape(s.value!, multiply(multiply(m, local), inverse(m))));
    return;
  }
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
  const original = s.value!,
    point = { ...vertices.value[i], [axis]: +v };
  const local = applyMatrix(inverse(matrix.value), point);
  const closed = distance(original.points[0], original.points.at(-1)!) < 1e-9;
  const next = {
    ...original,
    points: original.points.map((p, j) =>
      j === i ||
      (closed &&
        (i === 0 || i === original.points.length - 1) &&
        (j === 0 || j === original.points.length - 1))
        ? local
        : p,
    ),
  };
  const c = localCenter(next),
    rotated = rotatePoint(c, localCenter(original), original.rotation);
  edit({
    ...next,
    points: next.points.map((p) => ({
      x: p.x + rotated.x - c.x,
      y: p.y + rotated.y - c.y,
    })),
  });
}
</script>
<template>
  <p v-if="e.transformTool">
    Apply or cancel the transform to edit properties or change selection.
  </p>
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
        :value="+width.toFixed(1)"
        :min="0.001"
        @commit="size('x', $event)"
      />
      <Field
        label="Height"
        :value="+height.toFixed(1)"
        :min="0.001"
        @commit="size('y', $event)"
      />
    </div>
    <Field
      v-if="s.kind === 'rectangle'"
      :label="s.transform ? 'Corner radius (local)' : 'Corner radius'"
      :value="s.radius"
      :min="0"
      :max="Math.min(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 2"
      @commit="edit({ radius: +$event })"
    />
    <Field
      v-if="s.kind === 'circle' || s.kind === 'arc'"
      :label="s.transform ? 'Radius (local)' : 'Radius'"
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
      :value="+angle.toFixed(1)"
      @commit="edit(rotateShape(s, +$event - angle, c))"
    />
    <details v-if="['line', 'polyline'].includes(s.kind)">
      <summary>Vertex coordinates</summary>
      <div v-for="(point, i) in vertices" :key="i" class="field-row">
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
          ? `${selected.length} objects selected. Choose Move, Rotate or Resize in the floating toolbox.`
          : "Click an edge or drag a box. Ctrl selects interiors or crossing outlines; Shift adds to selection."
      }}
    </p>
  </template>
  <div v-if="selected.length" class="actions">
    <button :disabled="!e.ready" @click="editor.duplicate()">Duplicate</button>
    <button :disabled="!e.ready" @click="editor.delete()">Delete</button>
  </div>
</template>
