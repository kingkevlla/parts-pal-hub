import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹",
  AUD: "A$", CAD: "C$", CHF: "Fr", KRW: "₩", BRL: "R$", ZAR: "R",
  MXN: "$", SGD: "S$", AED: "د.إ", SAR: "﷼", TZS: "TSh", KES: "KSh", NGN: "₦"
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
    return `${currencySymbol}${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  return { currency, currencySymbol, formatAmount, loading };
}
