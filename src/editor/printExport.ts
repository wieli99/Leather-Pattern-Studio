import fontUrl from "../assets/fonts/PrintSans.ttf?url";
import { orderedPrintPages, pageSvg } from "./printScene";
import type { Doc } from "../model/project";
import type { PrintLayout } from "../model/printLayout";
import { layoutDxf } from "./printDxf";
export type PrintFormat = "pdf" | "svg" | "png" | "dxf";
let font: Promise<string> | undefined;
export function printFont() {
  return (font ??= fetch(fontUrl).then(async (response) => {
    if (!response.ok) throw Error("Could not load the print font");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }));
}
export async function selfContainedSvg(svg: string) {
  const base64 = await printFont();
  return svg.replace(
    "<defs>",
    `<defs><style>@font-face{font-family:PrintSans;src:url(data:font/ttf;base64,${base64}) format('truetype')}</style>`,
  );
}
export function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(Error("Could not render print artwork"));
    };
    image.src = url;
  });
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Canvas encoders default to 96 DPI; add a 300 DPI physical-resolution chunk. */
export async function pngAt300Dpi(blob: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunk = new Uint8Array(21),
    view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  view.setUint32(8, 11811);
  view.setUint32(12, 11811);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const parts: BlobPart[] = [bytes.slice(0, 8)];
  for (let offset = 8; offset < bytes.length;) {
    const length = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset,
      4,
    ).getUint32(0);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type !== "pHYs") parts.push(bytes.slice(offset, offset + length + 12));
    if (type === "IHDR") parts.push(chunk);
    offset += length + 12;
  }
  return new Blob(parts, { type: "image/png" });
}
export type PrintArtifact = {
  blob: Blob;
  filename: string;
  pages: { svg: string; png?: Blob }[];
  pdf?: Uint8Array;
  previewWidth?: number;
  previewHeight?: number;
};
export async function generatePrint(
  doc: Doc,
  layout: PrintLayout,
  format: PrintFormat,
): Promise<PrintArtifact> {
  if (format === "dxf") {
    const result = layoutDxf(doc, layout);
    return { blob: new Blob([result.text], { type: "application/dxf" }),
      filename: `${layout.name.replace(/[^a-zA-Z0-9_.-]/g, "_") || "print"}.dxf`,
      pages: [{ svg: result.svg }], previewWidth: result.width, previewHeight: result.height };
  }
  const pages = await Promise.all(
    orderedPrintPages(layout).map(async (page) => ({
      svg:
        format === "pdf"
          ? pageSvg(doc, layout, page)
          : await selfContainedSvg(pageSvg(doc, layout, page)),
      png: undefined as Blob | undefined,
    })),
  );
  const name = layout.name.replace(/[^a-zA-Z0-9_.-]/g, "_") || "print";
  if (format === "pdf") {
    const [{ jsPDF }] = await Promise.all([
      import("jspdf"),
      import("svg2pdf.js"),
    ]);
    const pdf = new jsPDF({
      unit: "mm",
      format: [layout.width, layout.height],
      orientation: layout.width > layout.height ? "landscape" : "portrait",
      compress: true,
      putOnlyUsedFonts: true,
    });
    pdf.addFileToVFS("PrintSans.ttf", await printFont());
    pdf.addFont("PrintSans.ttf", "PrintSans", "normal");
    pdf.setFont("PrintSans");
    for (let i = 0; i < pages.length; i++) {
      if (i)
        pdf.addPage(
          [layout.width, layout.height],
          layout.width > layout.height ? "landscape" : "portrait",
        );
      const svg = new DOMParser().parseFromString(pages[i].svg, "image/svg+xml")
        .documentElement as unknown as SVGSVGElement;
      await pdf.svg(svg, {
        x: 0,
        y: 0,
        width: layout.width,
        height: layout.height,
      });
    }
    const bytes = new Uint8Array(pdf.output("arraybuffer"));
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      filename: `${name}.pdf`,
      pages,
      pdf: bytes,
    };
  }
  const files: Blob[] = [];
  for (const page of pages) {
    if (format === "svg")
      files.push(new Blob([page.svg], { type: "image/svg+xml" }));
    else {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round((layout.width / 25.4) * 300);
      canvas.height = Math.round((layout.height / 25.4) * 300);
      if (canvas.width * canvas.height > 100_000_000)
        throw Error("Paper is too large for a 300 DPI PNG; choose PDF or SVG");
      const image = await svgImage(page.svg);
      canvas
        .getContext("2d")!
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error("PNG encoding failed"))),
          "image/png",
        ),
      );
      page.png = await pngAt300Dpi(png);
      files.push(page.png);
      canvas.width = canvas.height = 0;
    }
  }
  if (files.length === 1)
    return { blob: files[0], filename: `${name}.${format}`, pages };
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  files.forEach((file, index) =>
    zip.file(`${name}-${String(index + 1).padStart(3, "0")}.${format}`, file),
  );
  return {
    blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }),
    filename: `${name}.zip`,
    pages,
  };
}
export function downloadArtifact(artifact: PrintArtifact) {
  const url = URL.createObjectURL(artifact.blob),
    link = document.createElement("a");
  link.href = url;
  link.download = artifact.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
