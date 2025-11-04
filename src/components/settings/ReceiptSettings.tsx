import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";

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

export default function ReceiptSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState<ReceiptSettings>({
    receipt_logo_url: "",
    receipt_header_text: "RECEIPT",
    receipt_company_info: true,
    receipt_footer_text: "Thank you for your business!",
    receipt_show_qr: true,
    receipt_tax_label: "VAT",
    receipt_paper_size: "80mm",
    receipt_show_customer_info: true,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .eq("category", "receipt");

      if (error) throw error;

      const settingsMap: any = { ...settings };
      data?.forEach((setting: any) => {
        const value = setting.value;
        if (typeof value === 'boolean') {
          settingsMap[setting.key] = value;
        } else if (typeof value === 'string') {
          settingsMap[setting.key] = value;
        } else {
          settingsMap[setting.key] = String(value || '');
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
      const fileExt = file.name.split('.').pop();
      const fileName = `receipt-logo-${Date.now()}.${fileExt}`;

      const { error: uploadError, data } = await supabase.storage
        .from('avatars')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      setSettings({ ...settings, receipt_logo_url: publicUrl });
      toast({ title: "Logo uploaded successfully" });
    } catch (error: any) {
      toast({ title: "Error uploading logo", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveAll = async () => {
    try {
      setLoading(true);
      
      for (const [key, value] of Object.entries(settings)) {
        await supabase
          .from("system_settings")
          .update({ value: value })
          .eq("key", key);
      }

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
