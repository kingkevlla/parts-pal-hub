import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Trash2, AlertTriangle, Minus, Plus, Package, CreditCard, Banknote, Smartphone, Building2, X, Split, Wallet, Calendar, CheckCircle, UserPlus, Percent, ClipboardList } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import Receipt from '@/components/pos/Receipt';
import POSHeader from '@/components/pos/POSHeader';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BarcodeScanner } from '@/components/inventory/BarcodeScanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, addDays } from 'date-fns';
import PendingBills from '@/components/pos/PendingBills';

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface Warehouse {
  id: string;
  name: string;
  location: string | null;
}

interface ProductWithStock {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  selling_price: number;
  min_stock_level: number | null;
  image_url: string | null;
  stock?: number;
}

interface SplitPayment {
  method: string;
  amount: number;
}

interface Loan {
  id: string;
  amount: number;
  paid_amount: number | null;
  due_date: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  customers: { name: string; phone: string | null } | null;
}

interface LoanPayment {
  id: string;
  loan_id: string;
  amount: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

// Fuzzy search function
const fuzzySearch = (text: string, query: string): boolean => {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  // Direct includes
  if (textLower.includes(queryLower)) return true;
  
  // Fuzzy match - check if all characters appear in order
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === queryLower.length;
};

export default function POS() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSaleData, setLastSaleData] = useState<any>(null);
  const [showSplitPayment, setShowSplitPayment] = useState(false);
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([]);
  const [newSplitMethod, setNewSplitMethod] = useState('cash');
  const [newSplitAmount, setNewSplitAmount] = useState('');
  const [activeTab, setActiveTab] = useState('sales');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanSearchQuery, setLoanSearchQuery] = useState('');
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [loanPaymentAmount, setLoanPaymentAmount] = useState('');
  const [loanPaymentMethod, setLoanPaymentMethod] = useState('cash');
  const [loanPayments, setLoanPayments] = useState<LoanPayment[]>([]);
  // Credit sale state
  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [creditDueDays, setCreditDueDays] = useState('30');
  const [creditInterestRate, setCreditInterestRate] = useState('0');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  // Quick customer creation
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  // Pending bill tracking
  const [activePendingBillId, setActivePendingBillId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { settings } = useSystemSettings();

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: Banknote },
    { value: 'card', label: 'Card', icon: CreditCard },
    { value: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
    { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2 },
    { value: 'credit', label: 'Credit', icon: Wallet },
  ];

  useEffect(() => {
    fetchWarehouses();
    fetchLoans();
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchProductsWithStock();
  }, [selectedWarehouse]);

  const fetchProductsWithStock = async () => {
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id, name, sku, barcode, selling_price, min_stock_level, image_url')
      .eq('is_active', true)
      .order('name');
    
    if (productsError) return;

    let inventoryQuery = supabase.from('inventory').select('product_id, quantity');
    if (selectedWarehouse !== 'all') {
      inventoryQuery = inventoryQuery.eq('warehouse_id', selectedWarehouse);
    }
    const { data: inventoryData } = await inventoryQuery;

    const stockMap = new Map<string, number>();
    (inventoryData || []).forEach(i => {
      stockMap.set(i.product_id, (stockMap.get(i.product_id) || 0) + (i.quantity || 0));
    });
    
    const productsWithStock = (productsData || []).map(p => ({
      ...p,
      stock: stockMap.get(p.id) || 0
    }));

    setProducts(productsWithStock);
  };

  const fetchWarehouses = async () => {
    const { data, error } = await supabase.from('warehouses').select('*').eq('is_active', true).order('name');
    if (!error) {
      setWarehouses(data || []);
    }
  };

  const fetchLoans = async () => {
    const { data, error } = await supabase
      .from('loans')
      .select('*, customers(name, phone)')
      .in('status', ['pending', 'partial'])
      .order('due_date', { ascending: true });
    if (!error) setLoans(data || []);
  };

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone')
      .order('name');
    if (!error) setCustomers(data || []);
  };

  const fetchLoanPayments = async (loanId: string) => {
    const { data, error } = await supabase
      .from('loan_payments')
      .select('*')
      .eq('loan_id', loanId)
      .order('created_at', { ascending: false });
    if (!error) setLoanPayments(data || []);
  };

  const createQuickCustomer = async () => {
    if (!newCustomerName.trim()) {
      toast({ title: 'Error', description: 'Customer name is required', variant: 'destructive' });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      setCustomers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCustomerId(data.id);
      setShowNewCustomerForm(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      toast({ title: 'Success', description: `Customer "${data.name}" created` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleBarcodeProduct = (product: any) => {
    const productWithStock = products.find(p => p.id === product.id);
    if (productWithStock) {
      addToCart(productWithStock);
    } else {
      // Product not in current warehouse inventory
      toast({ 
        title: 'Product Found', 
        description: `${product.name} - Not available in selected warehouse`,
        variant: 'destructive'
      });
    }
  };

  const processLoanPayment = async () => {
    if (!selectedLoan) return;
    
    const amount = parseFloat(loanPaymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Error', description: 'Enter a valid payment amount', variant: 'destructive' });
      return;
    }

    const remaining = selectedLoan.amount - (selectedLoan.paid_amount || 0);
    if (amount > remaining) {
      toast({ title: 'Error', description: `Maximum payable: ${formatAmount(remaining)}`, variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const newPaidAmount = (selectedLoan.paid_amount || 0) + amount;
      const newStatus = newPaidAmount >= selectedLoan.amount ? 'paid' : 'partial';

      // Create loan payment record
      const { error: paymentError } = await supabase
        .from('loan_payments')
        .insert({
          loan_id: selectedLoan.id,
          amount,
          payment_method: loanPaymentMethod,
          notes: `Payment via POS`,
          created_by: user?.id,
        });

      if (paymentError) throw paymentError;

      // Update loan
      const { error } = await supabase
        .from('loans')
        .update({ 
          paid_amount: newPaidAmount, 
          status: newStatus,
        })
        .eq('id', selectedLoan.id);

      if (error) throw error;

      toast({ 
        title: 'Payment Successful', 
        description: newStatus === 'paid' ? 'Loan fully paid!' : `${formatAmount(amount)} paid. Remaining: ${formatAmount(selectedLoan.amount - newPaidAmount)}`
      });

      // Refresh payment history
      fetchLoanPayments(selectedLoan.id);
      setLoanPaymentAmount('');
      fetchLoans();
      
      // Update selected loan state
      setSelectedLoan(prev => prev ? { ...prev, paid_amount: newPaidAmount, status: newStatus } : null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectLoan = (loan: Loan) => {
    setSelectedLoan(loan);
    setLoanPaymentAmount((loan.amount - (loan.paid_amount || 0)).toString());
    fetchLoanPayments(loan.id);
  };

  const getStockStatus = (product: ProductWithStock) => {
    const stock = product.stock || 0;
    const minStock = product.min_stock_level || settings.low_stock_threshold;
    if (stock === 0) return 'out';
    if (stock <= minStock) return 'low';
    return 'ok';
  };

  const addToCart = (product: ProductWithStock, qty: number = 1) => {

    const currentCartQty = cart.find(i => i.productId === product.id)?.quantity || 0;
    const totalQty = currentCartQty + qty;
    const availableStock = product.stock || 0;

    if (availableStock < totalQty) {
      toast({ 
        title: 'Insufficient Stock', 
        description: `Available: ${availableStock}`, 
        variant: 'destructive' 
      });
      return;
    }

    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => 
          i.productId === product.id 
            ? { ...i, quantity: totalQty, subtotal: totalQty * i.price }
            : i
        );
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        quantity: qty,
        price: product.selling_price,
        subtotal: product.selling_price * qty,
      }];
    });
  };

  const updateCartQuantity = (productId: string, newQty: number) => {
    if (newQty < 1) {
      removeFromCart(productId);
      return;
    }

    const product = products.find(p => p.id === productId);
    if (!product) return;

    const availableStock = product.stock || 0;
    if (newQty > availableStock) {
      toast({ 
        title: 'Insufficient Stock', 
        description: `Maximum available: ${availableStock}`, 
        variant: 'destructive' 
      });
      return;
    }

    setCart(prev => prev.map(item => 
      item.productId === productId 
        ? { ...item, quantity: newQty, subtotal: newQty * item.price }
        : item
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.productId !== productId));
  };

  const getTotalAmount = () => cart.reduce((sum, item) => sum + item.subtotal, 0);

  const getSplitTotal = () => splitPayments.reduce((sum, p) => sum + p.amount, 0);
  const getRemainingAmount = () => getTotalAmount() - getSplitTotal();

  const addSplitPayment = () => {
    const amount = parseFloat(newSplitAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Error', description: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (amount > getRemainingAmount()) {
      toast({ title: 'Error', description: 'Amount exceeds remaining balance', variant: 'destructive' });
      return;
    }
    setSplitPayments(prev => [...prev, { method: newSplitMethod, amount }]);
    setNewSplitAmount('');
  };

  const removeSplitPayment = (index: number) => {
    setSplitPayments(prev => prev.filter((_, i) => i !== index));
  };

  const processSale = async (useSplit: boolean = false) => {
    if (cart.length === 0) {
      toast({ title: 'Error', description: 'Cart is empty', variant: 'destructive' });
      return;
    }

    if (!selectedWarehouse || selectedWarehouse === 'all') {
      toast({ title: 'Error', description: 'Please select a specific warehouse before checkout', variant: 'destructive' });
      return;
    }

    if (useSplit && getRemainingAmount() > 0.01) {
      toast({ title: 'Error', description: 'Split payments must cover full amount', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);

    try {
      const transactionNumber = `TXN-${Date.now()}`;
      const finalPaymentMethod = useSplit 
        ? `Split: ${splitPayments.map(p => `${p.method}(${formatAmount(p.amount)})`).join(', ')}`
        : paymentMethod;

      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert({
          transaction_number: transactionNumber,
          total_amount: getTotalAmount(),
          payment_method: finalPaymentMethod,
          status: 'completed',
          notes: customerName ? `Customer: ${customerName}` : null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      const transactionItems = cart.map(item => ({
        transaction_id: transaction.id,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.subtotal,
      }));

      const { error: itemsError } = await supabase.from('transaction_items').insert(transactionItems);
      if (itemsError) throw itemsError;

      const stockMovements = cart.map(item => ({
        product_id: item.productId,
        warehouse_id: selectedWarehouse,
        quantity: item.quantity,
        movement_type: 'out',
        reference_number: transactionNumber,
        notes: `POS Sale to ${customerName || 'Walk-in customer'}`,
        created_by: user?.id,
      }));

      const { error: movementError } = await supabase.from('stock_movements').insert(stockMovements);
      if (movementError) throw movementError;

      setLastSaleData({
        id: transaction.id,
        items: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          subtotal: item.subtotal,
        })),
        total_amount: getTotalAmount(),
        payment_method: finalPaymentMethod,
        customer_name: customerName,
        customer_phone: customerPhone,
        sale_date: new Date().toISOString(),
      });

      setShowReceipt(true);
      setShowSplitPayment(false);
      setSplitPayments([]);
      toast({ title: 'Success', description: 'Sale completed successfully' });

      // Close pending bill if this sale was loaded from one
      if (activePendingBillId) {
        await supabase.from('pending_bills').update({ status: 'closed' }).eq('id', activePendingBillId);
        setActivePendingBillId(null);
      }

      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setPaymentMethod('cash');
      fetchProductsWithStock();

    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const processCreditSale = async () => {
    if (cart.length === 0) {
      toast({ title: 'Error', description: 'Cart is empty', variant: 'destructive' });
      return;
    }

    if (!selectedCustomerId) {
      toast({ title: 'Error', description: 'Please select a customer for credit sale', variant: 'destructive' });
      return;
    }

    if (!selectedWarehouse || selectedWarehouse === 'all') {
      toast({ title: 'Error', description: 'Please select a specific warehouse before checkout', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);

    try {
      const transactionNumber = `TXN-${Date.now()}`;
      const baseAmount = getTotalAmount();
      const interestRate = parseFloat(creditInterestRate) || 0;
      const dueDays = parseInt(creditDueDays) || 30;
      const interestAmount = baseAmount * (interestRate / 100);
      const totalLoanAmount = baseAmount + interestAmount;
      const dueDate = addDays(new Date(), dueDays);
      const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

      // Create transaction
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert({
          transaction_number: transactionNumber,
          total_amount: baseAmount,
          payment_method: 'credit',
          status: 'completed',
          customer_id: selectedCustomerId,
          notes: `Credit Sale - Loan Amount: ${formatAmount(totalLoanAmount)} (includes ${interestRate}% interest)`,
          created_by: user?.id,
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      // Create transaction items
      const transactionItems = cart.map(item => ({
        transaction_id: transaction.id,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.subtotal,
      }));

      const { error: itemsError } = await supabase.from('transaction_items').insert(transactionItems);
      if (itemsError) throw itemsError;

      // Create stock movements
      const stockMovements = cart.map(item => ({
        product_id: item.productId,
        warehouse_id: selectedWarehouse,
        quantity: item.quantity,
        movement_type: 'out',
        reference_number: transactionNumber,
        notes: `Credit Sale to ${selectedCustomer?.name || 'Customer'}`,
        created_by: user?.id,
      }));

      const { error: movementError } = await supabase.from('stock_movements').insert(stockMovements);
      if (movementError) throw movementError;

      // Create loan record
      const { error: loanError } = await supabase.from('loans').insert({
        customer_id: selectedCustomerId,
        amount: totalLoanAmount,
        paid_amount: 0,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        status: 'pending',
        notes: `Credit sale - TXN: ${transactionNumber}\nBase: ${formatAmount(baseAmount)}, Interest: ${interestRate}%`,
        created_by: user?.id,
      });

      if (loanError) throw loanError;

      setLastSaleData({
        id: transaction.id,
        items: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          subtotal: item.subtotal,
        })),
        total_amount: baseAmount,
        payment_method: `Credit (Due: ${format(dueDate, 'PP')})`,
        customer_name: selectedCustomer?.name,
        customer_phone: selectedCustomer?.phone,
        sale_date: new Date().toISOString(),
      });

      setShowReceipt(true);
      setShowCreditDialog(false);
      toast({ 
        title: 'Credit Sale Completed', 
        description: `Loan of ${formatAmount(totalLoanAmount)} created for ${selectedCustomer?.name}` 
      });

      // Close pending bill if loaded from one
      if (activePendingBillId) {
        await supabase.from('pending_bills').update({ status: 'closed' }).eq('id', activePendingBillId);
        setActivePendingBillId(null);
      }

      // Reset state
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setPaymentMethod('cash');
      setSelectedCustomerId('');
      setCreditDueDays('30');
      setCreditInterestRate('0');
      fetchProductsWithStock();
      fetchLoans();

    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayNow = () => {
    if (paymentMethod === 'credit') {
      setShowCreditDialog(true);
    } else {
      processSale(false);
    }
  };

  const filteredProducts = products.filter(p =>
    fuzzySearch(p.name, searchQuery) ||
    (p.sku && fuzzySearch(p.sku, searchQuery)) ||
    (p.barcode && fuzzySearch(p.barcode, searchQuery))
  );

  const filteredLoans = loans.filter(l => 
    (l.customers?.name && fuzzySearch(l.customers.name, loanSearchQuery)) ||
    (l.customers?.phone && fuzzySearch(l.customers.phone, loanSearchQuery))
  );

  const handleRefresh = () => {
    fetchProductsWithStock();
    fetchWarehouses();
    fetchLoans();
    toast({ title: 'Refreshed', description: 'Data updated' });
  };

  return (
    <div className="h-screen flex flex-col bg-muted/30">
      <POSHeader 
        cartItemCount={cart.length}
        cartTotal={getTotalAmount()}
        onRefresh={handleRefresh}
      />

      <div className="flex-1 overflow-hidden p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="mb-4 w-fit">
            <TabsTrigger value="sales" className="gap-2">
              <Package className="h-4 w-4" /> Sales
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              <ClipboardList className="h-4 w-4" /> Pending Bills
            </TabsTrigger>
            <TabsTrigger value="loans" className="gap-2">
              <Wallet className="h-4 w-4" /> Loan Payments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="flex-1 overflow-hidden mt-0">
            <div className="grid gap-4 lg:grid-cols-3 h-full">
              {/* Products Grid */}
              <Card className="lg:col-span-2 flex flex-col overflow-hidden">
                <CardContent className="p-4 flex flex-col flex-1 overflow-hidden">
                  <div className="flex gap-3 mb-4">
                    <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select Warehouse" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Warehouses</SelectItem>
                        {warehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Search by name, SKU, or barcode..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1"
                      autoFocus
                    />
                    <BarcodeScanner onProductFound={handleBarcodeProduct} />
                  </div>

              <ScrollArea className="flex-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filteredProducts.map(product => {
                    const stockStatus = getStockStatus(product);
                    return (
                      <button
                        key={product.id}
                        type="button"
                        disabled={stockStatus === 'out'}
                        className="group relative bg-card border rounded-lg p-2 text-left hover:border-primary hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => addToCart(product)}
                      >
                        <div className="aspect-square rounded-md bg-muted mb-2 overflow-hidden flex items-center justify-center">
                          {product.image_url ? (
                            <img 
                              src={product.image_url} 
                              alt={product.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <Package className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-sm line-clamp-2 leading-tight">{product.name}</p>
                          <p className="text-primary font-semibold text-sm">{formatAmount(product.selling_price)}</p>
                        </div>
                        <Badge 
                          className={`absolute top-1 right-1 text-xs ${
                            stockStatus === 'out' ? 'bg-destructive' : 
                            stockStatus === 'low' ? 'bg-orange-500' : 'bg-green-600'
                          }`}
                        >
                          {product.stock}
                        </Badge>
                        {stockStatus === 'low' && (
                          <AlertTriangle className="absolute top-1 left-1 h-4 w-4 text-orange-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Cart & Checkout */}
          <Card className="flex flex-col overflow-hidden">
            <CardContent className="p-4 flex flex-col flex-1 overflow-hidden">
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Input 
                  value={customerName} 
                  onChange={(e) => setCustomerName(e.target.value)} 
                  placeholder="Customer name" 
                  className="h-9"
                />
                <Input 
                  value={customerPhone} 
                  onChange={(e) => setCustomerPhone(e.target.value)} 
                  placeholder="Phone" 
                  className="h-9"
                />
              </div>

              <ScrollArea className="flex-1 -mx-4 px-4">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                    <Package className="h-10 w-10 mb-2 opacity-50" />
                    <p className="text-sm">Cart is empty</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cart.map((item) => (
                      <div key={item.productId} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{formatAmount(item.price)} each</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-7 w-7"
                            onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateCartQuantity(item.productId, parseInt(e.target.value) || 1)}
                            className="w-12 h-7 text-center text-sm"
                          />
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-7 w-7"
                            onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="text-right w-20">
                          <p className="font-medium text-sm">{formatAmount(item.subtotal)}</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeFromCart(item.productId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="border-t pt-3 mt-3 space-y-3">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>{formatAmount(getTotalAmount())}</span>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Payment Method</Label>
                  <div className="grid grid-cols-5 gap-1">
                    {paymentMethods.map(pm => (
                      <Button
                        key={pm.value}
                        variant={paymentMethod === pm.value ? 'default' : 'outline'}
                        size="sm"
                        className="h-9 text-xs flex-col gap-0.5 px-1"
                        onClick={() => setPaymentMethod(pm.value)}
                      >
                        <pm.icon className="h-4 w-4" />
                        <span className="truncate">{pm.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowSplitPayment(true)} 
                    disabled={cart.length === 0}
                    className="gap-1"
                  >
                    <Split className="h-4 w-4" />
                    Split Pay
                  </Button>
                  <Button 
                    onClick={handlePayNow} 
                    disabled={isProcessing || cart.length === 0}
                  >
                    {isProcessing ? 'Processing...' : paymentMethod === 'credit' ? 'Credit Sale' : 'Pay Now'}
                  </Button>
                </div>
              </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Pending Bills Tab */}
        <TabsContent value="pending" className="flex-1 overflow-hidden mt-0">
          <PendingBills
            selectedWarehouse={selectedWarehouse}
            cart={cart}
            onLoadBill={(items, billId, name, phone, warehouseId) => {
              setCart(items);
              setCustomerName(name);
              setCustomerPhone(phone);
              setActivePendingBillId(billId);
              setSelectedWarehouse(warehouseId);
              setActiveTab('sales');
            }}
            onBillSaved={() => {
              setCart([]);
              setCustomerName('');
              setCustomerPhone('');
            }}
          />
        </TabsContent>

        {/* Loan Payments Tab */}
        <TabsContent value="loans" className="flex-1 overflow-hidden mt-0">
          <div className="grid gap-4 lg:grid-cols-2 h-full">
            {/* Loans List */}
            <Card className="flex flex-col overflow-hidden">
              <CardContent className="p-4 flex flex-col flex-1 overflow-hidden">
                <div className="mb-4">
                  <Input
                    placeholder="Search by customer name or phone..."
                    value={loanSearchQuery}
                    onChange={(e) => setLoanSearchQuery(e.target.value)}
                  />
                </div>
                <ScrollArea className="flex-1">
                  {filteredLoans.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                      <Wallet className="h-10 w-10 mb-2 opacity-50" />
                      <p className="text-sm">No pending loans</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredLoans.map((loan) => {
                        const remaining = loan.amount - (loan.paid_amount || 0);
                        const isOverdue = loan.due_date && new Date(loan.due_date) < new Date();
                        return (
                          <button
                            key={loan.id}
                            type="button"
                            className={`w-full text-left p-3 rounded-lg border transition-all ${
                              selectedLoan?.id === loan.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                            }`}
                            onClick={() => handleSelectLoan(loan)}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-medium">{loan.customers?.name || 'Unknown'}</span>
                              <Badge variant={isOverdue ? 'destructive' : loan.status === 'partial' ? 'secondary' : 'outline'}>
                                {isOverdue ? 'Overdue' : loan.status}
                              </Badge>
                            </div>
                            {loan.customers?.phone && (
                              <p className="text-xs text-muted-foreground">{loan.customers.phone}</p>
                            )}
                            <div className="flex justify-between mt-2 text-sm">
                              <span>Remaining:</span>
                              <span className="font-semibold text-destructive">{formatAmount(remaining)}</span>
                            </div>
                            {loan.due_date && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                Due: {format(new Date(loan.due_date), 'PP')}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Loan Payment Form */}
            <Card className="flex flex-col">
              <CardContent className="p-4 flex flex-col flex-1">
                {selectedLoan ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <h3 className="font-semibold text-lg mb-2">{selectedLoan.customers?.name}</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Total Loan:</span>
                          <p className="font-medium">{formatAmount(selectedLoan.amount)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Paid:</span>
                          <p className="font-medium text-green-600">{formatAmount(selectedLoan.paid_amount || 0)}</p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Remaining:</span>
                          <p className="font-semibold text-lg text-destructive">
                            {formatAmount(selectedLoan.amount - (selectedLoan.paid_amount || 0))}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Payment Amount</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount"
                        value={loanPaymentAmount}
                        onChange={(e) => setLoanPaymentAmount(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Payment Method</Label>
                      <div className="grid grid-cols-4 gap-2">
                        {paymentMethods.filter(pm => pm.value !== 'credit').map(pm => (
                          <Button
                            key={pm.value}
                            variant={loanPaymentMethod === pm.value ? 'default' : 'outline'}
                            size="sm"
                            className="h-10 text-xs flex-col gap-0.5"
                            onClick={() => setLoanPaymentMethod(pm.value)}
                          >
                            <pm.icon className="h-4 w-4" />
                            <span>{pm.label}</span>
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Payment History */}
                    {loanPayments.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm">Payment History</Label>
                        <ScrollArea className="h-32 border rounded-lg">
                          <div className="p-2 space-y-2">
                            {loanPayments.map(payment => (
                              <div key={payment.id} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded">
                                <div>
                                  <p className="font-medium text-green-600">+{formatAmount(payment.amount)}</p>
                                  <p className="text-xs text-muted-foreground capitalize">
                                    {payment.payment_method.replace('_', ' ')}
                                  </p>
                                </div>
                                <div className="text-right text-xs text-muted-foreground">
                                  {format(new Date(payment.created_at), 'PP')}
                                  <br />
                                  {format(new Date(payment.created_at), 'p')}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}

                    <Button
                      className="w-full gap-2" 
                      size="lg"
                      onClick={processLoanPayment}
                      disabled={isProcessing}
                    >
                      <CheckCircle className="h-5 w-5" />
                      {isProcessing ? 'Processing...' : 'Process Payment'}
                    </Button>

                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => setSelectedLoan(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <Wallet className="h-12 w-12 mb-3 opacity-50" />
                    <p>Select a loan to process payment</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      </div>

      {/* Split Payment Dialog */}
      <Dialog open={showSplitPayment} onOpenChange={setShowSplitPayment}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Split Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-between text-lg font-semibold">
              <span>Total:</span>
              <span>{formatAmount(getTotalAmount())}</span>
            </div>

            {splitPayments.length > 0 && (
              <div className="space-y-2">
                {splitPayments.map((payment, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="capitalize">{payment.method.replace('_', ' ')}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatAmount(payment.amount)}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeSplitPayment(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="p-3 bg-primary/10 rounded-lg">
              <div className="flex justify-between font-semibold">
                <span>Remaining:</span>
                <span className={getRemainingAmount() <= 0 ? 'text-green-600' : ''}>{formatAmount(getRemainingAmount())}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Select value={newSplitMethod} onValueChange={setNewSplitMethod}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map(pm => (
                    <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Amount"
                value={newSplitAmount}
                onChange={(e) => setNewSplitAmount(e.target.value)}
                className="flex-1"
              />
              <Button onClick={addSplitPayment}>Add</Button>
            </div>

            <Button 
              className="w-full" 
              size="lg"
              onClick={() => processSale(true)} 
              disabled={isProcessing || getRemainingAmount() > 0.01}
            >
              {isProcessing ? 'Processing...' : 'Complete Split Payment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Credit Sale Dialog */}
      <Dialog open={showCreditDialog} onOpenChange={setShowCreditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Credit Sale
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-between text-lg font-semibold p-3 bg-muted rounded-lg">
              <span>Cart Total:</span>
              <span>{formatAmount(getTotalAmount())}</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Select Customer *</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowNewCustomerForm(!showNewCustomerForm)}
                >
                  <UserPlus className="h-3 w-3" />
                  {showNewCustomerForm ? 'Cancel' : 'New Customer'}
                </Button>
              </div>

              {showNewCustomerForm ? (
                <div className="p-3 border rounded-lg space-y-3 bg-muted/30">
                  <Input
                    placeholder="Customer name *"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                  />
                  <Input
                    placeholder="Phone number (optional)"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                  />
                  <Button 
                    className="w-full" 
                    size="sm"
                    onClick={createQuickCustomer}
                    disabled={!newCustomerName.trim()}
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    Create & Select
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Search customers..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    className="mb-2"
                  />
                  <ScrollArea className="h-40 border rounded-lg">
                    <div className="p-2 space-y-1">
                      {customers
                        .filter(c => 
                          fuzzySearch(c.name, customerSearchQuery) || 
                          (c.phone && fuzzySearch(c.phone, customerSearchQuery))
                        )
                        .map(customer => (
                          <button
                            key={customer.id}
                            type="button"
                            className={`w-full text-left p-2 rounded transition-all ${
                              selectedCustomerId === customer.id 
                                ? 'bg-primary text-primary-foreground' 
                                : 'hover:bg-muted'
                            }`}
                            onClick={() => setSelectedCustomerId(customer.id)}
                          >
                            <div className="font-medium">{customer.name}</div>
                            {customer.phone && (
                              <div className="text-xs opacity-80">{customer.phone}</div>
                            )}
                          </button>
                        ))
                      }
                      {customers.filter(c => 
                        fuzzySearch(c.name, customerSearchQuery) || 
                        (c.phone && fuzzySearch(c.phone, customerSearchQuery))
                      ).length === 0 && (
                        <p className="text-center text-muted-foreground text-sm py-4">
                          No customers found
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Due in (days)
                </Label>
                <Select value={creditDueDays} onValueChange={setCreditDueDays}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Percent className="h-4 w-4" />
                  Interest Rate (%)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={creditInterestRate}
                  onChange={(e) => setCreditInterestRate(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            {parseFloat(creditInterestRate) > 0 && (
              <div className="p-3 bg-primary/10 rounded-lg space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Base Amount:</span>
                  <span>{formatAmount(getTotalAmount())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Interest ({creditInterestRate}%):</span>
                  <span>{formatAmount(getTotalAmount() * (parseFloat(creditInterestRate) / 100))}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                  <span>Total Loan:</span>
                  <span>{formatAmount(getTotalAmount() * (1 + parseFloat(creditInterestRate) / 100))}</span>
                </div>
              </div>
            )}

            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Due Date:</span>
              <span>{format(addDays(new Date(), parseInt(creditDueDays) || 30), 'PPP')}</span>
            </div>

            <Button 
              className="w-full gap-2" 
              size="lg"
              onClick={processCreditSale}
              disabled={isProcessing || !selectedCustomerId}
            >
              <Wallet className="h-5 w-5" />
              {isProcessing ? 'Processing...' : 'Complete Credit Sale'}
            </Button>

            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => {
                setShowCreditDialog(false);
                setSelectedCustomerId('');
                setCustomerSearchQuery('');
              }}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {lastSaleData && (
        <Receipt isOpen={showReceipt} onClose={() => setShowReceipt(false)} saleData={lastSaleData} />
      )}
    </div>
  );
}
