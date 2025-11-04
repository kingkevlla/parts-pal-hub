import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SystemSettings {
  currency: string;
  company_name: string;
  company_email: string;
  company_phone: string;
  tax_rate: number;
  low_stock_threshold: number;
}

const DEFAULT_SETTINGS: SystemSettings = {
  currency: "USD",
  company_name: "",
  company_email: "",
  company_phone: "",
  tax_rate: 0,
  low_stock_threshold: 10,
};

export function useSystemSettings() {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
    
    // Subscribe to settings changes
    const channel = supabase
      .channel('system-settings-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'system_settings' },
        () => {
          fetchSettings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value");

      if (error) throw error;

      const settingsMap: any = { ...DEFAULT_SETTINGS };
      
      data?.forEach((setting) => {
        const value = setting.value;
        // Parse the value based on the key
        if (setting.key === 'tax_rate' || setting.key === 'low_stock_threshold') {
          settingsMap[setting.key] = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
        } else if (setting.key === 'currency') {
          settingsMap[setting.key] = String(value || 'USD');
        } else {
          settingsMap[setting.key] = String(value || '');
        }
      });

      setSettings(settingsMap);
    } catch (error) {
      console.error("Error fetching system settings:", error);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  };

  return { settings, loading, refetch: fetchSettings };
}
