import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, Pencil, Trash2, Shield, UserCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AddEditUserDialog from '@/components/users/AddEditUserDialog';
import DeleteUserDialog from '@/components/users/DeleteUserDialog';
import RolePermissionsDialog from '@/components/users/RolePermissionsDialog';

interface UserRole {
  role: string;
}

interface UserProfile {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  created_at: string;
  roles: string[];
}

export default function UserManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, UserRole[]>>({});
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [addEditDialogOpen, setAddEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();

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
    }
  };

  const fetchUsers = async () => {
    // Fetch profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profilesError) {
      toast({
        title: 'Error',
        description: profilesError.message,
        variant: 'destructive',
      });
      return;
    }

    // Fetch user roles separately with role names
    const { data: roleData, error: rolesError } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        roles (name)
      `);

    if (rolesError) {
      toast({
        title: 'Error',
        description: rolesError.message,
        variant: 'destructive',
      });
      return;
    }

    // Group roles by user_id
    const rolesMap: Record<string, UserRole[]> = {};
    roleData?.forEach((userRole: any) => {
      if (!rolesMap[userRole.user_id]) {
        rolesMap[userRole.user_id] = [];
      }
      rolesMap[userRole.user_id].push({ role: userRole.roles.name });
    });

    // Map profiles to UserProfile with roles
    const usersWithRoles: UserProfile[] = (profiles || []).map(profile => ({
      ...profile,
      roles: rolesMap[profile.id]?.map(r => r.role) || []
    }));

    setUsers(usersWithRoles);
    setUserRoles(rolesMap);
  };

  const fetchRoles = async () => {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setRoles(data || []);
  };

  const handleAddUser = () => {
    setSelectedUser(null);
    setAddEditDialogOpen(true);
  };

  const handleEditUser = (userProfile: UserProfile) => {
    setSelectedUser(userProfile);
    setAddEditDialogOpen(true);
  };

  const handleDeleteUser = (userProfile: UserProfile) => {
    setSelectedUser(userProfile);
    setDeleteDialogOpen(true);
  };

  const handleManagePermissions = (role: { id: string; name: string }) => {
    setSelectedRole(role);
    setPermissionsDialogOpen(true);
  };

  const getRoleBadge = (role: string) => {
    const colors = {
      admin: 'bg-red-500',
      manager: 'bg-blue-500',
      staff: 'bg-green-500',
    };
    return <Badge className={colors[role as keyof typeof colors]}>{role}</Badge>;
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              You need administrator privileges to access user management.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage system users and their roles</p>
        </div>
        <Button onClick={handleAddUser}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Admins</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter(u => userRoles[u.id]?.some(r => r.role === 'admin')).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Staff</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter(u => userRoles[u.id]?.some(r => r.role === 'staff')).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>All Users</CardTitle>
          <Button variant="outline" onClick={() => roles.length > 0 && handleManagePermissions(roles[0])}>
            <UserCog className="h-4 w-4 mr-2" />
            Manage Role Permissions
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((userProfile) => (
                <TableRow key={userProfile.id}>
                  <TableCell className="font-medium">{userProfile.full_name || 'N/A'}</TableCell>
                  <TableCell>{userProfile.phone || 'N/A'}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {(userRoles[userProfile.id] || []).map((role, idx) => (
                        <span key={idx}>{getRoleBadge(role.role)}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{new Date(userProfile.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditUser(userProfile)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteUser(userProfile)}
                        disabled={userProfile.id === user?.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Roles & Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {roles.map((role) => (
              <div key={role.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-semibold capitalize">{role.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {users.filter(u => userRoles[u.id]?.some(r => r.role === role.name)).length} users
                  </p>
                </div>
                <Button variant="outline" onClick={() => handleManagePermissions(role)}>
                  <Shield className="h-4 w-4 mr-2" />
                  Manage Permissions
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AddEditUserDialog
        open={addEditDialogOpen}
        onOpenChange={setAddEditDialogOpen}
        user={selectedUser}
        onSuccess={fetchUsers}
      />

      <DeleteUserDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        userId={selectedUser?.id || ''}
        userName={selectedUser?.full_name || 'Unknown'}
        onSuccess={fetchUsers}
      />

      {selectedRole && (
        <RolePermissionsDialog
          open={permissionsDialogOpen}
          onOpenChange={setPermissionsDialogOpen}
          roleId={selectedRole.id}
          roleName={selectedRole.name}
        />
      )}
    </div>
  );
}
