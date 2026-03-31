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

// ─── Corporate Colors ───────────────────────────────────────────
const CORP_GREEN = '#0f6b3e';
const CORP_GREEN_LIGHT = '#e8f5ee';

// ─── Component ──────────────────────────────────────────────────
interface PiPdfTemplateProps {
  data: PiPdfData;
}

const PiPdfTemplate = React.forwardRef<HTMLDivElement, PiPdfTemplateProps>(({ data }, ref) => {
  const { company, invoice, customer, items, summary, signatory } = data;

  const rootStyle: React.CSSProperties = {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '11px',
    color: '#222',
    lineHeight: '1.4',
    width: '100%',
    position: 'relative',
  };

  return (
    <div ref={ref}>
      <div data-pdf-root style={rootStyle}>

        {/* ─── Section 1: HEADER ─── */}
        <div data-pdf-section style={{ paddingTop: '80px', marginBottom: '16px' }}>
          {/* Watermark */}
          <div style={{
            position: 'absolute',
            top: '45%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-30deg)',
            fontSize: '80px',
            fontWeight: 700,
            color: 'rgba(15, 107, 62, 0.06)',
            letterSpacing: '12px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 0,
            textTransform: 'uppercase',
          }}>
            PROFORMA
          </div>

          {/* Green accent line */}
          <div style={{
            height: '3px',
            background: `linear-gradient(90deg, ${CORP_GREEN}, ${CORP_GREEN}80, transparent)`,
            marginBottom: '16px',
            borderRadius: '2px',
          }} />

          {/* Header grid: Left 55% + Right 45% */}
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            
            {/* LEFT: PI info + Customer */}
            <div style={{ width: '55%' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {([
                    ['Nomor PI', invoice.number],
                    ['Kepada', customer.companyName],
                    ['Up.', customer.picName],
                    ['Alamat', customer.address],
                  ] as [string, string][]).map(([label, val]) => (
                    <tr key={label}>
                      <td style={{ fontSize: '11px', color: '#555', whiteSpace: 'nowrap', width: '85px', padding: '4px 0', verticalAlign: 'top' }}>{label}</td>
                      <td style={{ width: '12px', padding: '4px 0', textAlign: 'center', verticalAlign: 'top' }}>:</td>
                      <td style={{ fontSize: '11px', fontWeight: 600, padding: '4px 0', verticalAlign: 'top', lineHeight: '1.4' }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* RIGHT: Title + meta */}
            <div style={{ width: '45%' }}>
              <h1 style={{
                fontSize: '22px',
                fontWeight: 700,
                textTransform: 'uppercase',
                textAlign: 'right',
                margin: '0 0 12px 0',
                letterSpacing: '0.5px',
                color: CORP_GREEN,
              }}>
                PROFORMA INVOICE
              </h1>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {([
                    ['Tanggal', invoice.date],
                    ['Mata Uang', invoice.currency],
                    ['Nomor SO', invoice.soNumber],
                    ['No. PO Customer', invoice.customerPoNumber],
                  ] as [string, string][]).map(([label, val]) => (
                    <tr key={label}>
                      <td style={{ fontSize: '11px', color: '#555', whiteSpace: 'nowrap', width: '110px', padding: '4px 0' }}>{label}</td>
                      <td style={{ width: '12px', padding: '4px 0', textAlign: 'center' }}>:</td>
                      <td style={{ fontSize: '11px', fontWeight: 600, padding: '4px 0' }}>{val}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontSize: '11px', color: '#555', whiteSpace: 'nowrap', width: '110px', padding: '4px 0' }}>Term</td>
                    <td style={{ width: '12px', padding: '4px 0', textAlign: 'center' }}>:</td>
                    <td style={{ fontSize: '11px', fontWeight: 700, padding: '4px 0', color: '#b91c1c' }}>{invoice.term}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ─── Section 2: ITEMS TABLE ─── */}
        <div data-pdf-section style={{ marginBottom: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {[
                  { label: 'No', w: '32px', align: 'center' as const },
                  { label: 'Kode', w: '75px', align: 'left' as const },
                  { label: 'Nama Barang', w: 'auto', align: 'left' as const },
                  { label: 'Jumlah', w: '55px', align: 'center' as const },
                  { label: 'Unit', w: '42px', align: 'center' as const },
                  { label: 'Harga', w: '90px', align: 'right' as const },
                  { label: 'Disc.', w: '42px', align: 'center' as const },
                  { label: 'Sub Total', w: '95px', align: 'right' as const },
                  { label: 'Pajak', w: '46px', align: 'center' as const },
                ].map((h) => (
                  <th key={h.label} style={{
                    backgroundColor: CORP_GREEN,
                    color: '#fff',
                    border: '1px solid #0a5530',
                    padding: '8px 6px',
                    fontSize: '10px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    textAlign: h.align,
                    width: h.w,
                    WebkitPrintColorAdjust: 'exact' as any,
                    printColorAdjust: 'exact' as any,
                  }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.no} style={{ backgroundColor: idx % 2 === 1 ? CORP_GREEN_LIGHT : 'transparent' }}>
                  <td style={{ border: '1px solid #ccc', padding: '8px 6px', fontSize: '10px', textAlign: 'center' }}>{item.no}</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px 6px', fontSize: '10px', color: CORP_GREEN, fontWeight: 600 }}>{item.code}</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px 6px', fontSize: '10px', lineHeight: '1.4', wordBreak: 'break-word' }}>{item.name}</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px 6px', fontSize: '10px', textAlign: 'center' }}>{item.qty}</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px 6px', fontSize: '10px', textAlign: 'center' }}>{item.unit}</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px 6px', fontSize: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(item.price)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px 6px', fontSize: '10px', textAlign: 'center' }}>{item.discount > 0 ? `${item.discount}%` : '-'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px 6px', fontSize: '10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{fmt(item.subtotal)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px 6px', fontSize: '10px', textAlign: 'center' }}>{item.taxPercent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ─── Section 3: DIVIDER + BOTTOM 2-COLUMN ─── */}
        <div data-pdf-section style={{ marginTop: '24px' }}>
          {/* Divider line */}
          <div style={{
            borderTop: `2px solid ${CORP_GREEN}`,
            marginBottom: '20px',
          }} />

          {/* Bottom 2-column layout */}
          <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start' }}>
            
            {/* LEFT: Terbilang + Bank info */}
            <div style={{ width: '55%', fontSize: '10px' }}>
              {/* Terbilang */}
              <div style={{
                marginBottom: '16px',
                padding: '8px 10px',
                backgroundColor: CORP_GREEN_LIGHT,
                borderLeft: `3px solid ${CORP_GREEN}`,
                borderRadius: '2px',
                lineHeight: '1.5',
              }}>
                <span style={{ fontWeight: 700, fontSize: '10px' }}>Terbilang: </span>
                <span style={{ fontStyle: 'italic', fontSize: '10px' }}>{invoice.amountInWords}</span>
              </div>

              {/* Bank info box */}
              <div style={{
                border: '1px solid #999',
                padding: '12px 14px',
                borderRadius: '3px',
                lineHeight: '1.6',
              }}>
                <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '10px', color: CORP_GREEN, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Keterangan Pembayaran:</div>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <tbody>
                    {([
                      ['Account', company.name],
                      ['Bank', company.bankName],
                      ['No. Rekening', company.bankAccount],
                      ['NPWP', company.npwp],
                    ] as [string, string][]).map(([label, val]) => (
                      <tr key={label}>
                        <td style={{ fontSize: '10px', color: '#555', width: '80px', padding: '2px 0', verticalAlign: 'top' }}>{label}</td>
                        <td style={{ fontSize: '10px', padding: '2px 0', width: '10px', textAlign: 'center', verticalAlign: 'top' }}>:</td>
                        <td style={{ fontSize: '10px', fontWeight: 600, padding: '2px 0', verticalAlign: 'top' }}>{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RIGHT: Summary calculations */}
            <div style={{ width: '45%' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {([
                    { label: 'DPP', value: fmt(summary.dpp), bold: false },
                    { label: 'DPP Pengganti', value: fmt(summary.dppPengganti), bold: false },
                    { label: 'Pajak', value: fmt(summary.tax), bold: false },
                    { label: 'Biaya Pengantaran', value: fmt(summary.deliveryFee), bold: false },
                  ]).map((row) => (
                    <tr key={row.label}>
                      <td style={{ padding: '5px 0', fontSize: '10px', width: '60%', color: '#333' }}>{row.label}</td>
                      <td style={{ padding: '5px 0', fontSize: '10px', textAlign: 'center', width: '5%', color: '#333' }}>:</td>
                      <td style={{ padding: '5px 0', fontSize: '10px', textAlign: 'right', width: '35%', whiteSpace: 'nowrap' }}>{row.value}</td>
                    </tr>
                  ))}
                  {/* Sub Total */}
                  <tr>
                    <td style={{ padding: '8px 0 5px', fontSize: '10px', fontWeight: 700, borderTop: '1px solid #888' }}>Sub Total</td>
                    <td style={{ padding: '8px 0 5px', fontSize: '10px', textAlign: 'center', borderTop: '1px solid #888' }}>:</td>
                    <td style={{ padding: '8px 0 5px', fontSize: '10px', textAlign: 'right', fontWeight: 700, borderTop: '1px solid #888', whiteSpace: 'nowrap' }}>Rp {fmt(summary.subTotal)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '5px 0', fontSize: '10px', color: '#333' }}>Bea Materai</td>
                    <td style={{ padding: '5px 0', fontSize: '10px', textAlign: 'center', color: '#333' }}>:</td>
                    <td style={{ padding: '5px 0', fontSize: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Rp {fmt(summary.stampDuty)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '5px 0', fontSize: '10px', color: '#333' }}>Down Payment</td>
                    <td style={{ padding: '5px 0', fontSize: '10px', textAlign: 'center', color: '#333' }}>:</td>
                    <td style={{ padding: '5px 0', fontSize: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{summary.downPayment > 0 ? `Rp ${fmt(summary.downPayment)}` : '-'}</td>
                  </tr>
                  {/* SALDO - prominent */}
                  <tr>
                    <td style={{
                      padding: '10px 0 5px',
                      fontSize: '13px',
                      fontWeight: 700,
                      borderTop: `2px solid ${CORP_GREEN}`,
                      color: CORP_GREEN,
                    }}>Saldo</td>
                    <td style={{
                      padding: '10px 0 5px',
                      fontSize: '13px',
                      textAlign: 'center',
                      borderTop: `2px solid ${CORP_GREEN}`,
                      color: CORP_GREEN,
                    }}>:</td>
                    <td style={{
                      padding: '10px 0 5px',
                      fontSize: '13px',
                      textAlign: 'right',
                      fontWeight: 700,
                      borderTop: `2px solid ${CORP_GREEN}`,
                      whiteSpace: 'nowrap',
                      color: CORP_GREEN,
                    }}>Rp {fmt(summary.balance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ─── Section 4: SIGNATURE ─── */}
        <div data-pdf-section style={{ marginTop: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '240px', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', marginBottom: '4px' }}>{company.name}</div>
              <div style={{ height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px 0' }}>
                {signatory.isApproved && signatory.signatureUrl ? (
                  <img
                    src={signatory.signatureUrl}
                    alt="signature"
                    style={{ maxHeight: '50px', maxWidth: '160px', objectFit: 'contain' }}
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div style={{ height: '50px' }} />
                )}
              </div>
              <div style={{ width: '200px', margin: '0 auto 6px auto', borderTop: '1px solid #333' }} />
              <div style={{ fontWeight: 700, fontSize: '11px' }}>
                {signatory.isApproved && signatory.name ? signatory.name : '(..................................)'}
              </div>
              <div style={{ marginTop: '2px', fontSize: '10px', color: '#555' }}>{signatory.position}</div>
            </div>
          </div>
        </div>

        {/* ─── Section 5: FOOTER ─── */}
        <div data-pdf-section data-pdf-bottom style={{ marginTop: '30px', paddingTop: '10px', borderTop: '1px solid #ccc' }}>
          {/* Green accent bottom line */}
          <div style={{
            height: '2px',
            background: `linear-gradient(90deg, ${CORP_GREEN}, ${CORP_GREEN}60, transparent)`,
            marginBottom: '8px',
          }} />
          <div style={{ fontSize: '10px', lineHeight: '1.5' }}>
            <div style={{ fontWeight: 700, fontSize: '11px', color: CORP_GREEN, marginBottom: '2px', textTransform: 'uppercase' }}>{company.name}</div>
            <div style={{ color: '#555' }}>{company.address}</div>
            <div style={{ color: '#555' }}>{company.phone} | {company.website}</div>
          </div>
        </div>
      </div>
    </div>
  );
});

PiPdfTemplate.displayName = 'PiPdfTemplate';

export default PiPdfTemplate;
