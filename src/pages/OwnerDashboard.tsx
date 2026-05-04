import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
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
  Eye,
  CalendarDays,
  Receipt,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  PackageCheck,
  Banknote,
  Calendar as CalendarIcon,
  X
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductDetailsDialog } from "@/components/owner/ProductDetailsDialog";
import { Progress } from "@/components/ui/progress";

interface Stats {
  totalSales: number;
  totalRevenue: number;
  totalUsers: number;
  totalProducts: number;
  lowStockCount: number;
  activeLoans: number;
}

interface ActivityItem {
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
  customer_name: string;
  customer_phone: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  status: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  purchase_price: number;
  selling_price: number;
}

interface TodayStats {
  todaySales: number;
  todayRevenue: number;
  todayExpenses: number;
  todayProfit: number;
  todayTransactions: number;
}

interface WarehouseStock {
  id: string;
  name: string;
  location: string;
  totalItems: number;
  lowStockItems: number;
}

interface TopProduct {
  name: string;
  totalSold: number;
  revenue: number;
}

export default function OwnerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const { isOwner, isAdmin, loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalSales: 0,
    totalRevenue: 0,
    totalUsers: 0,
    totalProducts: 0,
    lowStockCount: 0,
    activeLoans: 0
  });
  const [todayStats, setTodayStats] = useState<TodayStats>({
    todaySales: 0,
    todayRevenue: 0,
    todayExpenses: 0,
    todayProfit: 0,
    todayTransactions: 0
  });
  const [warehouseStocks, setWarehouseStocks] = useState<WarehouseStock[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    if (!permissionsLoading) {
      setLoading(false);
    }
  }, [permissionsLoading]);

  useEffect(() => {
    if (canAccess && !permissionsLoading) {
      fetchStats();
      fetchTodayStats();
      fetchWarehouseStocks();
      fetchTopProducts();
      fetchInventoryValue();
      fetchTotalExpenses();
      fetchActivities();
      fetchUsers();
      fetchDueLoans();
      fetchProducts();
      subscribeToRealtime();
      
      const interval = setInterval(() => {
        fetchDueLoans();
        fetchTodayStats();
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [canAccess, permissionsLoading]);

  const fetchStats = async () => {
    try {
      const [transactionsData, productsData, usersData, loansData, inventoryData] = await Promise.all([
        supabase.from('transactions').select('total_amount', { count: 'exact' }),
        supabase.from('products').select('*', { count: 'exact' }),
        supabase.from('profiles').select('*', { count: 'exact' }),
        supabase.from('loans').select('*').in('status', ['active', 'pending']),
        supabase.from('inventory').select('quantity').lt('quantity', 10)
      ]);

      const totalRevenue = transactionsData.data?.reduce((sum, t) => sum + Number(t.total_amount || 0), 0) || 0;

      setStats({
        totalSales: transactionsData.count || 0,
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

  const fetchTodayStats = async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

      const [salesData, expensesData] = await Promise.all([
        supabase.from('transactions').select('total_amount').gte('created_at', startOfDay).lt('created_at', endOfDay),
        supabase.from('expenses').select('amount').gte('expense_date', today.toISOString().split('T')[0]).lte('expense_date', today.toISOString().split('T')[0])
      ]);

      const todayRevenue = salesData.data?.reduce((sum, t) => sum + Number(t.total_amount || 0), 0) || 0;
      const todayExpenses = expensesData.data?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;

      setTodayStats({
        todaySales: salesData.data?.length || 0,
        todayRevenue,
        todayExpenses,
        todayProfit: todayRevenue - todayExpenses,
        todayTransactions: salesData.data?.length || 0
      });
    } catch (error) {
      console.error('Error fetching today stats:', error);
    }
  };

  const fetchWarehouseStocks = async () => {
    try {
      const [warehousesRes, inventoryRes] = await Promise.all([
        supabase.from('warehouses').select('*').eq('is_active', true),
        supabase.from('inventory').select('warehouse_id, quantity')
      ]);

      const warehouses = warehousesRes.data || [];
      const inventory = inventoryRes.data || [];

      const stocks: WarehouseStock[] = warehouses.map(wh => {
        const whInventory = inventory.filter(inv => inv.warehouse_id === wh.id);
        const totalItems = whInventory.reduce((sum, inv) => sum + (inv.quantity || 0), 0);
        const lowStockItems = whInventory.filter(inv => (inv.quantity || 0) < 10).length;
        return {
          id: wh.id,
          name: wh.name,
          location: wh.location || 'No location',
          totalItems,
          lowStockItems
        };
      });

      setWarehouseStocks(stocks);
    } catch (error) {
      console.error('Error fetching warehouse stocks:', error);
    }
  };

  const fetchTopProducts = async () => {
    try {
      const { data: items } = await supabase
        .from('transaction_items')
        .select('product_id, quantity, total_price, products(name)');

      if (!items) return;

      const productMap = new Map<string, { name: string; totalSold: number; revenue: number }>();
      items.forEach(item => {
        const name = (item.products as any)?.name || 'Unknown';
        const existing = productMap.get(item.product_id) || { name, totalSold: 0, revenue: 0 };
        existing.totalSold += item.quantity;
        existing.revenue += Number(item.total_price || 0);
        productMap.set(item.product_id, existing);
      });

      const sorted = Array.from(productMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      setTopProducts(sorted);
    } catch (error) {
      console.error('Error fetching top products:', error);
    }
  };

  const fetchInventoryValue = async () => {
    try {
      const { data: inventory } = await supabase
        .from('inventory')
        .select('quantity, product_id, products(purchase_price, selling_price)');

      if (!inventory) return;

      const value = inventory.reduce((sum, inv) => {
        const price = (inv.products as any)?.selling_price || 0;
        return sum + (inv.quantity * Number(price));
      }, 0);

      setInventoryValue(value);
    } catch (error) {
      console.error('Error fetching inventory value:', error);
    }
  };

  const fetchTotalExpenses = async () => {
    try {
      const { data } = await supabase.from('expenses').select('amount');
      const total = data?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;
      setTotalExpenses(total);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    }
  };

  const fetchActivities = async () => {
    try {
      const [transactions, stockMovements] = await Promise.all([
        supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(5)
      ]);

      const activityItems: ActivityItem[] = [];

      transactions.data?.forEach(transaction => {
        activityItems.push({
          id: transaction.id,
          type: 'sale',
          description: `Sale of ${formatAmount(Number(transaction.total_amount || 0))}`,
          timestamp: new Date(transaction.created_at || ''),
          user: 'User'
        });
      });

      stockMovements.data?.forEach(movement => {
        activityItems.push({
          id: movement.id,
          type: 'stock',
          description: `${movement.movement_type === 'in' ? 'Added' : 'Removed'} ${movement.quantity} items`,
          timestamp: new Date(movement.created_at || ''),
          user: 'User'
        });
      });

      activityItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setActivities(activityItems.slice(0, 10));
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
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const formattedUsers = profiles?.map(profile => ({
        id: profile.id,
        full_name: profile.full_name || 'Unknown',
        phone: profile.phone || 'N/A',
        roles: userRoles
          ?.filter(ur => ur.user_id === profile.id)
          .map(ur => ur.role) || []
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
        .select('*, customers(name, phone)')
        .in('status', ['active', 'pending'])
        .lte('due_date', nextWeek.toISOString().split('T')[0])
        .order('due_date', { ascending: true });

      if (error) throw error;

      const formattedLoans: DueLoan[] = (data || []).map(loan => ({
        id: loan.id,
        customer_name: (loan.customers as any)?.name || 'Unknown',
        customer_phone: (loan.customers as any)?.phone || 'N/A',
        amount: loan.amount,
        paid_amount: loan.paid_amount || 0,
        due_date: loan.due_date || '',
        status: loan.status || 'pending'
      }));

      setDueLoans(formattedLoans);
      
      const total = formattedLoans.reduce((sum, loan) => sum + (loan.amount - loan.paid_amount), 0);
      setTotalLoanAmount(total);

      if (formattedLoans.length > 0 && !audioPlaying) {
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
        .select('id, name, sku, purchase_price, selling_price')
        .order('name');

      if (error) throw error;
      
      const formattedProducts: Product[] = (data || []).map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku || '',
        purchase_price: p.purchase_price || 0,
        selling_price: p.selling_price || 0
      }));
      
      setProducts(formattedProducts);
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
    const transactionsChannel = supabase
      .channel('owner-transactions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchStats();
        fetchTodayStats();
        fetchTopProducts();
        fetchActivities();
      })
      .subscribe();

    const stockChannel = supabase
      .channel('owner-stock-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => {
        fetchStats();
        fetchWarehouseStocks();
        fetchInventoryValue();
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

    const expensesChannel = supabase
      .channel('owner-expenses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
        fetchTodayStats();
        fetchTotalExpenses();
      })
      .subscribe();

    const inventoryChannel = supabase
      .channel('owner-inventory-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        fetchWarehouseStocks();
        fetchInventoryValue();
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(transactionsChannel);
      supabase.removeChannel(stockChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(loansChannel);
      supabase.removeChannel(expensesChannel);
      supabase.removeChannel(inventoryChannel);
    };
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const { error: rolesError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (rolesError) throw rolesError;

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

  if (loading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Activity className="h-12 w-12 animate-pulse text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading owner dashboard...</p>
        </div>
      </div>
    );
  }

  if (!canAccess) {
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

  const netProfit = stats.totalRevenue - totalExpenses;

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

      {/* Today's Summary Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          Today's Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-xs font-medium text-muted-foreground">Today's Sales</p>
              </div>
              <p className="text-xl font-bold">{formatAmount(todayStats.todayRevenue)}</p>
              <p className="text-xs text-muted-foreground mt-1">{todayStats.todayTransactions} transactions</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownRight className="h-4 w-4 text-red-600 dark:text-red-400" />
                <p className="text-xs font-medium text-muted-foreground">Today's Expenses</p>
              </div>
              <p className="text-xl font-bold">{formatAmount(todayStats.todayExpenses)}</p>
              <p className="text-xs text-muted-foreground mt-1">Outgoing today</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <p className="text-xs font-medium text-muted-foreground">Today's Profit</p>
              </div>
              <p className={`text-xl font-bold ${todayStats.todayProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatAmount(todayStats.todayProfit)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Revenue - Expenses</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <p className="text-xs font-medium text-muted-foreground">Last Sale</p>
              </div>
              <p className="text-xl font-bold">{todayStats.todaySales > 0 ? 'Active' : 'No sales'}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* All-time Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                <p className="text-2xl sm:text-3xl font-bold">{formatAmount(stats.totalRevenue)}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {stats.totalSales} sales
                </p>
              </div>
              <DollarSign className="h-10 w-10 sm:h-12 sm:w-12 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-accent/10 to-emerald-500/10 border-accent/20">
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

      {/* Financial Overview & Inventory Value */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Banknote className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Profit (All Time)</p>
                <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatAmount(netProfit)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-500/10 to-blue-500/5 border-indigo-500/20">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <PackageCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inventory Value</p>
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatAmount(inventoryValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/5 border-red-500/20">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Expenses</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatAmount(totalExpenses)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warehouse Stock Overview */}
      {warehouseStocks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Warehouse className="h-5 w-5 text-primary" />
              Warehouse Stock Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {warehouseStocks.map((wh) => {
                const maxItems = Math.max(...warehouseStocks.map(w => w.totalItems), 1);
                const fillPercent = (wh.totalItems / maxItems) * 100;
                return (
                  <div key={wh.id} className="p-4 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-sm">{wh.name}</h4>
                      {wh.lowStockItems > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {wh.lowStockItems} low
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{wh.location}</p>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Stock Level</span>
                      <span className="text-sm font-bold">{wh.totalItems} items</span>
                    </div>
                    <Progress value={fillPercent} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Products & Products Review */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Selling Products */}
        {topProducts.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Top Selling Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topProducts.map((product, idx) => {
                  const maxRevenue = Math.max(...topProducts.map(p => p.revenue), 1);
                  const barWidth = (product.revenue / maxRevenue) * 100;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate flex-1">{product.name}</span>
                        <span className="text-sm font-bold ml-2">{formatAmount(product.revenue)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-500"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right">{product.totalSold} sold</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Products Review */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-5 w-5 text-primary" />
              Products Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              {products.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No products found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Purchase</TableHead>
                      <TableHead>Selling</TableHead>
                      <TableHead>Profit</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => {
                      const profit = product.selling_price - product.purchase_price;
                      const profitMargin = product.purchase_price > 0 ? (profit / product.purchase_price) * 100 : 0;
                      
                      return (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium text-sm">{product.name}</TableCell>
                          <TableCell className="text-destructive text-sm">
                            {formatAmount(product.purchase_price)}
                          </TableCell>
                          <TableCell className="text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                            {formatAmount(product.selling_price)}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{formatAmount(profit)}</p>
                              <p className="text-xs text-muted-foreground">{profitMargin.toFixed(1)}%</p>
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
                        <ShoppingCart className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
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
                  {users.map((userItem) => (
                    <div key={userItem.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm break-words">{userItem.full_name}</p>
                        <p className="text-xs text-muted-foreground break-all">{userItem.phone}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {userItem.roles.map((role, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs capitalize">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setUserToDelete(userItem.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full sm:w-auto"
                        disabled={userItem.id === user?.id}
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
                const remainingAmount = loan.amount - loan.paid_amount;
                const isOverdue = daysUntilDue < 0;

                return (
                  <Card key={loan.id} className={isOverdue ? 'border-destructive' : 'border-warning'}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <h4 className="font-semibold">{loan.customer_name}</h4>
                          <p className="text-sm text-muted-foreground">{loan.customer_phone}</p>
                          <div className="mt-2 space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Total Amount:</span>
                              <span className="font-medium">{formatAmount(loan.amount)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Paid:</span>
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatAmount(loan.paid_amount)}</span>
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
