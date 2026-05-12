import { useState, useEffect } from "react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Package, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Users, WifiOff, CalendarIcon, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { getCachedData, cacheData } from "@/lib/offlineDb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

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
  min_stock_level: number;
  category: string | null;
}

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [datesWithRecords, setDatesWithRecords] = useState<Set<string>>(new Set());
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
  const [isOfflineData, setIsOfflineData] = useState(false);
  const { formatAmount, formatCompact } = useCurrency();
  const { settings } = useSystemSettings();

  useEffect(() => {
    fetchDashboardData();
    fetchDatesWithRecords();
    
    if (navigator.onLine) {
      const stockChannel = supabase
        .channel('dashboard-stock-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => {
          fetchDashboardData();
          fetchDatesWithRecords();
        })
        .subscribe();

      const transactionsChannel = supabase
        .channel('dashboard-transactions-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
          fetchDashboardData();
          fetchDatesWithRecords();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(stockChannel);
        supabase.removeChannel(transactionsChannel);
      };
    }
  }, [settings.low_stock_threshold]);

  useEffect(() => {
    fetchDashboardData();
  }, [dateRange]);

  const fetchDatesWithRecords = async () => {
    if (!navigator.onLine) return;
    try {
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();

      const [{ data: txDates }, { data: movDates }] = await Promise.all([
        supabase.from('transactions').select('created_at').gte('created_at', monthStart).lte('created_at', monthEnd),
        supabase.from('stock_movements').select('created_at').gte('created_at', monthStart).lte('created_at', monthEnd),
      ]);

      const dates = new Set<string>();
      txDates?.forEach(t => dates.add(format(new Date(t.created_at), 'yyyy-MM-dd')));
      movDates?.forEach(m => dates.add(format(new Date(m.created_at), 'yyyy-MM-dd')));
      setDatesWithRecords(dates);
    } catch (err) {
      console.error('Failed to fetch dates with records:', err);
    }
  };

  const fetchDashboardData = async () => {
    const isOnline = navigator.onLine;

    let rangeStart: string;
    let rangeEnd: string;
    if (dateRange?.from) {
      rangeStart = startOfDay(dateRange.from).toISOString();
      rangeEnd = dateRange.to ? endOfDay(dateRange.to).toISOString() : endOfDay(dateRange.from).toISOString();
    } else {
      rangeStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      rangeEnd = new Date().toISOString();
    }

    if (isOnline) {
      try {
        const [
          { count: productsCount },
          { data: stockMovements },
          { data: filteredTransactions },
          { count: customersCount },
          { data: recentMovements },
          { data: products },
          { data: allInventory },
        ] = await Promise.all([
          supabase.from('products').select('*', { count: 'exact', head: true }),
          supabase.from('stock_movements').select('movement_type, quantity').gte('created_at', rangeStart).lte('created_at', rangeEnd),
          supabase.from('transactions').select('total_amount').gte('created_at', rangeStart).lte('created_at', rangeEnd),
          supabase.from('customers').select('*', { count: 'exact', head: true }),
          supabase.from('stock_movements').select('id, movement_type, quantity, created_at, products(name)').gte('created_at', rangeStart).lte('created_at', rangeEnd).order('created_at', { ascending: false }).limit(10),
          supabase.from('products').select('id, sku, name, min_stock_level, categories(name)'),
          supabase.from('inventory').select('product_id, quantity'),
        ]);

        if (products) await cacheData('products', products);
        if (allInventory) await cacheData('inventory', allInventory);

        const stockInMonth = stockMovements?.filter(m => m.movement_type === 'in').reduce((sum, m) => sum + (m.quantity || 0), 0) || 0;
        const stockOutMonth = stockMovements?.filter(m => m.movement_type === 'out' || m.movement_type === 'sale').reduce((sum, m) => sum + (m.quantity || 0), 0) || 0;
        const monthlyRevenue = filteredTransactions?.reduce((sum, t) => sum + Number(t.total_amount || 0), 0) || 0;

        const activities: Activity[] = recentMovements?.map(m => ({
          id: m.id,
          type: m.movement_type === 'in' ? 'Stock In' : 'Stock Out',
          product_name: (m.products as any)?.name || 'Unknown Product',
          quantity: m.quantity,
          created_at: m.created_at || ''
        })) || [];

        const inventoryMap = new Map<string, number>();
        allInventory?.forEach(inv => {
          inventoryMap.set(inv.product_id, (inventoryMap.get(inv.product_id) || 0) + (inv.quantity || 0));
        });

        const lowStock: LowStockProduct[] = [];
        if (products) {
          for (const product of products) {
            const totalStock = inventoryMap.get(product.id) || 0;
            const threshold = product.min_stock_level || settings.low_stock_threshold;
            if (totalStock <= threshold) {
              lowStock.push({
                id: product.id,
                sku: product.sku || '',
                name: product.name,
                total_stock: totalStock,
                min_stock_level: threshold,
                category: (product as any).categories?.name || null
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
        setIsOfflineData(false);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        await loadFromCache();
      }
    } else {
      await loadFromCache();
    }

    setLoading(false);
  };

  const loadFromCache = async () => {
    try {
      const cachedProducts = await getCachedData('products');
      const cachedInventory = await getCachedData('inventory');
      const cachedCustomers = await getCachedData('customers');

      const inventoryMap = new Map<string, number>();
      cachedInventory.forEach((inv: any) => {
        inventoryMap.set(inv.product_id, (inventoryMap.get(inv.product_id) || 0) + (inv.quantity || 0));
      });

      const lowStock: LowStockProduct[] = [];
      for (const product of cachedProducts as any[]) {
        const totalStock = inventoryMap.get(product.id) || 0;
        const threshold = product.min_stock_level || settings.low_stock_threshold;
        if (totalStock <= threshold) {
          lowStock.push({
            id: product.id,
            sku: product.sku || '',
            name: product.name,
            total_stock: totalStock,
            min_stock_level: threshold,
            category: null,
          });
        }
      }

      setStats({
        totalProducts: cachedProducts.length,
        stockInMonth: 0,
        stockOutMonth: 0,
        lowStockCount: lowStock.length,
        monthlyRevenue: 0,
        activeCustomers: cachedCustomers.length,
      });

      setRecentActivity([]);
      setLowStockItems(lowStock.slice(0, 5));
      setIsOfflineData(true);
    } catch (err) {
      console.error('[Offline] Failed to load cached dashboard data:', err);
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

  const hasDateFilter = !!dateRange?.from;

  const getDateLabel = () => {
    if (!dateRange?.from) return 'Filter by date range';
    if (!dateRange.to || dateRange.from.toDateString() === dateRange.to.toDateString()) {
      return format(dateRange.from, 'PPP');
    }
    return `${format(dateRange.from, 'PP')} – ${format(dateRange.to, 'PP')}`;
  };

  const getSubtitle = () => {
    if (!hasDateFilter) return 'Overview of your spare parts inventory';
    if (!dateRange?.to || dateRange.from?.toDateString() === dateRange.to?.toDateString()) {
      return `Showing data for ${format(dateRange!.from!, 'PPP')}`;
    }
    return `Showing data from ${format(dateRange!.from!, 'PP')} to ${format(dateRange!.to!, 'PP')}`;
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">{getSubtitle()}</p>
        </div>
        <div className="flex items-center gap-2">
          {isOfflineData && (
            <Badge variant="outline" className="gap-1 border-warning text-warning">
              <WifiOff className="h-3 w-3" />
              Offline
            </Badge>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-left font-normal max-w-[280px]",
                  !hasDateFilter && "text-muted-foreground",
                  hasDateFilter && "border-primary text-primary"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{getDateLabel()}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={1}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
                modifiers={{
                  hasRecords: (date) => datesWithRecords.has(format(date, 'yyyy-MM-dd')),
                }}
                modifiersClassNames={{
                  hasRecords: 'bg-destructive/20 text-destructive font-bold hover:bg-destructive/30',
                }}
              />
            </PopoverContent>
          </Popover>
          {hasDateFilter && (
            <Button variant="ghost" size="icon" onClick={() => setDateRange(undefined)} className="text-muted-foreground h-9 w-9">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Total Products"
          value={stats.totalProducts}
          icon={Package}
          variant="default"
        />
        <StatCard
          title={hasDateFilter ? "Stock In (Filtered)" : "Stock In (This Month)"}
          value={stats.stockInMonth}
          icon={TrendingUp}
          variant="success"
        />
        <StatCard
          title={hasDateFilter ? "Stock Out (Filtered)" : "Stock Out (This Month)"}
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
          title={hasDateFilter ? "Revenue (Filtered)" : "Monthly Revenue"}
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
            <CardTitle>
              {hasDateFilter ? `Activity (${getDateLabel()})` : 'Recent Activity'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {isOfflineData ? 'Activity history unavailable offline' : hasDateFilter ? 'No activity in this range' : 'No recent activity'}
              </p>
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
                      <span className="text-muted-foreground">/ Min: {item.min_stock_level}</span>
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
