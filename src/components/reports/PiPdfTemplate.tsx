import React from 'react';

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

const fmt = (n: number) => new Intl.NumberFormat('id-ID').format(n);

const CORP_GREEN = '#0b8a47';
const CORP_GREEN_LIGHT = '#eef7f2';

// A4 content height = 297mm - 20mm top margin - 20mm bottom margin
const PAGE_HEIGHT = '257mm';
const ROWS_PER_CHUNK = 8;

interface PiPdfTemplateProps {
  data: PiPdfData;
}

const PiPdfTemplate = React.forwardRef<HTMLDivElement, PiPdfTemplateProps>(({ data }, ref) => {
  const { company, invoice, customer, items, summary, signatory } = data;

  const infoLabel: React.CSSProperties = {
    width: '26mm',
    padding: '0.7mm 0',
    verticalAlign: 'top',
    fontSize: '3.7mm',
    lineHeight: '1.55',
    fontWeight: 400,
  };
  const infoColon: React.CSSProperties = {
    width: '4mm',
    padding: '0.7mm 0',
    textAlign: 'center',
    verticalAlign: 'top',
    fontSize: '3.7mm',
  };
  const infoValue: React.CSSProperties = {
    padding: '0.7mm 0',
    verticalAlign: 'top',
    fontSize: '3.7mm',
    lineHeight: '1.55',
    fontWeight: 700,
  };

  const headerColumns = [
    { label: 'No', w: '28px' },
    { label: 'Kode', w: '70px' },
    { label: 'Nama Barang', w: 'auto' },
    { label: 'Jumlah', w: '48px' },
    { label: 'Unit', w: '38px' },
    { label: 'Harga', w: '78px' },
    { label: 'Disc.', w: '42px' },
    { label: 'Sub Total', w: '85px' },
    { label: 'Pajak', w: '38px' },
  ];

  const thStyle: React.CSSProperties = {
    backgroundColor: CORP_GREEN,
    color: '#fff',
    border: '0.3mm solid #7d7d7d',
    padding: '2.1mm 1.8mm',
    fontSize: '3.45mm',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    textAlign: 'center',
    WebkitPrintColorAdjust: 'exact' as any,
    printColorAdjust: 'exact' as any,
  };

  const tdBase: React.CSSProperties = {
    border: '0.3mm solid #7d7d7d',
    padding: '2.1mm 1.8mm',
    fontSize: '3.45mm',
    verticalAlign: 'middle',
  };

  const renderTableHeader = () => (
    <thead>
      <tr>
        {headerColumns.map((h) => (
          <th key={h.label} style={{ ...thStyle, width: h.w }}>{h.label}</th>
        ))}
      </tr>
    </thead>
  );

  const renderTableRow = (item: PiPdfItem, idx: number) => (
    <tr key={item.no} style={{ backgroundColor: idx % 2 === 1 ? CORP_GREEN_LIGHT : 'transparent' }}>
      <td style={{ ...tdBase, textAlign: 'center' }}>{item.no}</td>
      <td style={{ ...tdBase, color: CORP_GREEN, fontWeight: 700 }}>{item.code}</td>
      <td style={{ ...tdBase, wordBreak: 'break-word', lineHeight: '1.35' }}>{item.name}</td>
      <td style={{ ...tdBase, textAlign: 'center' }}>{item.qty}</td>
      <td style={{ ...tdBase, textAlign: 'center' }}>{item.unit}</td>
      <td style={{ ...tdBase, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(item.price)}</td>
      <td style={{ ...tdBase, textAlign: 'center' }}>{item.discount > 0 ? `${item.discount}%` : '-'}</td>
      <td style={{ ...tdBase, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{fmt(item.subtotal)}</td>
      <td style={{ ...tdBase, textAlign: 'center' }}>{item.taxPercent}</td>
    </tr>
  );

  // ── Header block (reused across pages) ──
  const renderHeader = () => (
    <div>
      {/* Title — font dikecilkan agar tidak terpotong elemen dekoratif background */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2mm', marginBottom: '2mm' }}>
        <div style={{ width: '72mm', textAlign: 'right', paddingRight: '4mm' }}>
          <h1 style={{
            fontSize: '11mm',
            fontWeight: 800,
            letterSpacing: '0.3px',
            lineHeight: 1.1,
            textTransform: 'uppercase',
            margin: 0,
            color: '#111',
          }}>
            PROFORMA INVOICE
          </h1>
        </div>
      </div>

      {/* Divider: stops before title box */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '6mm' }}>
        <div style={{ width: 'calc(100% - 72mm)', borderTop: '0.7mm solid #222', height: 0 }} />
      </div>

      {/* 2-column info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '14mm', marginBottom: '5mm' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={infoLabel}>Nomor PI</td><td style={infoColon}>:</td><td style={infoValue}>{invoice.number}</td></tr>
            <tr><td style={infoLabel}>Kepada</td><td style={infoColon}>:</td><td style={infoValue}>{customer.companyName}</td></tr>
            <tr><td style={infoLabel}>Up.</td><td style={infoColon}>:</td><td style={infoValue}>{customer.picName}</td></tr>
            <tr><td style={infoLabel}>Alamat</td><td style={infoColon}>:</td><td style={infoValue}>{customer.address}</td></tr>
          </tbody>
        </table>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={infoLabel}>Tanggal</td><td style={infoColon}>:</td><td style={infoValue}>{invoice.date}</td></tr>
            <tr><td style={infoLabel}>Mata Uang</td><td style={infoColon}>:</td><td style={infoValue}>{invoice.currency}</td></tr>
            <tr><td style={infoLabel}>Nomor SO</td><td style={infoColon}>:</td><td style={infoValue}>{invoice.soNumber}</td></tr>
            <tr><td style={infoLabel}>No. PO Customer</td><td style={infoColon}>:</td><td style={infoValue}>{invoice.customerPoNumber}</td></tr>
            <tr><td style={infoLabel}>Term</td><td style={infoColon}>:</td><td style={{ ...infoValue, color: '#c62828', fontWeight: 800 }}>{invoice.term}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── Footer block (terbilang + bank + summary + signature) ──
  const renderFooter = () => (
    <div>
      {/* Garis atas footer */}
      <div style={{ borderTop: '0.7mm solid #222', width: '100%', marginBottom: '6mm' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', columnGap: '12mm', alignItems: 'start' }}>

        {/* KIRI: Terbilang + Bank */}
        <div>
          <div style={{
            background: CORP_GREEN_LIGHT,
            borderLeft: `1mm solid ${CORP_GREEN}`,
            padding: '3mm 3.5mm',
            marginBottom: '5mm',
            fontSize: '3.5mm',
            lineHeight: '1.55',
          }}>
            <span style={{ fontWeight: 700 }}>Terbilang: </span>
            <span style={{ fontStyle: 'italic' }}>{invoice.amountInWords}</span>
          </div>

          <div style={{ border: '0.3mm solid #9a9a9a', padding: '3.5mm 4mm' }}>
            <div style={{ fontSize: '3.9mm', fontWeight: 800, marginBottom: '2.5mm', textTransform: 'uppercase', color: '#111' }}>
              Keterangan Pembayaran:
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '3.5mm', lineHeight: '1.6' }}>
              <tbody>
                {([
                  ['Account', company.name],
                  ['Bank', company.bankName],
                  ['No. Rekening', company.bankAccount],
                  ['NPWP', company.npwp],
                ] as [string, string][]).map(([label, val]) => (
                  <tr key={label}>
                    <td style={{ width: '23mm', padding: '0.5mm 0', verticalAlign: 'top' }}>{label}</td>
                    <td style={{ width: '4mm', padding: '0.5mm 0', textAlign: 'center', verticalAlign: 'top' }}>:</td>
                    <td style={{ fontWeight: 700, padding: '0.5mm 0', verticalAlign: 'top' }}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* KANAN: Summary + Signature */}
        <div style={{ width: '100%', fontSize: '3.7mm' }}>
          {([
            { label: 'DPP', value: fmt(summary.dpp) },
            { label: 'DPP Pengganti', value: fmt(summary.dppPengganti) },
            { label: 'Pajak', value: fmt(summary.tax) },
            { label: 'Biaya Pengantaran', value: fmt(summary.deliveryFee) },
          ]).map((row) => (
            <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '1fr 4mm auto', columnGap: '2mm', padding: '1.4mm 0', alignItems: 'baseline' }}>
              <div style={{ color: '#222' }}>{row.label}</div>
              <div style={{ textAlign: 'center' }}>:</div>
              <div style={{ minWidth: '34mm', textAlign: 'right' }}>{row.value}</div>
            </div>
          ))}

          <div style={{ borderTop: '0.3mm solid #888', margin: '1.5mm 0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 4mm auto', columnGap: '2mm', padding: '1.4mm 0', alignItems: 'baseline', fontWeight: 800 }}>
            <div>Sub Total</div>
            <div style={{ textAlign: 'center' }}>:</div>
            <div style={{ minWidth: '34mm', textAlign: 'right' }}>Rp {fmt(summary.subTotal)}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 4mm auto', columnGap: '2mm', padding: '1.4mm 0', alignItems: 'baseline' }}>
            <div>Bea Materai</div>
            <div style={{ textAlign: 'center' }}>:</div>
            <div style={{ minWidth: '34mm', textAlign: 'right' }}>Rp {fmt(summary.stampDuty)}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 4mm auto', columnGap: '2mm', padding: '1.4mm 0', alignItems: 'baseline' }}>
            <div>Down Payment</div>
            <div style={{ textAlign: 'center' }}>:</div>
            <div style={{ minWidth: '34mm', textAlign: 'right' }}>
              {summary.downPayment > 0 ? `Rp ${fmt(summary.downPayment)}` : '-'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 4mm auto', columnGap: '2mm', alignItems: 'baseline', paddingTop: '3mm', marginTop: '2mm', borderTop: '0.7mm solid #222' }}>
            <div style={{ fontSize: '5mm', fontWeight: 800, color: CORP_GREEN }}>Saldo</div>
            <div style={{ fontSize: '5mm', fontWeight: 800, color: CORP_GREEN, textAlign: 'center' }}>:</div>
            <div style={{ fontSize: '5mm', fontWeight: 800, color: CORP_GREEN, textAlign: 'right', minWidth: '34mm' }}>
              Rp {fmt(summary.balance)}
            </div>
          </div>

          {/* Signature di bawah Saldo */}
          <div style={{ textAlign: 'center', marginTop: '8mm' }}>
            <div style={{ fontSize: '4mm', fontWeight: 800, marginBottom: '13mm' }}>{company.name}</div>
            <div style={{ height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 0 2mm 0' }}>
              {signatory.isApproved && signatory.signatureUrl ? (
                <img src={signatory.signatureUrl} alt="signature" style={{ maxHeight: '50px', maxWidth: '160px', objectFit: 'contain' }} crossOrigin="anonymous" />
              ) : (
                <div style={{ height: '50px' }} />
              )}
            </div>
            <div style={{ width: '85%', borderTop: '0.35mm solid #666', margin: '0 auto 2mm auto' }} />
            <div style={{ fontSize: '3.5mm', marginBottom: '1mm' }}>
              {signatory.isApproved && signatory.name ? signatory.name : '(....................................)'}
            </div>
            <div style={{ fontSize: '3.4mm', fontWeight: 700, letterSpacing: '0.5px' }}>{signatory.position}</div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Style tiap halaman: fixed height + flexbox ──
  const pageStyle: React.CSSProperties = {
    height: PAGE_HEIGHT,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    // paddingTop: ruang untuk logo letterhead di background
    paddingTop: '55px',
    // paddingBottom: ruang untuk footer letterhead di background
    paddingBottom: '38px',
    overflow: 'hidden',
  };

  // ── Chunk items ──
  const chunks: PiPdfItem[][] = [];
  for (let i = 0; i < items.length; i += ROWS_PER_CHUNK) {
    chunks.push(items.slice(i, i + ROWS_PER_CHUNK));
  }
  const isMultiPage = chunks.length > 1;

  return (
    <div ref={ref}>
      <div
        data-pdf-root
        style={{
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '12px',
          color: '#222',
          lineHeight: '1.4',
          width: '100%',
        }}
      >
        {!isMultiPage ? (
          /*
           * ═══════════════════════════════════════════════════════
           * HALAMAN TUNGGAL (≤ 8 item)
           * Satu section fixed 257mm, flex column.
           * flex:1 spacer mendorong footer ke bawah secara alami.
           * Tidak perlu data-pdf-bottom sama sekali.
           * ═══════════════════════════════════════════════════════
           */
          <div data-pdf-section style={pageStyle}>
            {/* Header */}
            {renderHeader()}

            {/* Tabel item */}
            <div style={{ marginTop: '2mm' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {renderTableHeader()}
                <tbody>{items.map((item, idx) => renderTableRow(item, idx))}</tbody>
              </table>
            </div>

            {/* Spacer fleksibel — mendorong footer ke bawah */}
            <div style={{ flex: 1, minHeight: '5mm' }} />

            {/* Footer */}
            {renderFooter()}
          </div>
        ) : (
          /*
           * ═══════════════════════════════════════════════════════
           * MULTI-HALAMAN (> 8 item)
           * Halaman pertama: header + chunk pertama (tanpa footer)
           * Halaman tengah: chunk berikutnya (tanpa footer)
           * Halaman terakhir: chunk terakhir + spacer + footer
           * ═══════════════════════════════════════════════════════
           */
          chunks.map((chunk, chunkIdx) => {
            const isFirst = chunkIdx === 0;
            const isLast = chunkIdx === chunks.length - 1;

            return (
              <div key={chunkIdx} data-pdf-section style={pageStyle}>
                {/* Header hanya di halaman pertama */}
                {isFirst && renderHeader()}

                {/* Tabel items chunk ini */}
                <div style={{ marginTop: isFirst ? '2mm' : '0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    {renderTableHeader()}
                    <tbody>
                      {chunk.map((item, idx) =>
                        renderTableRow(item, chunkIdx * ROWS_PER_CHUNK + idx)
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Spacer fleksibel */}
                <div style={{ flex: 1, minHeight: '5mm' }} />

                {/* Footer hanya di halaman terakhir */}
                {isLast && renderFooter()}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

PiPdfTemplate.displayName = 'PiPdfTemplate';
export default PiPdfTemplate;
