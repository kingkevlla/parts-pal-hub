import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Upload, X, FileText, TrendingDown, DollarSign, Calendar, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { useDataTable } from "@/hooks/useDataTable";
import { DataTableSearch, DataTablePagination, DataTableBulkActions, SelectAllCheckbox } from "@/components/ui/data-table-controls";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  budget: number;
}

interface Expense {
  id: string;
  category_id: string | null;
  amount: number;
  description: string;
  vendor: string | null;
  expense_date: string;
  payment_method: string | null;
  receipt_url: string | null;
  status: string | null;
  is_recurring: boolean;
  recurring_frequency: string | null;
  notes: string | null;
  created_at: string;
  expense_categories?: { name: string } | null;
}

interface Budget {
  id: string;
  category_id: string | null;
  name: string;
  amount: number;
  period_start: string;
  period_end: string;
  expense_categories?: { name: string } | null;
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const { user } = useAuth();

  const expenseTable = useDataTable({
    data: expenses,
    searchFields: ['description', 'vendor', 'notes'] as (keyof Expense)[],
    defaultPageSize: 50,
  });

  // Calculate stats
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const pendingExpenses = expenses.filter(e => e.status === 'pending').length;
  const thisMonthExpenses = expenses.filter(e => {
    const expenseDate = new Date(e.expense_date);
    const now = new Date();
    return expenseDate.getMonth() === now.getMonth() && expenseDate.getFullYear() === now.getFullYear();
  }).reduce((sum, e) => sum + e.amount, 0);

  useEffect(() => {
    fetchExpenses();
    fetchCategories();
    fetchBudgets();
  }, []);

  const fetchExpenses = async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, expense_categories(name)')
      .order('expense_date', { ascending: false });
    if (!error) setExpenses(data || []);
  };

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .order('name');
    if (!error) setCategories(data || []);
  };

  const fetchBudgets = async () => {
    const { data, error } = await supabase
      .from('budgets')
      .select('*, expense_categories(name)')
      .order('period_start', { ascending: false });
    if (!error) setBudgets(data || []);
  };

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: 'Error', description: 'File must be less than 5MB', variant: 'destructive' });
        return;
      }
      setReceiptFile(file);
      setReceiptPreview(URL.createObjectURL(file));
    }
  };

  const uploadReceipt = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `receipts/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    const { error } = await supabase.storage.from('product-images').upload(fileName, file);
    if (error) return null;
    
    const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
    return publicUrl;
  };

  const handleExpenseSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      let receiptUrl = editingExpense?.receipt_url || null;

      if (receiptFile) {
        const uploadedUrl = await uploadReceipt(receiptFile);
        if (uploadedUrl) receiptUrl = uploadedUrl;
      }

      const expenseData = {
        category_id: formData.get('category_id') as string || null,
        amount: parseFloat(formData.get('amount') as string),
        description: formData.get('description') as string,
        vendor: formData.get('vendor') as string || null,
        expense_date: formData.get('expense_date') as string,
        payment_method: formData.get('payment_method') as string || null,
        receipt_url: receiptUrl,
        status: formData.get('status') as string || 'pending',
        is_recurring: formData.get('is_recurring') === 'on',
        recurring_frequency: formData.get('recurring_frequency') as string || null,
        notes: formData.get('notes') as string || null,
        created_by: user?.id,
      };

      if (editingExpense) {
        const { error } = await supabase.from('expenses').update(expenseData).eq('id', editingExpense.id);
        if (error) throw error;
        toast({ title: 'Success', description: 'Expense updated' });
      } else {
        const { error } = await supabase.from('expenses').insert(expenseData);
        if (error) throw error;
        toast({ title: 'Success', description: 'Expense created' });
      }

      setIsExpenseOpen(false);
      setEditingExpense(null);
      setReceiptFile(null);
      setReceiptPreview(null);
      fetchExpenses();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleCategorySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const categoryData = {
        name: formData.get('name') as string,
        description: formData.get('description') as string || null,
        budget: parseFloat(formData.get('budget') as string) || 0,
      };

      if (editingCategory) {
        const { error } = await supabase.from('expense_categories').update(categoryData).eq('id', editingCategory.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('expense_categories').insert(categoryData);
        if (error) throw error;
      }

      setIsCategoryOpen(false);
      setEditingCategory(null);
      fetchCategories();
      toast({ title: 'Success', description: `Category ${editingCategory ? 'updated' : 'created'}` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleBudgetSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const budgetData = {
        name: formData.get('name') as string,
        category_id: formData.get('category_id') as string || null,
        amount: parseFloat(formData.get('amount') as string),
        period_start: formData.get('period_start') as string,
        period_end: formData.get('period_end') as string,
      };

      const { error } = await supabase.from('budgets').insert(budgetData);
      if (error) throw error;

      setIsBudgetOpen(false);
      fetchBudgets();
      toast({ title: 'Success', description: 'Budget created' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleDeleteExpense = async () => {
    if (!deleteExpense) return;
    const { error } = await supabase.from('expenses').delete().eq('id', deleteExpense.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Expense deleted' });
      fetchExpenses();
    }
    setDeleteExpense(null);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(expenseTable.selectedIds);
    const { error } = await supabase.from('expenses').delete().in('id', ids);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: `${ids.length} expenses deleted` });
      expenseTable.clearSelection();
      fetchExpenses();
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-600">Approved</Badge>;
      case 'rejected': return <Badge variant="destructive">Rejected</Badge>;
      default: return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Expenses</h1>
          <p className="text-muted-foreground">Manage expenses, budgets and reports</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isCategoryOpen} onOpenChange={setIsCategoryOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="h-4 w-4 mr-2" />Category</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingCategory ? 'Edit' : 'Add'} Category</DialogTitle></DialogHeader>
              <form onSubmit={handleCategorySubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cat-name">Name *</Label>
                  <Input id="cat-name" name="name" required defaultValue={editingCategory?.name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cat-desc">Description</Label>
                  <Textarea id="cat-desc" name="description" defaultValue={editingCategory?.description || ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cat-budget">Default Budget</Label>
                  <Input id="cat-budget" name="budget" type="number" step="0.01" defaultValue={editingCategory?.budget || 0} />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Saving...' : 'Save Category'}</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isBudgetOpen} onOpenChange={setIsBudgetOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Calendar className="h-4 w-4 mr-2" />Budget</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Budget</DialogTitle></DialogHeader>
              <form onSubmit={handleBudgetSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="budget-name">Name *</Label>
                  <Input id="budget-name" name="name" required placeholder="Q1 2024 Budget" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget-category">Category</Label>
                  <Select name="category_id">
                    <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All categories</SelectItem>
                      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget-amount">Amount *</Label>
                  <Input id="budget-amount" name="amount" type="number" step="0.01" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="budget-start">Start Date *</Label>
                    <Input id="budget-start" name="period_start" type="date" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budget-end">End Date *</Label>
                    <Input id="budget-end" name="period_end" type="date" required />
                  </div>
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Creating...' : 'Create Budget'}</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isExpenseOpen} onOpenChange={(open) => {
            setIsExpenseOpen(open);
            if (!open) {
              setEditingExpense(null);
              setReceiptFile(null);
              setReceiptPreview(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Expense</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editingExpense ? 'Edit' : 'Add'} Expense</DialogTitle></DialogHeader>
              <form onSubmit={handleExpenseSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount *</Label>
                    <Input id="amount" name="amount" type="number" step="0.01" required defaultValue={editingExpense?.amount} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expense_date">Date *</Label>
                    <Input id="expense_date" name="expense_date" type="date" required defaultValue={editingExpense?.expense_date || format(new Date(), 'yyyy-MM-dd')} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Input id="description" name="description" required defaultValue={editingExpense?.description} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category_id">Category</Label>
                    <Select name="category_id" defaultValue={editingExpense?.category_id || ''}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendor">Vendor</Label>
                    <Input id="vendor" name="vendor" defaultValue={editingExpense?.vendor || ''} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="payment_method">Payment Method</Label>
                    <Select name="payment_method" defaultValue={editingExpense?.payment_method || ''}>
                      <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select name="status" defaultValue={editingExpense?.status || 'pending'}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Receipt Upload */}
                <div className="space-y-2">
                  <Label>Receipt (Optional)</Label>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleReceiptChange} className="hidden" id="receipt-file" />
                      <Button type="button" variant="outline" className="w-full gap-2" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="h-4 w-4" />{receiptFile ? 'Change Receipt' : 'Upload Receipt'}
                      </Button>
                    </div>
                    {(receiptPreview || editingExpense?.receipt_url) && (
                      <div className="relative">
                        <img src={receiptPreview || editingExpense?.receipt_url || ''} alt="Receipt" className="h-16 w-16 object-cover rounded-lg border" />
                        <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox id="is_recurring" name="is_recurring" defaultChecked={editingExpense?.is_recurring} />
                  <Label htmlFor="is_recurring">Recurring expense</Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" defaultValue={editingExpense?.notes || ''} />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Saving...' : 'Save Expense'}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(totalExpenses)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(thisMonthExpenses)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingExpenses}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="expenses">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
              <DataTableSearch value={expenseTable.searchTerm} onChange={expenseTable.setSearchTerm} placeholder="Search expenses..." />
              <DataTableBulkActions selectedCount={expenseTable.selectedIds.size} onDelete={handleBulkDelete} itemName="expenses" />
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="py-3 px-2 text-left">
                        <SelectAllCheckbox isAllSelected={expenseTable.isAllSelected} isSomeSelected={expenseTable.isSomeSelected} onToggle={expenseTable.selectAll} />
                      </th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Date</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Description</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Category</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Vendor</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Amount</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Status</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseTable.paginatedData.map((expense) => (
                      <tr key={expense.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-2">
                          <Checkbox checked={expenseTable.selectedIds.has(expense.id)} onCheckedChange={() => expenseTable.toggleSelect(expense.id)} />
                        </td>
                        <td className="py-3 px-2 text-sm">{format(new Date(expense.expense_date), 'MMM d, yyyy')}</td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            {expense.receipt_url && <Receipt className="h-4 w-4 text-muted-foreground" />}
                            <span className="font-medium">{expense.description}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2">{expense.expense_categories?.name || '-'}</td>
                        <td className="py-3 px-2 text-sm text-muted-foreground">{expense.vendor || '-'}</td>
                        <td className="py-3 px-2 font-medium">{formatAmount(expense.amount)}</td>
                        <td className="py-3 px-2">{getStatusBadge(expense.status)}</td>
                        <td className="py-3 px-2">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => { setEditingExpense(expense); setReceiptPreview(expense.receipt_url); setIsExpenseOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteExpense(expense)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DataTablePagination currentPage={expenseTable.currentPage} totalPages={expenseTable.totalPages} pageSize={expenseTable.pageSize} totalItems={expenseTable.totalItems} onPageChange={expenseTable.goToPage} onPageSizeChange={expenseTable.changePageSize} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budgets">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {budgets.map(budget => (
                  <Card key={budget.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{budget.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{budget.expense_categories?.name || 'All Categories'}</p>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatAmount(budget.amount)}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(budget.period_start), 'MMM d')} - {format(new Date(budget.period_end), 'MMM d, yyyy')}
                      </p>
                    </CardContent>
                  </Card>
                ))}
                {budgets.length === 0 && (
                  <div className="col-span-full text-center py-8 text-muted-foreground">No budgets created yet</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                {categories.map(cat => (
                  <Card key={cat.id} className="cursor-pointer hover:border-primary" onClick={() => { setEditingCategory(cat); setIsCategoryOpen(true); }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{cat.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">{cat.description || 'No description'}</p>
                      {cat.budget > 0 && <p className="text-sm font-medium mt-2">Budget: {formatAmount(cat.budget)}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteExpense} onOpenChange={(open) => !open && setDeleteExpense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this expense record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExpense}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
