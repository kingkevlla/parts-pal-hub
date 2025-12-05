import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useCurrency } from "@/hooks/useCurrency";
import QRCode from "qrcode";

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

export default function Receipt({ isOpen, onClose, saleData }: ReceiptProps) {
  const { settings: systemSettings } = useSystemSettings();
  const { formatAmount } = useCurrency();
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>({
    receipt_logo_url: "",
    receipt_header_text: "RECEIPT",
    receipt_company_info: true,
    receipt_footer_text: "Thank you for your business!",
    receipt_show_qr: true,
    receipt_tax_label: "VAT",
    receipt_paper_size: "80mm",
    receipt_show_customer_info: true,
  });
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchReceiptSettings();
  }, []);

  useEffect(() => {
    if (isOpen && receiptSettings.receipt_show_qr) {
      generateQRCode();
    }
  }, [isOpen, saleData.id, receiptSettings.receipt_show_qr]);

  const fetchReceiptSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .like("key", "receipt_%");

      if (error) throw error;

      const settingsMap: any = { ...receiptSettings };
      data?.forEach((setting: any) => {
        if (setting.value !== null) {
          settingsMap[setting.key] = typeof setting.value === 'object' ? setting.value : setting.value;
        }
      });
      setReceiptSettings(settingsMap);
    } catch (error) {
      console.error("Error fetching receipt settings:", error);
    }
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
    window.print();
  };

  const paperWidth = receiptSettings.receipt_paper_size === "58mm" ? "58mm" : "80mm";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Receipt
            <div className="flex gap-2">
              <Button size="icon" variant="outline" onClick={handlePrint}>
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

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          ${receiptRef.current ? `
            #receipt-content,
            #receipt-content * {
              visibility: visible;
            }
            #receipt-content {
              position: absolute;
              left: 0;
              top: 0;
              width: ${paperWidth};
            }
          ` : ''}
        }
      `}</style>
    </Dialog>
  );
}
