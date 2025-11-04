import { useState, useEffect } from "react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Package, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { useSystemSettings } from "@/hooks/useSystemSettings";

interface DashboardStats {
  totalProducts: number;
  stockInMonth: number;
  stockOutMonth: number;
  lowStockCount: number;
  monthlyRevenue: number;
  activeCustomers: number;
}

interface Activity {
  id: string;
  type: string;
  product_name: string;
  quantity: number;
  created_at: string;
}

interface LowStockProduct {
  id: string;
  sku: string;
  name: string;
  total_stock: number;
  reorder_level: number;
  category: string | null;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    stockInMonth: 0,
    stockOutMonth: 0,
    lowStockCount: 0,
    monthlyRevenue: 0,
    activeCustomers: 0,
  });
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const { formatAmount } = useCurrency();
  const { settings } = useSystemSettings();

  useEffect(() => {
    fetchDashboardData();
    
    // Subscribe to real-time updates
    const stockChannel = supabase
      .channel('dashboard-stock-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    const salesChannel = supabase
      .channel('dashboard-sales-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(stockChannel);
      supabase.removeChannel(salesChannel);
    };
  }, [settings.low_stock_threshold]);

  const fetchDashboardData = async () => {
    try {
      // Fetch total products
      const { count: productsCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      // Fetch stock movements for this month
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { data: stockMovements } = await supabase
        .from('stock_movements')
        .select('type, quantity')
        .gte('created_at', startOfMonth);

      const stockInMonth = stockMovements?.filter(m => m.type === 'in').reduce((sum, m) => sum + m.quantity, 0) || 0;
      const stockOutMonth = stockMovements?.filter(m => m.type === 'out' || m.type === 'sale').reduce((sum, m) => sum + m.quantity, 0) || 0;

      // Fetch monthly revenue
      const { data: monthlySales } = await supabase
        .from('sales')
        .select('total_amount')
        .gte('created_at', startOfMonth);

      const monthlyRevenue = monthlySales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;

      // Fetch active customers count
      const { count: customersCount } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      // Fetch recent activity
      const { data: recentMovements } = await supabase
        .from('stock_movements')
        .select('id, type, quantity, created_at, products(name)')
        .order('created_at', { ascending: false })
        .limit(5);

      const activities: Activity[] = recentMovements?.map(m => ({
        id: m.id,
        type: m.type === 'in' ? 'Stock In' : 'Stock Out',
        product_name: (m.products as any)?.name || 'Unknown Product',
        quantity: m.quantity,
        created_at: m.created_at
      })) || [];

      // Fetch low stock items
      const { data: products } = await supabase
        .from('products')
        .select('id, sku, name, reorder_level, categories(name)');

      const lowStock: LowStockProduct[] = [];
      if (products) {
        for (const product of products) {
          const { data: inventory } = await supabase
            .from('inventory')
            .select('quantity')
            .eq('product_id', product.id);

          const totalStock = inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
          const threshold = product.reorder_level || settings.low_stock_threshold;
          
          if (totalStock <= threshold) {
            lowStock.push({
              id: product.id,
              sku: product.sku,
              name: product.name,
              total_stock: totalStock,
              reorder_level: threshold,
              category: (product.categories as any)?.name || null
            });
          }
        }
      }

      setStats({
        totalProducts: productsCount || 0,
        stockInMonth,
        stockOutMonth,
        lowStockCount: lowStock.length,
        monthlyRevenue,
        activeCustomers: customersCount || 0,
      });

      setRecentActivity(activities);
      setLowStockItems(lowStock.slice(0, 5));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your spare parts inventory</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Total Products"
          value={stats.totalProducts}
          icon={Package}
          variant="default"
        />
        <StatCard
          title="Stock In (This Month)"
          value={stats.stockInMonth}
          icon={TrendingUp}
          variant="success"
        />
        <StatCard
          title="Stock Out (This Month)"
          value={stats.stockOutMonth}
          icon={TrendingDown}
          variant="default"
        />
        <StatCard
          title="Low Stock Items"
          value={stats.lowStockCount}
          icon={AlertTriangle}
          variant="warning"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatAmount(stats.monthlyRevenue)}
          icon={DollarSign}
          variant="success"
        />
        <StatCard
          title="Active Customers"
          value={stats.activeCustomers}
          icon={Users}
          variant="default"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
            ) : (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                    <div className="space-y-1">
                      <p className="font-medium">{activity.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {activity.type}: {activity.quantity} units
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">{getTimeAgo(activity.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStockItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">All stock levels are good</p>
            ) : (
              <div className="space-y-4">
                {lowStockItems.map((item) => (
                  <div key={item.id} className="space-y-2 border-b pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.sku} {item.category && `• ${item.category}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-destructive font-medium">{item.total_stock} units</span>
                      <span className="text-muted-foreground">/ Min: {item.reorder_level}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
