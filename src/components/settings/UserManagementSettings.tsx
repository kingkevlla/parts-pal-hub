import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
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

interface UserProfile {
  id: string;
  full_name: string;
  phone: string;
  roles: string[];
}

export default function UserManagementSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role_name: "admin"
      });

      if (error) throw error;
      setIsAdmin(data);

      if (data) {
        fetchUsers();
        fetchRoles();
      }
    } catch (error: any) {
      console.error("Error checking admin status:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          phone
        `);

      if (error) throw error;

      const usersWithRoles = await Promise.all(
        profiles?.map(async (profile) => {
          const { data: userRoles } = await supabase
            .from("user_roles")
            .select(`
              role_id,
              roles (name)
            `)
            .eq("user_id", profile.id);

          return {
            ...profile,
            roles: userRoles?.map((ur: any) => ur.roles.name) || []
          };
        }) || []
      );

      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchRoles = async () => {
    try {
      const { data, error } = await supabase
        .from("roles")
        .select("id, name");

      if (error) throw error;
      setRoles(data || []);
    } catch (error: any) {
      console.error("Error fetching roles:", error);
    }
  };

  const handleRoleChange = async (userId: string, roleName: string) => {
    try {
      const role = roles.find(r => r.name === roleName);
      if (!role) return;

      // Remove existing roles
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      // Add new role
      const { error } = await supabase
        .from("user_roles")
        .insert({
          user_id: userId,
          role_id: role.id
        });

      if (error) throw error;

      toast({ title: "User role updated successfully" });
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Error updating user role", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>You need administrator privileges to access this section</CardDescription>
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
              <TableHead>Actions</TableHead>
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
                  {userProfile.roles.map((role) => (
                    <Badge key={role} variant="outline" className="mr-1">
                      <Shield className="h-3 w-3 mr-1" />
                      {role}
                    </Badge>
                  ))}
                </TableCell>
                <TableCell>
                  <Select
                    defaultValue={userProfile.roles[0]}
                    onValueChange={(value) => handleRoleChange(userProfile.id, value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.name}>
                          {role.name}
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
