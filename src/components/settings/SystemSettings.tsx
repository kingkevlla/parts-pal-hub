import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Building2, DollarSign, Package, Bell } from "lucide-react";

export default function SystemSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value");

      if (error) throw error;

      const settingsMap: Record<string, any> = {};
      data?.forEach((setting) => {
        settingsMap[setting.key] = setting.value;
      });
      setSettings(settingsMap);
    } catch (error: any) {
      console.error("Error fetching settings:", error);
    }
  };

  const handleSaveAll = async () => {
    try {
      setLoading(true);
      
      for (const [key, value] of Object.entries(settings)) {
        const { data: existing } = await supabase
          .from("system_settings")
          .select("id")
          .eq("key", key)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("system_settings")
            .update({ value: value })
            .eq("key", key);
        } else {
          await supabase
            .from("system_settings")
            .insert({ key, value });
        }
      }

      toast({ title: "Settings saved successfully" });
    } catch (error: any) {
      toast({ title: "Error saving settings", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Information
          </CardTitle>
          <CardDescription>
            This information appears in the header and on receipts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company/Business Name</Label>
              <Input
                id="company_name"
                value={settings.company_name || ""}
                onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                placeholder="My Business Name"
              />
              <p className="text-xs text-muted-foreground">Displayed in the header</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_email">Email Address</Label>
              <Input
                id="company_email"
                type="email"
                value={settings.company_email || ""}
                onChange={(e) => setSettings({ ...settings, company_email: e.target.value })}
                placeholder="info@company.com"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company_phone">Phone Number</Label>
              <Input
                id="company_phone"
                type="tel"
                value={settings.company_phone || ""}
                onChange={(e) => setSettings({ ...settings, company_phone: e.target.value })}
                placeholder="+1234567890"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Default Currency</Label>
              <Select
                value={settings.currency || "USD"}
                onValueChange={(value) => setSettings({ ...settings, currency: value })}
              >
                <SelectTrigger id="currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">$ - US Dollar (USD)</SelectItem>
                  <SelectItem value="EUR">€ - Euro (EUR)</SelectItem>
                  <SelectItem value="GBP">£ - British Pound (GBP)</SelectItem>
                  <SelectItem value="JPY">¥ - Japanese Yen (JPY)</SelectItem>
                  <SelectItem value="CNY">¥ - Chinese Yuan (CNY)</SelectItem>
                  <SelectItem value="INR">₹ - Indian Rupee (INR)</SelectItem>
                  <SelectItem value="AUD">A$ - Australian Dollar (AUD)</SelectItem>
                  <SelectItem value="CAD">C$ - Canadian Dollar (CAD)</SelectItem>
                  <SelectItem value="CHF">Fr - Swiss Franc (CHF)</SelectItem>
                  <SelectItem value="KRW">₩ - South Korean Won (KRW)</SelectItem>
                  <SelectItem value="BRL">R$ - Brazilian Real (BRL)</SelectItem>
                  <SelectItem value="ZAR">R - South African Rand (ZAR)</SelectItem>
                  <SelectItem value="MXN">$ - Mexican Peso (MXN)</SelectItem>
                  <SelectItem value="SGD">S$ - Singapore Dollar (SGD)</SelectItem>
                  <SelectItem value="AED">د.إ - UAE Dirham (AED)</SelectItem>
                  <SelectItem value="SAR">﷼ - Saudi Riyal (SAR)</SelectItem>
                  <SelectItem value="TZS">TSh - Tanzanian Shilling (TZS)</SelectItem>
                  <SelectItem value="KES">KSh - Kenyan Shilling (KES)</SelectItem>
                  <SelectItem value="NGN">₦ - Nigerian Naira (NGN)</SelectItem>
                  <SelectItem value="RWF">FRw - Rwandan Franc (RWF)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_address">Business Address</Label>
            <Textarea
              id="company_address"
              value={settings.company_address || ""}
              onChange={(e) => setSettings({ ...settings, company_address: e.target.value })}
              placeholder="123 Main Street, City, Country"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sales Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Sales Settings
          </CardTitle>
          <CardDescription>Configure sales and transaction options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tax_rate">Default Tax Rate (%)</Label>
            <Input
              id="tax_rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={settings.tax_rate || 0}
              onChange={(e) => setSettings({ ...settings, tax_rate: parseFloat(e.target.value) || 0 })}
              placeholder="0"
              className="max-w-[200px]"
            />
            <p className="text-xs text-muted-foreground">
              Applied to all transactions (VAT, GST, etc.)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Inventory & Alert Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Inventory Settings
          </CardTitle>
          <CardDescription>Manage inventory thresholds and stock alerts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="low_stock_threshold">Low Stock Alert Threshold</Label>
              <Input
                id="low_stock_threshold"
                type="number"
                min="0"
                value={settings.low_stock_threshold || 10}
                onChange={(e) => setSettings({ ...settings, low_stock_threshold: parseInt(e.target.value) || 0 })}
                placeholder="10"
              />
              <p className="text-xs text-muted-foreground">
                Alert when stock falls below this level
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiry_alert_days">Expiry Warning Days</Label>
              <Input
                id="expiry_alert_days"
                type="number"
                min="1"
                value={settings.expiry_alert_days || 30}
                onChange={(e) => setSettings({ ...settings, expiry_alert_days: parseInt(e.target.value) || 30 })}
                placeholder="30"
              />
              <p className="text-xs text-muted-foreground">
                Days before expiry to show warning
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Settings
          </CardTitle>
          <CardDescription>Configure system alerts and notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Notifications are automatically generated for:
          </p>
          <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>Expired products (critical alert)</li>
            <li>Products expiring soon (warning)</li>
            <li>Low stock items (warning)</li>
            <li>Overdue loans (critical alert)</li>
            <li>Active loans (info)</li>
            <li>Open support tickets (info)</li>
          </ul>
        </CardContent>
      </Card>

      <Button onClick={handleSaveAll} disabled={loading} className="w-full" size="lg">
        {loading ? "Saving..." : "Save All Settings"}
      </Button>
    </div>
  );
}
