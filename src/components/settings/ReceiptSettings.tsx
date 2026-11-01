import { useState, useEffect, useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { offlineQuery, offlineMutate } from "@/lib/offlineHelpers";

import { useToast } from "@/hooks/use-toast";
import { imageToDataUrl } from "@/lib/imageToDataUrl";

interface ReceiptSettingsData {
  receipt_logo_url: string;
  receipt_header_text: string;
  receipt_company_info: boolean;
  receipt_footer_text: string;
  receipt_show_qr: boolean;
  receipt_tax_label: string;
  receipt_paper_size: string;
  receipt_show_customer_info: boolean;
  receipt_logo_align: string;
  receipt_logo_width: number;
  receipt_logo_offset_x: number;
}

export default function ReceiptSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState<ReceiptSettingsData>({
    receipt_logo_url: "",
    receipt_header_text: "RECEIPT",
    receipt_company_info: true,
    receipt_footer_text: "Thank you for your business!",
    receipt_show_qr: true,
    receipt_tax_label: "VAT",
    receipt_paper_size: "80mm",
    receipt_show_customer_info: true,
    receipt_logo_align: "center",
    receipt_logo_width: 120,
    receipt_logo_offset_x: 0,
  });
  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null);
  const logoWidth = Number(settings.receipt_logo_width) || 120;
  const logoOffset = Number(settings.receipt_logo_offset_x) || 0;
  const paperPx = settings.receipt_paper_size === "58mm" ? 220 : 300;
  const maxOffset = Math.max(0, paperPx - 32 - logoWidth);
  const clampOffset = (v: number) => Math.max(-maxOffset, Math.min(maxOffset, Math.round(v)));
  const onDragStart = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startOffset: logoOffset };
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const next = clampOffset(dragRef.current.startOffset + e.clientX - dragRef.current.startX);
    setSettings((p) => ({ ...p, receipt_logo_offset_x: next }));
  };
  const onDragEnd = () => { dragRef.current = null; };

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await offlineQuery<any>("system_settings", () =>
        supabase.from("system_settings").select("*")
      );


      const settingsMap: any = { ...settings };
      data?.forEach((setting) => {
        if (setting.key.startsWith('receipt_')) {
          const value = setting.value;
          if (setting.key === 'receipt_logo_width' || setting.key === 'receipt_logo_offset_x') {
            settingsMap[setting.key] = Number(value) || (setting.key === 'receipt_logo_width' ? 120 : 0);
          } else if (typeof value === 'boolean') {
            settingsMap[setting.key] = value;
          } else if (typeof value === 'string') {
            settingsMap[setting.key] = value;
          } else {
            settingsMap[setting.key] = String(value || '');
          }
        }
      });
      setSettings(settingsMap);
    } catch (error: any) {
      console.error("Error fetching settings:", error);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const publicUrl = await imageToDataUrl(file);
      setSettings((prev) => ({ ...prev, receipt_logo_url: publicUrl }));
      // Save right away so the logo is kept even without pressing Save.
      const { data: rows } = await offlineQuery<any>("system_settings");
      const exists = (rows || []).some((r: any) => r.key === "receipt_logo_url");
      const res = exists
        ? await offlineMutate("system_settings", "update", { value: publicUrl, updated_at: new Date().toISOString() }, { key: "receipt_logo_url" })
        : await offlineMutate("system_settings", "insert", { key: "receipt_logo_url", value: publicUrl });
      if (res && (res as any).success === false) throw (res as any).error || new Error("Could not save the logo");
      try {
        const cached = JSON.parse(localStorage.getItem("receipt_settings_cache_v1") || "{}");
        localStorage.setItem("receipt_settings_cache_v1", JSON.stringify({ ...cached, receipt_logo_url: publicUrl }));
      } catch {}
      toast({ title: "Logo saved", description: "It will show on every receipt." });
      e.target.value = "";
    } catch (error: any) {
      toast({ title: "Error uploading logo", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveAll = async () => {
    try {
      setLoading(true);
      
      const { data: existingRows } = await offlineQuery<any>("system_settings", () =>
        supabase.from("system_settings").select("*")
      );

      for (const [key, value] of Object.entries(settings)) {
        const existing = (existingRows || []).find((s: any) => s.key === key);
        if (existing) {
          await offlineMutate("system_settings", "update", { value, updated_at: new Date().toISOString() }, { key });
        } else {
          await offlineMutate("system_settings", "insert", { key, value });
        }
      }


      try { localStorage.setItem("receipt_settings_cache_v1", JSON.stringify(settings)); } catch {}
      toast({ title: "Receipt settings saved successfully" });
    } catch (error: any) {
      toast({ title: "Error saving settings", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Receipt Design</CardTitle>
          <CardDescription>Customize your receipt appearance and layout</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="logo">Receipt Logo</Label>
            <div className="flex items-center gap-4">
              {settings.receipt_logo_url && (
                <img 
                  src={settings.receipt_logo_url} 
                  alt="Receipt logo" 
                  className="h-20 w-20 object-contain border rounded"
                />
              )}
              <div className="flex-1">
                <Input
                  id="logo"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                  className="cursor-pointer"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Upload your company logo (PNG, JPG, or SVG)
                </p>
              </div>
            </div>
          </div>

          {settings.receipt_logo_url && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Logo position &amp; size</Label>
                <div className="flex gap-1">
                  {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
                    <Button key={a} type="button" size="sm" aria-label={`Align logo ${a}`}
                      variant={settings.receipt_logo_align === a ? "default" : "outline"}
                      onClick={() => setSettings((p) => ({ ...p, receipt_logo_align: a, receipt_logo_offset_x: 0 }))}>
                      <Icon className="h-4 w-4" />
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span>Size</span><span className="text-muted-foreground">{logoWidth}px</span></div>
                <Slider min={30} max={paperPx - 32} step={2} value={[logoWidth]}
                  onValueChange={([v]) => setSettings((p) => ({ ...p, receipt_logo_width: v, receipt_logo_offset_x: 0 }))} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span>Fine position (drag the logo below)</span><span className="text-muted-foreground">{logoOffset > 0 ? "+" : ""}{logoOffset}px</span></div>
                <Slider min={-maxOffset} max={maxOffset} step={1} value={[logoOffset]}
                  onValueChange={([v]) => setSettings((p) => ({ ...p, receipt_logo_offset_x: v }))} />
              </div>
              <div className="flex justify-center rounded-md bg-muted p-4">
                <div className="bg-card text-card-foreground shadow-sm p-4 font-mono text-xs" style={{ width: paperPx }}>
                  <div style={{ textAlign: settings.receipt_logo_align as any }} className="overflow-hidden">
                    <img src={settings.receipt_logo_url} alt="Logo preview" draggable={false}
                      onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
                      className="inline-block cursor-grab active:cursor-grabbing touch-none select-none outline-dashed outline-1 outline-primary/40"
                      style={{ width: logoWidth, position: "relative", left: logoOffset }} />
                  </div>
                  <div className="text-center font-bold text-sm mt-2">{settings.receipt_header_text}</div>
                  <div className="border-t border-dashed my-2" />
                  <div className="flex justify-between"><span>Item × 1</span><span>1,000</span></div>
                  <div className="border-t border-dashed my-2" />
                  <div className="flex justify-between font-bold"><span>TOTAL</span><span>1,000</span></div>
                  <div className="text-center mt-2">{settings.receipt_footer_text}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Preview of your {settings.receipt_paper_size} receipt. Press Save to keep the changes.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="paper_size">Paper Size</Label>
            <Select
              value={settings.receipt_paper_size}
              onValueChange={(value) => setSettings({ ...settings, receipt_paper_size: value })}
            >
              <SelectTrigger id="paper_size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="58mm">58mm (Small)</SelectItem>
                <SelectItem value="80mm">80mm (Standard)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="header_text">Header Text</Label>
            <Input
              id="header_text"
              value={settings.receipt_header_text}
              onChange={(e) => setSettings({ ...settings, receipt_header_text: e.target.value })}
              placeholder="RECEIPT"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show Company Information</Label>
              <p className="text-sm text-muted-foreground">
                Display company name, email, and phone on receipt
              </p>
            </div>
            <Switch
              checked={settings.receipt_company_info}
              onCheckedChange={(checked) => setSettings({ ...settings, receipt_company_info: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show Customer Information</Label>
              <p className="text-sm text-muted-foreground">
                Display customer name and phone if provided
              </p>
            </div>
            <Switch
              checked={settings.receipt_show_customer_info}
              onCheckedChange={(checked) => setSettings({ ...settings, receipt_show_customer_info: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax_label">Tax Label</Label>
            <Input
              id="tax_label"
              value={settings.receipt_tax_label}
              onChange={(e) => setSettings({ ...settings, receipt_tax_label: e.target.value })}
              placeholder="VAT"
            />
            <p className="text-sm text-muted-foreground">
              Label for tax display (e.g., VAT, Tax, GST)
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show QR Code</Label>
              <p className="text-sm text-muted-foreground">
                Generate verification QR code on each receipt
              </p>
            </div>
            <Switch
              checked={settings.receipt_show_qr}
              onCheckedChange={(checked) => setSettings({ ...settings, receipt_show_qr: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="footer_text">Footer Text</Label>
            <Textarea
              id="footer_text"
              value={settings.receipt_footer_text}
              onChange={(e) => setSettings({ ...settings, receipt_footer_text: e.target.value })}
              placeholder="Thank you for your business!"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSaveAll} disabled={loading || uploading} className="w-full">
        {loading ? "Saving..." : "Save Receipt Settings"}
      </Button>
    </div>
  );
}
