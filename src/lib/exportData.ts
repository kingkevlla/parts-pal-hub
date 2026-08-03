// Offline export helpers — work entirely on data already in memory / SQLite cache.
// No network required: CSV is built as a Blob, PDF via bundled jsPDF.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const escapeCsv = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Export rows to CSV (offline-safe). Returns number of rows written. */
export function exportToCSV<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string
): number {
  const lines = [
    columns.map((c) => escapeCsv(c.header)).join(','),
    ...rows.map((r) => columns.map((c) => escapeCsv(c.value(r))).join(',')),
  ];
  download(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
  return rows.length;
}

/** Export rows to a paginated PDF table (offline-safe). */
export function exportToPDF<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
  meta?: { title?: string; subtitle?: string; summary?: Array<[string, string]> }
): number {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });
  let y = 14;

  doc.setFontSize(16);
  doc.text(meta?.title || filename, 14, y);
  y += 6;

  doc.setFontSize(9);
  doc.setTextColor(120);
  if (meta?.subtitle) {
    doc.text(meta.subtitle, 14, y);
    y += 5;
  }
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, y);
  y += 6;

  if (meta?.summary?.length) {
    doc.setTextColor(0);
    meta.summary.forEach(([label, value]) => {
      doc.text(`${label}: ${value}`, 14, y);
      y += 5;
    });
    y += 2;
  }

  autoTable(doc, {
    startY: y,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => String(c.value(r) ?? ''))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filename}.pdf`);
  return rows.length;
}

export const stamp = () => new Date().toISOString().slice(0, 10);
