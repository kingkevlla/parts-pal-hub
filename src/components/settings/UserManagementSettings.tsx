import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserProfile {
  id: string;
  full_name: string;
  phone: string;
  role: AppRole;
}

const AVAILABLE_ROLES: { value: AppRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "user", label: "User" },
];

export default function UserManagementSettings() {
  const { user } = useAuth();
  const { isAdmin, isOwner, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const canManageUsers = isAdmin || isOwner;

  useEffect(() => {
    if (!permissionsLoading && canManageUsers) {
      fetchUsers();
    } else if (!permissionsLoading) {
      setLoading(false);
    }
  }, [permissionsLoading, canManageUsers]);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, phone");

      if (profilesError) throw profilesError;

      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      const rolesMap: Record<string, AppRole> = {};
      userRoles?.forEach((ur) => {
        rolesMap[ur.user_id] = ur.role;
      });

      const usersWithRoles: UserProfile[] = (profiles || []).map((profile) => ({
        ...profile,
        role: rolesMap[profile.id] || "user"
      }));

      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", userId);

      if (error) throw error;

      toast({ title: "User role updated successfully" });
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Error updating user role", description: error.message, variant: "destructive" });
    }
  };

  if (permissionsLoading || loading) {
    return <div className="py-4">Loading...</div>;
  }

  if (!canManageUsers) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>You need administrator or owner privileges to access this section</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>Manage users and assign roles</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Current Role</TableHead>
              <TableHead>Change Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((userProfile) => (
              <TableRow key={userProfile.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {userProfile.full_name || "No name"}
                  </div>
                </TableCell>
                <TableCell>{userProfile.phone || "N/A"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    <Shield className="h-3 w-3 mr-1" />
                    {userProfile.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Select
                    value={userProfile.role}
                    onValueChange={(value: AppRole) => handleRoleChange(userProfile.id, value)}
                    disabled={userProfile.id === user?.id}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_ROLES.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
