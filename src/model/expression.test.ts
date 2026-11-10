import { describe, expect, it } from 'vitest';
import { editableNumber, parseExpression } from './expression';

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
