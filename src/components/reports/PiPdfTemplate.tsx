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
const CORP_GREEN = '#0b8a47';
const CORP_GREEN_LIGHT = '#eef7f2';
const BORDER = '#7d7d7d';
const TEXT = '#222';

// ─── Constants ──────────────────────────────────────────────────
const TITLE_WIDTH_MM = 78;
const HEADER_TOP_OFFSET = '55px';
const MID_EMPTY_SPACE_MM = 82; // area kosong besar setelah tabel agar divider turun ke bawah

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
    lineHeight: '1.55',
  };

  const infoValue: React.CSSProperties = {
    padding: '0.7mm 0',
    verticalAlign: 'top',
    fontSize: '3.7mm',
    lineHeight: '1.55',
    fontWeight: 700,
  };

  const headerColumns = [
    { label: 'No', w: '6%' },
    { label: 'Kode', w: '12%' },
    { label: 'Nama Barang', w: '38%' },
    { label: 'Jumlah', w: '8%' },
    { label: 'Unit', w: '8%' },
    { label: 'Harga', w: '11%' },
    { label: 'Disc.', w: '7%' },
    { label: 'Sub Total', w: '13%' },
    { label: 'Pajak', w: '7%' },
  ];

  const thStyle: React.CSSProperties = {
    backgroundColor: CORP_GREEN,
    color: '#fff',
    border: `0.3mm solid ${BORDER}`,
    padding: '2.2mm 1.8mm',
    fontSize: '3.3mm',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    textAlign: 'center',
    verticalAlign: 'middle',
    WebkitPrintColorAdjust: 'exact' as any,
    printColorAdjust: 'exact' as any,
  };

  const tdBase: React.CSSProperties = {
    border: `0.3mm solid ${BORDER}`,
    padding: '2.1mm 1.8mm',
    fontSize: '3.45mm',
    verticalAlign: 'middle',
    color: TEXT,
  };

  const renderTableHeader = () => (
    <thead>
      <tr>
        {headerColumns.map((h) => (
          <th key={h.label} style={{ ...thStyle, width: h.w }}>
            {h.label}
          </th>
        ))}
      </tr>
    </thead>
  );

  const renderTableRow = (item: PiPdfItem, idx: number) => (
    <tr
      key={`${item.no}-${idx}`}
      style={{
        backgroundColor: idx % 2 === 1 ? CORP_GREEN_LIGHT : 'transparent',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      <td style={{ ...tdBase, textAlign: 'center' }}>{item.no}</td>
      <td style={{ ...tdBase, color: CORP_GREEN, fontWeight: 700 }}>{item.code}</td>
      <td style={{ ...tdBase, wordBreak: 'break-word', lineHeight: '1.35' }}>{item.name}</td>
      <td style={{ ...tdBase, textAlign: 'center' }}>{item.qty}</td>
      <td style={{ ...tdBase, textAlign: 'center' }}>{item.unit}</td>
      <td style={{ ...tdBase, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(item.price)}</td>
      <td style={{ ...tdBase, textAlign: 'center', whiteSpace: 'nowrap' }}>
        {item.discount > 0 ? `${item.discount}%` : '-'}
      </td>
      <td style={{ ...tdBase, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
        {fmt(item.subtotal)}
      </td>
      <td style={{ ...tdBase, textAlign: 'center', whiteSpace: 'nowrap' }}>{item.taxPercent}</td>
    </tr>
  );

  const ROWS_PER_CHUNK = 8;
  const chunks: PiPdfItem[][] = [];
  for (let i = 0; i < items.length; i += ROWS_PER_CHUNK) {
    chunks.push(items.slice(i, i + ROWS_PER_CHUNK));
  }

  const summaryRowsTop = [
    { label: 'DPP', value: fmt(summary.dpp) },
    { label: 'DPP Pengganti', value: fmt(summary.dppPengganti) },
    { label: 'Pajak', value: fmt(summary.tax) },
    { label: 'Biaya Pengantaran', value: fmt(summary.deliveryFee) },
  ];

  return (
    <div ref={ref}>
      <div
        data-pdf-root
        style={{
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '12px',
          color: TEXT,
          lineHeight: '1.4',
          width: '100%',
          position: 'relative',
        }}
      >
        {/* SECTION 1: HEADER */}
        <div data-pdf-section style={{ paddingTop: HEADER_TOP_OFFSET, marginBottom: '8mm' }}>
          {/* Judul + garis dalam satu baris agar presisi */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              marginBottom: '8mm',
            }}
          >
            <div
              style={{
                flex: 1,
                borderTop: '0.7mm solid #222',
                marginRight: '4mm',
                transform: 'translateY(-1.2mm)',
              }}
            />
            <div
              style={{
                width: `${TITLE_WIDTH_MM}mm`,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              <h1
                style={{
                  fontSize: '14mm',
                  fontWeight: 800,
                  letterSpacing: '0.2px',
                  lineHeight: 1,
                  textTransform: 'uppercase',
                  margin: 0,
                  color: '#111',
                }}
              >
                PROFORMA INVOICE
              </h1>
            </div>
          </div>

          {/* Header detail */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              columnGap: '14mm',
              marginBottom: '7mm',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={infoLabel}>Nomor PI</td>
                  <td style={infoColon}>:</td>
                  <td style={infoValue}>{invoice.number}</td>
                </tr>
                <tr>
                  <td style={infoLabel}>Kepada</td>
                  <td style={infoColon}>:</td>
                  <td style={infoValue}>{customer.companyName}</td>
                </tr>
                <tr>
                  <td style={infoLabel}>Up.</td>
                  <td style={infoColon}>:</td>
                  <td style={infoValue}>{customer.picName}</td>
                </tr>
                <tr>
                  <td style={infoLabel}>Alamat</td>
                  <td style={infoColon}>:</td>
                  <td style={{ ...infoValue, fontWeight: 700 }}>{customer.address}</td>
                </tr>
              </tbody>
            </table>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={infoLabel}>Tanggal</td>
                  <td style={infoColon}>:</td>
                  <td style={infoValue}>{invoice.date}</td>
                </tr>
                <tr>
                  <td style={infoLabel}>Mata Uang</td>
                  <td style={infoColon}>:</td>
                  <td style={infoValue}>{invoice.currency}</td>
                </tr>
                <tr>
                  <td style={infoLabel}>Nomor SO</td>
                  <td style={infoColon}>:</td>
                  <td style={infoValue}>{invoice.soNumber}</td>
                </tr>
                <tr>
                  <td style={infoLabel}>No. PO Customer</td>
                  <td style={infoColon}>:</td>
                  <td style={infoValue}>{invoice.customerPoNumber}</td>
                </tr>
                <tr>
                  <td style={infoLabel}>Term</td>
                  <td style={infoColon}>:</td>
                  <td style={{ ...infoValue, color: '#c62828', fontWeight: 800 }}>{invoice.term}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 2: ITEM TABLE */}
        {chunks.length <= 1 ? (
          <div data-pdf-section style={{ marginTop: '2mm', marginBottom: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              {renderTableHeader()}
              <tbody>{items.map((item, idx) => renderTableRow(item, idx))}</tbody>
            </table>
          </div>
        ) : (
          chunks.map((chunk, chunkIdx) => (
            <div key={chunkIdx} data-pdf-section style={{ marginBottom: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {renderTableHeader()}
                <tbody>
                  {chunk.map((item, idx) => renderTableRow(item, chunkIdx * ROWS_PER_CHUNK + idx))}
                </tbody>
              </table>
            </div>
          ))
        )}

        {/* SECTION 3: AREA KOSONG BESAR + BAWAH */}
        <div data-pdf-section style={{ marginTop: `${MID_EMPTY_SPACE_MM}mm` }}>
          <div style={{ borderTop: '0.7mm solid #222', width: '100%', marginBottom: '8mm' }} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.05fr 0.95fr',
              columnGap: '12mm',
              alignItems: 'start',
            }}
          >
            {/* KIRI */}
            <div>
              <div
                style={{
                  background: CORP_GREEN_LIGHT,
                  borderLeft: `1mm solid ${CORP_GREEN}`,
                  padding: '3mm 3.5mm',
                  marginBottom: '5mm',
                  fontSize: '3.5mm',
                  lineHeight: '1.55',
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                }}
              >
                <span style={{ fontWeight: 700 }}>Terbilang: </span>
                <span style={{ fontStyle: 'italic' }}>{invoice.amountInWords}</span>
              </div>

              <div
                style={{
                  border: '0.3mm solid #9a9a9a',
                  padding: '3.5mm 4mm',
                }}
              >
                <div
                  style={{
                    fontSize: '3.9mm',
                    fontWeight: 800,
                    marginBottom: '2.5mm',
                    textTransform: 'uppercase',
                    color: CORP_GREEN,
                  }}
                >
                  Keterangan Pembayaran:
                </div>

                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '3.5mm',
                    lineHeight: '1.6',
                  }}
                >
                  <tbody>
                    {([
                      ['Account', company.name],
                      ['Bank', company.bankName],
                      ['No. Rekening', company.bankAccount],
                      ['NPWP', company.npwp],
                    ] as [string, string][]).map(([label, val]) => (
                      <tr key={label}>
                        <td style={{ width: '23mm', padding: '0.5mm 0', verticalAlign: 'top' }}>{label}</td>
                        <td
                          style={{
                            width: '4mm',
                            padding: '0.5mm 0',
                            textAlign: 'center',
                            verticalAlign: 'top',
                          }}
                        >
                          :
                        </td>
                        <td style={{ fontWeight: 700, padding: '0.5mm 0', verticalAlign: 'top' }}>{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* KANAN */}
            <div style={{ width: '100%', fontSize: '3.7mm' }}>
              {summaryRowsTop.map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 4mm auto',
                    columnGap: '2mm',
                    padding: '1.4mm 0',
                    alignItems: 'baseline',
                  }}
                >
                  <div>{row.label}</div>
                  <div style={{ textAlign: 'center' }}>:</div>
                  <div style={{ minWidth: '34mm', textAlign: 'right' }}>{row.value}</div>
                </div>
              ))}

              <div style={{ borderTop: '0.3mm solid #888', margin: '1.5mm 0' }} />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 4mm auto',
                  columnGap: '2mm',
                  padding: '1.4mm 0',
                  alignItems: 'baseline',
                  fontWeight: 800,
                }}
              >
                <div>Sub Total</div>
                <div style={{ textAlign: 'center' }}>:</div>
                <div style={{ minWidth: '34mm', textAlign: 'right' }}>Rp {fmt(summary.subTotal)}</div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 4mm auto',
                  columnGap: '2mm',
                  padding: '1.4mm 0',
                  alignItems: 'baseline',
                }}
              >
                <div>Bea Materai</div>
                <div style={{ textAlign: 'center' }}>:</div>
                <div style={{ minWidth: '34mm', textAlign: 'right' }}>Rp {fmt(summary.stampDuty)}</div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 4mm auto',
                  columnGap: '2mm',
                  padding: '1.4mm 0',
                  alignItems: 'baseline',
                }}
              >
                <div>Down Payment</div>
                <div style={{ textAlign: 'center' }}>:</div>
                <div style={{ minWidth: '34mm', textAlign: 'right' }}>
                  {summary.downPayment > 0 ? `Rp ${fmt(summary.downPayment)}` : '-'}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 4mm auto',
                  columnGap: '2mm',
                  alignItems: 'baseline',
                  paddingTop: '3mm',
                  marginTop: '2mm',
                  borderTop: '0.7mm solid #222',
                }}
              >
                <div style={{ fontSize: '5mm', fontWeight: 800, color: CORP_GREEN }}>Saldo</div>
                <div style={{ fontSize: '5mm', fontWeight: 800, color: CORP_GREEN, textAlign: 'center' }}>:</div>
                <div
                  style={{
                    fontSize: '5mm',
                    fontWeight: 800,
                    color: CORP_GREEN,
                    textAlign: 'right',
                    minWidth: '34mm',
                  }}
                >
                  Rp {fmt(summary.balance)}
                </div>
              </div>

              {/* SIGNATURE */}
              <div style={{ textAlign: 'center', marginTop: '10mm' }}>
                <div style={{ fontSize: '4mm', fontWeight: 800, marginBottom: '11mm' }}>{company.name}</div>

                <div
                  style={{
                    height: '46px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 0 1.5mm 0',
                  }}
                >
                  {signatory.isApproved && signatory.signatureUrl ? (
                    <img
                      src={signatory.signatureUrl}
                      alt="signature"
                      style={{
                        maxHeight: '44px',
                        maxWidth: '150px',
                        objectFit: 'contain',
                      }}
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div style={{ height: '44px' }} />
                  )}
                </div>

                <div
                  style={{
                    width: '82%',
                    borderTop: '0.35mm solid #666',
                    margin: '0 auto 2mm auto',
                  }}
                />

                <div style={{ fontSize: '3.5mm', marginBottom: '0.8mm' }}>
                  {signatory.isApproved && signatory.name ? signatory.name : '(....................................)'}
                </div>

                <div
                  style={{
                    fontSize: '3.2mm',
                    fontWeight: 700,
                    letterSpacing: '0.4px',
                  }}
                >
                  {signatory.position}
                </div>
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
