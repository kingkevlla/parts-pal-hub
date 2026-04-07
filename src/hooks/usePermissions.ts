import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Cache role globally so every hook instance shares it
const roleCache = new Map<string, { role: AppRole; ts: number }>();
const CACHE_TTL = 60_000; // 1 minute

export type AppRole = "admin" | "owner" | "manager" | "cashier" | "user";

export const ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  admin: [
    "dashboard", "owner_dashboard", "pos", "inventory", "stock_in", "stock_out",
    "stock_adjustment", "products", "categories", "suppliers", "customers",
    "transactions", "sales_history", "reports", "loans", "expenses",
    "employees", "warehouses", "support", "settings", "users",
  ],
  owner: [
    "dashboard", "owner_dashboard", "pos", "inventory", "stock_in", "stock_out",
    "stock_adjustment", "products", "categories", "suppliers", "customers",
    "transactions", "sales_history", "reports", "loans", "expenses",
    "employees", "warehouses", "support", "settings",
  ],
  manager: [
    "dashboard", "pos", "inventory", "stock_in", "stock_out",
    "stock_adjustment", "products", "categories", "suppliers", "customers",
    "transactions", "sales_history", "reports", "loans", "expenses",
    "employees", "warehouses",
  ],
  cashier: [
    "dashboard", "pos", "customers", "transactions", "sales_history",
  ],
  user: [
    "dashboard",
  ],
};

export interface UserPermissions {
  role: AppRole | null;
  permissions: string[];
  isAdmin: boolean;
  isOwner: boolean;
  isManager: boolean;
  isCashier: boolean;
  hasPermission: (permission: string) => boolean;
  loading: boolean;
}

export function usePermissions(): UserPermissions {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      // Check cache first
      const cached = roleCache.get(user.id);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        setRole(cached.role);
        setPermissions(ROLE_PERMISSIONS[cached.role] || ROLE_PERMISSIONS.user);
        setLoading(false);
        return;
      }
      fetchUserRole();
    } else {
      setRole(null);
      setPermissions([]);
      setLoading(false);
    }
  }, [user]);

  const fetchUserRole = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      const userRole: AppRole = error ? "user" : ((data?.role as AppRole) || "user");
      roleCache.set(user.id, { role: userRole, ts: Date.now() });
      setRole(userRole);
      setPermissions(ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS.user);
    } catch {
      setRole("user");
      setPermissions(ROLE_PERMISSIONS.user);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };

  return {
    role,
    permissions,
    isAdmin: role === "admin",
    isOwner: role === "owner",
    isManager: role === "manager",
    isCashier: role === "cashier",
    hasPermission,
    loading,
  };
}
