import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, X, Download, WifiOff } from "lucide-react";
import { offlineQuery } from "@/lib/offlineHelpers";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useCurrency } from "@/hooks/useCurrency";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import QRCode from "qrcode";
import { QUEUED_RECEIPTS_KEY } from "@/lib/queuedReceipts";

function queueReceipt(saleData: any) {
  try {
    const existing = JSON.parse(localStorage.getItem(QUEUED_RECEIPTS_KEY) || "[]");
    if (existing.find((r: any) => r.id === saleData.id)) return;
    existing.unshift({ ...saleData, queued_at: new Date().toISOString() });
    localStorage.setItem(QUEUED_RECEIPTS_KEY, JSON.stringify(existing.slice(0, 50)));
  } catch {}
}

interface ReceiptProps {
  isOpen: boolean;
  onClose: () => void;
  saleData: {
    id: string;
    items: Array<{
      name: string;
      quantity: number;
      unit_price: number;
      subtotal: number;
    }>;
    total_amount: number;
    payment_method: string;
    customer_name?: string;
    customer_phone?: string;
    sale_date: string;
  };
}

interface ReceiptSettings {
  receipt_logo_url: string;
  receipt_header_text: string;
  receipt_company_info: boolean;
  receipt_footer_text: string;
  receipt_show_qr: boolean;
  receipt_tax_label: string;
  receipt_paper_size: string;
  receipt_show_customer_info: boolean;
}

const RECEIPT_SETTINGS_CACHE_KEY = "receipt_settings_cache_v1";

const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  receipt_logo_url: "",
  receipt_header_text: "RECEIPT",
  receipt_company_info: true,
  receipt_footer_text: "Thank you for your business!",
  receipt_show_qr: true,
  receipt_tax_label: "VAT",
  receipt_paper_size: "80mm",
  receipt_show_customer_info: true,
};

function loadCachedReceiptSettings(): ReceiptSettings {
  try {
    const raw = localStorage.getItem(RECEIPT_SETTINGS_CACHE_KEY);
    if (raw) return { ...DEFAULT_RECEIPT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_RECEIPT_SETTINGS;
}

export default function Receipt({ isOpen, onClose, saleData }: ReceiptProps) {
  const { settings: systemSettings } = useSystemSettings();
  const { formatAmount } = useCurrency();
  const isOnline = useOnlineStatus();
  // Load instantly from localStorage cache so the receipt renders with the
  // user's branding even before the system_settings query resolves.
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(() => loadCachedReceiptSettings());
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchReceiptSettings();
  }, []);

  useEffect(() => {
    if (isOpen && receiptSettings.receipt_show_qr) {
      generateQRCode();
    }
    // Always queue/cache the receipt locally so it can be re-opened offline.
    if (isOpen && saleData?.id) {
      queueReceipt(saleData);
    }
  }, [isOpen, saleData?.id, receiptSettings.receipt_show_qr]);

  const fetchReceiptSettings = async () => {
    try {
      // SWR: offlineQuery already returns cached data instantly and refreshes
      // in the background. Persist the merged result for next session.
      const { data } = await offlineQuery<any>("system_settings");
      const merged: ReceiptSettings = { ...DEFAULT_RECEIPT_SETTINGS };
      (data || [])
        .filter((s: any) => typeof s.key === "string" && s.key.startsWith("receipt_"))
        .forEach((setting: any) => {
          if (setting.value !== null && setting.value !== undefined) {
            (merged as any)[setting.key] = setting.value;
          }
        });
      setReceiptSettings(merged);
      try { localStorage.setItem(RECEIPT_SETTINGS_CACHE_KEY, JSON.stringify(merged)); } catch {}
    } catch (error) {
      console.error("Error fetching receipt settings:", error);
    }
  };

  const handleExport = () => {
    const lines = [
      receiptSettings.receipt_header_text,
      systemSettings.company_name || "",
      systemSettings.company_phone || "",
      "",
      `Receipt: ${saleData.id.substring(0, 8).toUpperCase()}`,
      `Date: ${new Date(saleData.sale_date).toLocaleString()}`,
      `Payment: ${saleData.payment_method}`,
      saleData.customer_name ? `Customer: ${saleData.customer_name}` : "",
      saleData.customer_phone ? `Phone: ${saleData.customer_phone}` : "",
      "",
      "Items:",
      ...saleData.items.map(
        (i) => `  ${i.quantity} x ${i.name} @ ${formatAmount(i.unit_price)} = ${formatAmount(i.subtotal)}`
      ),
      "",
      `TOTAL: ${formatAmount(saleData.total_amount)}`,
      "",
      receiptSettings.receipt_footer_text || "",
      !isOnline ? "\n[OFFLINE — will sync when online]" : "",
    ]
      .filter(Boolean)
      .join("\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${saleData.id.substring(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateQRCode = async () => {
    try {
      const qrData = JSON.stringify({
        sale_id: saleData.id,
        amount: saleData.total_amount,
        date: saleData.sale_date,
        status: "APPROVED"
      });
      const qrUrl = await QRCode.toDataURL(qrData, {
        width: 150,
        margin: 1,
      });
      setQrCodeUrl(qrUrl);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  };

  const handlePrint = () => {
    const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
    const width = receiptSettings.receipt_paper_size === '58mm' ? '58mm' : '80mm';
    const rows = saleData.items.map((it) => `
      <div class="item"><div class="name">${esc(it.name)}</div>
      <div class="row"><span>${esc(it.quantity)} x ${esc(formatAmount(it.unit_price))}</span><b>${esc(formatAmount(it.subtotal))}</b></div></div>`).join('');
    const tax = systemSettings.tax_rate > 0
      ? `<div class="row small"><span>Incl. ${esc(receiptSettings.receipt_tax_label)} (${esc(systemSettings.tax_rate)}%)</span><span>${esc(formatAmount(saleData.total_amount * systemSettings.tax_rate / 100))}</span></div>` : '';
    const customer = receiptSettings.receipt_show_customer_info && (saleData.customer_name || saleData.customer_phone)
      ? `<div class="sep"></div>${saleData.customer_name ? `<div class="row"><span>Customer</span><b>${esc(saleData.customer_name)}</b></div>` : ''}${saleData.customer_phone ? `<div class="row"><span>Phone</span><span>${esc(saleData.customer_phone)}</span></div>` : ''}` : '';
    const company = receiptSettings.receipt_company_info
      ? [systemSettings.company_name && `<div><b>${esc(systemSettings.company_name)}</b></div>`, systemSettings.company_email && `<div>${esc(systemSettings.company_email)}</div>`, systemSettings.company_phone && `<div>${esc(systemSettings.company_phone)}</div>`].filter(Boolean).join('') : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(saleData.id.substring(0, 8).toUpperCase())}</title>
<style>
  @page { size: ${width} auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; }
  .r { width: ${width}; max-width: 100%; margin: 0 auto; padding: 4px; }
  .c { text-align: center; }
  h1 { font-size: 16px; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .item { margin: 4px 0; } .name { font-weight: bold; word-break: break-word; }
  .total { font-size: 15px; font-weight: bold; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 0; margin-top: 6px; }
  .small { font-size: 11px; } img.logo { max-height: 50px; max-width: 100%; } img.qr { width: 110px; height: 110px; }
</style></head><body><div class="r">
  ${receiptSettings.receipt_logo_url ? `<div class="c"><img class="logo" src="${esc(receiptSettings.receipt_logo_url)}"></div>` : ''}
  <div class="c"><h1>${esc(receiptSettings.receipt_header_text || systemSettings.company_name || 'Receipt')}</h1>${company}</div>
  <div class="sep"></div>
  <div class="row"><span>Receipt No</span><b>${esc(saleData.id.substring(0, 8).toUpperCase())}</b></div>
  <div class="row"><span>Date</span><span>${esc(new Date(saleData.sale_date).toLocaleString())}</span></div>
  <div class="row"><span>Payment</span><span>${esc(saleData.payment_method.replace('_', ' ').toUpperCase())}</span></div>
  ${customer}
  <div class="sep"></div>${rows}
  <div class="row total"><span>TOTAL</span><span>${esc(formatAmount(saleData.total_amount))}</span></div>${tax}
  ${receiptSettings.receipt_show_qr && qrCodeUrl ? `<div class="sep"></div><div class="c"><img class="qr" src="${qrCodeUrl}"><div class="small"><b>APPROVED</b> - Scan to verify</div></div>` : ''}
  ${receiptSettings.receipt_footer_text ? `<div class="sep"></div><div class="c small">${esc(receiptSettings.receipt_footer_text)}</div>` : ''}
</div></body></html>`;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentWindow!.document;
    doc.open(); doc.write(html); doc.close();
    const go = () => {
      frame.contentWindow!.focus();
      frame.contentWindow!.print();
      setTimeout(() => frame.remove(), 1000);
    };
    const imgs = Array.from(doc.images);
    if (!imgs.length) setTimeout(go, 100);
    else {
      let left = imgs.length;
      const done = () => { if (--left <= 0) go(); };
      imgs.forEach((im) => (im.complete ? done() : (im.onload = im.onerror = done)));
    }
  };

  const paperWidth = receiptSettings.receipt_paper_size === "58mm" ? "58mm" : "80mm";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              Receipt
              {!isOnline && (
                <Badge variant="outline" className="gap-1 border-warning text-warning">
                  <WifiOff className="h-3 w-3" />
                  Offline – queued
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="icon" variant="outline" onClick={handleExport} title="Download as .txt">
                <Download className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" onClick={handlePrint} title="Print">
                <Printer className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div 
          ref={receiptRef}
          className="print:p-4 max-h-[600px] overflow-y-auto"
          style={{ 
            fontFamily: 'monospace',
            width: '100%',
            maxWidth: paperWidth
          }}
        >
          <Card className="print:shadow-none print:border-0">
            <CardContent className="p-6 space-y-4">
              {/* Logo */}
              {receiptSettings.receipt_logo_url && (
                <div className="flex justify-center">
                  <img 
                    src={receiptSettings.receipt_logo_url} 
                    alt="Company Logo" 
                    className="h-16 object-contain"
                  />
                </div>
              )}

              {/* Header */}
              <div className="text-center border-b-2 border-dashed pb-4">
                <h2 className="text-2xl font-bold">{receiptSettings.receipt_header_text}</h2>
                
                {/* Company Info */}
                {receiptSettings.receipt_company_info && (
                  <div className="mt-2 text-sm">
                    {systemSettings.company_name && (
                      <div className="font-semibold">{systemSettings.company_name}</div>
                    )}
                    {systemSettings.company_email && (
                      <div>{systemSettings.company_email}</div>
                    )}
                    {systemSettings.company_phone && (
                      <div>{systemSettings.company_phone}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Sale Info */}
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Receipt No:</span>
                  <span className="font-mono">{saleData.id.substring(0, 8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{new Date(saleData.sale_date).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Payment:</span>
                  <span className="uppercase">{saleData.payment_method.replace('_', ' ')}</span>
                </div>
              </div>

              {/* Customer Info */}
              {receiptSettings.receipt_show_customer_info && (saleData.customer_name || saleData.customer_phone) && (
                <div className="text-sm border-t border-dashed pt-2 space-y-1">
                  {saleData.customer_name && (
                    <div className="flex justify-between">
                      <span>Customer:</span>
                      <span className="font-semibold">{saleData.customer_name}</span>
                    </div>
                  )}
                  {saleData.customer_phone && (
                    <div className="flex justify-between">
                      <span>Phone:</span>
                      <span>{saleData.customer_phone}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Items */}
              <div className="border-t-2 border-dashed pt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1">Item</th>
                      <th className="text-center py-1">Qty</th>
                      <th className="text-right py-1">Price</th>
                      <th className="text-right py-1">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleData.items.map((item, index) => (
                      <tr key={index} className="border-b">
                        <td className="py-2">{item.name}</td>
                        <td className="text-center">{item.quantity}</td>
                        <td className="text-right">{formatAmount(item.unit_price)}</td>
                        <td className="text-right font-semibold">{formatAmount(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total */}
              <div className="border-t-2 border-double pt-4 space-y-2">
                <div className="flex justify-between text-xl font-bold">
                  <span>TOTAL:</span>
                  <span>{formatAmount(saleData.total_amount)}</span>
                </div>
                {systemSettings.tax_rate > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Incl. {receiptSettings.receipt_tax_label} ({systemSettings.tax_rate}%):</span>
                    <span>{formatAmount(saleData.total_amount * systemSettings.tax_rate / 100)}</span>
                  </div>
                )}
              </div>

              {/* QR Code */}
              {receiptSettings.receipt_show_qr && qrCodeUrl && (
                <div className="flex flex-col items-center border-t-2 border-dashed pt-4">
                  <img src={qrCodeUrl} alt="Receipt QR Code" className="w-32 h-32" />
                  <div className="text-center mt-2">
                    <div className="text-xs text-green-600 font-bold">✓ APPROVED</div>
                    <div className="text-xs text-muted-foreground">Scan to verify</div>
                  </div>
                </div>
              )}

              {/* Footer */}
              {receiptSettings.receipt_footer_text && (
                <div className="text-center text-sm border-t border-dashed pt-4">
                  {receiptSettings.receipt_footer_text}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>

    </Dialog>
  );
}
