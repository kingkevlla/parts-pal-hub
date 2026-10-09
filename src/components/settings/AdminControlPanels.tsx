import { useEffect, useState } from "react";
import { imageToDataUrl } from "@/lib/imageToDataUrl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { RotateCcw, Save, PanelLeft, PanelRight, PanelTop, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  AppConfig, AppRole, DEFAULT_CONFIG, DEFAULT_ROLE_PERMISSIONS, MODULES, TemplateStyle,
  saveAppConfig, useAppConfig,
} from "@/lib/appConfig";

/** Local draft editor shared by all admin panels. */
function useDraft() {
  const cfg = useAppConfig();
  const [draft, setDraft] = useState<AppConfig>(cfg);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  useEffect(() => setDraft(cfg), [cfg]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(cfg);
  const save = async () => {
    setSaving(true);
    try {
      const r = await saveAppConfig(draft);
      toast({ title: r.offline ? "Saved offline — will sync when online" : "Settings saved" });
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message, variant: "destructive" });
    } finally { setSaving(false); }
  };
  return { draft, setDraft, dirty, save, saving, reset: () => setDraft(cfg) };
}

function SaveBar({ dirty, saving, save, reset }: { dirty: boolean; saving: boolean; save: () => void; reset: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="outline" onClick={reset} disabled={!dirty || saving}><RotateCcw className="mr-2 h-4 w-4" />Discard</Button>
      <Button onClick={save} disabled={!dirty || saving}><Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save changes"}</Button>
    </div>
  );
}

const GROUPS = ["General", "Sales", "Inventory", "Finance", "People", "System"];

export function ModulesPanel() {
  const d = useDraft();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Modules</CardTitle>
        <CardDescription>Turn whole sections of the system on or off for everyone. Disabled modules disappear from menus and cannot be opened.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {GROUPS.map((g) => (
          <div key={g}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULES.filter((m) => m.group === g).map((m) => (
                <div key={m.key} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {m.label}{m.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </span>
                  <Switch
                    checked={d.draft.modules[m.key] !== false}
                    disabled={m.locked}
                    onCheckedChange={(v) => d.setDraft({ ...d.draft, modules: { ...d.draft.modules, [m.key]: v } })}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <SaveBar {...d} />
      </CardContent>
    </Card>
  );
}

const ROLES: AppRole[] = ["owner", "manager", "cashier", "user"];

export function RolesPanel() {
  const d = useDraft();
  const toggle = (role: AppRole, key: string, on: boolean) => {
    const cur = new Set(d.draft.role_permissions[role] || []);
    on ? cur.add(key) : cur.delete(key);
    d.setDraft({ ...d.draft, role_permissions: { ...d.draft.role_permissions, [role]: [...cur] } });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles & Permissions</CardTitle>
        <CardDescription>Choose which pages each role can open. Admin always has full access.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left font-medium">Module</th>
                <th className="p-3 text-center font-medium">Admin</th>
                {ROLES.map((r) => <th key={r} className="p-3 text-center font-medium capitalize">{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => {
                const off = d.draft.modules[m.key] === false;
                return (
                  <tr key={m.key} className={cn("border-t", off && "opacity-50")}>
                    <td className="p-3">
                      {m.label} {off && <Badge variant="outline" className="ml-2">Module off</Badge>}
                    </td>
                    <td className="p-3 text-center"><Checkbox checked disabled /></td>
                    {ROLES.map((r) => (
                      <td key={r} className="p-3 text-center">
                        <Checkbox
                          checked={(d.draft.role_permissions[r] || []).includes(m.key)}
                          onCheckedChange={(v) => toggle(r, m.key, !!v)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => d.setDraft({ ...d.draft, role_permissions: DEFAULT_ROLE_PERMISSIONS })}>
            Restore default permissions
          </Button>
          <SaveBar {...d} />
        </div>
      </CardContent>
    </Card>
  );
}

const TEMPLATES: { key: TemplateStyle; label: string; desc: string }[] = [
  { key: "classic", label: "Classic", desc: "Dark menu, light pages" },
  { key: "modern", label: "Modern", desc: "Light, clean menu" },
  { key: "minimal", label: "Minimal", desc: "Flat, no shadows" },
  { key: "bold", label: "Bold", desc: "Menu in brand color" },
];

export function AppearancePanel() {
  const d = useDraft();
  const t = d.draft.theme;
  const setT = (patch: Partial<AppConfig["theme"]>) => d.setDraft({ ...d.draft, theme: { ...t, ...patch } });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding & Design</CardTitle>
        <CardDescription>Logo, colors, page style and fonts for the whole system.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Page template style</Label>
          <div className="grid gap-3 sm:grid-cols-4">
            {TEMPLATES.map((tp) => (
              <button
                key={tp.key}
                type="button"
                onClick={() => setT({ template: tp.key })}
                className={cn("rounded-lg border p-3 text-left transition-colors hover:border-primary",
                  t.template === tp.key && "border-primary ring-2 ring-primary/30")}
              >
                <p className="font-medium">{tp.label}</p>
                <p className="text-xs text-muted-foreground">{tp.desc}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Main color</Label>
            <div className="flex gap-2">
              <Input type="color" className="h-10 w-14 p-1" value={t.primary} onChange={(e) => setT({ primary: e.target.value })} />
              <Input value={t.primary} onChange={(e) => setT({ primary: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Accent color</Label>
            <div className="flex gap-2">
              <Input type="color" className="h-10 w-14 p-1" value={t.accent} onChange={(e) => setT({ accent: e.target.value })} />
              <Input value={t.accent} onChange={(e) => setT({ accent: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {t.logo_url && <img src={t.logo_url} alt="Logo" className="h-10 w-10 rounded border object-contain" />}
              <Input type="file" accept="image/*" className="cursor-pointer" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                try { setT({ logo_url: await imageToDataUrl(f) }); } catch (err: any) { alert(err.message); }
              }} />
            </div>
            <Input placeholder="or paste an image link https://..." value={(t.logo_url || '').startsWith('data:') ? '' : t.logo_url} onChange={(e) => setT({ logo_url: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Font</Label>
            <div className="flex flex-wrap gap-2">
              {(["system", "rounded", "serif", "mono"] as const).map((f) => (
                <Button key={f} size="sm" variant={t.font === f ? "default" : "outline"} onClick={() => setT({ font: f })} className="capitalize">{f}</Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Spacing</Label>
            <div className="flex gap-2">
              {(["comfortable", "compact"] as const).map((v) => (
                <Button key={v} size="sm" variant={t.density === v ? "default" : "outline"} onClick={() => setT({ density: v })} className="capitalize">{v}</Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Corner roundness ({t.radius.toFixed(2)})</Label>
            <Slider min={0} max={1.25} step={0.05} value={[t.radius]} onValueChange={([v]) => setT({ radius: v })} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label>Dark mode</Label>
            <Switch checked={t.dark} onCheckedChange={(v) => setT({ dark: v })} />
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => setT(DEFAULT_CONFIG.theme)}>Restore default design</Button>
          <SaveBar {...d} />
        </div>
      </CardContent>
    </Card>
  );
}

export function LayoutPanel() {
  const d = useDraft();
  const l = d.draft.layout;
  const opts = [
    { key: "left", label: "Left", icon: PanelLeft },
    { key: "right", label: "Right", icon: PanelRight },
    { key: "top", label: "Top", icon: PanelTop },
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Menu Layout</CardTitle>
        <CardDescription>Choose where the main menu appears.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {opts.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => d.setDraft({ ...d.draft, layout: { ...l, sidebar_position: o.key } })}
              className={cn("flex flex-col items-center gap-2 rounded-lg border p-6 hover:border-primary",
                l.sidebar_position === o.key && "border-primary ring-2 ring-primary/30")}
            >
              <o.icon className="h-8 w-8 text-primary" />
              <span className="font-medium">{o.label}</span>
            </button>
          ))}
        </div>
        {l.sidebar_position !== "top" && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Start with menu collapsed</Label>
              <p className="text-xs text-muted-foreground">Shows only icons until expanded</p>
            </div>
            <Switch checked={l.sidebar_collapsed} onCheckedChange={(v) => d.setDraft({ ...d.draft, layout: { ...l, sidebar_collapsed: v } })} />
          </div>
        )}
        <SaveBar {...d} />
      </CardContent>
    </Card>
  );
}

function QuickAmounts({ values, onChange }: { values: number[]; onChange: (v: number[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const n = Math.round(parseFloat(input));
    if (!n || n <= 0 || values.includes(n) || values.length >= 6) return;
    onChange([...values, n].sort((a, b) => a - b));
    setInput("");
  };
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <Label>Loan repayment: quick amount buttons</Label>
        <p className="text-xs text-muted-foreground">Shown next to "Full" and "Half" when recording a loan payment. Up to 6 amounts.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {values.length === 0 && <span className="text-sm text-muted-foreground">No quick amounts — only Full and Half will show.</span>}
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 py-1 text-sm">
            {v.toLocaleString()}
            <button type="button" aria-label={`Remove ${v}`} className="ml-1 rounded hover:text-destructive" onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input type="number" min="1" placeholder="e.g. 2000" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} className="max-w-[10rem]" />
        <Button type="button" variant="outline" onClick={add} disabled={values.length >= 6}>Add</Button>
      </div>
    </div>
  );
}

export function RulesPanel() {
  const d = useDraft();
  const r = d.draft.rules;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Module Rules</CardTitle>
        <CardDescription>Behaviour options for individual modules. Tax, low stock level and expiry alerts are under General.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label>Point of Sale: allow manual items</Label>
            <p className="text-xs text-muted-foreground">Lets cashiers add items that are not in the product list</p>
          </div>
          <Switch checked={r.pos_allow_manual_entry} onCheckedChange={(v) => d.setDraft({ ...d.draft, rules: { ...r, pos_allow_manual_entry: v } })} />
        </div>
        <QuickAmounts
          values={r.loan_quick_amounts || []}
          onChange={(vals) => d.setDraft({ ...d.draft, rules: { ...r, loan_quick_amounts: vals } })}
        />
        <SaveBar {...d} />
      </CardContent>
    </Card>
  );
}
