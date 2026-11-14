export const toolCatalog: [
  id: string,
  name: string,
  shortcut: string,
  aliases: string,
][] = [
  ["move", "Move", "G", "translate position"],
  ["rotate", "Rotate", "E", "turn spin"],
  ["scale", "Resize", "S", "scale size"],
  ["mirror", "Mirror", "M", "flip reflect"],
  ["corner", "Corners", "B", "round fillet chamfer bevel"],
  ["trim", "Trim", "K", "cut snip"],
  ["offset", "Offset", "O", "inset outset"],
  ["path-copy", "Copy along path", "", "repeat array"],
  ["join", "Join", "J", "merge union combine"],
  ["subtract", "Subtract", "", "difference cut out"],
  ["intersect", "Intersect", "", "overlap"],
  ["exclude", "Exclude", "", "xor symmetric difference"],
];

export const defaultFavorites = toolCatalog.slice(0, 6).map((tool) => tool[0]);
export const favoritesStorageKey = "tool-favorites-v1";
export function parseFavorites(raw: string | null): string[] {
  if (raw === null) return [...defaultFavorites];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [...defaultFavorites];
    return [
      ...new Set(
        value.filter(
          (id): id is string =>
            typeof id === "string" &&
            toolCatalog.some((tool) => tool[0] === id),
        ),
      ),
    ].slice(0, 10);
  } catch {
    return [...defaultFavorites];
  }
}
