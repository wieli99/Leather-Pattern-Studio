/** Looks up a `{name}` variable; null rejects the formula. */
export type ExpressionResolver = (name: string) => number | null;
/** `{name}` (linked) and `{=name}` (value used once) both evaluate in a formula. */
const REFERENCE = /^\{=?([A-Za-z_][A-Za-z0-9_]*)\}/;
/** Small arithmetic grammar: never executes user text as JavaScript. */
export function parseExpression(
  text: string,
  mixedFractions = false,
  resolve?: ExpressionResolver,
  /** False checks syntax only: values may divide by zero or overflow. */
  checkValues = true,
): number | null {
  if (text.length > 2000) return null;
  let pos = 0, depth = 0;
  const space = () => { while (/\s/.test(text[pos] ?? '') && pos < text.length) pos++; };
  function primary(): number {
    space();
    if (++depth > 100) throw Error();
    let result: number;
    if (text[pos] === '+' || text[pos] === '-') {
      const sign = text[pos++] === '-' ? -1 : 1;
      result = sign * primary();
    } else if (text[pos] === '(') {
      pos++;
      result = sum();
      space();
      if (text[pos++] !== ')') throw Error();
    } else {
      const rest = text.slice(pos);
      const name = resolve && REFERENCE.exec(rest);
      if (name) {
        const value = resolve(name[1]);
        if (value === null) throw Error();
        pos += name[0].length;
        depth--;
        if (checkValues && !Number.isFinite(value)) throw Error();
        return value;
      }
      const mixed = mixedFractions && /^(\d+)\s+(\d+)\s*\/\s*(\d+)/.exec(rest);
      const literal = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
      if (mixed) {
        if (+mixed[3] === 0) throw Error();
        result = +mixed[1] + +mixed[2] / +mixed[3];
        pos += mixed[0].length;
      } else {
        if (!literal) throw Error();
        result = Number(literal[0]);
        pos += literal[0].length;
      }
    }
    depth--;
    if (checkValues && !Number.isFinite(result)) throw Error();
    return result;
  }
  function product(): number {
    let value = primary();
    space();
    while (text[pos] === '*' || text[pos] === '/') {
      const op = text[pos++], right = primary();
      if (checkValues && op === '/' && right === 0) throw Error();
      value = op === '*' ? value * right : value / right;
      if (checkValues && !Number.isFinite(value)) throw Error();
      space();
    }
    return value;
  }
  function sum(): number {
    let value = product();
    space();
    while (text[pos] === '+' || text[pos] === '-') {
      const op = text[pos++], right = product();
      value = op === '+' ? value + right : value - right;
      if (checkValues && !Number.isFinite(value)) throw Error();
      space();
    }
    return value;
  }
  try {
    const value = sum();
    return pos === text.length ? value : null;
  } catch { return null; }
}

/** Presentation only; never use this to normalize document geometry. */
export function editableNumber(value: number): string {
  const integer = Math.round(value);
  return String(Math.abs(value - integer) < 1e-10 ? integer : Number(value.toPrecision(15)));
}

/**
 * The one tokenizer for `{name}` (linked), `{=name}` (value used once) and the `{{`/`}}`
 * escapes, read left to right. Groups: 1 is `=` for a one-time value, 2 is the name.
 * The document core uses the same rules for linked references.
 */
export const REFERENCE_TOKENS = /\{\{|\}\}|\{(=?)([A-Za-z_][A-Za-z0-9_]*)\}/g;
/** Names written as linked `{name}` references. */
export function formulaReferences(text: string): string[] {
  return [...text.matchAll(REFERENCE_TOKENS)].flatMap((m) => (m[2] && !m[1] ? [m[2]] : []));
}
/** Names written as one-time `{=name}` references. */
export function onceReferences(text: string): string[] {
  return [...text.matchAll(REFERENCE_TOKENS)].flatMap((m) => (m[2] && m[1] ? [m[2]] : []));
}
/** Replace `{=name}` with the text `value` gives; unknown names stay as typed. */
export function bakeOnce(text: string, value: (name: string) => string | null): string {
  return text.replace(REFERENCE_TOKENS, (match, once?: string, name?: string) =>
    once && name ? value(name) ?? match : match);
}
