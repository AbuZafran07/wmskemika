// CSV Export/Import Utilities

export interface CSVColumn<T> {
  key: keyof T | string;
  header: string;
  getValue?: (item: T) => string | number;
}

export interface ValidationResult {
  isValid: boolean;
  isDuplicate: boolean;
  hasWarning: boolean;
  message?: string;
}

// Email validation regex
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone validation regex - accepts various formats
// Supports: +62812345678, 08123456789, 62-812-345-678, etc.
export const PHONE_REGEX = /^(\+?62|0)?[\s\-]?8[1-9][\s\-]?[0-9]{6,11}$/;

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  if (!email || email.trim() === '') return true; // Empty is valid (optional)
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Validate phone number format
 */
export function validatePhone(phone: string): boolean {
  if (!phone || phone.trim() === '') return true; // Empty is valid (optional)
  // Remove common separators for validation
  const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
  return PHONE_REGEX.test(cleanPhone);
}

/**
 * Validate contact info (email and phone) for Supplier/Customer import
 */
export function validateContactInfo(row: Record<string, string>): { 
  isValid: boolean; 
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check email field
  const email = row['Email'] || row['email'] || row['EMAIL'] || '';
  if (email && !validateEmail(email)) {
    errors.push(`Invalid email format: ${email}`);
  }
  
  // Check phone field
  const phone = row['Phone'] || row['phone'] || row['PHONE'] || row['Telepon'] || row['telepon'] || '';
  if (phone && !validatePhone(phone)) {
    errors.push(`Invalid phone format: ${phone}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Export data to CSV
export function exportToCSV<T>(
  data: T[],
  columns: CSVColumn<T>[],
  filename: string
): void {
  // Create header row
  const headerRow = columns.map(col => `"${col.header}"`).join(',');
  
  // Create data rows
  const dataRows = data.map(item => {
    return columns.map(col => {
      let value: unknown;
      if (col.getValue) {
        value = col.getValue(item);
      } else {
        value = item[col.key as keyof T];
      }
      
      // Handle null/undefined
      if (value === null || value === undefined) {
        return '""';
      }
      
      // Convert to string and escape quotes
      const stringValue = String(value).replace(/"/g, '""');
      return `"${stringValue}"`;
    }).join(',');
  });
  
  // Combine header and data
  const csvContent = [headerRow, ...dataRows].join('\n');
  
  // Add BOM for Excel compatibility with UTF-8
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Create download link
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

// Parse CSV content to array of objects
export function parseCSV(csvContent: string): Record<string, string>[] {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  
  // Parse header row
  const headers = parseCSVLine(lines[0]);
  
  // Parse data rows
  const data: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header.trim()] = values[index]?.trim() || '';
      });
      data.push(row);
    }
  }
  
  return data;
}

// Parse a single CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // End of quoted value
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  
  result.push(current);
  return result;
}

// Read file content as text
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// Download CSV template
export function downloadCSVTemplate(
  columns: { header: string; example: string }[],
  filename: string
): void {
  const headerRow = columns.map(col => `"${col.header}"`).join(',');
  const exampleRow = columns.map(col => `"${col.example}"`).join(',');
  
  const csvContent = [headerRow, exampleRow].join('\n');
  
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `template_${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

// Check for duplicates in CSV data
export function checkDuplicates(
  rows: Record<string, string>[],
  keyField: string,
  existingCodes: string[]
): Map<number, { isDuplicate: boolean; duplicateType: 'csv' | 'database' | null }> {
  const result = new Map<number, { isDuplicate: boolean; duplicateType: 'csv' | 'database' | null }>();
  const seenCodes = new Map<string, number>(); // code -> first row index
  
  const existingCodesLower = new Set(existingCodes.map(c => c.toLowerCase()));
  
  rows.forEach((row, index) => {
    const code = row[keyField]?.toLowerCase();
    
    if (!code) {
      result.set(index, { isDuplicate: false, duplicateType: null });
      return;
    }
    
    // Check if duplicate in database
    if (existingCodesLower.has(code)) {
      result.set(index, { isDuplicate: true, duplicateType: 'database' });
      return;
    }
    
    // Check if duplicate within CSV
    if (seenCodes.has(code)) {
      result.set(index, { isDuplicate: true, duplicateType: 'csv' });
      return;
    }
    
    seenCodes.set(code, index);
    result.set(index, { isDuplicate: false, duplicateType: null });
  });
  
  return result;
}

// Get column value with multiple possible header names
export function getColumnValue(
  row: Record<string, string>,
  possibleHeaders: string[]
): string {
  for (const header of possibleHeaders) {
    if (row[header] !== undefined && row[header] !== '') {
      return row[header];
    }
  }
  return '';
}
