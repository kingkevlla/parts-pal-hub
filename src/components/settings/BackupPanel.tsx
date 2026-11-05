import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2 } from "lucide-react";

export const BACKUP_TABLES = [
  "products", "categories", "warehouses", "inventory", "stock_movements",
  "transactions", "transaction_items", "customers", "loans", "loan_payments",
  "pending_bills", "pending_bill_items", "suppliers", "expenses", "expense_categories",
  "budgets", "employees", "employee_attendance", "employee_leave", "employee_loans",
  "employee_loan_payments", "employee_payroll", "system_settings", "audit_logs",
] as const;

const AUTO_KEY = "auto_backup_enabled";
const LAST_KEY = "last_backup_at";

async function fetchAll(table: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await (supabase as any).from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function runBackup() {
  const out: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) out[t] = await fetchAll(t);
  const blob = new Blob([JSON.stringify({ created_at: new Date().toISOString(), tables: out }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  localStorage.setItem(LAST_KEY, new Date().toISOString());
  return Object.values(out).reduce((n, r) => n + r.length, 0);
}

/** Called once after sign-in: downloads a backup if auto is on and the last one is over 24h old. */
export function maybeAutoBackup() {
  if (localStorage.getItem(AUTO_KEY) !== "1" || !navigator.onLine) return;
  const last = localStorage.getItem(LAST_KEY);
  if (last && Date.now() - new Date(last).getTime() < 86400000) return;
  runBackup().catch(() => {});
}

export default function BackupPanel() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(localStorage.getItem(AUTO_KEY) === "1");
  const last = localStorage.getItem(LAST_KEY);

  const download = async () => {
    if (!navigator.onLine) {
      toast({ title: "No internet", description: "Connect to the internet to download a full backup.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const n = await runBackup();
      toast({ title: "Backup downloaded", description: `${n} records saved.` });
    } catch (e) {
      toast({ title: "Backup failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup</CardTitle>
        <CardDescription>Save a copy of all your business data to this computer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={download} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download all data
          </Button>
          <span className="text-sm text-muted-foreground">
            Last backup: {last ? new Date(last).toLocaleString() : "never"}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-md border p-4">
          <div>
            <Label htmlFor="auto-backup">Daily automatic backup</Label>
            <p className="text-sm text-muted-foreground">Downloads a backup once a day when you open the app on this device.</p>
          </div>
          <Switch
            id="auto-backup"
            checked={auto}
            onCheckedChange={(v) => { setAuto(v); localStorage.setItem(AUTO_KEY, v ? "1" : "0"); }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
