import * as XLSX from 'xlsx';

interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export function exportToXlsx(
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string,
  sheetName = 'Report'
) {
  const headers = columns.map(c => c.header);
  const rows = data.map(row => columns.map(c => row[c.key] ?? ''));

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set column widths
  ws['!cols'] = columns.map(c => ({ wch: c.width || 18 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
