import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { calculateProformaTax } from './proformaTax';

describe('PI follows SO taxation', () => {
  it('does not charge VAT for the reported non-PPN SO', () => {
    deepStrictEqual(calculateProformaTax(52631502, 0), { taxRate: 0, dppPengganti: 0, taxAmount: 0 });
  });
  it('preserves 12% VAT on replacement DPP for taxable SOs', () => {
    deepStrictEqual(calculateProformaTax(52631502, 11), { taxRate: 12, dppPengganti: 48245544, taxAmount: 5789465 });
  });
});