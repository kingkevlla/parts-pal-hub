import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  TrendingUp, 
  Users, 
  Package, 
  DollarSign, 
  Activity,
  Power,
  UserX,
  AlertCircle,
  ShoppingCart,
  Warehouse
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Stats {
  totalSales: number;
  totalRevenue: number;
  totalUsers: number;
  totalProducts: number;
  lowStockCount: number;
  activeLoans: number;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  timestamp: Date;
  user?: string;
}

interface UserProfile {
  id: string;
  full_name: string;
  phone: string;
  roles: string[];
}

export default function OwnerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalSales: 0,
    totalRevenue: 0,
    totalUsers: 0,
    totalProducts: 0,
    lowStockCount: 0,
    activeLoans: 0
  });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [showShutdownDialog, setShowShutdownDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  useEffect(() => {
    checkOwnerStatus();
  }, [user]);

  useEffect(() => {
    if (isOwner) {
      fetchStats();
      fetchActivities();
      fetchUsers();
      subscribeToRealtime();
    }
  }, [isOwner]);

  const checkOwnerStatus = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role_name: 'owner'
      });

      if (error) throw error;
      setIsOwner(data);
    } catch (error) {
      console.error('Error checking owner status:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const [salesData, productsData, usersData, loansData, inventoryData] = await Promise.all([
        supabase.from('sales').select('total_amount', { count: 'exact' }),
        supabase.from('products').select('*', { count: 'exact' }),
        supabase.from('profiles').select('*', { count: 'exact' }),
        supabase.from('loans').select('*').eq('status', 'active'),
        supabase.from('inventory').select('*, products!inner(reorder_level)').filter('quantity', 'lt', 10)
      ]);

      const totalRevenue = salesData.data?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;

      setStats({
        totalSales: salesData.count || 0,
        totalRevenue,
        totalUsers: usersData.count || 0,
        totalProducts: productsData.count || 0,
        lowStockCount: inventoryData.data?.length || 0,
        activeLoans: loansData.data?.length || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchActivities = async () => {
    try {
      const [sales, stockMovements] = await Promise.all([
        supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(5)
      ]);

      const activities: Activity[] = [];

      sales.data?.forEach(sale => {
        activities.push({
          id: sale.id,
          type: 'sale',
          description: `Sale of $${sale.total_amount} ${sale.customer_name ? `to ${sale.customer_name}` : ''}`,
          timestamp: new Date(sale.created_at),
          user: 'User'
        });
      });

      stockMovements.data?.forEach(movement => {
        activities.push({
          id: movement.id,
          type: 'stock',
          description: `${movement.type === 'in' ? 'Added' : 'Removed'} ${movement.quantity} items`,
          timestamp: new Date(movement.created_at),
          user: 'User'
        });
      });

      activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setActivities(activities.slice(0, 10));
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, phone');

      if (profilesError) throw profilesError;

      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, roles(name)');

      if (rolesError) throw rolesError;

      const formattedUsers = profiles?.map(user => ({
        id: user.id,
        full_name: user.full_name || 'Unknown',
        phone: user.phone || 'N/A',
        roles: userRoles
          ?.filter((ur: any) => ur.user_id === user.id)
          .map((ur: any) => ur.roles?.name)
          .filter(Boolean) || []
      })) || [];

      setUsers(formattedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const subscribeToRealtime = () => {
    const salesChannel = supabase
      .channel('owner-sales-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        fetchStats();
        fetchActivities();
      })
      .subscribe();

    const stockChannel = supabase
      .channel('owner-stock-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => {
        fetchStats();
        fetchActivities();
      })
      .subscribe();

    const usersChannel = supabase
      .channel('owner-users-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsers();
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(stockChannel);
      supabase.removeChannel(usersChannel);
    };
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      // Delete user roles first
      const { error: rolesError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (rolesError) throw rolesError;

      // Delete profile (which cascades to auth.users)
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (profileError) throw profileError;

      toast({
        title: "Success",
        description: "User deleted successfully"
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleShutdown = () => {
    toast({
      title: "System Shutdown",
      description: "System shutdown initiated. Redirecting...",
      variant: "destructive"
    });
    
    setTimeout(() => {
      window.location.href = '/auth';
    }, 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Activity className="h-12 w-12 animate-pulse text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading owner dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-6 w-6" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">You don't have owner privileges to access this dashboard.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Owner Dashboard</h1>
          <p className="text-sm text-muted-foreground">Real-time system overview and controls</p>
        </div>
        <Button 
          variant="destructive" 
          onClick={() => setShowShutdownDialog(true)}
          className="w-full sm:w-auto"
        >
          <Power className="h-4 w-4 mr-2" />
          Shutdown System
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                <p className="text-2xl sm:text-3xl font-bold">${stats.totalRevenue.toFixed(2)}</p>
                <p className="text-xs text-success mt-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {stats.totalSales} sales
                </p>
              </div>
              <DollarSign className="h-10 w-10 sm:h-12 sm:w-12 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-accent/10 to-success/10 border-accent/20">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                <p className="text-2xl sm:text-3xl font-bold">{stats.totalUsers}</p>
                <p className="text-xs text-muted-foreground mt-1">Active accounts</p>
              </div>
              <Users className="h-10 w-10 sm:h-12 sm:w-12 text-accent opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-warning/10 to-destructive/10 border-warning/20">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Products</p>
                <p className="text-2xl sm:text-3xl font-bold">{stats.totalProducts}</p>
                {stats.lowStockCount > 0 && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {stats.lowStockCount} low stock
                  </p>
                )}
              </div>
              <Package className="h-10 w-10 sm:h-12 sm:w-12 text-warning opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Activity and User Management */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-primary animate-pulse" />
              Live Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] sm:h-[400px] pr-4">
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
              ) : (
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      {activity.type === 'sale' ? (
                        <ShoppingCart className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      ) : (
                        <Warehouse className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium break-words">{activity.description}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <p className="text-xs text-muted-foreground">{activity.user}</p>
                          <span className="text-xs text-muted-foreground">•</span>
                          <p className="text-xs text-muted-foreground">
                            {activity.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* User Management */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-primary" />
              User Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] sm:h-[400px] pr-4">
              {users.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No users found</p>
              ) : (
                <div className="space-y-3">
                  {users.map((user) => (
                    <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm break-words">{user.full_name}</p>
                        <p className="text-xs text-muted-foreground break-all">{user.phone}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {user.roles.map((role, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setUserToDelete(user.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full sm:w-auto"
                      >
                        <UserX className="h-4 w-4" />
                        <span className="sm:hidden ml-2">Remove User</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Shutdown Confirmation Dialog */}
      <AlertDialog open={showShutdownDialog} onOpenChange={setShowShutdownDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Shutdown System?</AlertDialogTitle>
            <AlertDialogDescription>
              This will log out all users and close the system. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleShutdown} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Shutdown
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this user and all their data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (userToDelete) handleDeleteUser(userToDelete);
                setUserToDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
