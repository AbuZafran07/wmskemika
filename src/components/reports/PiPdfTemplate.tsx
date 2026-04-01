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

// ─── Shared Styles ──────────────────────────────────────────────
const labelCell: React.CSSProperties = {
  fontSize: '11px',
  color: '#444',
  whiteSpace: 'nowrap',
  padding: '3px 0',
  verticalAlign: 'top',
};

const colonCell: React.CSSProperties = {
  width: '12px',
  padding: '3px 0',
  textAlign: 'center',
  verticalAlign: 'top',
  fontSize: '11px',
};

const valueCell: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  padding: '3px 0',
  verticalAlign: 'top',
  lineHeight: '1.5',
};

// ─── Component ──────────────────────────────────────────────────
interface PiPdfTemplateProps {
  data: PiPdfData;
}

const PiPdfTemplate = React.forwardRef<HTMLDivElement, PiPdfTemplateProps>(({ data }, ref) => {
  const { company, invoice, customer, items, summary, signatory } = data;

  return (
    <div ref={ref}>
      <div data-pdf-root style={{
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '11px',
        color: '#222',
        lineHeight: '1.4',
        width: '100%',
        position: 'relative',
      }}>


        {/* ═══ SECTION 1: HEADER ═══ */}
        <div data-pdf-section style={{ paddingTop: '55px', marginBottom: '16px' }}>

          {/* Title */}
          <h1 style={{
            fontSize: '22px',
            fontWeight: 700,
            textTransform: 'uppercase',
            textAlign: 'right',
            margin: '0 0 8px 0',
            letterSpacing: '1px',
            color: '#000',
          }}>
            PROFORMA INVOICE
          </h1>

          {/* Separator */}
          <div style={{ height: '2px', backgroundColor: '#000', marginBottom: '20px', marginRight: '15px' }} />

          {/* 2-column header: Left = PI info, Right = meta */}
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

            {/* LEFT COLUMN */}
            <div style={{ width: '55%' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ ...labelCell, width: '80px' }}>Nomor PI</td>
                    <td style={colonCell}>:</td>
                    <td style={valueCell}>{invoice.number}</td>
                  </tr>
                  <tr>
                    <td style={{ ...labelCell, width: '80px' }}>Kepada</td>
                    <td style={colonCell}>:</td>
                    <td style={valueCell}>{customer.companyName}</td>
                  </tr>
                  <tr>
                    <td style={{ ...labelCell, width: '80px' }}>Up.</td>
                    <td style={colonCell}>:</td>
                    <td style={valueCell}>{customer.picName}</td>
                  </tr>
                  <tr>
                    <td style={{ ...labelCell, width: '80px' }}>Alamat</td>
                    <td style={colonCell}>:</td>
                    <td style={valueCell}>{customer.address}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* RIGHT COLUMN */}
            <div style={{ width: '45%' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ ...labelCell, width: '110px' }}>Tanggal</td>
                    <td style={colonCell}>:</td>
                    <td style={valueCell}>{invoice.date}</td>
                  </tr>
                  <tr>
                    <td style={{ ...labelCell, width: '110px' }}>Mata Uang</td>
                    <td style={colonCell}>:</td>
                    <td style={valueCell}>{invoice.currency}</td>
                  </tr>
                  <tr>
                    <td style={{ ...labelCell, width: '110px' }}>Nomor SO</td>
                    <td style={colonCell}>:</td>
                    <td style={valueCell}>{invoice.soNumber}</td>
                  </tr>
                  <tr>
                    <td style={{ ...labelCell, width: '110px' }}>No. PO Customer</td>
                    <td style={colonCell}>:</td>
                    <td style={valueCell}>{invoice.customerPoNumber}</td>
                  </tr>
                  <tr>
                    <td style={{ ...labelCell, width: '110px' }}>Term</td>
                    <td style={colonCell}>:</td>
                    <td style={{ ...valueCell, color: '#b91c1c' }}>{invoice.term}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ═══ SECTION 2: ITEMS TABLE ═══ */}
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
                  { label: 'Harga', w: '85px', align: 'right' as const },
                  { label: 'Disc.', w: '55px', align: 'center' as const },
                  { label: 'Sub Total', w: '90px', align: 'right' as const },
                  { label: 'Pajak', w: '42px', align: 'center' as const },
                ].map((h) => (
                  <th key={h.label} style={{
                    backgroundColor: CORP_GREEN,
                    color: '#fff',
                    border: '1px solid #0a5530',
                    padding: '7px 6px',
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
                  <td style={{ border: '1px solid #ccc', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{item.no}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', fontSize: '10px', color: CORP_GREEN, fontWeight: 700 }}>{item.code}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', fontSize: '10px', lineHeight: '1.4', wordBreak: 'break-word' }}>{item.name}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{item.qty}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{item.unit}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', fontSize: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(item.price)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{item.discount > 0 ? `${item.discount}%` : '-'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', fontSize: '10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{fmt(item.subtotal)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{item.taxPercent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ═══ SECTION 3: BOTTOM AREA (Terbilang + Bank | Calculations) ═══ */}
        <div data-pdf-section style={{ marginTop: '24px' }}>
          {/* Divider */}
          <div style={{ borderTop: '2px solid #000', marginBottom: '16px' }} />

          <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start' }}>

            {/* LEFT: Terbilang + Bank Info */}
            <div style={{ width: '55%', fontSize: '10px' }}>
              {/* Terbilang */}
              <div style={{
                marginBottom: '14px',
                padding: '8px 10px',
                borderLeft: `3px solid ${CORP_GREEN}`,
                lineHeight: '1.5',
              }}>
                <span style={{ fontWeight: 700 }}>Terbilang: </span>
                <span style={{ fontStyle: 'italic' }}>{invoice.amountInWords}</span>
              </div>

              {/* Bank Info */}
              <div style={{
                border: '1px solid #999',
                padding: '10px 12px',
                lineHeight: '1.6',
              }}>
                <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Keterangan Pembayaran:
                </div>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <tbody>
                    {([
                      ['Account', company.name],
                      ['Bank', company.bankName],
                      ['No. Rekening', company.bankAccount],
                      ['NPWP', company.npwp],
                    ] as [string, string][]).map(([label, val]) => (
                      <tr key={label}>
                        <td style={{ fontSize: '10px', color: '#555', width: '75px', padding: '2px 0', verticalAlign: 'top' }}>{label}</td>
                        <td style={{ fontSize: '10px', padding: '2px 0', width: '10px', textAlign: 'center', verticalAlign: 'top' }}>:</td>
                        <td style={{ fontSize: '10px', fontWeight: 700, padding: '2px 0', verticalAlign: 'top' }}>{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RIGHT: Summary Calculations */}
            <div style={{ width: '45%' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {([
                    { label: 'DPP', value: fmt(summary.dpp) },
                    { label: 'DPP Pengganti', value: fmt(summary.dppPengganti) },
                    { label: 'Pajak', value: fmt(summary.tax) },
                    { label: 'Biaya Pengantaran', value: fmt(summary.deliveryFee) },
                  ]).map((row) => (
                    <tr key={row.label}>
                      <td style={{ padding: '4px 0', fontSize: '10px', width: '55%', color: '#333' }}>{row.label}</td>
                      <td style={{ padding: '4px 0', fontSize: '10px', textAlign: 'center', width: '5%', color: '#333' }}>:</td>
                      <td style={{ padding: '4px 0', fontSize: '10px', textAlign: 'right', width: '40%', whiteSpace: 'nowrap' }}>{row.value}</td>
                    </tr>
                  ))}

                  {/* Sub Total */}
                  <tr>
                    <td style={{ padding: '6px 0 4px', fontSize: '10px', fontWeight: 700, borderTop: '1px solid #888' }}>Sub Total</td>
                    <td style={{ padding: '6px 0 4px', fontSize: '10px', textAlign: 'center', borderTop: '1px solid #888' }}>:</td>
                    <td style={{ padding: '6px 0 4px', fontSize: '10px', textAlign: 'right', fontWeight: 700, borderTop: '1px solid #888', whiteSpace: 'nowrap' }}>Rp {fmt(summary.subTotal)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 0', fontSize: '10px', color: '#333' }}>Bea Materai</td>
                    <td style={{ padding: '4px 0', fontSize: '10px', textAlign: 'center', color: '#333' }}>:</td>
                    <td style={{ padding: '4px 0', fontSize: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Rp {fmt(summary.stampDuty)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 0', fontSize: '10px', color: '#333', borderBottom: '1px solid #888' }}>Down Payment</td>
                    <td style={{ padding: '4px 0', fontSize: '10px', textAlign: 'center', color: '#333', borderBottom: '1px solid #888' }}>:</td>
                    <td style={{ padding: '4px 0', fontSize: '10px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid #888' }}>
                      {summary.downPayment > 0 ? `Rp ${fmt(summary.downPayment)}` : '-'}
                    </td>
                  </tr>

                  {/* Saldo */}
                  <tr>
                    <td style={{ padding: '8px 0', fontSize: '12px', fontWeight: 700 }}>Saldo</td>
                    <td style={{ padding: '8px 0', fontSize: '12px', textAlign: 'center' }}>:</td>
                    <td style={{ padding: '8px 0', fontSize: '12px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      Rp {fmt(summary.balance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ═══ SECTION 4: SIGNATURE ═══ */}
        <div data-pdf-section style={{ marginTop: '28px', marginBottom: '120px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '240px', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', marginBottom: '4px' }}>
                {company.name}
              </div>
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
              <div style={{ marginTop: '2px', fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>
                {signatory.position}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
});

PiPdfTemplate.displayName = 'PiPdfTemplate';

export default PiPdfTemplate;
