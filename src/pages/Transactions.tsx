import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, DollarSign, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrency } from '@/hooks/useCurrency';
import { Checkbox } from '@/components/ui/checkbox';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTableSearch, DataTablePagination, SelectAllCheckbox } from '@/components/ui/data-table-controls';

interface Transaction {
  id: string;
  transaction_number: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  payment_method: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const { toast } = useToast();
  const { formatAmount } = useCurrency();

  const table = useDataTable({
    data: transactions,
    searchFields: ['transaction_number', 'payment_method', 'status'] as (keyof Transaction)[],
    defaultPageSize: 100,
  });

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setTransactions(data || []);
    }
  };

  const getTotalSales = () => {
    return transactions
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + (t.total_amount || 0), 0);
  };

  const getTotalTax = () => {
    return transactions.reduce((sum, t) => sum + (t.tax_amount || 0), 0);
  };

  const getTotalDiscount = () => {
    return transactions.reduce((sum, t) => sum + (t.discount_amount || 0), 0);
  };

  const getStatusBadge = (status: string | null) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-500',
      pending: 'bg-yellow-500',
      cancelled: 'bg-red-500',
      refunded: 'bg-gray-500',
    };
    return <Badge className={colors[status || 'pending'] || 'bg-gray-500'}>{status || 'pending'}</Badge>;
  };

  const getPaymentBadge = (method: string | null) => {
    const colors: Record<string, string> = {
      cash: 'bg-green-500',
      card: 'bg-blue-500',
      transfer: 'bg-purple-500',
    };
    return <Badge variant="outline" className={colors[method || 'cash']}>{method || 'cash'}</Badge>;
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Transactions</h1>
        <p className="text-muted-foreground">View all sales transactions</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{formatAmount(getTotalSales())}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tax Collected</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(getTotalTax())}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Discounts</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{formatAmount(getTotalDiscount())}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center mt-4">
            <DataTableSearch
              value={table.searchTerm}
              onChange={table.setSearchTerm}
              placeholder="Search by transaction #, payment method, or status..."
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <SelectAllCheckbox
                    isAllSelected={table.isAllSelected}
                    isSomeSelected={table.isSomeSelected}
                    onToggle={table.selectAll}
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Transaction #</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.paginatedData.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>
                    <Checkbox
                      checked={table.selectedIds.has(transaction.id)}
                      onCheckedChange={() => table.toggleSelect(transaction.id)}
                    />
                  </TableCell>
                  <TableCell>{new Date(transaction.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{transaction.transaction_number || '-'}</TableCell>
                  <TableCell>{getPaymentBadge(transaction.payment_method)}</TableCell>
                  <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatAmount(transaction.total_amount || 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DataTablePagination
            currentPage={table.currentPage}
            totalPages={table.totalPages}
            pageSize={table.pageSize}
            totalItems={table.totalItems}
            onPageChange={table.goToPage}
            onPageSizeChange={table.changePageSize}
          />
        </CardContent>
      </Card>
    </div>
  );
}
