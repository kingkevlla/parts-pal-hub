import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

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

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["dashboard", "pos", "inventory", "stock_in", "stock_out", "products", "categories", "suppliers", "customers", "transactions", "reports", "loans", "warehouses", "settings", "users"],
  owner: ["dashboard", "pos", "inventory", "stock_in", "stock_out", "products", "categories", "suppliers", "customers", "transactions", "reports", "loans", "warehouses", "settings", "users"],
  manager: ["dashboard", "pos", "inventory", "stock_in", "stock_out", "products", "categories", "suppliers", "customers", "transactions", "reports", "loans", "warehouses"],
  cashier: ["dashboard", "pos", "customers", "transactions"],
  user: ["dashboard"],
};

export function usePermissions(): UserPermissions {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
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

      if (error) {
        console.error("Error fetching user role:", error);
        setRole("user");
        setPermissions(ROLE_PERMISSIONS.user);
      } else {
        const userRole = data?.role as AppRole;
        setRole(userRole);
        setPermissions(ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS.user);
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
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
