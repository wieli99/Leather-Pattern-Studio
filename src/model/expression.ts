/** Small arithmetic grammar: never executes user text as JavaScript. */
export function parseExpression(text: string, mixedFractions = false): number | null {
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
    if (!Number.isFinite(result)) throw Error();
    return result;
  }
  function product(): number {
    let value = primary();
    space();
    while (text[pos] === '*' || text[pos] === '/') {
      const op = text[pos++], right = primary();
      if (op === '/' && right === 0) throw Error();
      value = op === '*' ? value * right : value / right;
      if (!Number.isFinite(value)) throw Error();
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
      if (!Number.isFinite(value)) throw Error();
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
