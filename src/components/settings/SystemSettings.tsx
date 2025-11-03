import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SystemSetting {
  key: string;
  value: any;
  category: string;
  description: string;
}

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
        .select("*")
        .in("category", ["general", "sales", "inventory"]);

      if (error) throw error;

      const settingsMap: Record<string, any> = {};
      data?.forEach((setting: SystemSetting) => {
        settingsMap[setting.key] = setting.value;
      });
      setSettings(settingsMap);
    } catch (error: any) {
      console.error("Error fetching settings:", error);
    }
  };

  const handleUpdateSetting = async (key: string, value: any) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from("system_settings")
        .update({ value: value })
        .eq("key", key);

      if (error) throw error;

      setSettings({ ...settings, [key]: value });
      toast({ title: "Setting updated successfully" });
    } catch (error: any) {
      toast({ title: "Error updating setting", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
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

      toast({ title: "All settings saved successfully" });
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
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Basic company and system configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name</Label>
            <Input
              id="company_name"
              value={settings.company_name || ""}
              onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
              placeholder="Your Company Name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_email">Company Email</Label>
            <Input
              id="company_email"
              type="email"
              value={settings.company_email || ""}
              onChange={(e) => setSettings({ ...settings, company_email: e.target.value })}
              placeholder="info@company.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_phone">Company Phone</Label>
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
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sales Settings</CardTitle>
          <CardDescription>Configure sales and transaction options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tax_rate">Tax Rate (%)</Label>
            <Input
              id="tax_rate"
              type="number"
              step="0.01"
              value={settings.tax_rate || 0}
              onChange={(e) => setSettings({ ...settings, tax_rate: parseFloat(e.target.value) })}
              placeholder="0"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventory Settings</CardTitle>
          <CardDescription>Manage inventory and stock alerts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="low_stock_threshold">Low Stock Alert Threshold</Label>
            <Input
              id="low_stock_threshold"
              type="number"
              value={settings.low_stock_threshold || 10}
              onChange={(e) => setSettings({ ...settings, low_stock_threshold: parseInt(e.target.value) })}
              placeholder="10"
            />
            <p className="text-sm text-muted-foreground">
              You'll be notified when stock falls below this level
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSaveAll} disabled={loading} className="w-full">
        {loading ? "Saving..." : "Save All Settings"}
      </Button>
    </div>
  );
}
