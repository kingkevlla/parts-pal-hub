import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface Loan {
  id: string;
  borrower_name: string;
  borrower_phone: string;
  amount: number;
  amount_paid: number;
  interest_rate: number;
  status: string;
  due_date: string;
  created_at: string;
}

export default function Loans() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [deleteLoan, setDeleteLoan] = useState<Loan | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();

  useEffect(() => {
    fetchLoans();
  }, []);

  const fetchLoans = async () => {
    const { data, error } = await supabase
      .from('loans')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setLoans(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const loanData = {
      borrower_name: formData.get('borrower_name') as string,
      borrower_phone: formData.get('borrower_phone') as string,
      amount: parseFloat(formData.get('amount') as string),
      interest_rate: parseFloat(formData.get('interest_rate') as string) || 0,
      due_date: formData.get('due_date') as string,
      user_id: user?.id,
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

  const getStatusBadge = (status: string) => {
    const colors = {
      active: 'bg-blue-500',
      paid: 'bg-green-500',
      defaulted: 'bg-red-500',
    };
    return <Badge className={colors[status as keyof typeof colors]}>{status}</Badge>;
  };

  const getBalance = (loan: Loan) => {
    return loan.amount + (loan.amount * loan.interest_rate / 100) - loan.amount_paid;
  };

  return (
    <div className="space-y-6">
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
                <Label htmlFor="borrower_name">Borrower Name</Label>
                <Input id="borrower_name" name="borrower_name" required defaultValue={editingLoan?.borrower_name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="borrower_phone">Phone Number</Label>
                <Input id="borrower_phone" name="borrower_phone" defaultValue={editingLoan?.borrower_phone} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Loan Amount</Label>
                <Input id="amount" name="amount" type="number" step="0.01" required defaultValue={editingLoan?.amount} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interest_rate">Interest Rate (%)</Label>
                <Input id="interest_rate" name="interest_rate" type="number" step="0.01" defaultValue={editingLoan?.interest_rate || 0} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date</Label>
                <Input id="due_date" name="due_date" type="date" required defaultValue={editingLoan?.due_date} />
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
            <div className="text-2xl font-bold">{loans.filter(l => l.status === 'active').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatAmount(loans.filter(l => l.status === 'active').reduce((sum, l) => sum + getBalance(l), 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loans List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Borrower</TableHead>
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
              {loans.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell className="font-medium">{loan.borrower_name}</TableCell>
                  <TableCell>{loan.borrower_phone}</TableCell>
                  <TableCell>{formatAmount(loan.amount)}</TableCell>
                  <TableCell>{formatAmount(loan.amount_paid)}</TableCell>
                  <TableCell>{formatAmount(getBalance(loan))}</TableCell>
                  <TableCell>{new Date(loan.due_date).toLocaleDateString()}</TableCell>
                  <TableCell>{getStatusBadge(loan.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingLoan(loan); setIsOpen(true); }}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteLoan(loan)}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteLoan} onOpenChange={(open) => !open && setDeleteLoan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the loan for {deleteLoan?.borrower_name}. This action cannot be undone.
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
