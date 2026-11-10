/** SO stores effective VAT (11) or zero; PI displays statutory VAT (12). */
export function calculateProformaTax(subtotal: number, sourceTaxRate: number | null | undefined) {
  const taxable = Number(sourceTaxRate ?? 0) > 0;
  const taxRate = taxable ? 12 : 0;
  const dppPengganti = taxable ? Math.round(subtotal * 11 / 12) : 0;
  const taxAmount = taxable ? Math.round(dppPengganti * taxRate / 100) : 0;
  return { taxRate, dppPengganti, taxAmount };
}