import { editableNumber, parseExpression } from "./expression";
/** Documents always store millimetres; these helpers only convert presentation. */
export type UnitMode = 'mm' | 'in-fractional' | 'in-decimal';
export const unitSymbol = (mode: UnitMode) => mode === 'mm' ? 'mm' : 'in';
export const fromMillimetres = (value: number, mode: UnitMode) => mode === 'mm' ? value : value / 25.4;
export const toMillimetres = (value: number, mode: UnitMode) => mode === 'mm' ? value : value * 25.4;

/** Evaluate in display units, then convert the final result once. */
export function parseLength(text: string, mode: UnitMode): number | null {
  const value = parseExpression(text, mode !== 'mm');
  if (value === null) return null;
  const result = toMillimetres(value, mode);
  return Number.isFinite(result) ? result : null;
}

export function formatLength(value: number, mode: UnitMode, precision = 2): string {
  const converted = fromMillimetres(value, mode);
  if (mode !== 'in-fractional') return String(Number(converted.toFixed(mode === 'mm' ? precision : 4)));
  const ticks = Math.round(Math.abs(converted) * 64);
  const whole = Math.floor(ticks / 64);
  let numerator = ticks % 64, denominator = 64;
  while (numerator && numerator % 2 === 0) { numerator /= 2; denominator /= 2; }
  const fraction = numerator ? `${numerator}/${denominator}` : '';
  const body = whole ? `${whole}${fraction ? ' ' + fraction : ''}` : fraction || '0';
  const approximate = Math.abs(ticks / 64 - Math.abs(converted)) > 1e-10;
  return `${approximate ? '≈' : ''}${converted < 0 && ticks ? '-' : ''}${body}`;
}

/** Editing precision is independent of display rounding. */
export const editableLength = (value: number, mode: UnitMode) => editableNumber(fromMillimetres(value, mode));
export const formatArea = (value: number, mode: UnitMode) => `${Number((mode === 'mm' ? value : value / (25.4 * 25.4)).toFixed(2))} ${unitSymbol(mode)}²`;
