import { parseProject, type Doc } from "../model/project";
export type Recovery = { document: Doc; name: string; time: number };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("leather-studio", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("recovery");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function recovery(
  value?: Recovery,
): Promise<Recovery | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("recovery", value ? "readwrite" : "readonly"),
        store = tx.objectStore("recovery");
      const r = value ? store.put(value, "current") : store.get("current");
      let result: Recovery | undefined;
      r.onsuccess = () => {
        result = value ?? r.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export class ProjectFiles {
  handle: any = null;
  async open(): Promise<{ document: Doc; name: string } | undefined> {
    if ("showOpenFilePicker" in window) {
      try {
        const [h] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: "Leather project",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const f = await h.getFile();
        if (f.size > 1e7) throw Error("Project exceeds 10 MB");
        const document = parseProject(await f.text());
        this.handle = h;
        return { document, name: f.name };
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        throw e;
      }
    }
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.oncancel = () => resolve(undefined);
      input.onchange = async () => {
        try {
          const f = input.files?.[0];
          if (!f) {
            resolve(undefined);
            return;
          }
          if (f.size > 1e7) throw Error("Project exceeds 10 MB");
          const document = parseProject(await f.text());
          this.handle = null;
          resolve({ document, name: f.name });
        } catch (e) {
          reject(e);
        }
      };
      input.click();
    });
  }
  async save(
    document: Doc,
    name: string,
  ): Promise<{ outcome: "saved" | "downloaded" | "cancelled"; name: string }> {
    const text = JSON.stringify(document, null, 2);
    if ("showSaveFilePicker" in window) {
      try {
        const h =
          this.handle ||
          (await (window as any).showSaveFilePicker({
            suggestedName: name,
            types: [
              {
                description: "Leather project",
                accept: { "application/json": [".json"] },
              },
            ],
          }));
        const writable = await h.createWritable();
        await writable.write(text);
        await writable.close();
        this.handle = h;
        return { outcome: "saved", name: h.name };
      } catch (e) {
        if ((e as Error).name === "AbortError") return { outcome: "cancelled", name };
        throw e;
      }
    }
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const a = window.document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { outcome: "downloaded", name };
  }
}
