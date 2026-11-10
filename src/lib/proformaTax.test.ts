import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { calculateProformaTax, calculateProformaSummary } from './proformaTax';

describe('PI follows SO taxation', () => {
  it('does not charge VAT for the reported non-PPN SO', () => {
    deepStrictEqual(calculateProformaTax(52631502, 0), { taxRate: 0, dppPengganti: 0, taxAmount: 0 });
  });
  it('preserves 12% VAT on replacement DPP for taxable SOs', () => {
    deepStrictEqual(calculateProformaTax(52631502, 11), { taxRate: 12, dppPengganti: 48245544, taxAmount: 5789465 });
  });
  it('uses the corrected non-PPN invoice snapshot for every output', () => {
    const result = calculateProformaSummary({ subtotal: 52631502, tax_rate: 0, tax_amount: 0, shipping_cost: 0, other_costs: 0, materai_amount: 10000 });
    deepStrictEqual([result.tax, result.subTotal, result.grossTotal, result.balance], [0, 52631502, 52641502, 52641502]);
  });
  it('includes other costs and calculates DP from the same invoice total', () => {
    const result = calculateProformaSummary({ subtotal: 1000000, tax_rate: 0, tax_amount: 0, shipping_cost: 50000, other_costs: 25000, materai_amount: 10000, dp_percent: 50 });
    deepStrictEqual([result.subTotal, result.grossTotal, result.downPayment, result.balance], [1075000, 1085000, 542500, 542500]);
  });
});