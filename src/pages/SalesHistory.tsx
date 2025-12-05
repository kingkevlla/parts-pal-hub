import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ShoppingCart, DollarSign, TrendingUp, Calendar, Eye, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { useDataTable } from "@/hooks/useDataTable";
import { DataTableSearch, DataTablePagination, SelectAllCheckbox } from "@/components/ui/data-table-controls";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";

interface Transaction {
  id: string;
  transaction_number: string | null;
  total_amount: number;
  payment_method: string | null;
  status: string | null;
  customer_id: string | null;
  notes: string | null;
  created_at: string;
  customers?: { name: string; phone: string | null } | null;
}

interface TransactionItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  products?: { name: string; sku: string | null } | null;
}

export default function SalesHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [transactionItems, setTransactionItems] = useState<TransactionItem[]>([]);
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const { toast } = useToast();
  const { formatAmount } = useCurrency();

  const table = useDataTable({
    data: transactions,
    searchFields: ['transaction_number', 'payment_method', 'notes'] as (keyof Transaction)[],
    defaultPageSize: 50,
  });

  // Stats
  const totalSales = transactions.reduce((sum, t) => sum + (t.total_amount || 0), 0);
  const totalTransactions = transactions.length;
  const avgSale = totalTransactions > 0 ? totalSales / totalTransactions : 0;
  const todaySales = transactions.filter(t => {
    const date = new Date(t.created_at);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }).reduce((sum, t) => sum + (t.total_amount || 0), 0);

  useEffect(() => {
    fetchTransactions();
  }, [dateFilter, customStartDate, customEndDate]);

  const getDateRange = () => {
    const now = new Date();
    switch (dateFilter) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'yesterday':
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case 'this_week':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'this_month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'last_30_days':
        return { start: subDays(now, 30), end: now };
      case 'custom':
        if (customStartDate && customEndDate) {
          return { start: new Date(customStartDate), end: new Date(customEndDate + 'T23:59:59') };
        }
        return null;
      default:
        return null;
    }
  };

  const fetchTransactions = async () => {
    let query = supabase
      .from('transactions')
      .select('*, customers(name, phone)')
      .order('created_at', { ascending: false });

    const dateRange = getDateRange();
    if (dateRange) {
      query = query
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setTransactions(data || []);
    }
  };

  const fetchTransactionItems = async (transactionId: string) => {
    const { data, error } = await supabase
      .from('transaction_items')
      .select('*, products(name, sku)')
      .eq('transaction_id', transactionId);

    if (!error) setTransactionItems(data || []);
  };

  const handleViewDetails = async (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    await fetchTransactionItems(transaction.id);
  };

  const getPaymentBadge = (method: string | null) => {
    const methodLower = method?.toLowerCase() || '';
    if (methodLower.includes('cash')) return <Badge className="bg-green-600">Cash</Badge>;
    if (methodLower.includes('card')) return <Badge className="bg-blue-600">Card</Badge>;
    if (methodLower.includes('mobile')) return <Badge className="bg-purple-600">Mobile</Badge>;
    if (methodLower.includes('credit')) return <Badge className="bg-orange-500">Credit</Badge>;
    if (methodLower.includes('split')) return <Badge className="bg-pink-600">Split</Badge>;
    return <Badge variant="secondary">{method || 'Unknown'}</Badge>;
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'completed': return <Badge className="bg-green-600">Completed</Badge>;
      case 'pending': return <Badge className="bg-orange-500">Pending</Badge>;
      case 'refunded': return <Badge variant="destructive">Refunded</Badge>;
      case 'cancelled': return <Badge variant="secondary">Cancelled</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Sales History</h1>
          <p className="text-muted-foreground">View and analyze all sales transactions</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(totalSales)}</div>
            <p className="text-xs text-muted-foreground">{totalTransactions} transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(todaySales)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Average Sale</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(avgSale)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTransactions}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
          <DataTableSearch value={table.searchTerm} onChange={table.setSearchTerm} placeholder="Search transactions..." />
          <div className="flex gap-2 flex-wrap">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Date filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {dateFilter === 'custom' && (
              <>
                <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="w-[150px]" />
                <Input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="w-[150px]" />
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="py-3 px-2 text-left">
                    <SelectAllCheckbox isAllSelected={table.isAllSelected} isSomeSelected={table.isSomeSelected} onToggle={table.selectAll} />
                  </th>
                  <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Transaction #</th>
                  <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Date</th>
                  <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Customer</th>
                  <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Amount</th>
                  <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Payment</th>
                  <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {table.paginatedData.map((transaction) => (
                  <tr key={transaction.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-2">
                      <Checkbox checked={table.selectedIds.has(transaction.id)} onCheckedChange={() => table.toggleSelect(transaction.id)} />
                    </td>
                    <td className="py-3 px-2 font-mono text-sm">{transaction.transaction_number || '-'}</td>
                    <td className="py-3 px-2 text-sm">{format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}</td>
                    <td className="py-3 px-2">
                      {transaction.customers ? (
                        <div>
                          <p className="font-medium">{transaction.customers.name}</p>
                          {transaction.customers.phone && <p className="text-xs text-muted-foreground">{transaction.customers.phone}</p>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Walk-in</span>
                      )}
                    </td>
                    <td className="py-3 px-2 font-bold">{formatAmount(transaction.total_amount)}</td>
                    <td className="py-3 px-2">{getPaymentBadge(transaction.payment_method)}</td>
                    <td className="py-3 px-2">{getStatusBadge(transaction.status)}</td>
                    <td className="py-3 px-2">
                      <Button variant="ghost" size="sm" onClick={() => handleViewDetails(transaction)}>
                        <Eye className="h-4 w-4 mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DataTablePagination currentPage={table.currentPage} totalPages={table.totalPages} pageSize={table.pageSize} totalItems={table.totalItems} onPageChange={table.goToPage} onPageSizeChange={table.changePageSize} />
        </CardContent>
      </Card>

      {/* Transaction Details Dialog */}
      <Dialog open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Transaction Details
            </DialogTitle>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Transaction #</p>
                  <p className="font-mono font-medium">{selectedTransaction.transaction_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{format(new Date(selectedTransaction.created_at), 'MMM d, yyyy h:mm a')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedTransaction.customers?.name || 'Walk-in'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment Method</p>
                  <p className="font-medium">{selectedTransaction.payment_method}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Items</h4>
                <div className="space-y-2">
                  {transactionItems.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-sm">
                      <div>
                        <p className="font-medium">{item.products?.name}</p>
                        <p className="text-muted-foreground">{item.quantity} × {formatAmount(item.unit_price)}</p>
                      </div>
                      <p className="font-medium">{formatAmount(item.total_price)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{formatAmount(selectedTransaction.total_amount)}</span>
              </div>

              {selectedTransaction.notes && (
                <div className="border-t pt-4">
                  <p className="text-muted-foreground text-sm">Notes</p>
                  <p className="text-sm">{selectedTransaction.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
