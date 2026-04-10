import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  DollarSign, Package, Users, TrendingUp, TrendingDown, Calendar,
  UserCheck, ShoppingCart, FileText, Download, Filter, Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCachedData } from "@/lib/offlineDb";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from "date-fns";

// ─── Types ───────────────────────────────────────────────
interface UserProfile {
  user_id: string;
  full_name: string | null;
}

interface TransactionRow {
  id: string;
  transaction_number: string | null;
  total_amount: number;
  payment_method: string | null;
  status: string | null;
  created_at: string;
  created_by: string | null;
  customer_id: string | null;
  discount_amount: number | null;
  tax_amount: number | null;
  customers: { name: string } | null;
}

interface StockMovementRow {
  id: string;
  movement_type: string;
  quantity: number;
  created_at: string;
  created_by: string | null;
  notes: string | null;
  products: { name: string } | null;
  warehouses: { name: string } | null;
}

interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  status: string | null;
  category_id: string | null;
  created_by: string | null;
  expense_categories: { name: string } | null;
}

interface UserActivity {
  userId: string;
  userName: string;
  totalSales: number;
  totalRevenue: number;
  totalStockMoves: number;
  totalExpenses: number;
  transactions: TransactionRow[];
  stockMovements: StockMovementRow[];
}

// ─── Date range helpers ──────────────────────────────────
function getDateRange(filter: string, customStart: string, customEnd: string) {
  const now = new Date();
  switch (filter) {
    case "today": return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": { const y = subDays(now, 1); return { start: startOfDay(y), end: endOfDay(y) }; }
    case "this_week": return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "this_month": return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last_30": return { start: subDays(now, 30), end: now };
    case "this_year": return { start: startOfYear(now), end: endOfYear(now) };
    case "custom":
      if (customStart && customEnd) return { start: new Date(customStart), end: endOfDay(new Date(customEnd)) };
      return null;
    default: return null; // "all"
  }
}

export default function Reports() {
  const [dateFilter, setDateFilter] = useState("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedUser, setSelectedUser] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovementRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [supplierCount, setSupplierCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const { settings } = useSystemSettings();

  // Fetch profiles once
  useEffect(() => {
    if (navigator.onLine) {
      supabase.from("profiles").select("user_id, full_name").then(({ data }) => {
        if (data) setProfiles(data);
      });
    } else {
      getCachedData('profiles').then(data => setProfiles(data as any));
    }
  }, []);

  // Fetch report data when filters change
  useEffect(() => {
    fetchData();
  }, [dateFilter, customStart, customEnd]);

  const dateRange = getDateRange(dateFilter, customStart, customEnd);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (navigator.onLine) {
        const applyDateFilter = (query: any, col = "created_at") => {
          if (dateRange) {
            query = query.gte(col, dateRange.start.toISOString()).lte(col, dateRange.end.toISOString());
          }
          return query;
        };

        let txQuery = supabase.from("transactions").select("id, transaction_number, total_amount, payment_method, status, created_at, created_by, customer_id, discount_amount, tax_amount, customers(name)");
        txQuery = applyDateFilter(txQuery);

        let smQuery = supabase.from("stock_movements").select("id, movement_type, quantity, created_at, created_by, notes, products(name), warehouses(name)");
        smQuery = applyDateFilter(smQuery);

        let exQuery = supabase.from("expenses").select("id, description, amount, expense_date, status, category_id, created_by, expense_categories(name)");
        if (dateRange) {
          exQuery = exQuery.gte("expense_date", format(dateRange.start, "yyyy-MM-dd")).lte("expense_date", format(dateRange.end, "yyyy-MM-dd"));
        }

        const [
          { data: txData }, { data: smData }, { data: exData },
          { count: pc }, { count: cc }, { count: sc },
        ] = await Promise.all([
          txQuery.order("created_at", { ascending: false }),
          smQuery.order("created_at", { ascending: false }),
          exQuery.order("expense_date", { ascending: false }),
          supabase.from("products").select("*", { count: "exact", head: true }),
          supabase.from("customers").select("*", { count: "exact", head: true }),
          supabase.from("suppliers").select("*", { count: "exact", head: true }),
        ]);

        setTransactions(txData || []);
        setStockMovements(smData || []);
        setExpenses(exData || []);
        setProductCount(pc || 0);
        setCustomerCount(cc || 0);
        setSupplierCount(sc || 0);
      } else {
        // Offline: use cached data
        const [txData, smData, exData, products, customers, suppliers] = await Promise.all([
          getCachedData('transactions'),
          getCachedData('stock_movements'),
          getCachedData('expenses'),
          getCachedData('products'),
          getCachedData('customers'),
          getCachedData('suppliers'),
        ]);

        let filteredTx = txData;
        let filteredSm = smData;
        let filteredEx = exData;

        if (dateRange) {
          filteredTx = txData.filter((t: any) => {
            const d = new Date(t.created_at);
            return d >= dateRange.start && d <= dateRange.end;
          });
          filteredSm = smData.filter((m: any) => {
            const d = new Date(m.created_at);
            return d >= dateRange.start && d <= dateRange.end;
          });
          filteredEx = exData.filter((e: any) => {
            const d = new Date(e.expense_date);
            return d >= dateRange.start && d <= dateRange.end;
          });
        }

        setTransactions(filteredTx as any);
        setStockMovements(filteredSm as any);
        setExpenses(filteredEx as any);
        setProductCount(products.length);
        setCustomerCount(customers.length);
        setSupplierCount(suppliers.length);
      }
    } catch (err: any) {
      toast({ title: "Error loading reports", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ─── Helpers ─────────────────────────────────────────────
  const getUserName = (userId: string | null) => {
    if (!userId) return "System";
    const p = profiles.find((pr) => pr.user_id === userId);
    return p?.full_name || userId.slice(0, 8) + "...";
  };

  // Filter by selected user
  const filteredTransactions = useMemo(() =>
    selectedUser === "all" ? transactions : transactions.filter((t) => t.created_by === selectedUser),
    [transactions, selectedUser]
  );
  const filteredStockMovements = useMemo(() =>
    selectedUser === "all" ? stockMovements : stockMovements.filter((s) => s.created_by === selectedUser),
    [stockMovements, selectedUser]
  );
  const filteredExpenses = useMemo(() =>
    selectedUser === "all" ? expenses : expenses.filter((e) => e.created_by === selectedUser),
    [expenses, selectedUser]
  );

  // Summary stats
  const totalRevenue = filteredTransactions.filter((t) => t.status === "completed").reduce((s, t) => s + Number(t.total_amount || 0), 0);
  const totalExpenseAmount = filteredExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenseAmount;
  const completedSales = filteredTransactions.filter((t) => t.status === "completed").length;
  const stockInCount = filteredStockMovements.filter((s) => s.movement_type === "in").reduce((a, s) => a + s.quantity, 0);
  const stockOutCount = filteredStockMovements.filter((s) => s.movement_type === "out" || s.movement_type === "sale").reduce((a, s) => a + s.quantity, 0);

  // ─── User activity aggregation ──────────────────────────
  const userActivities = useMemo(() => {
    const map = new Map<string, UserActivity>();

    const getOrCreate = (userId: string): UserActivity => {
      if (!map.has(userId)) {
        map.set(userId, {
          userId,
          userName: getUserName(userId),
          totalSales: 0,
          totalRevenue: 0,
          totalStockMoves: 0,
          totalExpenses: 0,
          transactions: [],
          stockMovements: [],
        });
      }
      return map.get(userId)!;
    };

    transactions.forEach((t) => {
      if (!t.created_by) return;
      const u = getOrCreate(t.created_by);
      u.transactions.push(t);
      if (t.status === "completed") {
        u.totalSales++;
        u.totalRevenue += Number(t.total_amount || 0);
      }
    });

    stockMovements.forEach((s) => {
      if (!s.created_by) return;
      const u = getOrCreate(s.created_by);
      u.stockMovements.push(s);
      u.totalStockMoves++;
    });

    expenses.forEach((e) => {
      if (!e.created_by) return;
      const u = getOrCreate(e.created_by);
      u.totalExpenses += Number(e.amount || 0);
    });

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [transactions, stockMovements, expenses, profiles]);

  // Unique users that had activity
  const activeUsers = useMemo(() => {
    const userIds = new Set<string>();
    transactions.forEach((t) => t.created_by && userIds.add(t.created_by));
    stockMovements.forEach((s) => s.created_by && userIds.add(s.created_by));
    expenses.forEach((e) => e.created_by && userIds.add(e.created_by));
    return Array.from(userIds).map((id) => ({ id, name: getUserName(id) }));
  }, [transactions, stockMovements, expenses, profiles]);

  // Selected user detail
  const selectedUserActivity = selectedUser !== "all" ? userActivities.find((u) => u.userId === selectedUser) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Business insights, analytics & user activity</p>
        </div>
      </div>

      {/* ─── Filters ─────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Date Range</label>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_30">Last 30 Days</SelectItem>
                  <SelectItem value="this_year">This Year</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateFilter === "custom" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">From</label>
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-[160px]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">To</label>
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-[160px]" />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> User / Cashier</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Users" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {activeUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" size="sm" onClick={() => { setDateFilter("this_month"); setSelectedUser("all"); }}>
              <Filter className="h-4 w-4 mr-1" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Loading report data...</p>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="user_activity">User Activity</TabsTrigger>
          </TabsList>

          {/* ═══ OVERVIEW TAB ════════════════════════════════ */}
          <TabsContent value="overview" className="space-y-6">
            {selectedUser !== "all" && selectedUserActivity && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Showing results for</p>
                  <p className="text-xl font-bold">{selectedUserActivity.userName}</p>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard title="Total Sales" value={completedSales} icon={ShoppingCart} />
              <StatCard title="Revenue" value={formatAmount(totalRevenue)} icon={TrendingUp} variant="success" />
              <StatCard title="Expenses" value={formatAmount(totalExpenseAmount)} icon={TrendingDown} variant="destructive" />
              <StatCard title="Net Profit" value={formatAmount(netProfit)} icon={DollarSign} variant={netProfit >= 0 ? "success" : "destructive"} />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Stock In</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-success">+{stockInCount} units</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Stock Out</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-destructive">-{stockOutCount} units</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Counts</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm">
                    <span><strong>{productCount}</strong> Products</span>
                    <span><strong>{customerCount}</strong> Customers</span>
                    <span><strong>{supplierCount}</strong> Suppliers</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ═══ SALES TAB ═══════════════════════════════════ */}
          <TabsContent value="sales" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Sales Transactions</CardTitle>
                <CardDescription>{filteredTransactions.length} transactions found</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Txn #</TableHead>
                        <TableHead>Cashier</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No transactions found</TableCell></TableRow>
                      ) : filteredTransactions.slice(0, 100).map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap text-sm">{format(new Date(t.created_at), "MMM dd, HH:mm")}</TableCell>
                          <TableCell className="font-mono text-sm">{t.transaction_number || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{getUserName(t.created_by)}</Badge>
                          </TableCell>
                          <TableCell>{t.customers?.name || "Walk-in"}</TableCell>
                          <TableCell className="capitalize">{t.payment_method || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={t.status === "completed" ? "default" : "secondary"} className="text-xs">
                              {t.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatAmount(t.total_amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredTransactions.length > 100 && (
                    <p className="text-sm text-muted-foreground text-center mt-2">Showing first 100 of {filteredTransactions.length}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ INVENTORY TAB ═══════════════════════════════ */}
          <TabsContent value="inventory" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Stock Movements</CardTitle>
                <CardDescription>{filteredStockMovements.length} movements found</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStockMovements.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No stock movements found</TableCell></TableRow>
                      ) : filteredStockMovements.slice(0, 100).map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="whitespace-nowrap text-sm">{format(new Date(s.created_at), "MMM dd, HH:mm")}</TableCell>
                          <TableCell>
                            <Badge variant={s.movement_type === "in" ? "default" : "destructive"} className="text-xs capitalize">
                              {s.movement_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{getUserName(s.created_by)}</Badge>
                          </TableCell>
                          <TableCell>{s.products?.name || "—"}</TableCell>
                          <TableCell>{s.warehouses?.name || "—"}</TableCell>
                          <TableCell className="text-right font-medium">{s.quantity}</TableCell>
                          <TableCell className="max-w-[150px] truncate text-sm text-muted-foreground">{s.notes || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ USER ACTIVITY TAB ═══════════════════════════ */}
          <TabsContent value="user_activity" className="space-y-4">
            {selectedUser === "all" ? (
              /* Summary of all users */
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> User Activity Summary</CardTitle>
                  <CardDescription>Performance breakdown per user during the selected period</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead className="text-right">Sales</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Stock Moves</TableHead>
                          <TableHead className="text-right">Expenses</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {userActivities.length === 0 ? (
                          <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No user activity found</TableCell></TableRow>
                        ) : userActivities.map((u) => (
                          <TableRow key={u.userId}>
                            <TableCell className="font-medium">{u.userName}</TableCell>
                            <TableCell className="text-right">{u.totalSales}</TableCell>
                            <TableCell className="text-right font-medium text-success">{formatAmount(u.totalRevenue)}</TableCell>
                            <TableCell className="text-right">{u.totalStockMoves}</TableCell>
                            <TableCell className="text-right text-destructive">{formatAmount(u.totalExpenses)}</TableCell>
                            <TableCell>
                              <Button size="sm" variant="ghost" onClick={() => { setSelectedUser(u.userId); setActiveTab("overview"); }}>
                                View Details
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* Detailed view for selected user */
              selectedUserActivity && (
                <div className="space-y-4">
                  <Card className="border-primary/30">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <UserCheck className="h-5 w-5" />
                        {selectedUserActivity.userName}'s Activity Report
                      </CardTitle>
                      <CardDescription>
                        {dateFilter === "all" ? "All time" : dateRange ? `${format(dateRange.start, "MMM dd, yyyy")} — ${format(dateRange.end, "MMM dd, yyyy")}` : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="rounded-lg border p-4 text-center">
                          <p className="text-2xl font-bold">{selectedUserActivity.totalSales}</p>
                          <p className="text-sm text-muted-foreground">Completed Sales</p>
                        </div>
                        <div className="rounded-lg border p-4 text-center">
                          <p className="text-2xl font-bold text-success">{formatAmount(selectedUserActivity.totalRevenue)}</p>
                          <p className="text-sm text-muted-foreground">Revenue Generated</p>
                        </div>
                        <div className="rounded-lg border p-4 text-center">
                          <p className="text-2xl font-bold">{selectedUserActivity.totalStockMoves}</p>
                          <p className="text-sm text-muted-foreground">Stock Movements</p>
                        </div>
                        <div className="rounded-lg border p-4 text-center">
                          <p className="text-2xl font-bold text-destructive">{formatAmount(selectedUserActivity.totalExpenses)}</p>
                          <p className="text-sm text-muted-foreground">Expenses Recorded</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* User's transactions */}
                  <Card>
                    <CardHeader><CardTitle className="text-base">Sales by {selectedUserActivity.userName}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Txn #</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Payment</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedUserActivity.transactions.length === 0 ? (
                              <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No sales</TableCell></TableRow>
                            ) : selectedUserActivity.transactions.map((t) => (
                              <TableRow key={t.id}>
                                <TableCell className="whitespace-nowrap text-sm">{format(new Date(t.created_at), "MMM dd, HH:mm")}</TableCell>
                                <TableCell className="font-mono text-sm">{t.transaction_number || "—"}</TableCell>
                                <TableCell>{t.customers?.name || "Walk-in"}</TableCell>
                                <TableCell className="capitalize">{t.payment_method || "—"}</TableCell>
                                <TableCell><Badge variant={t.status === "completed" ? "default" : "secondary"} className="text-xs">{t.status}</Badge></TableCell>
                                <TableCell className="text-right font-medium">{formatAmount(t.total_amount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* User's stock movements */}
                  <Card>
                    <CardHeader><CardTitle className="text-base">Stock Movements by {selectedUserActivity.userName}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Product</TableHead>
                              <TableHead>Warehouse</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedUserActivity.stockMovements.length === 0 ? (
                              <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No stock movements</TableCell></TableRow>
                            ) : selectedUserActivity.stockMovements.map((s) => (
                              <TableRow key={s.id}>
                                <TableCell className="whitespace-nowrap text-sm">{format(new Date(s.created_at), "MMM dd, HH:mm")}</TableCell>
                                <TableCell>
                                  <Badge variant={s.movement_type === "in" ? "default" : "destructive"} className="text-xs capitalize">{s.movement_type}</Badge>
                                </TableCell>
                                <TableCell>{s.products?.name || "—"}</TableCell>
                                <TableCell>{s.warehouses?.name || "—"}</TableCell>
                                <TableCell className="text-right font-medium">{s.quantity}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
