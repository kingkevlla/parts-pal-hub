// Helpers for working with locally queued POS receipts (offline-friendly).

export const QUEUED_RECEIPTS_KEY = "queued_receipts";

export interface QueuedReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface QueuedReceipt {
  id: string;
  items: QueuedReceiptItem[];
  total_amount: number;
  payment_method: string;
  customer_name?: string;
  customer_phone?: string;
  sale_date: string;
  queued_at?: string;
}

export function getQueuedReceipts(): QueuedReceipt[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUED_RECEIPTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function clearQueuedReceipts() {
  localStorage.removeItem(QUEUED_RECEIPTS_KEY);
}

function formatReceiptText(
  r: QueuedReceipt,
  format: (n: number) => string,
): string {
  const lines = [
    "==============================",
    `Receipt: ${r.id.substring(0, 8).toUpperCase()}`,
    `Date: ${new Date(r.sale_date).toLocaleString()}`,
    `Payment: ${r.payment_method}`,
    r.customer_name ? `Customer: ${r.customer_name}` : "",
    r.customer_phone ? `Phone: ${r.customer_phone}` : "",
    "------------------------------",
    "Items:",
    ...r.items.map(
      (i) =>
        `  ${i.quantity} x ${i.name} @ ${format(i.unit_price)} = ${format(i.subtotal)}`,
    ),
    "------------------------------",
    `TOTAL: ${format(r.total_amount)}`,
    r.queued_at ? `Queued at: ${new Date(r.queued_at).toLocaleString()}` : "",
    "",
  ];
  return lines.filter(Boolean).join("\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportQueuedReceipts(
  formatAmount: (n: number) => string,
  fmt: "txt" | "json" | "csv" = "txt",
): number {
  const receipts = getQueuedReceipts();
  if (receipts.length === 0) return 0;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (fmt === "json") {
    downloadBlob(
      new Blob([JSON.stringify(receipts, null, 2)], {
        type: "application/json",
      }),
      `queued-receipts-${stamp}.json`,
    );
  } else if (fmt === "csv") {
    const header = [
      "receipt_id",
      "sale_date",
      "payment_method",
      "customer_name",
      "customer_phone",
      "item_name",
      "quantity",
      "unit_price",
      "subtotal",
      "total_amount",
    ].join(",");
    const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows: string[] = [header];
    receipts.forEach((r) => {
      r.items.forEach((i) => {
        rows.push(
          [
            r.id,
            r.sale_date,
            r.payment_method,
            r.customer_name || "",
            r.customer_phone || "",
            i.name,
            i.quantity,
            i.unit_price,
            i.subtotal,
            r.total_amount,
          ]
            .map(escape)
            .join(","),
        );
      });
    });
    downloadBlob(
      new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }),
      `queued-receipts-${stamp}.csv`,
    );
  } else {
    const header =
      `QUEUED RECEIPTS EXPORT\nGenerated: ${new Date().toLocaleString()}\nCount: ${receipts.length}\n\n`;
    const body = receipts.map((r) => formatReceiptText(r, formatAmount)).join("\n");
    downloadBlob(
      new Blob([header + body], { type: "text/plain;charset=utf-8" }),
      `queued-receipts-${stamp}.txt`,
    );
  }
  return receipts.length;
}
