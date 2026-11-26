import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "./id";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("createId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses randomUUID in secure contexts", () => {
    expect(createId()).toMatch(uuid);
  });

  it("falls back to getRandomValues outside secure contexts", () => {
    const secure = crypto;
    vi.stubGlobal("crypto", { getRandomValues: secure.getRandomValues.bind(secure) });
    const ids = new Set(Array.from({ length: 50 }, createId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(uuid);
  });
});
