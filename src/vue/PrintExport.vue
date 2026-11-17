<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from "vue";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "reka-ui";
import {
  generatePrint,
  svgImage,
  downloadArtifact,
  type PrintArtifact,
  type PrintFormat,
} from "../editor/printExport";
import type { Doc } from "../model/project";
import type { PrintLayout } from "../model/printLayout";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
const props = defineProps<{
  open: boolean;
  document: Doc;
  layout: PrintLayout;
  revision: number;
}>();
const emit = defineEmits<{ close: [] }>();
const format = ref<PrintFormat>("pdf"),
  busy = ref(false),
  error = ref(""),
  artifact = ref<PrintArtifact>(),
  page = ref(0),
  zoom = ref(0),
  canvas = ref<HTMLCanvasElement>();
let generation = 0,
  renderGeneration = 0;
let pdf: import("pdfjs-dist").PDFDocumentProxy | undefined;
let task: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
let renderTask: import("pdfjs-dist").RenderTask | undefined;
async function build() {
  const token = ++generation;
  artifact.value = undefined;
  error.value = "";
  busy.value = true;
  page.value = 0;
  renderTask?.cancel();
  const previousTask = task;
  task = undefined;
  pdf = undefined;
  try {
    await previousTask?.destroy();
    if (token !== generation || !props.open) return;
    const result = await generatePrint(
      structuredClone(props.document),
      structuredClone(props.layout),
      format.value,
    );
    if (token !== generation || !props.open) return;
    if (result.pdf) {
      const lib = await import("pdfjs-dist");
      if (token !== generation || !props.open) return;
      lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const loading = lib.getDocument({ data: result.pdf.slice() });
      task = loading;
      const document = await loading.promise;
      if (token !== generation || !props.open) {
        await loading.destroy();
        return;
      }
      pdf = document;
    }
    if (token !== generation) return;
    artifact.value = result;
    await nextTick();
    await paint();
  } catch (reason) {
    if (token === generation) error.value = String(reason);
  } finally {
    if (token === generation) busy.value = false;
  }
}
async function paint() {
  const token = ++renderGeneration;
  const previousRender = renderTask;
  previousRender?.cancel();
  renderTask = undefined;
  if (!artifact.value || !canvas.value) return;
  try {
    await previousRender?.promise.catch(() => {});
    if (token !== renderGeneration) return;
    const el = canvas.value;
    if (pdf) {
      const p = await pdf.getPage(page.value + 1);
      if (token !== renderGeneration) return;
      const base = p.getViewport({ scale: 1 });
      const scale = zoom.value
        ? zoom.value * 1.2
        : Math.min(
            (el.parentElement!.clientWidth - 32) / base.width,
            (el.parentElement!.clientHeight - 32) / base.height,
          );
      const v = p.getViewport({ scale: Math.max(0.05, scale) });
      el.width = v.width;
      el.height = v.height;
      renderTask = p.render({ canvas: el, viewport: v });
      await renderTask.promise;
    } else {
      const entry = artifact.value.pages[page.value];
      const image = entry.png
        ? await createImageBitmap(entry.png)
        : await svgImage(entry.svg);
      if (token !== renderGeneration) {
        if ("close" in image) image.close();
        return;
      }
      const scale =
        zoom.value ||
        Math.min(
          (el.parentElement!.clientWidth - 32) / ((artifact.value.previewWidth ?? props.layout.width) * 3),
          (el.parentElement!.clientHeight - 32) / ((artifact.value.previewHeight ?? props.layout.height) * 3),
        );
      el.width = (artifact.value.previewWidth ?? props.layout.width) * 3 * scale;
      el.height = (artifact.value.previewHeight ?? props.layout.height) * 3 * scale;
      el.getContext("2d")!.drawImage(image, 0, 0, el.width, el.height);
      if ("close" in image) image.close();
    }
  } catch (reason) {
    if (
      token === renderGeneration &&
      !String(reason).includes("RenderingCancelled")
    )
      error.value = String(reason);
  }
}
watch(
  () => [props.open, props.revision, props.layout.id, format.value],
  () => {
    if (props.open) void build();
    else {
      generation++;
      renderGeneration++;
      renderTask?.cancel();
      void task?.destroy();
      task = undefined;
      pdf = undefined;
      artifact.value = undefined;
    }
  },
  { immediate: true },
);
watch([page, zoom, canvas], () => void paint());
onUnmounted(() => {
  generation++;
  renderTask?.cancel();
  void task?.destroy();
});
</script>
<template>
  <DialogRoot :open="open" @update:open="!$event && emit('close')"
    ><DialogPortal
      ><DialogOverlay class="print-dialog-overlay" /><DialogContent
        class="print-dialog export-dialog"
        aria-label="Export print layout"
        ><DialogTitle>Export print layout</DialogTitle
        ><DialogDescription
          >Generated pages at actual size. Print PDF at 100%, without fitting to
          page.</DialogDescription
        >
        <div class="export-controls">
          <label
            >Format
            <select v-model="format" aria-label="Format">
              <option value="pdf">PDF</option>
              <option value="svg">SVG</option>
              <option value="dxf">DXF (outlines only)</option>
              <option value="png">PNG (300 DPI)</option>
            </select></label
          ><button
            :disabled="busy || !artifact"
            @click="artifact && downloadArtifact(artifact)"
          >
            Export</button
          ><DialogClose>Close</DialogClose>
        </div>
        <p v-if="format === 'dxf'">Complete outlines in one continuous layout, in millimetres. Stitch holes, annotations, images and paper decorations are omitted.</p>
        <p v-if="busy" role="status">Generating preview…</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="export-controls">
          <button v-if="format !== 'dxf'" :disabled="page === 0 || busy" @click="page--">
            Previous page</button
          ><span v-if="format !== 'dxf'">Page {{ page + 1 }} / {{ artifact?.pages.length ?? "…" }}</span
          ><button
            v-if="format !== 'dxf'" :disabled="!artifact || page >= artifact.pages.length - 1 || busy"
            @click="page++"
          >
            Next page</button
          ><label
            >Preview zoom
            <select v-model="zoom" aria-label="Preview zoom">
              <option :value="0">Fit page</option>
              <option :value="0.5">50%</option>
              <option :value="1">100%</option>
              <option :value="1.5">150%</option>
            </select></label
          >
        </div>
        <div class="generated-preview">
          <canvas ref="canvas" aria-label="Generated print preview" />
        </div> </DialogContent></DialogPortal
  ></DialogRoot>
</template>
<style scoped>
.export-dialog {
  width: min(1000px, 94vw);
  height: 90vh;
  display: flex;
  flex-direction: column;
}
.export-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
}
.generated-preview {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #35383c;
  padding: 16px;
}
.generated-preview canvas {
  width: auto;
  height: auto;
  max-width: none;
  margin: auto;
  touch-action: auto;
}
</style>
