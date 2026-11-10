/** SO stores effective VAT (11) or zero; PI displays statutory VAT (12). */
export function calculateProformaTax(subtotal: number, sourceTaxRate: number | null | undefined) {
  const taxable = Number(sourceTaxRate ?? 0) > 0;
  const taxRate = taxable ? 12 : 0;
  const dppPengganti = taxable ? Math.round(subtotal * 11 / 12) : 0;
  const taxAmount = taxable ? Math.round(dppPengganti * taxRate / 100) : 0;
  return { taxRate, dppPengganti, taxAmount };
}

/** Render the saved invoice snapshot identically in details and PDF, including all fees. */
export function calculateProformaSummary(invoice: {
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  shipping_cost: number;
  other_costs: number;
  materai_amount: number;
  dp_percent?: number | null;
}) {
  const dpp = Math.round(Number(invoice.subtotal) || 0);
  const tax = Number(invoice.tax_rate) > 0 ? Math.round(Number(invoice.tax_amount) || 0) : 0;
  const dppPengganti = Number(invoice.tax_rate) > 0 ? Math.round(dpp * 11 / 12) : 0;
  const deliveryFee = Math.round(Number(invoice.shipping_cost) || 0);
  const otherCosts = Math.round(Number(invoice.other_costs) || 0);
  const stampDuty = Math.round(Number(invoice.materai_amount) || 0);
  const subTotal = dpp + tax + deliveryFee + otherCosts;
  const grossTotal = subTotal + stampDuty;
  const dpPercent = Number(invoice.dp_percent) || 0;
  const downPayment = Math.round(grossTotal * dpPercent / 100);
  return { dpp, dppPengganti, tax, deliveryFee, otherCosts, subTotal, stampDuty, grossTotal, dpPercent, downPayment, balance: grossTotal - downPayment };
}