import type { Doc } from "../model/project";
export type Snapshot = {
  document: Doc;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
};
export class Core {
  private worker = new Worker(new URL("../editor-worker.ts", import.meta.url), {
    type: "module",
  });
  private id = 0;
  private failure: Error | null = null;
  private requests = new Map<
    number,
    { resolve: (s: Snapshot) => void; reject: (e: Error) => void }
  >();
  constructor() {
    this.worker.onmessage = (e) => {
      const p = this.requests.get(e.data.id);
      if (!p) return;
      this.requests.delete(e.data.id);
      e.data.error ? p.reject(Error(e.data.error)) : p.resolve(e.data.result);
    };
    this.worker.onerror = (event) => {
      this.fail(
        new Error(
          `Geometry worker failed: ${event.message || "unable to load worker"}. Reload the page to retry.`,
        ),
      );
    };
    this.worker.onmessageerror = () =>
      this.fail(
        new Error(
          "Geometry worker returned an unreadable response. Reload the page to retry.",
        ),
      );
  }
  private fail(error: Error) {
    this.failure = error;
    for (const request of this.requests.values()) request.reject(error);
    this.requests.clear();
  }

  request(
    operation: string,
    revision: number,
    document?: Doc,
  ): Promise<Snapshot> {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(
          "Geometry engine did not respond within 15 seconds. Reload the page to retry; saved projects and recovery data are unchanged.",
        );
        this.fail(error);
        this.worker.terminate();
      }, 15000);
      this.requests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      try {
        this.worker.postMessage({ id, operation, revision, document });
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  dispose() {
    this.worker.terminate();
    for (const p of this.requests.values()) p.reject(Error("Editor closed"));
    this.requests.clear();
  }
}
