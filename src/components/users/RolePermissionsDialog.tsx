import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ALL_PERMISSIONS = [
  { id: "dashboard", name: "Dashboard", description: "Access to main dashboard", category: "General" },
  { id: "pos", name: "Point of Sale", description: "Access to POS system", category: "Sales" },
  { id: "inventory", name: "Inventory", description: "View inventory", category: "Inventory" },
  { id: "stock_in", name: "Stock In", description: "Add stock to inventory", category: "Inventory" },
  { id: "stock_out", name: "Stock Out", description: "Remove stock from inventory", category: "Inventory" },
  { id: "products", name: "Products", description: "Manage products", category: "Inventory" },
  { id: "categories", name: "Categories", description: "Manage categories", category: "Inventory" },
  { id: "suppliers", name: "Suppliers", description: "Manage suppliers", category: "Contacts" },
  { id: "customers", name: "Customers", description: "Manage customers", category: "Contacts" },
  { id: "transactions", name: "Transactions", description: "View transactions", category: "Sales" },
  { id: "reports", name: "Reports", description: "Access reports", category: "Analytics" },
  { id: "loans", name: "Loans", description: "Manage loans", category: "Finance" },
  { id: "warehouses", name: "Warehouses", description: "Manage warehouses", category: "Inventory" },
  { id: "settings", name: "Settings", description: "Access system settings", category: "Administration" },
  { id: "users", name: "Users", description: "Manage users", category: "Administration" },
];

interface RolePermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleId: string;
  roleName: string;
}

export default function RolePermissionsDialog({
  open,
  onOpenChange,
  roleId,
  roleName
}: RolePermissionsDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && roleId) {
      fetchRolePermissions();
    }
  }, [open, roleId]);

  const fetchRolePermissions = async () => {
    setLoading(true);
    try {
      // Use the hardcoded ROLE_PERMISSIONS since there's no roles table
      const ROLE_PERMISSIONS: Record<string, string[]> = {
        admin: ["dashboard", "pos", "inventory", "stock_in", "stock_out", "products", "categories", "suppliers", "customers", "transactions", "reports", "loans", "warehouses", "settings", "users"],
        owner: ["dashboard", "pos", "inventory", "stock_in", "stock_out", "products", "categories", "suppliers", "customers", "transactions", "reports", "loans", "warehouses", "settings", "users"],
        manager: ["dashboard", "pos", "inventory", "stock_in", "stock_out", "products", "categories", "suppliers", "customers", "transactions", "reports", "loans", "warehouses"],
        cashier: ["dashboard", "pos", "customers", "transactions"],
        user: ["dashboard"],
      };
      const perms = ROLE_PERMISSIONS[roleName] || [];
      setSelectedPermissions(new Set(perms));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Permissions are currently hardcoded per role - this is a read-only view
    toast({ title: "Role permissions are managed through the system configuration" });
    onOpenChange(false);
  };

  const togglePermission = (permId: string) => {
    const newSelected = new Set(selectedPermissions);
    if (newSelected.has(permId)) {
      newSelected.delete(permId);
    } else {
      newSelected.add(permId);
    }
    setSelectedPermissions(newSelected);
  };

  const selectAll = () => {
    setSelectedPermissions(new Set(ALL_PERMISSIONS.map(p => p.id)));
  };

  const clearAll = () => {
    setSelectedPermissions(new Set());
  };

  // Group permissions by category
  const groupedPermissions = ALL_PERMISSIONS.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, typeof ALL_PERMISSIONS>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Manage Permissions for {roleName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={clearAll}>
                Clear All
              </Button>
            </div>

            {Object.entries(groupedPermissions).map(([category, perms]) => (
              <Card key={category}>
                <CardHeader className="py-3">
                  <CardTitle className="text-base">{category}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-0">
                  {perms.map((perm) => (
                    <div key={perm.id} className="flex items-start space-x-3">
                      <Checkbox
                        id={perm.id}
                        checked={selectedPermissions.has(perm.id)}
                        onCheckedChange={() => togglePermission(perm.id)}
                      />
                      <div className="grid gap-1 leading-none">
                        <Label
                          htmlFor={perm.id}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {perm.name}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {perm.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
