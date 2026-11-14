import { expect, test } from "vitest";
import { defaultFavorites, parseFavorites, toolCatalog } from "./toolCatalog";
test("default favorites have the requested order", () => {
  expect(defaultFavorites).toEqual([
    "move",
    "rotate",
    "scale",
    "mirror",
    "corner",
    "trim",
  ]);
  expect(new Set(toolCatalog.map((t) => t[0])).size).toBe(12);
});
test("favorites preserve empty lists, sanitize IDs, and cap length", () => {
  expect(parseFavorites("[]")).toEqual([]);
  expect(parseFavorites('["trim","unknown","trim","move",null]')).toEqual([
    "trim",
    "move",
  ]);
  expect(
    parseFavorites(JSON.stringify(toolCatalog.map((t) => t[0]))),
  ).toHaveLength(10);
});
test("invalid or absent preferences restore defaults", () => {
  for (const raw of [null, "{", "false", "{}"])
    expect(parseFavorites(raw)).toEqual(defaultFavorites);
});
