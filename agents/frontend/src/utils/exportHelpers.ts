/**
 * Export Helpers - Phase 2.2
 * CSV, PDF, and Excel export functionality for reports
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';

// Format date for filenames
const formatDateForFilename = () => {
  const now = new Date();
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
};

// Flatten nested objects for export
const flattenObject = (obj: any, prefix = ''): any => {
  const flattened: any = {};

  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}_${key}` : key;

    if (value === null || value === undefined) {
      flattened[newKey] = '';
    } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else if (value instanceof Date) {
      flattened[newKey] = value.toLocaleDateString();
    } else if (typeof value === 'boolean') {
      flattened[newKey] = value ? 'Yes' : 'No';
    } else {
      flattened[newKey] = value;
    }
  });

  return flattened;
};

// Prepare data for export (flatten and format)
const prepareDataForExport = (data: any[]): any[] => {
  return data.map(row => flattenObject(row));
};

/**
 * Export to CSV
 */
export const exportToCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  const preparedData = prepareDataForExport(data);
  const csv = Papa.unparse(preparedData);

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${formatDateForFilename()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export to Excel
 */
export const exportToExcel = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  const preparedData = prepareDataForExport(data);

  // Create worksheet
  const ws = XLSX.utils.json_to_sheet(preparedData);

  // Auto-size columns
  const colWidths: any[] = [];
  const headers = Object.keys(preparedData[0] || {});

  headers.forEach((header, idx) => {
    const maxLength = Math.max(
      header.length,
      ...preparedData.map(row => String(row[header] || '').length)
    );
    colWidths[idx] = { wch: Math.min(maxLength + 2, 50) };
  });

  ws['!cols'] = colWidths;

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');

  // Save file
  XLSX.writeFile(wb, `${filename}_${formatDateForFilename()}.xlsx`);
};

/**
 * Export to PDF
 */
export const exportToPDF = (
  data: any[],
  filename: string,
  reportTitle: string,
  filters?: { from?: string; to?: string; status?: string; source?: string; type?: string }
) => {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  const preparedData = prepareDataForExport(data);
  const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation

  // Add title
  doc.setFontSize(16);
  doc.setTextColor(40, 40, 40);
  doc.text(reportTitle, 14, 15);

  // Add filters if present
  let yPos = 22;
  if (filters) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);

    const filterTexts: string[] = [];
    if (filters.from) filterTexts.push(`From: ${filters.from}`);
    if (filters.to) filterTexts.push(`To: ${filters.to}`);
    if (filters.status && filters.status !== 'all') filterTexts.push(`Status: ${filters.status}`);
    if (filters.source && filters.source !== 'all') filterTexts.push(`Source: ${filters.source}`);
    if (filters.type && filters.type !== 'all') filterTexts.push(`Type: ${filters.type}`);

    if (filterTexts.length > 0) {
      doc.text(`Filters: ${filterTexts.join(' | ')}`, 14, yPos);
      yPos += 7;
    }
  }

  // Add generation date
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos);
  yPos += 5;

  // Prepare table data
  const headers = Object.keys(preparedData[0] || {});
  const tableData = preparedData.map(row => headers.map(header => String(row[header] || '')));

  // Format headers (capitalize and replace underscores)
  const formattedHeaders = headers.map(h =>
    h.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  );

  // Add table
  autoTable(doc, {
    head: [formattedHeaders],
    body: tableData,
    startY: yPos + 3,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246], // Blue
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: 50,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
    tableWidth: 'auto',
    styles: {
      overflow: 'linebreak',
      cellWidth: 'wrap',
    },
  });

  // Add page numbers
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() - 30,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  // Save file
  doc.save(`${filename}_${formatDateForFilename()}.pdf`);
};

/**
 * Export summary data (for aggregated reports)
 */
export const exportSummaryToCSV = (summaryData: any, filename: string) => {
  const rows: any[] = [];

  Object.entries(summaryData).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(item => {
        rows.push({ category: key.replace(/_/g, ' '), ...flattenObject(item) });
      });
    } else {
      rows.push({ metric: key.replace(/_/g, ' '), value });
    }
  });

  exportToCSV(rows, filename);
};

/**
 * Export summary to Excel with multiple sheets
 */
export const exportSummaryToExcel = (summaryData: any, filename: string) => {
  const wb = XLSX.utils.book_new();

  Object.entries(summaryData).forEach(([key, value]) => {
    if (Array.isArray(value) && value.length > 0) {
      const preparedData = prepareDataForExport(value);
      const ws = XLSX.utils.json_to_sheet(preparedData);

      // Auto-size columns
      const headers = Object.keys(preparedData[0] || {});
      const colWidths = headers.map((header) => ({
        wch: Math.min(
          Math.max(header.length, ...preparedData.map(row => String(row[header] || '').length)) + 2,
          50
        ),
      }));
      ws['!cols'] = colWidths;

      // Sheet name (max 31 chars, no special chars)
      const sheetName = key.replace(/_/g, ' ').substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
  });

  // If no sheets were added, create a summary sheet
  if (wb.SheetNames.length === 0) {
    const summaryRows = Object.entries(summaryData).map(([key, value]) => ({
      metric: key.replace(/_/g, ' '),
      value: typeof value === 'object' ? JSON.stringify(value) : value,
    }));
    const ws = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  }

  XLSX.writeFile(wb, `${filename}_${formatDateForFilename()}.xlsx`);
};
