import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹",
  AUD: "A$", CAD: "C$", CHF: "Fr", KRW: "₩", BRL: "R$", ZAR: "R",
  MXN: "$", SGD: "S$", AED: "د.إ", SAR: "﷼", TZS: "TSh", KES: "KSh", NGN: "₦", RWF: "FRw"
};

export function useCurrency() {
  const [currency, setCurrency] = useState("USD");
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrency();
    
    // Subscribe to currency changes
    const channel = supabase
      .channel('currency-changes')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'system_settings', filter: 'key=eq.currency' },
        (payload: any) => {
          const newCurrency = payload.new.value as string;
          setCurrency(newCurrency);
          setCurrencySymbol(CURRENCY_SYMBOLS[newCurrency] || "$");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCurrency = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "currency")
        .single();

      if (error) throw error;

      const curr = data?.value as string || "USD";
      setCurrency(curr);
      setCurrencySymbol(CURRENCY_SYMBOLS[curr] || "$");
    } catch (error) {
      console.error("Error fetching currency:", error);
      setCurrency("USD");
      setCurrencySymbol("$");
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number) => {
    const safe = Number.isFinite(amount) ? amount : 0;
    return `${currencySymbol}${safe.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  /**
   * Compact formatter for dashboard KPI cards. Keeps numbers short
   * so they never overflow narrow cards. Examples (RWF):
   *   1234       -> "FRw 1,234"
   *   12345      -> "FRw 12.3K"
   *   1234567    -> "FRw 1.23M"
   *   1234567890 -> "FRw 1.23B"
   */
  const formatCompact = (amount: number) => {
    const safe = Number.isFinite(amount) ? amount : 0;
    const sign = safe < 0 ? "-" : "";
    const abs = Math.abs(safe);
    let body: string;
    if (abs >= 1_000_000_000) body = `${(abs / 1_000_000_000).toFixed(2)}B`;
    else if (abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(2)}M`;
    else if (abs >= 10_000) body = `${(abs / 1_000).toFixed(1)}K`;
    else body = Math.round(abs).toLocaleString();
    return `${sign}${currencySymbol} ${body}`;
  };

  return { currency, currencySymbol, formatAmount, formatCompact, loading };
}
