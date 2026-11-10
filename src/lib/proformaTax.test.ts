import { describe, it, expect } from 'bun:test';
import { calculateProformaTax } from './proformaTax';

describe('PI follows SO taxation', () => {
  it('does not charge VAT for the reported non-PPN SO', () => {
    expect(calculateProformaTax(52631502, 0)).toEqual({ taxRate: 0, dppPengganti: 0, taxAmount: 0 });
  });
  it('preserves 12% VAT on replacement DPP for taxable SOs', () => {
    expect(calculateProformaTax(52631502, 11)).toEqual({ taxRate: 12, dppPengganti: 48245544, taxAmount: 5789465 });
  });
});