import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { offlineQuery, offlineMutate } from "@/lib/offlineHelpers";

export type AppRole = "admin" | "owner" | "manager" | "cashier" | "user";
export type SidebarPosition = "left" | "right" | "top";
export type TemplateStyle = "classic" | "modern" | "minimal" | "bold";

export interface ModuleDef { key: string; label: string; group: string; locked?: boolean }

export const MODULES: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", group: "General", locked: true },
  { key: "owner_dashboard", label: "Owner Dashboard", group: "General" },
  { key: "pos", label: "Point of Sale", group: "Sales" },
  { key: "sales_history", label: "Sales History", group: "Sales" },
  { key: "transactions", label: "Transactions", group: "Sales" },
  { key: "inventory", label: "Inventory", group: "Inventory" },
  { key: "categories", label: "Categories", group: "Inventory" },
  { key: "stock_in", label: "Stock In", group: "Inventory" },
  { key: "stock_out", label: "Stock Out", group: "Inventory" },
  { key: "stock_adjustment", label: "Stock Adjustment", group: "Inventory" },
  { key: "warehouses", label: "Warehouses", group: "Inventory" },
  { key: "loans", label: "Loans", group: "Finance" },
  { key: "expenses", label: "Expenses", group: "Finance" },
  { key: "employees", label: "Employees (HR)", group: "People" },
  { key: "suppliers", label: "Suppliers", group: "People" },
  { key: "customers", label: "Customers", group: "People" },
  { key: "reports", label: "Reports", group: "System" },
  { key: "support", label: "Support", group: "System" },
  { key: "users", label: "Users", group: "System", locked: true },
  { key: "settings", label: "Settings", group: "System", locked: true },
];

const ALL = MODULES.map((m) => m.key);

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  admin: ALL,
  owner: ALL.filter((k) => k !== "users"),
  manager: ["dashboard", "pos", "inventory", "stock_in", "stock_out", "stock_adjustment", "products", "categories",
    "suppliers", "customers", "transactions", "sales_history", "reports", "loans", "expenses", "employees", "warehouses"],
  cashier: ["dashboard", "pos", "customers", "transactions", "sales_history"],
  user: ["dashboard"],
};

export interface AppConfig {
  modules: Record<string, boolean>;
  role_permissions: Record<AppRole, string[]>;
  theme: {
    primary: string; // hex
    accent: string; // hex
    radius: number; // rem
    template: TemplateStyle;
    dark: boolean;
    font: "system" | "serif" | "mono" | "rounded";
    density: "comfortable" | "compact";
    logo_url: string;
  };
  layout: { sidebar_position: SidebarPosition; sidebar_collapsed: boolean };
  rules: {
    pos_allow_manual_entry: boolean;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  modules: Object.fromEntries(ALL.map((k) => [k, true])),
  role_permissions: DEFAULT_ROLE_PERMISSIONS,
  theme: { primary: "#0b5fd6", accent: "#22c3e6", radius: 0.5, template: "classic", dark: false, font: "system", density: "comfortable", logo_url: "" },
  layout: { sidebar_position: "left", sidebar_collapsed: false },
  rules: {
    pos_allow_manual_entry: true,
  },
};

const KEY = "app_config";
const LS = "app_config_cache";

function merge(raw: any): AppConfig {
  const r = raw || {};
  return {
    modules: { ...DEFAULT_CONFIG.modules, ...(r.modules || {}) },
    role_permissions: { ...DEFAULT_CONFIG.role_permissions, ...(r.role_permissions || {}) },
    theme: { ...DEFAULT_CONFIG.theme, ...(r.theme || {}) },
    layout: { ...DEFAULT_CONFIG.layout, ...(r.layout || {}) },
    rules: { ...DEFAULT_CONFIG.rules, ...(r.rules || {}) },
  };
}

let current: AppConfig = (() => {
  try { return merge(JSON.parse(localStorage.getItem(LS) || "null")); } catch { return DEFAULT_CONFIG; }
})();
let loaded = false;
const listeners = new Set<(c: AppConfig) => void>();

function setCurrent(c: AppConfig) {
  current = c;
  try { localStorage.setItem(LS, JSON.stringify(c)); } catch { /* ignore */ }
  applyTheme(c);
  listeners.forEach((l) => l(c));
}

export async function loadAppConfig() {
  try {
    const { data } = await offlineQuery<any>("system_settings", () => supabase.from("system_settings").select("*"));
    const row = (data || []).find((r: any) => r.key === KEY);
    if (row) setCurrent(merge(row.value));
  } catch { /* keep cache */ }
  loaded = true;
  flushAuditQueue();
}

// ---------- Audit log ----------
const AUDIT_Q = "audit_log_queue";
export const AUDIT_SECTIONS: Record<string, string> = {
  modules: "Modules",
  role_permissions: "Permissions",
  theme: "Design",
  layout: "Layout",
  rules: "Module rules",
};

function diffSection(section: keyof AppConfig, before: any, after: any) {
  const changes: Record<string, { from: any; to: any }> = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  keys.forEach((k) => {
    const a = before?.[k], b = after?.[k];
    const same = Array.isArray(a) && Array.isArray(b)
      ? [...a].sort().join() === [...b].sort().join()
      : JSON.stringify(a) === JSON.stringify(b);
    if (!same) changes[k] = { from: a ?? null, to: b ?? null };
  });
  if (!Object.keys(changes).length) return null;
  let summary = `${Object.keys(changes).length} change(s)`;
  if (section === "modules") summary = Object.entries(changes).map(([k, c]) => `${k} ${c.to ? "on" : "off"}`).join(", ");
  else if (section === "role_permissions") {
    summary = Object.entries(changes).map(([role, c]) => {
      const add = (c.to || []).filter((x: string) => !(c.from || []).includes(x));
      const rem = (c.from || []).filter((x: string) => !(c.to || []).includes(x));
      return `${role}: ${[...add.map((x: string) => "+" + x), ...rem.map((x: string) => "-" + x)].join(" ")}`;
    }).join("; ");
  } else summary = Object.keys(changes).join(", ") + " changed";
  return { section, summary, changes };
}

async function flushAuditQueue() {
  let q: any[] = [];
  try { q = JSON.parse(localStorage.getItem(AUDIT_Q) || "[]"); } catch { q = []; }
  if (!q.length || !navigator.onLine) return;
  const { error } = await (supabase as any).from("audit_logs").insert(q);
  if (!error) localStorage.removeItem(AUDIT_Q);
}

async function recordAudit(before: AppConfig, after: AppConfig, source?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  let userName = user.email || "Unknown";
  try {
    const { data } = await offlineQuery<any>("profiles", () => supabase.from("profiles").select("*"));
    const p = (data || []).find((r: any) => r.user_id === user.id);
    if (p?.full_name) userName = p.full_name;
  } catch { /* ignore */ }
  const rows = (Object.keys(AUDIT_SECTIONS) as (keyof AppConfig)[])
    .map((s) => diffSection(s, before[s], after[s]))
    .filter(Boolean)
    .map((d) => ({
      user_id: user.id,
      user_name: userName,
      section: d!.section,
      action: source || "update",
      summary: d!.summary,
      changes: d!.changes,
      created_at: new Date().toISOString(),
    }));
  if (!rows.length) return;
  try {
    const q = JSON.parse(localStorage.getItem(AUDIT_Q) || "[]");
    localStorage.setItem(AUDIT_Q, JSON.stringify([...q, ...rows]));
  } catch { /* ignore */ }
  await flushAuditQueue();
}

export async function saveAppConfig(next: AppConfig, source?: string) {
  const before = current;
  setCurrent(next);
  const { data } = await offlineQuery<any>("system_settings", () => supabase.from("system_settings").select("*"));
  const exists = (data || []).some((r: any) => r.key === KEY);
  const res = exists
    ? await offlineMutate("system_settings", "update", { value: next, updated_at: new Date().toISOString() }, { key: KEY })
    : await offlineMutate("system_settings", "insert", { key: KEY, value: next });
  if (!res.success) throw res.error ?? new Error("Save failed");
  recordAudit(before, next, source).catch(() => { /* never block saving */ });
  return res;
}

export function getAppConfig() { return current; }

export function useAppConfig() {
  const [cfg, setCfg] = useState(current);
  useEffect(() => {
    listeners.add(setCfg);
    if (!loaded) loadAppConfig();
    return () => { listeners.delete(setCfg); };
  }, []);
  return cfg;
}

export function hexToHsl(hex: string): string {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return "217 91% 45%";
  const [r, g, b] = m.map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const FONTS: Record<AppConfig["theme"]["font"], string> = {
  system: "ui-sans-serif, system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SFMono-Regular', monospace",
  rounded: "'Nunito', 'Segoe UI Rounded', ui-rounded, system-ui, sans-serif",
};

export function applyTheme(c: AppConfig) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const p = hexToHsl(c.theme.primary);
  const a = hexToHsl(c.theme.accent);
  root.classList.toggle("dark", c.theme.dark);
  root.style.setProperty("--primary", p);
  root.style.setProperty("--ring", p);
  root.style.setProperty("--accent", a);
  if (c.theme.template === "bold") root.style.removeProperty("--sidebar-primary");
  else root.style.setProperty("--sidebar-primary", p);
  root.style.setProperty("--radius", `${c.theme.radius}rem`);
  root.style.setProperty("--gradient-primary", `linear-gradient(135deg, hsl(${p}) 0%, hsl(${a}) 100%)`);
  root.style.setProperty("--app-font", FONTS[c.theme.font]);
  root.dataset.template = c.theme.template;
  root.dataset.density = c.theme.density;
}

applyTheme(current);
