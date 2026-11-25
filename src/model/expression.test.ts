import { describe, expect, it } from 'vitest';
import { editableNumber, formulaReferences, parseExpression } from './expression';

describe('numeric formulas', () => {
  it.each([
    ['2+3*4', 14], ['(2+3)*4', 20], ['-(-3)+.5', 3.5],
    ['1e-3 * 2', .002], ['12/2/3', 2], [' 2 + +3 ', 5],
  ])('evaluates %s', (input, value) => expect(parseExpression(input)).toBe(value));
  it.each(['', '2+', '(2+3', '2 3', '2(3)', '1/0', '1/(3-3)',
    '1e309', '1e308*10', '1e308+1e308', 'NaN', 'Infinity', 'Math.PI', 'alert(1)', '2mm'])
    ('rejects %s', input => expect(parseExpression(input)).toBeNull());
  it('bounds input size and nesting', () => {
    expect(parseExpression('('.repeat(101)+'1'+')'.repeat(101))).toBeNull();
    expect(parseExpression('1+'.repeat(2000)+'1')).toBeNull();
  });
  it('accepts signed mixed fractions only in length mode', () => {
    expect(parseExpression('-1 1/2 + 2', true)).toBe(.5);
    expect(parseExpression('1 1/2')).toBeNull();
  });
  it('removes presentation noise', () => {
    expect(editableNumber(5.00000000007)).toBe('5');
    expect(editableNumber(.1+.2)).toBe('0.3');
    expect(editableNumber(3.141592653589793)).toBe('3.14159265358979');
  });
});

describe('formula variables', () => {
  const resolve = (name: string) => ({ w: 10, t: 1.5 } as Record<string, number>)[name] ?? null;
  it('resolves identifiers only when a resolver is given', () => {
    expect(parseExpression('{w} + 2*{t}', false, resolve)).toBe(13);
    expect(parseExpression('{w}')).toBeNull();
    expect(parseExpression('w + 1', false, resolve)).toBeNull();
    expect(parseExpression('{missing} + 1', false, resolve)).toBeNull();
    expect(parseExpression('{w} {t}', false, resolve)).toBeNull();
    expect(parseExpression('2{w}', false, resolve)).toBeNull();
    expect(parseExpression('Math.PI', false, resolve)).toBeNull();
    expect(parseExpression('1e-3*{w}', false, resolve)).toBe(.01);
  });
  it('lists references without exponents', () => {
    expect(formulaReferences('1e-3 + {card_w}*2.5E+2 - ({t2}) + x')).toEqual(['card_w', 't2']);
    expect(formulaReferences('(10+5)*2')).toEqual([]);
  });
});

describe('reference tokens', () => {
  it('reads references left to right like the document core', () => {
    expect(formulaReferences('{a}} }}{b} {{c}}')).toEqual(['a', 'b']);
  });
  it('checks syntax without judging values', () => {
    expect(parseExpression('{l}/({n}-1)', false, () => 1)).toBeNull();
    expect(parseExpression('{l}/({n}-1)', false, () => 1, false)).not.toBeNull();
    expect(parseExpression('{l}/(', false, () => 1, false)).toBeNull();
  });
});
