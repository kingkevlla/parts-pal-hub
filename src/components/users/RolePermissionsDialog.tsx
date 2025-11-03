import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
}

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
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && roleId) {
      fetchPermissions();
    }
  }, [open, roleId]);

  const fetchPermissions = async () => {
    setLoading(true);
    try {
      // Fetch all permissions
      const { data: allPerms, error: permsError } = await supabase
        .from("permissions")
        .select("*")
        .order("resource", { ascending: true })
        .order("action", { ascending: true });

      if (permsError) throw permsError;

      // Fetch current role permissions
      const { data: rolePerms, error: rolePermsError } = await supabase
        .from("role_permissions")
        .select("permission_id")
        .eq("role_id", roleId);

      if (rolePermsError) throw rolePermsError;

      setPermissions(allPerms || []);
      setSelectedPermissions(new Set(rolePerms?.map(rp => rp.permission_id) || []));
    } catch (error: any) {
      toast({
        title: "Error loading permissions",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Delete existing role permissions
      await supabase.from("role_permissions").delete().eq("role_id", roleId);

      // Insert new role permissions
      const inserts = Array.from(selectedPermissions).map(permId => ({
        role_id: roleId,
        permission_id: permId
      }));

      if (inserts.length > 0) {
        const { error } = await supabase.from("role_permissions").insert(inserts);
        if (error) throw error;
      }

      toast({ title: "Permissions updated successfully" });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error updating permissions",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
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

  // Group permissions by resource
  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.resource]) {
      acc[perm.resource] = [];
    }
    acc[perm.resource].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Manage Permissions for {roleName}
          </DialogTitle>
        </DialogHeader>

        {loading && !permissions.length ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedPermissions).map(([resource, perms]) => (
              <Card key={resource}>
                <CardHeader>
                  <CardTitle className="text-lg capitalize">{resource}</CardTitle>
                  <CardDescription>
                    Manage {resource} permissions
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {perms.map((perm) => (
                    <div key={perm.id} className="flex items-start space-x-3">
                      <Checkbox
                        id={perm.id}
                        checked={selectedPermissions.has(perm.id)}
                        onCheckedChange={() => togglePermission(perm.id)}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label
                          htmlFor={perm.id}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {perm.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                        </Label>
                        <p className="text-sm text-muted-foreground">
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
