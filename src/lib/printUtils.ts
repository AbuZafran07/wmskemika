import DOMPurify from 'dompurify';

interface PrintOptions {
  title: string;
  styles?: string;
  content: string;
}

/**
 * Secure print utility that avoids inline scripts in document.write()
 * Uses external event handlers for defense-in-depth XSS protection
 */
export const securePrint = ({ title, styles = '', content }: PrintOptions): void => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.warn('Print window blocked by browser');
    return;
  }

  // Sanitize content with DOMPurify
  const sanitizedContent = DOMPurify.sanitize(content);

  // Write HTML without inline scripts
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${DOMPurify.sanitize(title)}</title>
        <meta charset="utf-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'unsafe-inline' 'self';">
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 16px; color: #111; }
          @page { margin: 12mm; }
          ${styles}
        </style>
      </head>
      <body>
        ${sanitizedContent}
      </body>
    </html>
  `);
  printWindow.document.close();

  // Use external event handler instead of inline script
  printWindow.onload = function() {
    printWindow.print();
    printWindow.onafterprint = function() {
      printWindow.close();
    };
  };
};

// Preset styles for different document types
export const printStyles = {
  salesOrder: `
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 16px; color: #111; }
    @page { margin: 12mm; }
  `,
  planOrder: `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      padding: 20px; 
      color: #333;
      font-size: 12px;
    }
    .header { 
      text-align: center; 
      border-bottom: 2px solid #333; 
      padding-bottom: 15px; 
      margin-bottom: 20px; 
    }
    .company-name { font-size: 18px; font-weight: bold; color: #1a365d; }
    .document-title { font-size: 16px; margin-top: 10px; font-weight: 600; }
    .info-grid { 
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      gap: 15px; 
      margin-bottom: 20px; 
    }
    .info-item label { 
      font-size: 10px; 
      color: #666; 
      text-transform: uppercase; 
      display: block;
      margin-bottom: 2px;
    }
    .info-item p { font-weight: 500; }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin: 20px 0; 
    }
    th, td { 
      border: 1px solid #ddd; 
      padding: 8px; 
      text-align: left; 
    }
    th { 
      background: #f5f5f5; 
      font-weight: 600; 
      font-size: 11px;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .summary { 
      margin-top: 20px; 
      border-top: 1px solid #ddd;
      padding-top: 15px;
    }
    .summary-row { 
      display: flex; 
      justify-content: space-between; 
      padding: 5px 0;
    }
    .summary-row.total { 
      font-weight: bold; 
      font-size: 14px; 
      border-top: 2px solid #333;
      margin-top: 10px;
      padding-top: 10px;
    }
    .footer { 
      margin-top: 40px; 
      display: grid; 
      grid-template-columns: 1fr 1fr 1fr; 
      text-align: center; 
    }
    .signature { 
      padding-top: 60px; 
      border-top: 1px solid #333; 
      margin-top: 60px;
      width: 80%;
      margin-left: auto;
      margin-right: auto;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
    }
    .badge-draft { background: #e2e8f0; color: #475569; }
    .badge-approved { background: #dcfce7; color: #166534; }
    .badge-pending { background: #fef3c7; color: #92400e; }
    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-cancelled { background: #fee2e2; color: #991b1b; }
    @media print {
      body { padding: 0; }
    }
  `,
  stockAdjustment: `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; font-size: 12px; }
    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
    .company-name { font-size: 18px; font-weight: bold; color: #1a365d; }
    .document-title { font-size: 16px; margin-top: 10px; font-weight: 600; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
    .info-item label { font-size: 10px; color: #666; text-transform: uppercase; display: block; margin-bottom: 2px; }
    .info-item p { font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; font-size: 11px; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .positive { color: #16a34a; }
    .negative { color: #dc2626; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
    .badge-draft { background: #e2e8f0; color: #475569; }
    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-cancelled { background: #fee2e2; color: #991b1b; }
    @media print { body { padding: 0; } }
  `
};
