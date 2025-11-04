import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
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
  Warehouse,
  HandCoins,
  Bell,
  Volume2,
  VolumeX,
  Eye
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductDetailsDialog } from "@/components/owner/ProductDetailsDialog";

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

interface DueLoan {
  id: string;
  borrower_name: string;
  borrower_phone: string;
  amount: number;
  amount_paid: number;
  due_date: string;
  status: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  cost_price: number;
  selling_price: number;
}

export default function OwnerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
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
  const [dueLoans, setDueLoans] = useState<DueLoan[]>([]);
  const [totalLoanAmount, setTotalLoanAmount] = useState(0);
  const [showLoanDetails, setShowLoanDetails] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioTimer, setAudioTimer] = useState<NodeJS.Timeout | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showProductDetails, setShowProductDetails] = useState(false);

  useEffect(() => {
    checkOwnerStatus();
  }, [user]);

  useEffect(() => {
    if (isOwner) {
      fetchStats();
      fetchActivities();
      fetchUsers();
      fetchDueLoans();
      fetchProducts();
      subscribeToRealtime();
      
      // Check for due loans every minute
      const interval = setInterval(fetchDueLoans, 60000);
      return () => clearInterval(interval);
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
          description: `Sale of ${formatAmount(Number(sale.total_amount))} ${sale.customer_name ? `to ${sale.customer_name}` : ''}`,
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

  const fetchDueLoans = async () => {
    try {
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);

      const { data, error } = await supabase
        .from('loans')
        .select('*')
        .eq('status', 'active')
        .lte('due_date', nextWeek.toISOString().split('T')[0])
        .order('due_date', { ascending: true });

      if (error) throw error;

      setDueLoans(data || []);
      
      // Calculate total loan amount
      const total = data?.reduce((sum, loan) => sum + (Number(loan.amount) - Number(loan.amount_paid || 0)), 0) || 0;
      setTotalLoanAmount(total);

      // Play voice notification if there are due loans
      if (data && data.length > 0 && !audioPlaying) {
        playLoanReminder();
      }
    } catch (error) {
      console.error('Error fetching due loans:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, cost_price, selling_price')
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const playLoanReminder = () => {
    if (audioPlaying) return;
    
    setAudioPlaying(true);
    
    const utterance = new SpeechSynthesisUtterance(
      `Attention boss! You have ${dueLoans.length} loan${dueLoans.length > 1 ? 's' : ''} that ${dueLoans.length > 1 ? 'are' : 'is'} due soon. Please review the loan details.`
    );
    
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    utterance.onend = () => {
      setAudioPlaying(false);
      if (audioTimer) {
        clearTimeout(audioTimer);
        setAudioTimer(null);
      }
    };
    
    window.speechSynthesis.speak(utterance);
    
    // Auto-stop after 30 seconds
    const timer = setTimeout(() => {
      stopLoanReminder();
    }, 30000);
    
    setAudioTimer(timer);
  };

  const stopLoanReminder = () => {
    window.speechSynthesis.cancel();
    setAudioPlaying(false);
    if (audioTimer) {
      clearTimeout(audioTimer);
      setAudioTimer(null);
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

    const loansChannel = supabase
      .channel('owner-loans-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, () => {
        fetchStats();
        fetchDueLoans();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(stockChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(loansChannel);
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

      {/* Loan Reminder Notification */}
      {dueLoans.length > 0 && (
        <Card className="bg-gradient-to-r from-destructive/20 to-warning/20 border-destructive/40 animate-pulse">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Bell className="h-6 w-6 text-destructive flex-shrink-0 mt-1 animate-bounce" />
                <div className="flex-1">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    Loan Payment Reminder
                    {audioPlaying && <Volume2 className="h-4 w-4 animate-pulse" />}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    You have {dueLoans.length} loan{dueLoans.length > 1 ? 's' : ''} that {dueLoans.length > 1 ? 'are' : 'is'} due soon!
                  </p>
                  <Button 
                    variant="link" 
                    className="h-auto p-0 mt-2 text-primary"
                    onClick={() => setShowLoanDetails(true)}
                  >
                    Click to review details →
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                {audioPlaying ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={stopLoanReminder}
                    className="border-destructive text-destructive hover:bg-destructive/10"
                  >
                    <VolumeX className="h-4 w-4 mr-2" />
                    Stop Voice
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={playLoanReminder}
                    className="border-primary text-primary hover:bg-primary/10"
                  >
                    <Volume2 className="h-4 w-4 mr-2" />
                    Play Voice
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                <p className="text-2xl sm:text-3xl font-bold">{formatAmount(stats.totalRevenue)}</p>
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

        <Card 
          className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => setShowLoanDetails(true)}
        >
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Loans</p>
                <p className="text-2xl sm:text-3xl font-bold">{stats.activeLoans}</p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 flex items-center gap-1">
                  <HandCoins className="h-3 w-3" />
                  {formatAmount(totalLoanAmount)} outstanding
                </p>
              </div>
              <HandCoins className="h-10 w-10 sm:h-12 sm:w-12 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products Review */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-primary" />
            Products Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No products found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Purchase Price</TableHead>
                    <TableHead>Selling Price</TableHead>
                    <TableHead>Profit</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const profit = Number(product.selling_price) - Number(product.cost_price);
                    const profitMargin = (profit / Number(product.cost_price)) * 100;
                    
                    return (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{product.sku}</TableCell>
                        <TableCell className="text-destructive font-medium">
                          {formatAmount(Number(product.cost_price))}
                        </TableCell>
                        <TableCell className="text-success font-medium">
                          {formatAmount(Number(product.selling_price))}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{formatAmount(profit)}</p>
                            <p className="text-xs text-muted-foreground">
                              {profitMargin.toFixed(1)}%
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedProductId(product.id);
                              setShowProductDetails(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

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

      {/* Product Details Dialog */}
      <ProductDetailsDialog
        productId={selectedProductId}
        open={showProductDetails}
        onOpenChange={setShowProductDetails}
      />

      {/* Loan Details Dialog */}
      <AlertDialog open={showLoanDetails} onOpenChange={setShowLoanDetails}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-purple-500" />
              Loan Payment Reminders
            </AlertDialogTitle>
            <AlertDialogDescription>
              Review loans that are due within the next 7 days
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 my-4">
            {dueLoans.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No loans due soon</p>
            ) : (
              dueLoans.map((loan) => {
                const daysUntilDue = Math.ceil(
                  (new Date(loan.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                );
                const remainingAmount = Number(loan.amount) - Number(loan.amount_paid || 0);
                const isOverdue = daysUntilDue < 0;

                return (
                  <Card key={loan.id} className={isOverdue ? 'border-destructive' : 'border-warning'}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <h4 className="font-semibold">{loan.borrower_name}</h4>
                          <p className="text-sm text-muted-foreground">{loan.borrower_phone}</p>
                          <div className="mt-2 space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Total Amount:</span>
                              <span className="font-medium">{formatAmount(Number(loan.amount))}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Paid:</span>
                              <span className="font-medium text-success">{formatAmount(Number(loan.amount_paid || 0))}</span>
                            </div>
                            <div className="flex justify-between text-sm border-t pt-1">
                              <span className="text-muted-foreground">Remaining:</span>
                              <span className="font-semibold text-destructive">{formatAmount(remainingAmount)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={isOverdue ? 'destructive' : 'default'} className="mb-2">
                            {isOverdue ? 'OVERDUE' : `Due in ${daysUntilDue} days`}
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            Due: {new Date(loan.due_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowLoanDetails(false)}>
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
