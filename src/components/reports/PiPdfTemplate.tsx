import React from 'react';

// ─── Data Contract ──────────────────────────────────────────────
export interface PiPdfCompany {
  name: string;
  address: string;
  phone: string;
  website: string;
  bankName: string;
  bankAccount: string;
  npwp: string;
}

export interface PiPdfInvoice {
  number: string;
  date: string;
  currency: string;
  soNumber: string;
  customerPoNumber: string;
  term: string;
  amountInWords: string;
}

export interface PiPdfCustomer {
  companyName: string;
  picName: string;
  address: string;
}

export interface PiPdfItem {
  no: number;
  code: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
  discount: number;
  subtotal: number;
  taxPercent: string;
}

export interface PiPdfSummary {
  dpp: number;
  dppPengganti: number;
  tax: number;
  deliveryFee: number;
  subTotal: number;
  stampDuty: number;
  downPayment: number;
  balance: number;
}

export interface PiPdfSignatory {
  name: string | null;
  position: string;
  signatureUrl: string | null;
  isApproved: boolean;
}

export interface PiPdfData {
  company: PiPdfCompany;
  invoice: PiPdfInvoice;
  customer: PiPdfCustomer;
  items: PiPdfItem[];
  summary: PiPdfSummary;
  signatory: PiPdfSignatory;
}

// ─── Formatter ──────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat('id-ID').format(n);

// ─── Shared styles ──────────────────────────────────────────────
const S = {
  root: { fontFamily: "Arial, Helvetica, sans-serif", fontSize: "11px", color: "#222", width: "100%" } as React.CSSProperties,
  labelTd: { fontSize: "11px", color: "#333", whiteSpace: "nowrap", width: "90px", padding: "3px 0" } as React.CSSProperties,
  sepTd: { width: "10px", padding: "3px 0", textAlign: "center" } as React.CSSProperties,
  valTd: { fontSize: "11px", fontWeight: 600, padding: "3px 0" } as React.CSSProperties,
  thBase: { backgroundColor: "#0f6b3e", color: "#fff", border: "1px solid #666", padding: "8px 6px", fontSize: "10px", whiteSpace: "nowrap", WebkitPrintColorAdjust: "exact" } as React.CSSProperties,
  tdBase: { border: "1px solid #666", padding: "8px 6px", fontSize: "10px" } as React.CSSProperties,
};

// ─── Component ──────────────────────────────────────────────────
interface PiPdfTemplateProps {
  data: PiPdfData;
}

const PiPdfTemplate = React.forwardRef<HTMLDivElement, PiPdfTemplateProps>(({ data }, ref) => {
  const { company, invoice, customer, items, summary, signatory } = data;

  return (
    <div ref={ref}>
      <div data-pdf-root style={S.root}>

        {/* ─── Section 1: Header ─── */}
        <div data-pdf-section style={{ paddingTop: "85px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "24px" }}>
            {/* Left */}
            <div style={{ width: "48%" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {([
                    ["Nomor PI", invoice.number],
                    ["Kepada", customer.companyName],
                    ["Up.", customer.picName],
                    ["Alamat", customer.address],
                  ] as [string, string][]).map(([label, val]) => (
                    <tr key={label}>
                      <td style={S.labelTd}>{label}</td>
                      <td style={S.sepTd}>:</td>
                      <td style={S.valTd}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Right */}
            <div style={{ width: "48%" }}>
              <h1 style={{ fontSize: "28px", fontWeight: 700, textTransform: "uppercase", textAlign: "right", margin: "0 0 14px 0", letterSpacing: "0.5px" }}>
                PROFORMA INVOICE
              </h1>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {([
                    ["Tanggal", invoice.date],
                    ["Mata Uang", invoice.currency],
                    ["Nomor SO", invoice.soNumber],
                    ["No. PO Customer", invoice.customerPoNumber],
                  ] as [string, string][]).map(([label, val]) => (
                    <tr key={label}>
                      <td style={S.labelTd}>{label}</td>
                      <td style={S.sepTd}>:</td>
                      <td style={S.valTd}>{val}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={S.labelTd}>Term</td>
                    <td style={S.sepTd}>:</td>
                    <td style={{ ...S.valTd, color: "#b91c1c" }}>{invoice.term}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ─── Section 2: Items Table ─── */}
        <div data-pdf-section style={{ marginTop: "14px", marginBottom: "14px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  { label: "No", w: "30px", align: "center" as const },
                  { label: "Kode", w: "70px", align: "left" as const },
                  { label: "Nama Barang", w: "auto", align: "left" as const },
                  { label: "Jumlah", w: "55px", align: "center" as const },
                  { label: "Unit", w: "40px", align: "center" as const },
                  { label: "Harga", w: "90px", align: "right" as const },
                  { label: "Disc.", w: "40px", align: "center" as const },
                  { label: "Sub Total", w: "95px", align: "right" as const },
                  { label: "Pajak", w: "45px", align: "center" as const },
                ].map((h) => (
                  <th key={h.label} style={{ ...S.thBase, textAlign: h.align, width: h.w }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.no}>
                  <td style={{ ...S.tdBase, textAlign: "center" }}>{item.no}</td>
                  <td style={{ ...S.tdBase, color: "#0f6b3e", fontWeight: 600 }}>{item.code}</td>
                  <td style={{ ...S.tdBase, lineHeight: "1.4", wordBreak: "break-word" }}>{item.name}</td>
                  <td style={{ ...S.tdBase, textAlign: "center" }}>{item.qty}</td>
                  <td style={{ ...S.tdBase, textAlign: "center" }}>{item.unit}</td>
                  <td style={{ ...S.tdBase, textAlign: "right", whiteSpace: "nowrap" }}>{fmt(item.price)}</td>
                  <td style={{ ...S.tdBase, textAlign: "center" }}>{item.discount}</td>
                  <td style={{ ...S.tdBase, textAlign: "right", whiteSpace: "nowrap" }}>{fmt(item.subtotal)}</td>
                  <td style={{ ...S.tdBase, textAlign: "center" }}>{item.taxPercent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ─── Section 3: Summary + Terbilang + Signature ─── */}
        <div data-pdf-section style={{ marginTop: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "28px" }}>
            {/* Left: Terbilang + Bank */}
            <div style={{ width: "55%", fontSize: "10px" }}>
              <div style={{ marginBottom: "14px", lineHeight: "1.5" }}>
                <b>Terbilang:</b>{" "}
                <i>{invoice.amountInWords}</i>
              </div>
              <div style={{ border: "1px solid #888", padding: "10px 12px", minHeight: "110px" }}>
                <div style={{ fontWeight: 700, marginBottom: "8px" }}>Keterangan:</div>
                <div style={{ marginBottom: "4px" }}>Account Banking a/n {company.name}</div>
                <div style={{ marginBottom: "4px" }}>Bank {company.bankName}</div>
                <div style={{ marginBottom: "4px" }}>Acc. No {company.bankAccount}</div>
                <div>NPWP: {company.npwp}</div>
              </div>
            </div>

            {/* Right: Calculations + Signature */}
            <div style={{ width: "45%" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "26px" }}>
                <tbody>
                  {([
                    { label: "DPP", value: fmt(summary.dpp) },
                    { label: "DPP Pengganti", value: fmt(summary.dppPengganti) },
                    { label: "Pajak", value: fmt(summary.tax) },
                    { label: "Biaya Pengantaran", value: fmt(summary.deliveryFee) },
                  ]).map((row) => (
                    <tr key={row.label}>
                      <td style={{ padding: "5px 0", fontSize: "10px", width: "65%" }}>{row.label}</td>
                      <td style={{ padding: "5px 0", fontSize: "10px", textAlign: "center", width: "5%" }}>:</td>
                      <td style={{ padding: "5px 0", fontSize: "10px", textAlign: "right", width: "30%", whiteSpace: "nowrap" }}>{row.value}</td>
                    </tr>
                  ))}
                  {/* Sub Total */}
                  <tr>
                    <td style={{ padding: "8px 0 5px", fontSize: "10px", fontWeight: 700, borderTop: "1px solid #555" }}>Sub Total</td>
                    <td style={{ padding: "8px 0 5px", fontSize: "10px", textAlign: "center", borderTop: "1px solid #555" }}>:</td>
                    <td style={{ padding: "8px 0 5px", fontSize: "10px", textAlign: "right", fontWeight: 700, borderTop: "1px solid #555", whiteSpace: "nowrap" }}>Rp {fmt(summary.subTotal)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "5px 0", fontSize: "10px" }}>Bea Materai</td>
                    <td style={{ padding: "5px 0", fontSize: "10px", textAlign: "center" }}>:</td>
                    <td style={{ padding: "5px 0", fontSize: "10px", textAlign: "right", whiteSpace: "nowrap" }}>Rp {fmt(summary.stampDuty)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "5px 0", fontSize: "10px" }}>Down Payment</td>
                    <td style={{ padding: "5px 0", fontSize: "10px", textAlign: "center" }}>:</td>
                    <td style={{ padding: "5px 0", fontSize: "10px", textAlign: "right" }}>{summary.downPayment > 0 ? `Rp ${fmt(summary.downPayment)}` : '-'}</td>
                  </tr>
                  {/* Saldo */}
                  <tr>
                    <td style={{ padding: "10px 0 5px", fontSize: "14px", fontWeight: 700, borderTop: "2px solid #333" }}>Saldo</td>
                    <td style={{ padding: "10px 0 5px", fontSize: "14px", textAlign: "center", borderTop: "2px solid #333" }}>:</td>
                    <td style={{ padding: "10px 0 5px", fontSize: "14px", textAlign: "right", fontWeight: 700, borderTop: "2px solid #333", whiteSpace: "nowrap" }}>Rp {fmt(summary.balance)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Signature */}
              <div style={{ textAlign: "center", width: "100%", marginTop: "24px" }}>
                <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: "11px" }}>{company.name}</div>
                <div style={{ height: "48px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {signatory.isApproved && signatory.signatureUrl ? (
                    <img src={signatory.signatureUrl} alt="signature" style={{ maxHeight: "48px", maxWidth: "160px", objectFit: "contain" }} crossOrigin="anonymous" />
                  ) : null}
                </div>
                <div style={{ width: "220px", margin: "0 auto 6px auto", borderTop: "1px solid #333" }} />
                <div style={{ fontWeight: 700, fontSize: "11px" }}>
                  {signatory.isApproved && signatory.name ? signatory.name : '(..................................)'}
                </div>
                <div style={{ marginTop: "2px", fontSize: "10px" }}>{signatory.position}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Section 4: Footer ─── */}
        <div data-pdf-section data-pdf-bottom style={{ marginTop: "34px", paddingTop: "10px", borderTop: "1px solid #bbb", fontSize: "10px", lineHeight: "1.5" }}>
          <div style={{ fontWeight: 700, fontSize: "12px", color: "#0f6b3e", marginBottom: "4px", textTransform: "uppercase" }}>{company.name}</div>
          <div>{company.address}</div>
          <div>{company.phone} | {company.website}</div>
        </div>
      </div>
    </div>
  );
});

PiPdfTemplate.displayName = 'PiPdfTemplate';

export default PiPdfTemplate;
