import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Sparkles, Check, ChevronDown, ChevronRight } from "lucide-react";
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Change History</CardTitle>
          <CardDescription>Who changed modules, permissions, design, layout and rules — and when.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </Button>
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

export function PolicyAdvisorPanel() {
  const cfg = useAppConfig();
  const { toast } = useToast();
  const [policy, setPolicy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [applying, setApplying] = useState(false);

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
              <Button onClick={apply} disabled={applying}><Check className="mr-2 h-4 w-4" />{applying ? "Applying..." : "Apply recommendations"}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
