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
}

export async function saveAppConfig(next: AppConfig) {
  setCurrent(next);
  const { data } = await offlineQuery<any>("system_settings", () => supabase.from("system_settings").select("*"));
  const exists = (data || []).some((r: any) => r.key === KEY);
  const res = exists
    ? await offlineMutate("system_settings", "update", { value: next, updated_at: new Date().toISOString() }, { key: KEY })
    : await offlineMutate("system_settings", "insert", { key: KEY, value: next });
  if (!res.success) throw res.error ?? new Error("Save failed");
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
