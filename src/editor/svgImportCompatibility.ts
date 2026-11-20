const adobeNamespaces = new Map([
  ["ns_extend", "http://ns.adobe.com/Extensibility/1.0/"],
  ["ns_ai", "http://ns.adobe.com/AdobeIllustrator/10.0/"],
  ["ns_graphs", "http://ns.adobe.com/Graphs/1.0/"],
  ["ns_vars", "http://ns.adobe.com/Variables/1.0/"],
  ["ns_imrep", "http://ns.adobe.com/ImageReplacement/1.0/"],
  ["ns_sfw", "http://ns.adobe.com/SaveForWeb/1.0/"],
  ["ns_custom", "http://ns.adobe.com/GenericCustomNamespace/1.0/"],
  ["ns_adobe_xpath", "http://ns.adobe.com/XPath/1.0/"],
]);

/** Remove document types before XML parsing. Only literal Adobe aliases are expanded. */
export function prepareSvgXml(text: string): string {
  const entities = new Map<string, string>();
  text = text.replace(
    /<!DOCTYPE\s+svg(?:\s+(?:PUBLIC\s+(?:"[^"]*"|'[^']*')\s+(?:"[^"]*"|'[^']*')|SYSTEM\s+(?:"[^"]*"|'[^']*')))?\s*(?:\[([\s\S]*?)\]\s*)?>/i,
    (_, subset: string | undefined) => {
      const remaining = (subset ?? "").replace(
        /<!ENTITY\s+(\w+)\s+(["'])([^"'<>%&]+)\2\s*>/g,
        (declaration, name: string, _quote, value: string) => {
          if (adobeNamespaces.get(name) !== value || entities.has(name)) return declaration;
          entities.set(name, value);
          return "";
        },
      );
      if (remaining.trim()) throw Error("Only Adobe SVG namespace entities are supported");
      return "";
    },
  );
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error("Unsupported SVG document declaration");
  if (!entities.size) return text;
  // Match complete tags and attributes so text, comments and other values stay inert.
  return text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<[A-Za-z_][\w:.-]*(?:[^<>"']|"[^"]*"|'[^']*')*>/g, tag => {
    if (/^<[!?]/.test(tag)) return tag;
    return tag.replace(/(\s+)([\w:.-]+)(\s*=\s*)(["'])(.*?)\4/gs,
      (attribute, whitespace, name: string, equals, quote, value: string) => {
        if (name !== "requiredExtensions" && !/^xmlns:[\w.-]+$/.test(name)) return attribute;
        const alias = /^&(\w+);$/.exec(value);
        const uri = alias && entities.get(alias[1]);
        return uri ? whitespace + name + equals + quote + uri + quote : attribute;
      },
    );
  });
}

const geometryProperties = new Set([
  "all", "x", "y", "cx", "cy", "r", "rx", "ry", "width", "height",
  "min-width", "min-height", "max-width", "max-height", "aspect-ratio", "d",
  "transform", "transform-origin", "transform-box", "translate", "rotate", "scale",
  "offset", "offset-path", "offset-distance", "offset-anchor", "offset-position", "offset-rotate", "zoom",
]);

function cssStatements(css: string, splitRules = false): string[] {
  const statements: string[] = [];
  const nesting: string[] = [];
  let statement = "", offset = 0;
  for (const match of css.matchAll(/\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\\[\s\S]|[()[\]{};]/g)) {
    const token = match[0];
    statement += css.slice(offset, match.index);
    offset = match.index + token.length;
    if (token.startsWith("/*")) continue;
    if (!nesting.length && (token === ";" || (splitRules && (token === "{" || token === "}")))) {
      statements.push(statement);
      statement = "";
      continue;
    }
    if (token === "(" || token === "[" || token === "{") nesting.push(token);
    else if ((token === ")" && nesting.at(-1) === "(") ||
             (token === "]" && nesting.at(-1) === "[") ||
             (token === "}" && nesting.at(-1) === "{")) nesting.pop();
    statement += token;
  }
  statements.push(statement + css.slice(offset));
  return statements;
}

// Check even unsupported selectors and at-rules before converting the geometry.
function svgCssPropertyNames(css: string): string[] {
  return cssStatements(css, true).flatMap(statement => {
    const colon = statement.indexOf(":");
    if (colon < 0) return [];
    const property = statement.slice(0, colon).trimStart().replace(
      /\\([\da-f]{1,6})(?:\r\n|[\t\n\f\r ])?|\\([^\n\r\f])/gi,
      (_, hex: string | undefined, character: string | undefined) => {
        if (!hex) return character ?? "";
        const code = Number.parseInt(hex, 16);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd";
      },
    );
    return /^[\w-]+$/.test(property.trim()) ? [property.trim()] : [];
  });
}

export function rejectSvgGeometryCss(css: string) {
  for (const name of svgCssPropertyNames(css)) {
    if (geometryProperties.has(name.toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/, "")))
      throw Error(`Editable SVG cannot apply CSS “${name}”. Use SVG geometry attributes or choose Import as image.`);
  }
}

export function isSvgEffectProperty(name: string): boolean {
  const property = name.toLowerCase().replace(/^-webkit-/, "");
  return property === "clip-path" || property === "filter" || property === "mask" || property.startsWith("mask-");
}
const visibilityProperties = new Set([
  "all", "display", "visibility", "opacity", "color",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-opacity", "stroke-width",
]);

function rejectIgnoredSvgEffects(css: string) {
  if (svgCssPropertyNames(css).some(isSvgEffectProperty))
    throw Error("Editable SVG cannot resolve CSS clipping, masking, or filters. Simplify the stylesheet or choose Import as image.");
  if (svgCssPropertyNames(css).some(name => visibilityProperties.has(name.toLowerCase())))
    throw Error("Editable SVG cannot resolve CSS visibility. Simplify the stylesheet or choose Import as image.");
}

function svgEncodingDeclaration(text: string): string | undefined {
  const declaration = /^<\?xml\s[^?]*\?>/.exec(text)?.[0];
  return /\sencoding\s*=\s*(["'])([A-Za-z][A-Za-z\d._-]*)\1/.exec(declaration ?? "")?.[2]?.toLowerCase();
}

function decodeSvgBytes(bytes: Uint8Array, encoding: string): string {
  if (encoding === "iso-8859-1") {
    // TextDecoder aliases ISO-8859-1 to Windows-1252. XML uses literal Latin-1.
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 8192)
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
    return chunks.join("");
  }
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw Error(`SVG contains invalid ${encoding.toUpperCase()} bytes. Save it with the correct encoding and try again.`);
  }
}

export async function readSvgText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const [a, b, c, d] = bytes;
  if ((a === 0 && b === 0 && c === 0xfe && d === 0xff) ||
      (a === 0xff && b === 0xfe && c === 0 && d === 0))
    throw Error("Unsupported SVG encoding: UTF-32. Save the SVG as UTF-8 and try again.");

  const utf16 = (a === 0xff && b === 0xfe) || (a === 0x3c && b === 0) ? "utf-16le"
    : (a === 0xfe && b === 0xff) || (a === 0 && b === 0x3c) ? "utf-16be" : undefined;
  if (utf16) {
    const text = decodeSvgBytes(bytes, utf16);
    const declared = svgEncodingDeclaration(text);
    if (declared && declared !== "utf-16" && declared !== utf16)
      throw Error("SVG encoding declaration conflicts with the UTF-16 file bytes.");
    return text;
  }

  const utf8Bom = a === 0xef && b === 0xbb && c === 0xbf;
  const start = utf8Bom ? 3 : 0;
  // Read only the ASCII XML declaration before decoding the rest of the file.
  let end = start;
  if (bytes[start] === 0x3c && bytes[start + 1] === 0x3f &&
      bytes[start + 2] === 0x78 && bytes[start + 3] === 0x6d && bytes[start + 4] === 0x6c) {
    end = start + 5;
    while (end + 1 < bytes.length && !(bytes[end] === 0x3f && bytes[end + 1] === 0x3e)) end++;
    if (end + 1 < bytes.length) end += 2;
  }
  const declared = svgEncodingDeclaration(decodeSvgBytes(bytes.subarray(start, end), "iso-8859-1"));
  const encoding = !declared || declared === "utf8" ? "utf-8" : declared;
  if (utf8Bom && encoding !== "utf-8")
    throw Error("SVG encoding declaration conflicts with the UTF-8 byte-order mark.");
  if (!["utf-8", "iso-8859-1", "windows-1252"].includes(encoding))
    throw Error(`Unsupported SVG encoding: ${encoding}. Save the SVG as UTF-8 and try again.`);
  return decodeSvgBytes(bytes, encoding);
}

type Declaration = { value: string; important: boolean };

export function isSvgCssValue(property: string, value: string): boolean {
  return ((property === "fill" || property === "stroke") && /^context-(?:fill|stroke)$/i.test(value)) ||
    CSS.supports(property, value);
}

export function svgDeclarations(
  text: string,
  supported: ReadonlySet<string>,
  warn: (declaration: string) => void,
): Map<string, Declaration> {
  const declarations = new Map<string, Declaration>();
  for (const declaration of cssStatements(text)) {
    if (!declaration.trim()) continue;
    const parsed = /^\s*([\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(declaration);
    const key = parsed?.[1].toLowerCase();
    if (!parsed || !key || !supported.has(key)) {
      rejectIgnoredSvgEffects(declaration);
      warn(declaration);
      continue;
    }
    const raw = parsed[2];
    const priority = /!\s*important$/i.exec(raw);
    const value = priority ? raw.slice(0, priority.index).trim() : raw;
    if (!value) {
      rejectIgnoredSvgEffects(declaration);
      warn(declaration);
      continue;
    }
    if (!isSvgCssValue(key, value)) continue;
    if (visibilityProperties.has(key) && /(?:var|env)\s*\(/i.test(value))
      rejectIgnoredSvgEffects(declaration);
    if (!declarations.get(key)?.important || priority)
      declarations.set(key, { value, important: !!priority });
  }
  return declarations;
}

/** Evaluate the supported class rules without attaching the CSS to the browser document. */
export function svgClassStyles(
  root: Element,
  supported: ReadonlySet<string>,
  warn: (message: string) => void,
): (element: Element) => Map<string, Declaration> {
  type Rule = Declaration & { key: string; order: number };
  const styles = new Map<string, Map<string, Rule>>();
  let order = 0;
  for (const element of root.getElementsByTagNameNS("*", "style")) {
    if (element.namespaceURI !== "http://www.w3.org/2000/svg" &&
        element.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
    rejectSvgGeometryCss(element.textContent ?? "");
    const css = (element.textContent ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (element.hasAttribute("media") || css.includes("@") || /\{[^}]*\{/.test(css) ||
        (element.hasAttribute("type") && element.getAttribute("type") !== "text/css")) {
      rejectIgnoredSvgEffects(css);
      warn("Unsupported SVG stylesheet conditions or at-rules");
      continue;
    }
    const blocks = css.split("}");
    const remainder = blocks.pop();
    if (remainder?.trim()) {
      rejectIgnoredSvgEffects(remainder);
      warn("Unsupported SVG stylesheet syntax");
    }
    for (const block of blocks) {
      const brace = block.indexOf("{");
      if (brace === -1) {
        rejectIgnoredSvgEffects(block);
        warn("Unsupported SVG stylesheet syntax");
        continue;
      }
      const selectors = block.slice(0, brace).split(",").map(selector => /^\.([\w-]+)$/.exec(selector.trim()));
      if (selectors.some(selector => !selector)) {
        rejectIgnoredSvgEffects(block);
        warn("Unsupported SVG stylesheet selector");
        continue;
      }
      const declarations = svgDeclarations(block.slice(brace + 1), supported,
        () => warn("Unsupported SVG stylesheet declaration"));
      for (const [key, declaration] of declarations) {
        const rule = { key, ...declaration, order: order++ };
        for (const selector of selectors) {
          const name = selector![1];
          const properties = styles.get(name) ?? new Map<string, Rule>();
          styles.set(name, properties);
          if (!properties.get(key)?.important || rule.important) properties.set(key, rule);
        }
      }
    }
  }
  return element => {
    const properties = Array.from(element.classList).flatMap(name => [...(styles.get(name)?.values() ?? [])]);
    properties.sort((a, b) => Number(a.important) - Number(b.important) || a.order - b.order);
    return new Map(properties.map(property => [property.key, property]));
  };
}

const unsupportedExtensions = new Set(adobeNamespaces.values());

/** True and false mean the active status is known. Undefined means conversion cannot evaluate the condition. */
export function svgCondition(element: Element): boolean | undefined {
  const extensions = element.getAttribute("requiredExtensions");
  if (extensions?.trim().split(/\s+/).some(uri => unsupportedExtensions.has(uri))) return false;
  if (extensions !== null || element.hasAttribute("requiredFeatures")) return undefined;
  const language = element.getAttribute("systemLanguage");
  if (language === null) return true;
  const requested = language.split(",").map(tag => tag.trim().toLowerCase());
  const languages = navigator.languages?.map(tag => tag.toLowerCase());
  if (!languages?.length || requested.some(tag => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)))
    return undefined;
  return requested.some(tag => languages.some(locale => locale === tag || locale.startsWith(tag + "-")));
}

export function svgSwitchBranch(element: Element, warn: (message: string) => void): Element | undefined {
  for (const child of element.children) {
    const active = svgCondition(child);
    if (active === true) return child;
    if (active === undefined) {
      warn("Omitted SVG switch with an unsupported branch condition");
      return;
    }
  }
  warn("Omitted SVG switch without active artwork");
}


/** Keep saved names within the UTF-16 limit without cutting a surrogate pair. */
export function truncateSvgName(value: string, limit = 200): string {
  return value.slice(0, limit).replace(/[\uD800-\uDBFF]$/, "");
}
