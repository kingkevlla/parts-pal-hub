import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Sparkles, Check, ChevronDown, ChevronRight, Download, AlertTriangle, ShieldAlert } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { exportToCSV, exportToPDF, stamp, ExportColumn } from "@/lib/exportData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AUDIT_SECTIONS, AppConfig, AppRole, MODULES, saveAppConfig, useAppConfig } from "@/lib/appConfig";

interface AuditRow {
  id: string; user_name: string | null; section: string; action: string;
  summary: string | null; changes: any; created_at: string;
}

export function AuditLogPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500);
    if (!error) setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const users = useMemo(() => [...new Set(rows.map((r) => r.user_name || "Unknown"))], [rows]);
  const filtered = rows.filter((r) => {
    if (section !== "all" && r.section !== section) return false;
    if (userFilter !== "all" && (r.user_name || "Unknown") !== userFilter) return false;
    const d = r.created_at.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (search && !`${r.summary} ${r.user_name}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const doExport = (kind: "pdf" | "csv") => {
    const fmtChanges = (c: any) => Object.entries(c || {}).map(([k, v]: any) => `${k}: ${JSON.stringify(v.from)} -> ${JSON.stringify(v.to)}`).join(" | ");
    const cols: ExportColumn<AuditRow>[] = [
      { header: "Date & time", value: (r) => new Date(r.created_at).toLocaleString() },
      { header: "Person", value: (r) => r.user_name || "Unknown" },
      { header: "Section", value: (r) => AUDIT_SECTIONS[r.section] || r.section },
      { header: "Source", value: (r) => (r.action === "ai" ? "AI suggestion" : "Manual") },
      { header: "Summary", value: (r) => r.summary || "" },
      ...(kind === "csv" ? [{ header: "Details", value: (r: AuditRow) => fmtChanges(r.changes) }] : []),
    ];
    const filters = [
      section !== "all" ? `Section: ${AUDIT_SECTIONS[section]}` : "",
      userFilter !== "all" ? `Person: ${userFilter}` : "",
      from || to ? `Dates: ${from || "start"} to ${to || "today"}` : "",
      search ? `Search: "${search}"` : "",
    ].filter(Boolean).join(" · ") || "No filters (all records)";
    const name = `change-history-${stamp()}`;
    if (kind === "csv") exportToCSV(filtered, cols, name);
    else exportToPDF(filtered, cols, name, { title: "Control Center Change History", subtitle: filters, summary: [["Records", String(filtered.length)]] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Change History</CardTitle>
          <CardDescription>Who changed modules, permissions, design, layout and rules — and when.</CardDescription>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!filtered.length}><Download className="mr-2 h-4 w-4" />Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => doExport("pdf")}>Download PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("csv")}>Download CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={section} onValueChange={setSection}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {Object.entries(AUDIT_SECTIONS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All people</SelectItem>
              {users.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing {filtered.length} of {rows.length} records</span>
          <Button variant="ghost" size="sm" onClick={() => { setSection("all"); setUserFilter("all"); setFrom(""); setTo(""); setSearch(""); }}>Clear filters</Button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {filtered.map((r) => (
              <li key={r.id}>
                <button className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/50" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {open === r.id ? <ChevronDown className="mt-1 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.user_name || "Unknown"}</span>
                      <Badge variant="outline">{AUDIT_SECTIONS[r.section] || r.section}</Badge>
                      {r.action === "ai" && <Badge variant="secondary"><Sparkles className="mr-1 h-3 w-3" />AI suggestion</Badge>}
                      <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 break-words text-sm text-muted-foreground">{r.summary}</p>
                  </div>
                </button>
                {open === r.id && (
                  <div className="space-y-1 bg-muted/30 px-10 py-3 text-xs">
                    {Object.entries(r.changes || {}).map(([k, c]: any) => (
                      <div key={k} className="grid grid-cols-[8rem_1fr] gap-2">
                        <span className="font-medium">{k}</span>
                        <span className="break-all"><span className="text-destructive line-through">{JSON.stringify(c.from)}</span> → <span className="text-success">{JSON.stringify(c.to)}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

interface Recommendation {
  summary: string;
  modules: { key: string; enabled: boolean; reason: string }[];
  role_permissions: { role: AppRole; modules: string[]; reason: string }[];
  rules: { pos_allow_manual_entry: boolean; reason: string };
}

const LOCKED = new Set(MODULES.filter((m) => m.locked).map((m) => m.key));
const label = (k: string) => MODULES.find((m) => m.key === k)?.label || k;

// Pages that expose money, staff data or system control
const SENSITIVE = new Set(["settings", "users", "employees", "expenses", "loans", "reports", "owner_dashboard", "stock_adjustment", "transactions"]);
const LOW_ROLES = new Set(["cashier", "user"]);

function assessRisks(
  rec: Recommendation, cfg: AppConfig,
  diffs: { role: AppRole; add: string[]; rem: string[] }[],
): { level: "high" | "medium"; text: string }[] {
  const out: { level: "high" | "medium"; text: string }[] = [];
  diffs.forEach((d) => {
    d.add.filter((x) => SENSITIVE.has(x)).forEach((x) =>
      out.push({ level: LOW_ROLES.has(d.role) || x === "settings" || x === "users" ? "high" : "medium",
        text: `${d.role} would gain access to ${label(x)}.` }));
    if (d.rem.includes("pos") && d.role === "cashier") out.push({ level: "high", text: "Cashiers would lose the Point of Sale — they may not be able to sell." });
    const final = rec.role_permissions.find((r) => r.role === d.role)?.modules || [];
    if (!final.includes("dashboard")) out.push({ level: "medium", text: `${d.role} would lose the Dashboard (their start page).` });
  });
  rec.modules.forEach((m) => {
    if (!LOCKED.has(m.key) && !m.enabled && cfg.modules[m.key] !== false && ["pos", "inventory"].includes(m.key))
      out.push({ level: "high", text: `${label(m.key)} would be turned off for everyone.` });
  });
  if (rec.rules.pos_allow_manual_entry && !cfg.rules.pos_allow_manual_entry)
    out.push({ level: "medium", text: "Cashiers could sell items that are not in the product list." });
  return out;
}

export function PolicyAdvisorPanel() {
  const cfg = useAppConfig();
  const { toast } = useToast();
  const [policy, setPolicy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const ask = async () => {
    setLoading(true); setError(""); setRec(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-policy-advisor", {
        body: {
          policy,
          modules: MODULES.map(({ key, label, group }) => ({ key, label, group })),
          current: { modules: cfg.modules, role_permissions: cfg.role_permissions, rules: cfg.rules },
        },
      });
      if (error) {
        let msg = error.message;
        try { msg = (await (error as any).context?.json())?.error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      setRec(data.recommendation);
    } catch (e: any) {
      setError(navigator.onLine ? e.message : "The AI advisor needs an internet connection.");
    } finally { setLoading(false); }
  };

  const apply = async () => {
    if (!rec) return;
    setConfirmOpen(false);
    setApplying(true);
    const modules = { ...cfg.modules };
    rec.modules.forEach((m) => { if (!LOCKED.has(m.key)) modules[m.key] = m.enabled; });
    const role_permissions = { ...cfg.role_permissions };
    rec.role_permissions.forEach((r) => { if (r.role !== "admin") role_permissions[r.role] = r.modules; });
    const next: AppConfig = { ...cfg, modules, role_permissions, rules: { ...cfg.rules, pos_allow_manual_entry: rec.rules.pos_allow_manual_entry } };
    try {
      await saveAppConfig(next, "ai");
      toast({ title: "AI recommendations applied" });
      setRec(null);
    } catch (e: any) {
      toast({ title: "Could not apply", description: e?.message, variant: "destructive" });
    } finally { setApplying(false); }
  };

  const roleDiffs = (rec?.role_permissions || []).filter((r) => r.role !== "admin").map((r) => {
    const cur = cfg.role_permissions[r.role] || [];
    return { role: r.role, add: r.modules.filter((x) => !cur.includes(x)), rem: cur.filter((x) => !r.modules.includes(x)) };
  }).filter((d) => d.add.length + d.rem.length > 0);
  const risks = rec ? assessRisks(rec, cfg, roleDiffs) : [];
  const moduleChanges = rec?.modules.filter((m) => !LOCKED.has(m.key) && (cfg.modules[m.key] !== false) !== m.enabled) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />AI Policy Advisor</CardTitle>
        <CardDescription>Describe how your business works. AI suggests which modules to use, what each role can open, and rules. Nothing changes until you press Apply.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="policy">Your operational policies</Label>
          <Textarea
            id="policy" rows={6} value={policy} onChange={(e) => setPolicy(e.target.value)} maxLength={6000}
            placeholder="Example: Cashiers only sell and see today's sales. Managers handle stock and suppliers but not salaries. We don't give credit to customers. Every sold item must exist in the product list."
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={ask} disabled={loading || policy.trim().length < 10}>
            <Sparkles className="mr-2 h-4 w-4" />{loading ? "Thinking..." : "Get recommendations"}
          </Button>
        </div>
        {error && <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        {rec && (
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-sm">{rec.summary}</p>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Module changes</p>
              {moduleChanges.length === 0 ? <p className="text-sm text-muted-foreground">No module changes.</p> : (
                <ul className="space-y-1 text-sm">
                  {moduleChanges.map((m) => (
                    <li key={m.key}><Badge variant={m.enabled ? "default" : "outline"} className="mr-2">{m.enabled ? "Turn on" : "Turn off"}</Badge>{label(m.key)} — <span className="text-muted-foreground">{m.reason}</span></li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role access</p>
              <div className="space-y-3">
                {rec.role_permissions.filter((r) => r.role !== "admin").map((r) => {
                  const cur = cfg.role_permissions[r.role] || [];
                  const add = r.modules.filter((x) => !cur.includes(x));
                  const rem = cur.filter((x) => !r.modules.includes(x));
                  return (
                    <div key={r.role} className="text-sm">
                      <p className="font-medium capitalize">{r.role} <span className="font-normal text-muted-foreground">— {r.reason}</span></p>
                      {add.length + rem.length === 0 ? <p className="text-xs text-muted-foreground">No change</p> : (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {add.map((x) => <Badge key={x}>+ {label(x)}</Badge>)}
                          {rem.map((x) => <Badge key={x} variant="outline" className="line-through">{label(x)}</Badge>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Module rules</p>
              <p className="text-sm">Point of Sale manual items: <strong>{rec.rules.pos_allow_manual_entry ? "Allowed" : "Not allowed"}</strong> — <span className="text-muted-foreground">{rec.rules.reason}</span></p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRec(null)}>Dismiss</Button>
              <Button onClick={() => setConfirmOpen(true)} disabled={applying}><Check className="mr-2 h-4 w-4" />{applying ? "Applying..." : "Review & apply"}</Button>
            </div>
          </div>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm changes</AlertDialogTitle>
              <AlertDialogDescription>Check what will change before applying. This is recorded in Change History.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 text-sm">
              {risks.length > 0 ? (
                <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                  <p className="flex items-center gap-2 font-semibold text-destructive"><ShieldAlert className="h-4 w-4" />Access risks ({risks.length})</p>
                  <ul className="space-y-1">
                    {risks.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${r.level === "high" ? "text-destructive" : "text-warning"}`} />
                        <span><Badge variant={r.level === "high" ? "destructive" : "outline"} className="mr-1">{r.level === "high" ? "High" : "Check"}</Badge>{r.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="rounded-md border p-3 text-muted-foreground">No access risks found.</p>
              )}

              <div>
                <p className="mb-2 font-semibold">Permission changes</p>
                {roleDiffs.length === 0 ? <p className="text-muted-foreground">None</p> : (
                  <div className="overflow-hidden rounded-md border">
                    {roleDiffs.map((d) => (
                      <div key={d.role} className="border-b p-3 last:border-b-0">
                        <p className="mb-1 font-medium capitalize">{d.role}</p>
                        <div className="flex flex-wrap gap-1">
                          {d.add.map((x) => <Badge key={x} className={SENSITIVE.has(x) ? "bg-destructive text-destructive-foreground" : ""}>+ Gains {label(x)}</Badge>)}
                          {d.rem.map((x) => <Badge key={x} variant="outline">− Loses {label(x)}</Badge>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 font-semibold">Module changes</p>
                {moduleChanges.length === 0 ? <p className="text-muted-foreground">None</p> : (
                  <div className="flex flex-wrap gap-1">
                    {moduleChanges.map((m) => <Badge key={m.key} variant={m.enabled ? "default" : "outline"}>{m.enabled ? "Turn on" : "Turn off"} {label(m.key)}</Badge>)}
                  </div>
                )}
              </div>

              {rec && rec.rules.pos_allow_manual_entry !== cfg.rules.pos_allow_manual_entry && (
                <p>Point of Sale manual items: <strong>{cfg.rules.pos_allow_manual_entry ? "Allowed" : "Not allowed"} → {rec.rules.pos_allow_manual_entry ? "Allowed" : "Not allowed"}</strong></p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={apply} className={risks.some((r) => r.level === "high") ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}>
                {risks.some((r) => r.level === "high") ? "Apply anyway" : "Apply changes"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
