import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Phone, MessageCircle, Download } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { exportToCSV, stamp } from "@/lib/exportData";

interface LoanLike {
  id: string;
  amount: number;
  paid_amount: number;
  status: string;
  due_date: string | null;
  customer?: { name: string; phone: string | null } | null;
  customer_name?: string;
}

type Filter = "overdue" | "1-7" | "8-30" | "30+" | "week" | "nodate";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "overdue", label: "All overdue" },
  { key: "1-7", label: "1–7 days late" },
  { key: "8-30", label: "8–30 days late" },
  { key: "30+", label: "Over 30 days" },
  { key: "week", label: "Due this week" },
  { key: "nodate", label: "No due date" },
];

const DAY = 86_400_000;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function OverdueLoans({ loans }: { loans: LoanLike[] }) {
  const { formatAmount } = useCurrency();
  const [filter, setFilter] = useState<Filter>("overdue");
  const [search, setSearch] = useState("");

  const open = useMemo(() => loans
    .map((l) => {
      const balance = Math.max(0, l.amount - (l.paid_amount || 0));
      const due = l.due_date ? new Date(l.due_date + "T00:00:00").getTime() : null;
      const daysLate = due === null ? null : Math.floor((today() - due) / DAY);
      return { ...l, balance, daysLate };
    })
    .filter((l) => l.balance > 0.009 && l.status !== "paid"), [loans]);

  const match = (l: (typeof open)[number], f: Filter) => {
    const d = l.daysLate;
    switch (f) {
      case "overdue": return d !== null && d > 0;
      case "1-7": return d !== null && d >= 1 && d <= 7;
      case "8-30": return d !== null && d >= 8 && d <= 30;
      case "30+": return d !== null && d > 30;
      case "week": return d !== null && d <= 0 && d >= -7;
      case "nodate": return d === null;
    }
  };

  const rows = open
    .filter((l) => match(l, filter))
    .filter((l) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (l.customer_name || "").toLowerCase().includes(q) || (l.customer?.phone || "").includes(q);
    })
    .sort((a, b) => (b.daysLate ?? -9999) - (a.daysLate ?? -9999));

  const overdueAll = open.filter((l) => match(l, "overdue"));
  const totalOverdue = overdueAll.reduce((s, l) => s + l.balance, 0);
  const customersLate = new Set(overdueAll.map((l) => l.customer_name)).size;
  const total = rows.reduce((s, l) => s + l.balance, 0);

  const lateLabel = (d: number | null) => d === null ? "No due date" : d > 0 ? `${d} day${d > 1 ? "s" : ""} late` : d === 0 ? "Due today" : `Due in ${-d} day${d < -1 ? "s" : ""}`;
  const waLink = (phone: string, name: string, bal: number) =>
    `https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hello ${name}, this is a friendly reminder that your balance of ${formatAmount(bal)} is overdue. Thank you.`)}`;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Overdue & Follow-up</CardTitle>
          <CardDescription>
            {overdueAll.length} overdue loan{overdueAll.length === 1 ? "" : "s"} · {customersLate} customer{customersLate === 1 ? "" : "s"} · <strong className="text-destructive">{formatAmount(totalOverdue)}</strong> late
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => exportToCSV(rows, [
          { header: "Customer", value: (r) => r.customer_name || "" },
          { header: "Phone", value: (r) => r.customer?.phone || "" },
          { header: "Due date", value: (r) => r.due_date || "" },
          { header: "Status", value: (r) => lateLabel(r.daysLate) },
          { header: "Loan amount", value: (r) => r.amount },
          { header: "Paid", value: (r) => r.paid_amount || 0 },
          { header: "Balance", value: (r) => r.balance },
        ], `follow-up-loans-${stamp()}`)}>
          <Download className="mr-2 h-4 w-4" />Export list
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const n = open.filter((l) => match(l, f.key)).length;
            return (
              <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
                {f.label} <Badge variant="secondary" className="ml-2">{n}</Badge>
              </Button>
            );
          })}
        </div>
        <Input placeholder="Search customer name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing here — no loans match this filter.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="font-medium">{l.customer_name || "Unknown"}</div>
                      {l.customer?.phone && <div className="text-xs text-muted-foreground">{l.customer.phone}</div>}
                    </TableCell>
                    <TableCell>{l.due_date ? new Date(l.due_date + "T00:00:00").toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={l.daysLate !== null && l.daysLate > 30 ? "destructive" : l.daysLate !== null && l.daysLate > 0 ? "secondary" : "outline"}>
                        {lateLabel(l.daysLate)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatAmount(l.balance)}</TableCell>
                    <TableCell className="text-right">
                      {l.customer?.phone ? (
                        <div className="flex justify-end gap-1">
                          <Button asChild size="sm" variant="ghost" aria-label="Call customer">
                            <a href={`tel:${l.customer.phone}`}><Phone className="h-4 w-4" /></a>
                          </Button>
                          <Button asChild size="sm" variant="ghost" aria-label="Send WhatsApp reminder">
                            <a href={waLink(l.customer.phone, l.customer_name || "", l.balance)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a>
                          </Button>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">No phone</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-right text-sm text-muted-foreground">Total in this view: <strong className="text-foreground">{formatAmount(total)}</strong></p>
      </CardContent>
    </Card>
  );
}
