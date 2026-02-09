import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, Pencil, Trash2, Shield, Crown, UserCog, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import AddEditUserDialog from '@/components/users/AddEditUserDialog';
import DeleteUserDialog from '@/components/users/DeleteUserDialog';
import RolePermissionsDialog from '@/components/users/RolePermissionsDialog';
type AppRole = "admin" | "owner" | "manager" | "cashier" | "user";

interface UserProfile {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  created_at: string;
  roles: string[];
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-500 hover:bg-red-600',
  owner: 'bg-purple-500 hover:bg-purple-600',
  manager: 'bg-blue-500 hover:bg-blue-600',
  cashier: 'bg-green-500 hover:bg-green-600',
  user: 'bg-gray-500 hover:bg-gray-600',
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  admin: <ShieldCheck className="h-3 w-3 mr-1" />,
  owner: <Crown className="h-3 w-3 mr-1" />,
  manager: <UserCog className="h-3 w-3 mr-1" />,
  cashier: <Users className="h-3 w-3 mr-1" />,
  user: <Users className="h-3 w-3 mr-1" />,
};

export default function UserManagement() {
  const { user } = useAuth();
  const { isAdmin, isOwner, hasPermission, loading: permissionsLoading } = usePermissions();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string; description: string; permissions: string[] }[]>([]);
  const [addEditDialogOpen, setAddEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const canManageUsers = isAdmin || isOwner;

  useEffect(() => {
    if (!permissionsLoading && canManageUsers) {
      fetchUsers();
      fetchRoles();
    } else if (!permissionsLoading) {
      setLoading(false);
    }
  }, [permissionsLoading, canManageUsers]);

  const fetchUsers = async () => {
    setLoading(true);
    
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
      setLoading(false);
      return;
    }

    // Fetch user roles
    const { data: roleData, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role');

    if (rolesError) {
      toast({
        title: 'Error',
        description: rolesError.message,
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    // Group roles by user_id
    const rolesMap: Record<string, string[]> = {};
    roleData?.forEach((userRole) => {
      if (!rolesMap[userRole.user_id]) {
        rolesMap[userRole.user_id] = [];
      }
      rolesMap[userRole.user_id].push(userRole.role);
    });

    // Map profiles to UserProfile with roles
    const usersWithRoles: UserProfile[] = (profiles || []).map(profile => ({
      ...profile,
      roles: rolesMap[profile.id] || ['user']
    }));

    setUsers(usersWithRoles);
    setLoading(false);
  };

  const fetchRoles = async () => {
    // Roles are defined in the permission system, not a separate table
    const defaultRoles = [
      { id: 'admin', name: 'admin', description: 'Full system access', permissions: ['dashboard', 'pos', 'inventory', 'stock_in', 'stock_out', 'products', 'categories', 'suppliers', 'customers', 'transactions', 'reports', 'loans', 'warehouses', 'settings', 'users'] },
      { id: 'owner', name: 'owner', description: 'Business owner access', permissions: ['dashboard', 'pos', 'inventory', 'stock_in', 'stock_out', 'products', 'categories', 'suppliers', 'customers', 'transactions', 'reports', 'loans', 'warehouses', 'settings', 'users'] },
      { id: 'manager', name: 'manager', description: 'Operational management', permissions: ['dashboard', 'pos', 'inventory', 'stock_in', 'stock_out', 'products', 'categories', 'suppliers', 'customers', 'transactions', 'reports', 'loans', 'warehouses'] },
      { id: 'cashier', name: 'cashier', description: 'POS operations', permissions: ['dashboard', 'pos', 'customers', 'transactions'] },
      { id: 'user', name: 'user', description: 'Basic access', permissions: ['dashboard'] },
    ];
    setRoles(defaultRoles);
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
    return (
      <Badge className={`${ROLE_COLORS[role] || ROLE_COLORS.user} text-white flex items-center`}>
        {ROLE_ICONS[role]}
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Badge>
    );
  };

  const getRoleCount = (roleName: string) => {
    return users.filter(u => u.roles.includes(roleName)).length;
  };

  if (permissionsLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!canManageUsers) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              You need administrator or owner privileges to access user management.
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

      <div className="grid gap-4 md:grid-cols-5">
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
            <CardTitle className="text-sm font-medium">Owners</CardTitle>
            <Crown className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getRoleCount('owner')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Managers</CardTitle>
            <UserCog className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getRoleCount('manager')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cashiers</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getRoleCount('cashier')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Admins</CardTitle>
            <ShieldCheck className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getRoleCount('admin')}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.map((userProfile) => (
                  <TableRow key={userProfile.id}>
                    <TableCell className="font-medium">{userProfile.full_name || 'N/A'}</TableCell>
                    <TableCell>{userProfile.phone || 'N/A'}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {userProfile.roles.map((role, idx) => (
                          <span key={idx}>{getRoleBadge(role)}</span>
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
                ))
              )}
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
          <div className="grid gap-4 md:grid-cols-2">
            {roles.map((role) => (
              <div key={role.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {getRoleBadge(role.name)}
                    <span className="text-sm text-muted-foreground">
                      ({getRoleCount(role.name)} users)
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{role.description}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleManagePermissions(role)}>
                  <Shield className="h-4 w-4 mr-2" />
                  Permissions
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
