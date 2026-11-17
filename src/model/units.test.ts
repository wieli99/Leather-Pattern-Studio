import { describe, expect, it } from 'vitest';
import { editableLength, formatArea, formatLength, parseLength } from './units';
describe('measurement units', () => {
  it('converts decimal and signed fractional inch input', () => {
    expect(parseLength('1', 'in-decimal')).toBe(25.4);
    expect(parseLength('-1 3/8', 'in-fractional')).toBeCloseTo(-34.925);
    expect(parseLength('3/8', 'in-decimal')).toBeCloseTo(9.525);
  });
  it('rejects invalid entries', () => {
    for (const input of ['', '1/0', '1/(2-2)', 'Infinity', '1 +' ]) expect(parseLength(input, 'in-fractional')).toBeNull();
    expect(parseLength('1/2', 'mm')).toBe(0.5);
    expect(parseLength('1 + 2', 'in-decimal')).toBeCloseTo(76.2);
    expect(parseLength('(1 1/2)*2', 'in-fractional')).toBeCloseTo(76.2);
  });
  it('reduces fractions and marks rounding', () => {
    expect(formatLength(34.925, 'in-fractional')).toBe('1 3/8');
    expect(formatLength(25.4, 'in-fractional')).toBe('1');
    expect(formatLength(1, 'in-fractional')).toBe('≈3/64');
  });
  it('preserves editable precision and converts square units', () => {
    const value = 3.85;
    expect(parseLength(editableLength(value, 'in-fractional'), 'in-fractional')).toBeCloseTo(value, 12);
    expect(formatArea(645.16, 'in-decimal')).toBe('1 in²');
  });
});
