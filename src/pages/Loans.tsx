import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTableSearch, DataTablePagination, DataTableBulkActions, SelectAllCheckbox } from '@/components/ui/data-table-controls';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

interface Loan {
  id: string;
  customer_id: string | null;
  amount: number;
  paid_amount: number;
  status: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  customer?: Customer | null;
  customer_name?: string;
}

export default function Loans() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [deleteLoan, setDeleteLoan] = useState<Loan | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();

  const table = useDataTable({
    data: loans,
    searchFields: ['customer_name', 'status', 'notes'] as (keyof Loan)[],
    defaultPageSize: 100,
  });

  useEffect(() => {
    fetchLoans();
    fetchCustomers();
  }, []);

  const fetchLoans = async () => {
    const { data, error } = await supabase
      .from('loans')
      .select('*, customers(id, name, phone)')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      const formattedLoans: Loan[] = (data || []).map(loan => ({
        id: loan.id,
        customer_id: loan.customer_id,
        amount: loan.amount,
        paid_amount: loan.paid_amount || 0,
        status: loan.status || 'pending',
        due_date: loan.due_date,
        notes: loan.notes,
        created_at: loan.created_at || '',
        customer: loan.customers as Customer | null,
        customer_name: (loan.customers as Customer | null)?.name || 'Unknown'
      }));
      setLoans(formattedLoans);
    }
  };

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone')
      .order('name');

    if (!error) setCustomers(data || []);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    
    const loanData = {
      customer_id: formData.get('customer_id') as string || null,
      amount: parseFloat(formData.get('amount') as string),
      due_date: formData.get('due_date') as string || null,
      notes: formData.get('notes') as string || null,
      created_by: user?.id,
    };

    let error;
    if (editingLoan) {
      const result = await supabase.from('loans').update(loanData).eq('id', editingLoan.id);
      error = result.error;
    } else {
      const result = await supabase.from('loans').insert(loanData);
      error = result.error;
    }

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: `Loan ${editingLoan ? 'updated' : 'created'} successfully` });
      setIsOpen(false);
      setEditingLoan(null);
      fetchLoans();
    }

    setIsLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteLoan) return;

    const { error } = await supabase.from('loans').delete().eq('id', deleteLoan.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Loan deleted successfully' });
      fetchLoans();
    }
    setDeleteLoan(null);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(table.selectedIds);
    const { error } = await supabase.from('loans').delete().in('id', ids);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: `${ids.length} loans deleted successfully` });
      table.clearSelection();
      fetchLoans();
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-blue-500',
      pending: 'bg-yellow-500',
      paid: 'bg-green-500',
      defaulted: 'bg-red-500',
    };
    return <Badge className={colors[status] || 'bg-gray-500'}>{status}</Badge>;
  };

  const getBalance = (loan: Loan) => {
    return loan.amount - loan.paid_amount;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Loan Management</h1>
          <p className="text-muted-foreground">Track loans and payments</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setEditingLoan(null); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Loan
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingLoan ? 'Edit Loan' : 'Create New Loan'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer_id">Customer</Label>
                <Select name="customer_id" defaultValue={editingLoan?.customer_id || undefined}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} {customer.phone && `(${customer.phone})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Loan Amount</Label>
                <Input id="amount" name="amount" type="number" step="0.01" required defaultValue={editingLoan?.amount} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date</Label>
                <Input id="due_date" name="due_date" type="date" defaultValue={editingLoan?.due_date || ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" defaultValue={editingLoan?.notes || ''} />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Saving...' : editingLoan ? 'Update Loan' : 'Create Loan'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Loans</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(loans.reduce((sum, l) => sum + l.amount, 0))}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Loans</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loans.filter(l => l.status === 'active' || l.status === 'pending').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatAmount(loans.filter(l => l.status !== 'paid').reduce((sum, l) => sum + getBalance(l), 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loans List</CardTitle>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center mt-4">
            <DataTableSearch
              value={table.searchTerm}
              onChange={table.setSearchTerm}
              placeholder="Search by customer, status, or notes..."
            />
          </div>
          <DataTableBulkActions
            selectedCount={table.selectedIds.size}
            onDelete={handleBulkDelete}
            itemName="loans"
          />
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
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No loans found
                  </TableCell>
                </TableRow>
              ) : (
                table.paginatedData.map((loan) => (
                  <TableRow key={loan.id}>
                    <TableCell>
                      <Checkbox
                        checked={table.selectedIds.has(loan.id)}
                        onCheckedChange={() => table.toggleSelect(loan.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{loan.customer?.name || 'Unknown'}</TableCell>
                    <TableCell>{loan.customer?.phone || 'N/A'}</TableCell>
                    <TableCell>{formatAmount(loan.amount)}</TableCell>
                    <TableCell>{formatAmount(loan.paid_amount)}</TableCell>
                    <TableCell>{formatAmount(getBalance(loan))}</TableCell>
                    <TableCell>{loan.due_date ? new Date(loan.due_date).toLocaleDateString() : 'N/A'}</TableCell>
                    <TableCell>{getStatusBadge(loan.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setEditingLoan(loan); setIsOpen(true); }}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteLoan(loan)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
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

      <AlertDialog open={!!deleteLoan} onOpenChange={(open) => !open && setDeleteLoan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the loan for {deleteLoan?.customer?.name || 'this customer'}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
