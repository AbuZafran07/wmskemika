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

// ─── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat('id-ID').format(n);

const CORP_GREEN = '#0b8a47';
const CORP_GREEN_LIGHT = '#eef7f2';
const BORDER = '#7d7d7d';
const TEXT = '#222';

// ─── Layout Constants ───────────────────────────────────────────
const PAGE_WIDTH = '210mm';
const PAGE_HEIGHT = '297mm';

const PAGE_PADDING_TOP = '16mm';
const PAGE_PADDING_LEFT = '14mm';
const PAGE_PADDING_RIGHT = '18mm'; // aman dari kop hijau kanan
const PAGE_PADDING_BOTTOM = '16mm';

const HEADER_TOP_OFFSET = '32px';
const TITLE_WIDTH_MM = 62;

interface PiPdfTemplateProps {
  data: PiPdfData;
}

const PiPdfTemplate = React.forwardRef<HTMLDivElement, PiPdfTemplateProps>(({ data }, ref) => {
  const { company, invoice, customer, items, summary, signatory } = data;

  const infoLabel: React.CSSProperties = {
    width: '22mm',
    padding: '0.6mm 0',
    verticalAlign: 'top',
    fontSize: '3.35mm',
    lineHeight: '1.5',
    fontWeight: 400,
    color: '#333',
  };

  const infoColon: React.CSSProperties = {
    width: '4mm',
    padding: '0.6mm 0',
    textAlign: 'center',
    verticalAlign: 'top',
    fontSize: '3.35mm',
    lineHeight: '1.5',
  };

  const infoValue: React.CSSProperties = {
    padding: '0.6mm 0',
    verticalAlign: 'top',
    fontSize: '3.35mm',
    lineHeight: '1.5',
    fontWeight: 700,
    color: TEXT,
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
    padding: '1.9mm 1.5mm',
    fontSize: '3.1mm',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    textAlign: 'center',
    verticalAlign: 'middle',
    WebkitPrintColorAdjust: 'exact' as any,
    printColorAdjust: 'exact' as any,
  };

  const tdBase: React.CSSProperties = {
    border: `0.3mm solid ${BORDER}`,
    padding: '1.9mm 1.5mm',
    fontSize: '3.2mm',
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
      <td style={{ ...tdBase, wordBreak: 'break-word', lineHeight: '1.32' }}>{item.name}</td>
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

  const summaryRowsTop = [
    { label: 'DPP', value: fmt(summary.dpp) },
    { label: 'DPP Pengganti', value: fmt(summary.dppPengganti) },
    { label: 'Pajak', value: fmt(summary.tax) },
    { label: 'Biaya Pengantaran', value: fmt(summary.deliveryFee) },
  ];

  const itemCount = items.length;
  const dynamicSpacerMinHeight =
    itemCount <= 2 ? '56mm' :
    itemCount <= 4 ? '42mm' :
    itemCount <= 6 ? '28mm' :
    itemCount <= 8 ? '18mm' :
    '10mm';

  return (
    <div ref={ref}>
      <div
        data-pdf-root
        style={{
          width: PAGE_WIDTH,
          minHeight: PAGE_HEIGHT,
          margin: '0 auto',
          paddingTop: PAGE_PADDING_TOP,
          paddingLeft: PAGE_PADDING_LEFT,
          paddingRight: PAGE_PADDING_RIGHT,
          paddingBottom: PAGE_PADDING_BOTTOM,
          boxSizing: 'border-box',
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '12px',
          color: TEXT,
          lineHeight: 1.4,
          background: 'transparent',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            minHeight: `calc(${PAGE_HEIGHT} - ${PAGE_PADDING_TOP} - ${PAGE_PADDING_BOTTOM})`,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* HEADER */}
          <div style={{ paddingTop: HEADER_TOP_OFFSET }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                marginBottom: '6.5mm',
              }}
            >
              <div
                style={{
                  flex: 1,
                  borderTop: '0.7mm solid #222',
                  marginRight: '4mm',
                  transform: 'translateY(-1mm)',
                }}
              />
              <div
                style={{
                  width: `${TITLE_WIDTH_MM}mm`,
                  flexShrink: 0,
                  textAlign: 'right',
                }}
              >
                <h1
                  style={{
                    margin: 0,
                    fontSize: '8.4mm',
                    lineHeight: 1.02,
                    fontWeight: 800,
                    letterSpacing: '0.1px',
                    textTransform: 'uppercase',
                    color: '#111',
                  }}
                >
                  PROFORMA INVOICE
                </h1>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                columnGap: '14mm',
                marginBottom: '6.5mm',
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
                    <td style={infoValue}>{customer.address}</td>
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
                    <td style={infoLabel}>PO Cust.</td>
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

            {/* ITEM TABLE */}
            <div style={{ marginTop: '1.5mm' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {renderTableHeader()}
                <tbody>{items.map((item, idx) => renderTableRow(item, idx))}</tbody>
              </table>
            </div>
          </div>

          {/* AREA KOSONG FLEKSIBEL */}
          <div
            style={{
              flex: '1 1 auto',
              minHeight: dynamicSpacerMinHeight,
            }}
          />

          {/* BOTTOM SECTION */}
          <div
            style={{
              breakInside: 'avoid' as any,
              pageBreakInside: 'avoid',
            }}
          >
            <div style={{ borderTop: '0.7mm solid #222', width: '100%', marginBottom: '7mm' }} />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.03fr 0.97fr',
                columnGap: '12mm',
                alignItems: 'start',
              }}
            >
              {/* LEFT */}
              <div
                style={{
                  breakInside: 'avoid' as any,
                  pageBreakInside: 'avoid',
                }}
              >
                <div
                  style={{
                    background: CORP_GREEN_LIGHT,
                    borderLeft: `1mm solid ${CORP_GREEN}`,
                    padding: '2.7mm 3.2mm',
                    marginBottom: '5mm',
                    fontSize: '3.25mm',
                    lineHeight: '1.5',
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
                    padding: '3.1mm 3.6mm',
                    breakInside: 'avoid' as any,
                    pageBreakInside: 'avoid',
                  }}
                >
                  <div
                    style={{
                      fontSize: '3.7mm',
                      fontWeight: 800,
                      marginBottom: '2.1mm',
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
                      fontSize: '3.25mm',
                      lineHeight: '1.52',
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
                          <td style={{ width: '22mm', padding: '0.4mm 0', verticalAlign: 'top' }}>{label}</td>
                          <td style={{ width: '4mm', padding: '0.4mm 0', textAlign: 'center', verticalAlign: 'top' }}>
                            :
                          </td>
                          <td style={{ fontWeight: 700, padding: '0.4mm 0', verticalAlign: 'top' }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* RIGHT */}
              <div
                style={{
                  width: '100%',
                  fontSize: '3.35mm',
                  breakInside: 'avoid' as any,
                  pageBreakInside: 'avoid',
                }}
              >
                {summaryRowsTop.map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 4mm auto',
                      columnGap: '2mm',
                      padding: '1.15mm 0',
                      alignItems: 'baseline',
                    }}
                  >
                    <div>{row.label}</div>
                    <div style={{ textAlign: 'center' }}>:</div>
                    <div style={{ minWidth: '32mm', textAlign: 'right' }}>{row.value}</div>
                  </div>
                ))}

                <div style={{ borderTop: '0.3mm solid #888', margin: '1.2mm 0' }} />

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 4mm auto',
                    columnGap: '2mm',
                    padding: '1.15mm 0',
                    alignItems: 'baseline',
                    fontWeight: 800,
                  }}
                >
                  <div>Sub Total</div>
                  <div style={{ textAlign: 'center' }}>:</div>
                  <div style={{ minWidth: '32mm', textAlign: 'right' }}>Rp {fmt(summary.subTotal)}</div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 4mm auto',
                    columnGap: '2mm',
                    padding: '1.15mm 0',
                    alignItems: 'baseline',
                  }}
                >
                  <div>Bea Materai</div>
                  <div style={{ textAlign: 'center' }}>:</div>
                  <div style={{ minWidth: '32mm', textAlign: 'right' }}>Rp {fmt(summary.stampDuty)}</div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 4mm auto',
                    columnGap: '2mm',
                    padding: '1.15mm 0',
                    alignItems: 'baseline',
                  }}
                >
                  <div>Down Payment</div>
                  <div style={{ textAlign: 'center' }}>:</div>
                  <div style={{ minWidth: '32mm', textAlign: 'right' }}>
                    {summary.downPayment > 0 ? `Rp ${fmt(summary.downPayment)}` : '-'}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 4mm auto',
                    columnGap: '2mm',
                    alignItems: 'baseline',
                    paddingTop: '2.6mm',
                    marginTop: '1.7mm',
                    borderTop: '0.7mm solid #222',
                  }}
                >
                  <div style={{ fontSize: '4.6mm', fontWeight: 800, color: CORP_GREEN }}>Saldo</div>
                  <div style={{ fontSize: '4.6mm', fontWeight: 800, color: CORP_GREEN, textAlign: 'center' }}>:</div>
                  <div
                    style={{
                      fontSize: '4.6mm',
                      fontWeight: 800,
                      color: CORP_GREEN,
                      textAlign: 'right',
                      minWidth: '32mm',
                    }}
                  >
                    Rp {fmt(summary.balance)}
                  </div>
                </div>

                {/* SIGNATURE */}
                <div
                  style={{
                    textAlign: 'center',
                    marginTop: '8mm',
                    breakInside: 'avoid' as any,
                    pageBreakInside: 'avoid',
                  }}
                >
                  <div style={{ fontSize: '3.7mm', fontWeight: 800, marginBottom: '9mm' }}>
                    {company.name}
                  </div>

                  <div
                    style={{
                      height: '38px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 0 1.2mm 0',
                    }}
                  >
                    {signatory.isApproved && signatory.signatureUrl ? (
                      <img
                        src={signatory.signatureUrl}
                        alt="signature"
                        crossOrigin="anonymous"
                        style={{
                          maxHeight: '36px',
                          maxWidth: '130px',
                          objectFit: 'contain',
                        }}
                      />
                    ) : (
                      <div style={{ height: '36px' }} />
                    )}
                  </div>

                  <div
                    style={{
                      width: '82%',
                      borderTop: '0.35mm solid #666',
                      margin: '0 auto 1.7mm auto',
                    }}
                  />

                  <div style={{ fontSize: '3.2mm', marginBottom: '0.7mm' }}>
                    {signatory.isApproved && signatory.name ? signatory.name : '(....................................)'}
                  </div>

                  <div
                    style={{
                      fontSize: '2.95mm',
                      fontWeight: 700,
                      letterSpacing: '0.35px',
                    }}
                  >
                    {signatory.position}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style>
          {`
            @page {
              size: A4 portrait;
              margin: 0;
            }

            @media print {
              html, body {
                width: 210mm;
                height: 297mm;
                margin: 0;
                padding: 0;
              }

              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                box-sizing: border-box !important;
              }

              table, tr, td, th, img {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
          `}
        </style>
      </div>
    </div>
  );
});

PiPdfTemplate.displayName = 'PiPdfTemplate';
export default PiPdfTemplate;
