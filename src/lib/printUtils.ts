import DOMPurify from 'dompurify';

interface PrintOptions {
  title: string;
  styles?: string;
  content: string;
  backgroundImage?: string;
}

/**
 * DOMPurify configuration for strict sanitization
 * - Removes all scripts and event handlers
 * - Only allows safe HTML tags for document printing
 * - Strips data: and javascript: URIs
 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div', 'br', 'hr',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup',
    'img', 'figure', 'figcaption',
    'blockquote', 'pre', 'code',
    'header', 'footer', 'main', 'section', 'article', 'aside', 'nav',
    'label'
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'style', 'src', 'alt', 'title', 'width', 'height',
    'colspan', 'rowspan', 'scope', 'headers',
    'for', 'name'
  ],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'frame', 'frameset', 'link', 'meta', 'base'],
  FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress'],
  SANITIZE_DOM: true,
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Sanitizes HTML content with strict DOMPurify configuration
 * @param content - Raw HTML content to sanitize
 * @returns Sanitized HTML string safe for rendering
 */
export const sanitizeHtml = (content: string): string => {
  return DOMPurify.sanitize(content, PURIFY_CONFIG);
};

/**
 * Sanitizes a plain text string for use in HTML attributes or text content
 * Escapes special HTML characters and removes potentially dangerous patterns
 * @param text - Raw text to sanitize
 * @param maxLength - Maximum allowed length (default: 255)
 * @returns Sanitized text safe for use in HTML
 */
export const sanitizeText = (text: string | null | undefined, maxLength: number = 255): string => {
  if (!text) return '';
  
  // Truncate to max length
  const truncated = text.slice(0, maxLength);
  
  // Escape HTML special characters
  return truncated
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Secure print utility that avoids inline scripts in document.write()
 * Uses external event handlers for defense-in-depth XSS protection
 * 
 * Security measures:
 * 1. Strict DOMPurify configuration to remove all scripts/handlers
 * 2. Content-Security-Policy meta tag to block inline scripts
 * 3. External event handlers instead of inline onclick
 * 4. Sanitized title to prevent header injection
 */
export const securePrint = ({ title, styles = '', content, backgroundImage }: PrintOptions): void => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.warn('Print window blocked by browser');
    return;
  }

  // Sanitize content with strict DOMPurify configuration
  const sanitizedContent = DOMPurify.sanitize(content, PURIFY_CONFIG);
  
  // Sanitize title to prevent header injection
  const sanitizedTitle = sanitizeText(title, 100);

  // Write HTML without inline scripts
  // CSP policy blocks inline scripts, only allows inline styles for print formatting
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${sanitizedTitle}</title>
        <meta charset="utf-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: https:; font-src 'self';">
        <style>
          * { 
            box-sizing: border-box; 
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          body { font-family: Arial, sans-serif; padding: 16px; color: #111; ${backgroundImage ? `background-image: url(${backgroundImage}); background-size: 210mm 297mm; background-repeat: no-repeat; background-position: center top;` : ''} }
          /*
            Ensure row background colors (e.g., green header rows applied to <tr>)
            are actually painted on the cells in print preview.
            Some browsers don't reliably paint <tr> backgrounds in print.
          */
          table tr[style*="background"] > th,
          table tr[style*="background"] > td {
            background: inherit !important;
            color: inherit !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          @page { margin: ${backgroundImage ? '0' : '12mm'}; }
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            table tr[style*="background"] > th,
            table tr[style*="background"] > td {
              background: inherit !important;
              color: inherit !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
          }
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
// NOTE: Do NOT override body background or @page margin here — securePrint handles those when backgroundImage is provided.
export const printStyles = {
  salesOrder: `
    * { box-sizing: border-box; }
  `,
  planOrder: `
    * { margin: 0; padding: 0; box-sizing: border-box; }
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
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      th, .badge, [style*="background"] {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  `,
  stockAdjustment: `
    * { 
      margin: 0; padding: 0; box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
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
    @media print { 
      body { padding: 0; }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  `
};
