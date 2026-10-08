import { useState, useEffect } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { getCachedData, queueMutation, cacheData, makeCacheKey, getCachedQuery, setCachedQuery, isQueryFresh, getTtlForKey, invalidateQueryByPrefix } from '@/lib/offlineDb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Trash2, AlertTriangle, Minus, Plus, Package, CreditCard, Banknote, Smartphone, Building2, X, Split, Wallet, Calendar, CheckCircle, UserPlus, Percent, ClipboardList, ShoppingCart, ChevronUp, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { offlineMutate, offlineInsertSingle } from '@/lib/offlineHelpers';
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
import ManualItemEntry from '@/components/pos/ManualItemEntry';
import { getAppConfig } from '@/lib/appConfig';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  isManual?: boolean;
  sellingUnit?: string;
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
  stock_unit: string;
  selling_unit: string;
  unit_conversion_factor: number;
  availableInSellingUnit?: number;
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

const fuzzySearch = (text: string, query: string): boolean => {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  if (textLower.includes(queryLower)) return true;
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) queryIndex++;
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
  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [creditDueDays, setCreditDueDays] = useState('30');
  const [creditInterestRate, setCreditInterestRate] = useState('0');
  const [creditDeposit, setCreditDeposit] = useState('');
  const [creditDepositMethod, setCreditDepositMethod] = useState('cash');
  const [settleAll, setSettleAll] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [activePendingBillId, setActivePendingBillId] = useState<string | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { settings } = useSystemSettings();

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: Banknote },
    { value: 'card', label: 'Card', icon: CreditCard },
    { value: 'mobile_money', label: 'M-Money', icon: Smartphone },
    { value: 'bank_transfer', label: 'Bank', icon: Building2 },
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

  const buildProductsWithStock = (
    productsData: any[],
    inventoryData: any[],
    salesCountMap: Map<string, number>
  ) => {
    const stockMap = new Map<string, number>();
    (inventoryData || []).forEach((i: any) => {
      stockMap.set(i.product_id, (stockMap.get(i.product_id) || 0) + (i.quantity || 0));
    });
    const productsWithStock = (productsData || []).map((p: any) => {
      const rawStock = stockMap.get(p.id) || 0;
      const stockUnit = p.stock_unit || 'piece';
      const sellingUnit = p.selling_unit || 'piece';
      const convFactor = p.unit_conversion_factor || 1;
      const availableInSellingUnit = stockUnit !== sellingUnit ? rawStock * convFactor : rawStock;
      return { ...p, stock: rawStock, stock_unit: stockUnit, selling_unit: sellingUnit, unit_conversion_factor: convFactor, availableInSellingUnit, _salesCount: salesCountMap.get(p.id) || 0 };
    });
    productsWithStock.sort((a: any, b: any) => {
      if ((b.stock || 0) !== (a.stock || 0)) return (b.stock || 0) - (a.stock || 0);
      return (b._salesCount || 0) - (a._salesCount || 0);
    });
    return productsWithStock;
  };

  const fetchProductsWithStock = async (opts?: { force?: boolean }) => {
    const isOnline = navigator.onLine;
    const cacheKey = makeCacheKey('pos_products_with_stock', { warehouse: selectedWarehouse });
    const force = opts?.force === true;

    // 1) Render instantly from keyed cache if present.
    const cached = await getCachedQuery<any[]>(cacheKey);
    const fresh = !force && isQueryFresh(cached, getTtlForKey(cacheKey));
    if (cached?.data?.length) {
      setProducts(cached.data);
      // Fresh cache → skip the network refresh entirely.
      if (!isOnline || fresh) return;
      // stale → fall through to background refresh
    }

    // 2) Fallback: build from raw cached tables (first ever load while online too).
    if (!cached?.data?.length) {
      const rawProducts = await getCachedData('products');
      const rawInv = await getCachedData('inventory');
      const rawTx = await getCachedData('transaction_items');
      if (rawProducts.length) {
        const inv = selectedWarehouse === 'all'
          ? rawInv
          : rawInv.filter((i: any) => i.warehouse_id === selectedWarehouse);
        const salesMap = new Map<string, number>();
        (rawTx || []).forEach((s: any) => {
          salesMap.set(s.product_id, (salesMap.get(s.product_id) || 0) + Number(s.quantity || 1));
        });
        setProducts(buildProductsWithStock(rawProducts, inv, salesMap));
      }
      if (!isOnline) return;
    }

    // 3) Background refresh from network — runs in parallel.
    try {
      const [pRes, iRes, sRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, sku, barcode, selling_price, min_stock_level, image_url, stock_unit, selling_unit, unit_conversion_factor')
          .eq('is_active', true),
        supabase.from('inventory').select('id, product_id, quantity, warehouse_id'),
        supabase.from('transaction_items').select('product_id, quantity'),
      ]);

      if (pRes.error) return;
      const productsData = pRes.data || [];
      const allInventory = iRes.data || [];
      const inventoryData = selectedWarehouse === 'all' ? allInventory : allInventory.filter((i: any) => i.warehouse_id === selectedWarehouse);
      const salesCountMap = new Map<string, number>();
      (sRes.data || []).forEach((s: any) => {
        salesCountMap.set(s.product_id, (salesCountMap.get(s.product_id) || 0) + Number(s.quantity || 1));
      });

      // Refresh underlying caches for other screens.
      cacheData('products', productsData).catch(() => {});
      if (!iRes.error) cacheData('inventory', allInventory).catch(() => {});
      cacheData('transaction_items', sRes.data || []).catch(() => {});

      const next = buildProductsWithStock(productsData, inventoryData, salesCountMap);
      await setCachedQuery(cacheKey, next);
      setProducts(next);
    } catch {
      // network failure — keep showing cached data
    }
  };

  /** Drop every keyed POS cache so the next fetch is forced to refresh. */
  const invalidatePosProductCaches = async () => {
    await invalidateQueryByPrefix('pos_products_with_stock');
  };


  const fetchWarehouses = async () => {
    if (navigator.onLine) {
      const { data, error } = await supabase.from('warehouses').select('*').eq('is_active', true).order('name');
      if (!error && data) { setWarehouses(data); await cacheData('warehouses', data); }
      else { setWarehouses(await getCachedData('warehouses') as any); }
    } else { setWarehouses(await getCachedData('warehouses') as any); }
  };

  const fetchLoans = async () => {
    if (navigator.onLine) {
      const { data, error } = await supabase.from('loans').select('*, customers(name, phone)').in('status', ['pending', 'partial']).order('due_date', { ascending: true });
      if (!error) setLoans(data || []);
    } else {
      const [cached, custs] = await Promise.all([getCachedData('loans'), getCachedData('customers')]);
      const byId = new Map((custs as any[]).map((c) => [c.id, c]));
      setLoans((cached as any[])
        .filter((l) => (l.status === 'pending' || l.status === 'partial') && l.amount - (l.paid_amount || 0) > 0.009)
        .map((l) => ({ ...l, customers: l.customers || (byId.get(l.customer_id) ? { name: byId.get(l.customer_id).name, phone: byId.get(l.customer_id).phone } : null) }))
        .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''))) as any);
    }
  };

  const fetchCustomers = async () => {
    if (navigator.onLine) {
      const { data, error } = await supabase.from('customers').select('id, name, phone').order('name');
      if (!error) { setCustomers(data || []); await cacheData('customers', data || []); }
    } else { setCustomers(await getCachedData('customers') as any); }
  };

  const fetchLoanPayments = async (loanId: string) => {
    if (navigator.onLine) {
      const { data, error } = await supabase.from('loan_payments').select('*').eq('loan_id', loanId).order('created_at', { ascending: false });
      if (!error) { setLoanPayments(data || []); return; }
    }
    const cached = await getCachedData('loan_payments');
    setLoanPayments((cached as any[]).filter((p) => p.loan_id === loanId).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
  };

  const createQuickCustomer = async () => {
    if (!newCustomerName.trim()) { toast({ title: 'Error', description: 'Customer name is required', variant: 'destructive' }); return; }
    try {
      const { data, error } = await offlineInsertSingle<any>('customers', { name: newCustomerName.trim(), phone: newCustomerPhone.trim() || null });
      if (error) throw error;
      setCustomers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCustomerId(data.id);
      setShowNewCustomerForm(false);
      setNewCustomerName(''); setNewCustomerPhone('');
      toast({ title: 'Success', description: `Customer "${data.name}" created` });
    } catch (error: any) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
  };

  const handleBarcodeProduct = (product: any) => {
    const p = products.find(pr => pr.id === product.id);
    if (p) addToCart(p);
    else toast({ title: 'Product Found', description: `${product.name} - Not available in selected warehouse`, variant: 'destructive' });
  };

  const customerKey = (l: Loan) => (l as any).customer_id || l.customers?.name || l.id;
  const customerLoans = (loan: Loan | null) => loan
    ? loans.filter((l) => customerKey(l) === customerKey(loan)).sort((a, b) => String(a.due_date || a.created_at || '').localeCompare(String(b.due_date || b.created_at || '')))
    : [];
  const remainingOf = (l: Loan) => Math.max(0, l.amount - (l.paid_amount || 0));
  const payTargets = settleAll ? customerLoans(selectedLoan) : (selectedLoan ? [selectedLoan] : []);
  const payDue = payTargets.reduce((s, l) => s + remainingOf(l), 0);

  const processLoanPayment = async () => {
    if (!selectedLoan) return;
    const amount = parseFloat(loanPaymentAmount);
    if (isNaN(amount) || amount <= 0) { toast({ title: 'Error', description: 'Enter a valid payment amount', variant: 'destructive' }); return; }
    if (amount > payDue + 0.009) { toast({ title: 'Too much', description: `Maximum payable: ${formatAmount(payDue)}`, variant: 'destructive' }); return; }
    setIsProcessing(true);
    try {
      let left = amount;
      const paidLines: { loan: Loan; paid: number; status: string }[] = [];
      for (const loan of payTargets) {
        if (left <= 0.009) break;
        const pay = Math.min(left, remainingOf(loan));
        if (pay <= 0) continue;
        const newPaid = (loan.paid_amount || 0) + pay;
        const status = newPaid >= loan.amount - 0.009 ? 'paid' : 'partial';
        const r1 = await offlineMutate('loan_payments', 'insert', { loan_id: loan.id, amount: pay, payment_method: loanPaymentMethod, notes: settleAll ? 'Bulk payment via POS' : 'Payment via POS', created_by: user?.id });
        if (!r1.success) throw r1.error;
        const r2 = await offlineMutate('loans', 'update', { paid_amount: newPaid, status }, { id: loan.id });
        if (!r2.success) throw r2.error;
        paidLines.push({ loan, paid: pay, status });
        left -= pay;
      }
      const stillOwed = payDue - amount;
      toast({ title: stillOwed <= 0.009 ? 'Fully settled ✓' : 'Payment saved', description: stillOwed <= 0.009 ? `${selectedLoan.customers?.name || 'Customer'} has no remaining balance${settleAll ? '' : ' on this loan'}.` : `${formatAmount(amount)} received. Still owed: ${formatAmount(stillOwed)}` });
      setLastSaleData({
        id: `PAY-${Date.now()}`,
        items: paidLines.map((p) => ({ name: `Loan payment${p.loan.due_date ? ` (due ${format(new Date(p.loan.due_date), 'PP')})` : ''}${p.status === 'paid' ? ' – settled' : ''}`, quantity: 1, unit_price: p.paid, subtotal: p.paid })),
        total_amount: amount,
        payment_method: `${loanPaymentMethod.replace('_', ' ')} · Balance left: ${formatAmount(Math.max(0, stillOwed))}`,
        customer_name: selectedLoan.customers?.name,
        customer_phone: selectedLoan.customers?.phone,
        sale_date: new Date().toISOString(),
      });
      setShowReceipt(true);
      setLoanPaymentAmount('');
      // Update local list immediately
      const updated = new Map(paidLines.map((p) => [p.loan.id, p]));
      setLoans((prev) => prev
        .map((l) => updated.has(l.id) ? { ...l, paid_amount: (l.paid_amount || 0) + updated.get(l.id)!.paid, status: updated.get(l.id)!.status } : l)
        .filter((l) => l.status !== 'paid'));
      const self = updated.get(selectedLoan.id);
      if (stillOwed <= 0.009 || self?.status === 'paid') { setSelectedLoan(null); setSettleAll(false); }
      else { setSelectedLoan((prev) => prev ? { ...prev, paid_amount: (prev.paid_amount || 0) + (self?.paid || 0) } : null); fetchLoanPayments(selectedLoan.id); }
      fetchLoans();
    } catch (error: any) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    finally { setIsProcessing(false); }
  };

  const handleSelectLoan = (loan: Loan) => {
    setSelectedLoan(loan);
    setSettleAll(false);
    setLoanPaymentAmount(String(Math.round(remainingOf(loan) * 100) / 100));
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
    const available = product.availableInSellingUnit || product.stock || 0;
    if (available < totalQty) {
      toast({ title: 'Insufficient Stock', description: `Available: ${available} ${product.selling_unit}`, variant: 'destructive' });
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id ? { ...i, quantity: totalQty, subtotal: totalQty * i.price } : i);
      }
      return [...prev, { productId: product.id, name: product.name, quantity: qty, price: product.selling_price, subtotal: product.selling_price * qty, sellingUnit: product.selling_unit }];
    });
  };

  const updateCartQuantity = (productId: string, newQty: number) => {
    if (newQty < 0.01) { removeFromCart(productId); return; }
    const cartItem = cart.find(i => i.productId === productId);
    if (!cartItem?.isManual) {
      const product = products.find(p => p.id === productId);
      if (product) {
        const available = product.availableInSellingUnit || product.stock || 0;
        if (newQty > available) {
          toast({ title: 'Insufficient Stock', description: `Maximum available: ${available} ${product.selling_unit}`, variant: 'destructive' });
          return;
        }
      }
    }
    setCart(prev => prev.map(item => item.productId === productId ? { ...item, quantity: newQty, subtotal: newQty * item.price } : item));
  };

  const removeFromCart = (productId: string) => setCart(prev => prev.filter(i => i.productId !== productId));
  const getTotalAmount = () => cart.reduce((sum, item) => sum + item.subtotal, 0);
  const getSplitTotal = () => splitPayments.reduce((sum, p) => sum + p.amount, 0);
  const getRemainingAmount = () => getTotalAmount() - getSplitTotal();

  const addSplitPayment = () => {
    const amount = parseFloat(newSplitAmount);
    if (isNaN(amount) || amount <= 0) { toast({ title: 'Error', description: 'Enter a valid amount', variant: 'destructive' }); return; }
    if (amount > getRemainingAmount()) { toast({ title: 'Error', description: 'Amount exceeds remaining balance', variant: 'destructive' }); return; }
    setSplitPayments(prev => [...prev, { method: newSplitMethod, amount }]);
    setNewSplitAmount('');
  };

  const removeSplitPayment = (index: number) => setSplitPayments(prev => prev.filter((_, i) => i !== index));

  /** Load inventory rows for given products (network when online, else local cache). */
  const loadInventoryRows = async (productIds: string[]): Promise<any[]> => {
    if (navigator.onLine && productIds.length) {
      try {
        const { data, error } = await supabase.from('inventory').select('product_id, quantity, warehouse_id').in('product_id', productIds);
        if (!error && data) return data;
      } catch { /* fall back to cache */ }
    }
    return (await getCachedData('inventory')) as any[];
  };

  /** Split a sold quantity across warehouses. Specific warehouse → that one; All → largest stock first. */
  const allocateWarehouses = (productId: string, qty: number, invRows: any[]): { warehouse_id: string; quantity: number }[] => {
    if (selectedWarehouse && selectedWarehouse !== 'all') return [{ warehouse_id: selectedWarehouse, quantity: qty }];
    const rows = invRows.filter((r) => r.product_id === productId && Number(r.quantity) > 0)
      .sort((a, b) => Number(b.quantity) - Number(a.quantity));
    const out: { warehouse_id: string; quantity: number }[] = [];
    let left = qty;
    for (const r of rows) {
      if (left <= 0) break;
      const take = Math.min(left, Number(r.quantity));
      out.push({ warehouse_id: r.warehouse_id, quantity: take });
      left -= take;
    }
    if (left > 0) {
      const fallback = rows[0]?.warehouse_id || invRows.find((r) => r.product_id === productId)?.warehouse_id || warehouses[0]?.id;
      if (fallback) {
        const ex = out.find((o) => o.warehouse_id === fallback);
        if (ex) ex.quantity += left; else out.push({ warehouse_id: fallback, quantity: left });
      }
    }
    return out;
  };

  const buildStockMovements = (invRows: any[], transactionNumber: string, notePrefix: string, who: string, extraWarehouseId: string | null = null) =>
    cart.flatMap((item) => {
      const product = products.find(p => p.id === item.productId);
      const convFactor = product?.unit_conversion_factor || 1;
      const stockUnitQty = product && product.stock_unit !== product.selling_unit ? item.quantity / convFactor : item.quantity;
      const base = { product_id: item.productId, movement_type: 'out', reference_number: transactionNumber, notes: `${notePrefix}: ${item.quantity} ${item.sellingUnit || 'pc'} to ${who}`, created_by: user?.id };
      if (item.isManual && extraWarehouseId) return [{ ...base, warehouse_id: extraWarehouseId, quantity: stockUnitQty }];
      return allocateWarehouses(item.productId, stockUnitQty, invRows).map((a) => ({ ...base, ...a }));
    });

  const processSale = async (useSplit: boolean = false) => {
    if (cart.length === 0) { toast({ title: 'Error', description: 'Cart is empty', variant: 'destructive' }); return; }
    const hasRegularItems = cart.some(item => !item.isManual);
    if (useSplit && getRemainingAmount() > 0.01) {
      toast({ title: 'Error', description: 'Split payments must cover full amount', variant: 'destructive' }); return;
    }
    setIsProcessing(true);
    try {
      const transactionNumber = `TXN-${Date.now()}`;
      const finalPaymentMethod = useSplit ? `Split: ${splitPayments.map(p => `${p.method}(${formatAmount(p.amount)})`).join(', ')}` : paymentMethod;
      const transactionData = { transaction_number: transactionNumber, total_amount: getTotalAmount(), payment_method: finalPaymentMethod, status: 'completed', notes: customerName ? `Customer: ${customerName}` : null, created_by: user?.id };

      if (!navigator.onLine) {
        const offlineId = `offline-${Date.now()}`;
        await queueMutation('transactions', 'insert', { ...transactionData, id: offlineId });
        await queueMutation('transaction_items', 'insert', cart.map(item => ({ transaction_id: offlineId, product_id: item.productId, quantity: item.quantity, unit_price: item.price, total_price: item.subtotal })));
        const cachedInventory = (await getCachedData('inventory')) as any[];
        const stockMovements = buildStockMovements(cachedInventory, transactionNumber, 'POS Sale (offline)', customerName || 'Walk-in customer');
        await queueMutation('stock_movements', 'insert', stockMovements);
        for (const m of stockMovements) {
          const inv = cachedInventory.find((i: any) => i.product_id === m.product_id && i.warehouse_id === m.warehouse_id);
          if (inv) inv.quantity = Math.max(0, (inv.quantity || 0) - m.quantity);
        }
        await cacheData('inventory', cachedInventory);
        setLastSaleData({ id: offlineId, items: cart.map(item => ({ name: item.name, quantity: item.quantity, unit_price: item.price, subtotal: item.subtotal })), total_amount: getTotalAmount(), payment_method: finalPaymentMethod, customer_name: customerName, customer_phone: customerPhone, sale_date: new Date().toISOString() });
        setShowReceipt(true); setShowSplitPayment(false); setSplitPayments([]); setMobileCartOpen(false);
        toast({ title: 'Sale Saved Offline', description: 'Will sync automatically when internet returns' });
        setCart([]); setCustomerName(''); setCustomerPhone(''); setPaymentMethod('cash');
        await invalidatePosProductCaches();
        fetchProductsWithStock({ force: true }); setIsProcessing(false); return;
      }

      const txRes = await offlineInsertSingle<any>('transactions', transactionData);
      if (txRes.error) throw txRes.error;
      const transaction = txRes.data!;
      const itemsRes = await offlineMutate('transaction_items', 'insert', cart.map(item => ({ transaction_id: transaction.id, product_id: item.productId, quantity: item.quantity, unit_price: item.price, total_price: item.subtotal })));
      if (!itemsRes.success) throw itemsRes.error;

      let extraWarehouseId: string | null = null;
      if (cart.some(item => item.isManual)) {
        const { data: extraWh } = await supabase.from('warehouses').select('id').eq('name', 'Extra').limit(1);
        extraWarehouseId = extraWh?.[0]?.id || null;
      }
      for (const item of cart) {
        if (item.isManual && extraWarehouseId) {
          const { data: inv } = await supabase.from('inventory').select('quantity').eq('product_id', item.productId).eq('warehouse_id', extraWarehouseId).maybeSingle();
          const currentStock = inv?.quantity ?? 0;
          if (currentStock < item.quantity) {
            await offlineMutate('stock_movements', 'insert', { product_id: item.productId, warehouse_id: extraWarehouseId, quantity: item.quantity - currentStock, movement_type: 'in', notes: 'Auto top-up for manual POS item', created_by: user?.id });
          }
        }
      }

      const invRows = await loadInventoryRows(cart.filter(i => !i.isManual).map(i => i.productId));
      const stockMovements = buildStockMovements(invRows, transactionNumber, 'POS Sale', customerName || 'Walk-in customer', extraWarehouseId);
      const movRes = await offlineMutate('stock_movements', 'insert', stockMovements);
      if (!movRes.success) throw movRes.error;

      setLastSaleData({ id: transaction.id, items: cart.map(item => ({ name: item.name, quantity: item.quantity, unit_price: item.price, subtotal: item.subtotal })), total_amount: getTotalAmount(), payment_method: finalPaymentMethod, customer_name: customerName, customer_phone: customerPhone, sale_date: new Date().toISOString() });
      setShowReceipt(true); setShowSplitPayment(false); setSplitPayments([]); setMobileCartOpen(false);
      toast({ title: 'Success', description: 'Sale completed successfully' });
      if (activePendingBillId) { await offlineMutate('pending_bills', 'update', { status: 'closed' }, { id: activePendingBillId }); setActivePendingBillId(null); }
      setCart([]); setCustomerName(''); setCustomerPhone(''); setPaymentMethod('cash');
      await invalidatePosProductCaches();
      fetchProductsWithStock({ force: true });
    } catch (error: any) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    finally { setIsProcessing(false); }
  };

  const processCreditSale = async () => {
    if (cart.length === 0) { toast({ title: 'Error', description: 'Cart is empty', variant: 'destructive' }); return; }
    if (!selectedCustomerId) { toast({ title: 'Error', description: 'Please select a customer for credit sale', variant: 'destructive' }); return; }
    const hasRegularItems = cart.some(item => !item.isManual);
    setIsProcessing(true);
    try {
      const transactionNumber = `TXN-${Date.now()}`;
      const baseAmount = getTotalAmount();
      const interestRate = parseFloat(creditInterestRate) || 0;
      const dueDays = parseInt(creditDueDays) || 30;
      const deposit = Math.min(Math.max(parseFloat(creditDeposit) || 0, 0), baseAmount);
      if (deposit >= baseAmount) { toast({ title: 'Nothing to lend', description: 'The amount paid now covers the full total — use a normal payment instead.', variant: 'destructive' }); setIsProcessing(false); return; }
      const interestAmount = (baseAmount - deposit) * (interestRate / 100);
      const totalLoanAmount = baseAmount - deposit + interestAmount;
      const dueDate = addDays(new Date(), dueDays);
      const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

      const txRes = await offlineInsertSingle<any>('transactions', { transaction_number: transactionNumber, total_amount: baseAmount, payment_method: 'credit', status: 'completed', customer_id: selectedCustomerId, notes: `Credit Sale - Loan Amount: ${formatAmount(totalLoanAmount)} (includes ${interestRate}% interest)${deposit > 0 ? ` · Paid now: ${formatAmount(deposit)} (${creditDepositMethod})` : ''}`, created_by: user?.id });
      if (txRes.error) throw txRes.error;
      const transaction = txRes.data!;
      const itemsRes = await offlineMutate('transaction_items', 'insert', cart.map(item => ({ transaction_id: transaction.id, product_id: item.productId, quantity: item.quantity, unit_price: item.price, total_price: item.subtotal })));
      if (!itemsRes.success) throw itemsRes.error;

      let extraWarehouseId: string | null = null;
      if (cart.some(item => item.isManual)) {
        const { data: extraWh } = await supabase.from('warehouses').select('id').eq('name', 'Extra').limit(1);
        extraWarehouseId = extraWh?.[0]?.id || null;
      }
      for (const item of cart) {
        if (item.isManual && extraWarehouseId) {
          const { data: inv } = await supabase.from('inventory').select('quantity').eq('product_id', item.productId).eq('warehouse_id', extraWarehouseId).maybeSingle();
          if ((inv?.quantity ?? 0) < item.quantity) {
            await offlineMutate('stock_movements', 'insert', { product_id: item.productId, warehouse_id: extraWarehouseId, quantity: item.quantity - (inv?.quantity ?? 0), movement_type: 'in', notes: 'Auto top-up for manual POS item (credit)', created_by: user?.id });
          }
        }
      }

      const invRows = await loadInventoryRows(cart.filter(i => !i.isManual).map(i => i.productId));
      const stockMovements = buildStockMovements(invRows, transactionNumber, 'Credit Sale', selectedCustomer?.name || 'Customer', extraWarehouseId);
      const movRes = await offlineMutate('stock_movements', 'insert', stockMovements);
      if (!movRes.success) throw movRes.error;

      const loanRes = await offlineMutate('loans', 'insert', { customer_id: selectedCustomerId, amount: totalLoanAmount, paid_amount: 0, due_date: format(dueDate, 'yyyy-MM-dd'), status: 'pending', notes: `Credit sale - TXN: ${transactionNumber}\nBase: ${formatAmount(baseAmount)}${deposit > 0 ? `, Paid now: ${formatAmount(deposit)}` : ''}, Interest: ${interestRate}%`, created_by: user?.id });
      if (!loanRes.success) throw loanRes.error;

      setLastSaleData({ id: transaction.id, items: cart.map(item => ({ name: item.name, quantity: item.quantity, unit_price: item.price, subtotal: item.subtotal })), total_amount: baseAmount, payment_method: deposit > 0 ? `Paid ${formatAmount(deposit)} (${creditDepositMethod}) + Credit ${formatAmount(totalLoanAmount)} (Due: ${format(dueDate, 'PP')})` : `Credit ${formatAmount(totalLoanAmount)} (Due: ${format(dueDate, 'PP')})`, customer_name: selectedCustomer?.name, customer_phone: selectedCustomer?.phone, sale_date: new Date().toISOString() });
      setShowReceipt(true); setShowCreditDialog(false); setMobileCartOpen(false);
      toast({ title: 'Credit Sale Completed', description: `Loan of ${formatAmount(totalLoanAmount)} created for ${selectedCustomer?.name}` });
      if (activePendingBillId) { await offlineMutate('pending_bills', 'update', { status: 'closed' }, { id: activePendingBillId }); setActivePendingBillId(null); }
      setCart([]); setCustomerName(''); setCustomerPhone(''); setPaymentMethod('cash'); setSelectedCustomerId(''); setCreditDueDays('30'); setCreditInterestRate('0'); setCreditDeposit(''); setCustomerSearchQuery('');
      await invalidatePosProductCaches();
      fetchProductsWithStock({ force: true }); fetchLoans();
    } catch (error: any) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    finally { setIsProcessing(false); }
  };

  const handlePayNow = () => {
    if (paymentMethod === 'credit') {
      if (cart.length === 0) { toast({ title: 'Error', description: 'Cart is empty', variant: 'destructive' }); return; }
      const typed = (customerPhone || customerName).trim();
      if (typed && !selectedCustomerId) {
        setCustomerSearchQuery(typed);
        const match = customers.find((c) => (customerPhone && c.phone === customerPhone.trim()) || c.name.toLowerCase() === customerName.trim().toLowerCase());
        if (match) setSelectedCustomerId(match.id);
        else { setNewCustomerName(customerName.trim()); setNewCustomerPhone(customerPhone.trim()); }
      }
      setShowCreditDialog(true);
    }
    else processSale(false);
  };

  const filteredProducts = products.filter(p =>
    fuzzySearch(p.name, searchQuery) || (p.sku && fuzzySearch(p.sku, searchQuery)) || (p.barcode && fuzzySearch(p.barcode, searchQuery))
  );

  const filteredLoans = loans.filter(l =>
    (l.customers?.name && fuzzySearch(l.customers.name, loanSearchQuery)) || (l.customers?.phone && fuzzySearch(l.customers.phone, loanSearchQuery))
  );

  const handleRefresh = () => {
    invalidatePosProductCaches().then(() => fetchProductsWithStock({ force: true }));
    fetchWarehouses(); fetchLoans();
    toast({ title: 'Refreshed', description: 'Data updated' });
  };

  const CartContent = () => (
    <div className="flex flex-col h-full">
      {/* Customer Info */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" className="h-9 text-sm" />
        <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone" className="h-9 text-sm" />
      </div>

      {/* Cart Items */}
      <ScrollArea className="flex-1 min-h-0">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">Your cart is empty</p>
            <p className="text-xs mt-1">Tap products to add them</p>
          </div>
        ) : (
          <div className="space-y-2 pr-2">
            {cart.map((item) => (
              <div key={item.productId} className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-xl border border-border/50">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{formatAmount(item.price)}/{item.sellingUnit || 'pc'}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input type="number" min="0.01" step="0.1" value={item.quantity} onChange={(e) => updateCartQuantity(item.productId, parseFloat(e.target.value) || 0.01)} className="w-12 h-7 text-center text-sm px-1" />
                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <p className="font-semibold text-sm w-16 text-right shrink-0">{formatAmount(item.subtotal)}</p>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive shrink-0" onClick={() => removeFromCart(item.productId)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Manual Entry */}
      {getAppConfig().rules.pos_allow_manual_entry && (
        <ManualItemEntry onItemAdded={(item) => setCart(prev => [...prev, { ...item, isManual: true }])} />
      )}

      {/* Checkout Section */}
      <div className="border-t pt-3 mt-3 space-y-3">
        <div className="flex justify-between items-center text-lg font-bold">
          <span>Total</span>
          <span className="text-primary">{formatAmount(getTotalAmount())}</span>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">Payment Method</Label>
          <div className="grid grid-cols-5 gap-1">
            {paymentMethods.map(pm => (
              <Button key={pm.value} variant={paymentMethod === pm.value ? 'default' : 'outline'} size="sm" className="h-9 text-[10px] sm:text-xs flex-col gap-0.5 px-1" onClick={() => setPaymentMethod(pm.value)}>
                <pm.icon className="h-3.5 w-3.5" />
                <span className="truncate leading-tight">{pm.label}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setShowSplitPayment(true)} disabled={cart.length === 0} className="gap-1 text-sm">
            <Split className="h-4 w-4" /> Split
          </Button>
          <Button onClick={handlePayNow} disabled={isProcessing || cart.length === 0} className="text-sm font-semibold">
            {isProcessing ? 'Processing...' : paymentMethod === 'credit' ? 'Credit Sale' : 'Pay Now'}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-muted/30">
      <POSHeader cartItemCount={cart.length} cartTotal={getTotalAmount()} onRefresh={handleRefresh} />

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="px-3 pt-3 sm:px-4 sm:pt-4">
            <TabsList className="w-full sm:w-fit">
              <TabsTrigger value="sales" className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
                <Package className="h-4 w-4" /> Sales
              </TabsTrigger>
              <TabsTrigger value="pending" className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
                <ClipboardList className="h-4 w-4" /> Pending
              </TabsTrigger>
              <TabsTrigger value="loans" className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
                <Wallet className="h-4 w-4" /> Loans
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="sales" className="flex-1 overflow-hidden mt-0 px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="flex gap-4 h-full">
              {/* Products Area */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Search & Filters */}
                <div className="flex flex-col sm:flex-row gap-2 mb-3 mt-3">
                  <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                    <SelectTrigger className="w-full sm:w-44 h-10">
                      <SelectValue placeholder="Warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Warehouses</SelectItem>
                      {warehouses.map((w) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-10" />
                    {searchQuery && (
                      <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearchQuery('')}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <BarcodeScanner onProductFound={handleBarcodeProduct} />
                </div>

                {/* Product Grid */}
                <ScrollArea className="flex-1">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-3 pb-20 lg:pb-4">
                    {filteredProducts.map((product) => {
                      const stockStatus = getStockStatus(product);
                      const inCart = cart.find(i => i.productId === product.id);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          className={`relative flex flex-col p-2.5 sm:p-3 rounded-xl border text-left transition-all active:scale-[0.97] ${
                            stockStatus === 'out'
                              ? 'opacity-50 cursor-not-allowed border-border'
                              : inCart
                              ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                              : 'hover:border-primary/50 hover:shadow-sm border-border bg-card'
                          }`}
                          onClick={() => stockStatus !== 'out' && addToCart(product)}
                          disabled={stockStatus === 'out'}
                        >
                          {/* Product Image */}
                          <div className="w-full aspect-square rounded-lg bg-muted/50 flex items-center justify-center mb-2 overflow-hidden">
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} className="w-full h-full object-cover rounded-lg" loading="lazy" />
                            ) : (
                              <Package className="h-8 w-8 text-muted-foreground/50" />
                            )}
                          </div>

                          {/* Product Info */}
                          <p className="font-medium text-xs sm:text-sm line-clamp-2 leading-tight mb-1">{product.name}</p>
                          <p className="text-primary font-bold text-sm sm:text-base">{formatAmount(product.selling_price)}</p>
                          <p className="text-[10px] text-muted-foreground">per {product.selling_unit}</p>

                          {/* Stock Badge */}
                          <Badge className={`absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0 h-5 ${
                            stockStatus === 'out' ? 'bg-destructive' : stockStatus === 'low' ? 'bg-orange-500' : 'bg-green-600'
                          }`}>
                            {product.stock_unit !== product.selling_unit
                              ? `${(product.availableInSellingUnit || 0).toFixed(0)} ${product.selling_unit}`
                              : product.stock}
                          </Badge>

                          {/* In-Cart Indicator */}
                          {inCart && (
                            <Badge className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 h-5 bg-primary">
                              {inCart.quantity} in cart
                            </Badge>
                          )}

                          {stockStatus === 'low' && <AlertTriangle className="absolute bottom-1.5 left-1.5 h-3.5 w-3.5 text-orange-500" />}
                        </button>
                      );
                    })}
                    {filteredProducts.length === 0 && (
                      <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <Package className="h-12 w-12 mb-3 opacity-30" />
                        <p className="font-medium">No products found</p>
                        <p className="text-sm mt-1">Try a different search or warehouse</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Desktop Cart Sidebar - hidden on mobile */}
              <Card className="hidden lg:flex w-[380px] xl:w-[420px] flex-col overflow-hidden shrink-0">
                <CardContent className="p-4 flex flex-col flex-1 overflow-hidden">
                  <h2 className="font-bold text-base mb-3 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Cart
                    {cart.length > 0 && <Badge variant="secondary" className="text-xs">{cart.length}</Badge>}
                  </h2>
                  {CartContent()}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* PENDING BILLS TAB */}
          <TabsContent value="pending" className="flex-1 overflow-hidden mt-0 px-3 pb-3 sm:px-4 sm:pb-4">
            <PendingBills
              selectedWarehouse={selectedWarehouse}
              warehouses={warehouses}
              cart={cart}
              onLoadBill={(items, billId, name, phone, warehouseId) => {
                setCart(items); setCustomerName(name); setCustomerPhone(phone);
                setActivePendingBillId(billId); setSelectedWarehouse(warehouseId); setActiveTab('sales');
              }}
              onBillSaved={() => { setCart([]); setCustomerName(''); setCustomerPhone(''); }}
            />
          </TabsContent>

          {/* LOAN PAYMENTS TAB */}
          <TabsContent value="loans" className="flex-1 overflow-hidden mt-0 px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="grid gap-4 md:grid-cols-2 h-full pt-3">
              <Card className="flex flex-col overflow-hidden">
                <CardContent className="p-4 flex flex-col flex-1 overflow-hidden">
                  <Input placeholder="Search by customer name or phone..." value={loanSearchQuery} onChange={(e) => setLoanSearchQuery(e.target.value)} className="mb-3" />
                  <ScrollArea className="flex-1">
                    {filteredLoans.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Wallet className="h-10 w-10 mb-2 opacity-50" />
                        <p className="text-sm">No pending loans</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredLoans.map((loan) => {
                          const remaining = remainingOf(loan);
                          const isOverdue = loan.due_date && new Date(loan.due_date) < new Date();
                          return (
                            <button key={loan.id} type="button" className={`w-full text-left p-3 rounded-xl border transition-all ${selectedLoan?.id === loan.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`} onClick={() => handleSelectLoan(loan)}>
                              <div className="flex justify-between items-start mb-1">
                                <span className="font-medium text-sm">{loan.customers?.name || 'Unknown'}</span>
                                <Badge variant={isOverdue ? 'destructive' : loan.status === 'partial' ? 'secondary' : 'outline'} className="text-[10px]">{isOverdue ? 'Overdue' : loan.status}</Badge>
                              </div>
                              {loan.customers?.phone && <p className="text-xs text-muted-foreground">{loan.customers.phone}</p>}
                              <div className="flex justify-between mt-2 text-sm">
                                <span>Remaining:</span>
                                <span className="font-semibold text-destructive">{formatAmount(remaining)}</span>
                              </div>
                              {loan.due_date && (<div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" />Due: {format(new Date(loan.due_date), 'PP')}</div>)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="flex flex-col">
                <CardContent className="p-4 flex flex-col flex-1">
                  {selectedLoan ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-muted rounded-xl">
                        <h3 className="font-semibold text-lg mb-2">{selectedLoan.customers?.name}</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-muted-foreground">Total Loan:</span><p className="font-medium">{formatAmount(selectedLoan.amount)}</p></div>
                          <div><span className="text-muted-foreground">Paid:</span><p className="font-medium text-green-600">{formatAmount(selectedLoan.paid_amount || 0)}</p></div>
                          <div className="col-span-2"><span className="text-muted-foreground">Remaining:</span><p className="font-semibold text-lg text-destructive">{formatAmount(selectedLoan.amount - (selectedLoan.paid_amount || 0))}</p></div>
                        </div>
                      </div>
                      {customerLoans(selectedLoan).length > 1 && (
                        <div className="grid grid-cols-2 gap-2">
                          <Button size="sm" variant={!settleAll ? 'default' : 'outline'} onClick={() => { setSettleAll(false); setLoanPaymentAmount(String(remainingOf(selectedLoan))); }}>This loan</Button>
                          <Button size="sm" variant={settleAll ? 'default' : 'outline'} onClick={() => { setSettleAll(true); setLoanPaymentAmount(String(customerLoans(selectedLoan).reduce((s, l) => s + remainingOf(l), 0))); }}>
                            All {customerLoans(selectedLoan).length} loans
                          </Button>
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between"><Label>Amount received</Label><span className="text-xs text-muted-foreground">Due: {formatAmount(payDue)}</span></div>
                        <Input type="number" inputMode="decimal" placeholder="Enter amount" value={loanPaymentAmount} onChange={(e) => setLoanPaymentAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') processLoanPayment(); }} className="h-12 text-lg font-semibold" />
                        <div className="grid grid-cols-4 gap-1">
                          <Button type="button" size="sm" variant="secondary" onClick={() => setLoanPaymentAmount(String(payDue))}>Full</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setLoanPaymentAmount(String(Math.round(payDue / 2)))}>Half</Button>
                          {(getAppConfig().rules.loan_quick_amounts || []).filter((v) => v > 0).slice(0, 6).map((v) => (
                            <Button key={v} type="button" size="sm" variant="outline" onClick={() => setLoanPaymentAmount(String(Math.min(payDue, v)))}>{v.toLocaleString()}</Button>
                          ))}
                        </div>
                        {(() => {
                          const a = parseFloat(loanPaymentAmount) || 0;
                          if (a <= 0) return null;
                          if (a > payDue + 0.009) return <p className="text-xs text-destructive">More than owed — maximum {formatAmount(payDue)}</p>;
                          const left = payDue - a;
                          return <p className="text-xs text-muted-foreground">{left <= 0.009 ? 'This settles the balance completely.' : `Balance after payment: ${formatAmount(left)}`}</p>;
                        })()}
                      </div>
                      <div className="space-y-2">
                        <Label>Payment Method</Label>
                        <div className="grid grid-cols-4 gap-2">
                          {paymentMethods.filter(pm => pm.value !== 'credit').map(pm => (
                            <Button key={pm.value} variant={loanPaymentMethod === pm.value ? 'default' : 'outline'} size="sm" className="h-10 text-xs flex-col gap-0.5" onClick={() => setLoanPaymentMethod(pm.value)}>
                              <pm.icon className="h-4 w-4" /><span>{pm.label}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                      {loanPayments.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm">Payment History</Label>
                          <ScrollArea className="h-32 border rounded-lg">
                            <div className="p-2 space-y-2">
                              {loanPayments.map(payment => (
                                <div key={payment.id} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded">
                                  <div><p className="font-medium text-green-600">+{formatAmount(payment.amount)}</p><p className="text-xs text-muted-foreground capitalize">{payment.payment_method.replace('_', ' ')}</p></div>
                                  <div className="text-right text-xs text-muted-foreground">{format(new Date(payment.created_at), 'PP')}<br />{format(new Date(payment.created_at), 'p')}</div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      )}
                      <Button className="w-full gap-2" size="lg" onClick={processLoanPayment} disabled={isProcessing}><CheckCircle className="h-5 w-5" />{isProcessing ? 'Processing...' : (parseFloat(loanPaymentAmount) || 0) >= payDue - 0.009 ? 'Settle in full' : 'Record payment'}</Button>
                      <Button variant="outline" className="w-full" onClick={() => setSelectedLoan(null)}>Cancel</Button>
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

      {/* Mobile Floating Cart Button - shown only on mobile when in sales tab */}
      {activeTab === 'sales' && (
        <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
          <SheetTrigger asChild>
            <button
              className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-primary text-primary-foreground px-5 py-3 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-transform"
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="font-bold text-sm">
                {cart.length > 0 ? `${cart.length} items` : 'Cart'}
              </span>
              {cart.length > 0 && (
                <>
                  <span className="w-px h-5 bg-primary-foreground/30" />
                  <span className="font-bold text-sm">{formatAmount(getTotalAmount())}</span>
                </>
              )}
              <ChevronUp className="h-4 w-4" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl px-4 pb-4 pt-2 flex flex-col">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-3 shrink-0" />
            <SheetHeader className="pb-2 shrink-0">
              <SheetTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="h-4 w-4" />
                Cart
                {cart.length > 0 && <Badge variant="secondary" className="text-xs">{cart.length}</Badge>}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 min-h-0 overflow-hidden">
              {CartContent()}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Split Payment Dialog */}
      <Dialog open={showSplitPayment} onOpenChange={setShowSplitPayment}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Split Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-between text-lg font-semibold"><span>Total:</span><span>{formatAmount(getTotalAmount())}</span></div>
            {splitPayments.length > 0 && (
              <div className="space-y-2">
                {splitPayments.map((payment, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="capitalize">{payment.method.replace('_', ' ')}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatAmount(payment.amount)}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeSplitPayment(index)}><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="p-3 bg-primary/10 rounded-lg">
              <div className="flex justify-between font-semibold"><span>Remaining:</span><span className={getRemainingAmount() <= 0 ? 'text-green-600' : ''}>{formatAmount(getRemainingAmount())}</span></div>
            </div>
            <div className="flex gap-2">
              <Select value={newSplitMethod} onValueChange={setNewSplitMethod}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{paymentMethods.map(pm => (<SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>))}</SelectContent>
              </Select>
              <Input type="number" placeholder="Amount" value={newSplitAmount} onChange={(e) => setNewSplitAmount(e.target.value)} className="flex-1" />
              <Button onClick={addSplitPayment}>Add</Button>
            </div>
            <Button className="w-full" size="lg" onClick={() => processSale(true)} disabled={isProcessing || getRemainingAmount() > 0.01}>
              {isProcessing ? 'Processing...' : 'Complete Split Payment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Credit Sale Dialog */}
      <Dialog open={showCreditDialog} onOpenChange={setShowCreditDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />Credit Sale</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-between text-lg font-semibold p-3 bg-muted rounded-lg"><span>Cart Total:</span><span>{formatAmount(getTotalAmount())}</span></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Select Customer *</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowNewCustomerForm(!showNewCustomerForm)}>
                  <UserPlus className="h-3 w-3" />{showNewCustomerForm ? 'Cancel' : 'New Customer'}
                </Button>
              </div>
              {showNewCustomerForm ? (
                <div className="p-3 border rounded-lg space-y-3 bg-muted/30">
                  <Input placeholder="Customer name *" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
                  <Input placeholder="Phone number (optional)" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
                  <Button className="w-full" size="sm" onClick={createQuickCustomer} disabled={!newCustomerName.trim()}><UserPlus className="h-4 w-4 mr-1" />Create & Select</Button>
                </div>
              ) : (
                <>
                  <Input placeholder="Search customers..." value={customerSearchQuery} onChange={(e) => setCustomerSearchQuery(e.target.value)} className="mb-2" />
                  <ScrollArea className="h-40 border rounded-lg">
                    <div className="p-2 space-y-1">
                      {customers.filter(c => fuzzySearch(c.name, customerSearchQuery) || (c.phone && fuzzySearch(c.phone, customerSearchQuery))).map(customer => (
                        <button key={customer.id} type="button" className={`w-full text-left p-2 rounded transition-all ${selectedCustomerId === customer.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} onClick={() => setSelectedCustomerId(customer.id)}>
                          <div className="font-medium">{customer.name}</div>
                          {customer.phone && <div className="text-xs opacity-80">{customer.phone}</div>}
                        </button>
                      ))}
                      {customers.filter(c => fuzzySearch(c.name, customerSearchQuery) || (c.phone && fuzzySearch(c.phone, customerSearchQuery))).length === 0 && (
                        <p className="text-center text-muted-foreground text-sm py-4">No customers found</p>
                      )}
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>
            {selectedCustomerId && (() => {
              const debt = loans.filter((l: any) => l.customer_id === selectedCustomerId);
              const owed = debt.reduce((s, l) => s + remainingOf(l), 0);
              const overdue = debt.some((l) => l.due_date && new Date(l.due_date) < new Date());
              return owed > 0 ? (
                <div className={`rounded-lg border p-3 text-sm ${overdue ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'bg-muted/50'}`}>
                  Already owes <strong>{formatAmount(owed)}</strong> on {debt.length} loan{debt.length > 1 ? 's' : ''}{overdue ? ' — some are overdue' : ''}.
                </div>
              ) : null;
            })()}
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Calendar className="h-4 w-4" />Pay back in</Label>
              <div className="grid grid-cols-5 gap-1">
                {['7', '14', '30', '60', '90'].map((d) => (
                  <Button key={d} type="button" size="sm" variant={creditDueDays === d ? 'default' : 'outline'} onClick={() => setCreditDueDays(d)}>{d}d</Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Paid now (optional deposit)</Label>
              <div className="flex gap-2">
                <Input type="number" min="0" placeholder="0" value={creditDeposit} onChange={(e) => setCreditDeposit(e.target.value)} />
                <Select value={creditDepositMethod} onValueChange={setCreditDepositMethod}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.filter((pm) => pm.value !== 'credit').map((pm) => <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-1">
                {[0.25, 0.5].map((f) => (
                  <Button key={f} type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreditDeposit(String(Math.round(getTotalAmount() * f)))}>{f * 100}%</Button>
                ))}
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreditDeposit('')}>None</Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Percent className="h-4 w-4" />Interest Rate (%)</Label>
                <Input type="number" min="0" max="100" step="0.5" value={creditInterestRate} onChange={(e) => setCreditInterestRate(e.target.value)} placeholder="0" />
              </div>
            </div>
            {(() => {
              const total = getTotalAmount();
              const dep = Math.min(Math.max(parseFloat(creditDeposit) || 0, 0), total);
              const rate = parseFloat(creditInterestRate) || 0;
              const interest = (total - dep) * rate / 100;
              return (
                <div className="p-3 bg-primary/10 rounded-lg space-y-1">
                  <div className="flex justify-between text-sm"><span>Cart total:</span><span>{formatAmount(total)}</span></div>
                  {dep > 0 && <div className="flex justify-between text-sm"><span>Paid now:</span><span>− {formatAmount(dep)}</span></div>}
                  {rate > 0 && <div className="flex justify-between text-sm"><span>Interest ({rate}%):</span><span>+ {formatAmount(interest)}</span></div>}
                  <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Customer will owe:</span><span>{formatAmount(total - dep + interest)}</span></div>
                </div>
              );
            })()}
            <div className="flex justify-between text-sm text-muted-foreground"><span>Due Date:</span><span>{format(addDays(new Date(), parseInt(creditDueDays) || 30), 'PPP')}</span></div>
            <Button className="w-full gap-2" size="lg" onClick={processCreditSale} disabled={isProcessing || !selectedCustomerId}>
              <Wallet className="h-5 w-5" />{isProcessing ? 'Processing...' : 'Complete Credit Sale'}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => { setShowCreditDialog(false); setSelectedCustomerId(''); setCustomerSearchQuery(''); }}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      {lastSaleData && <Receipt isOpen={showReceipt} onClose={() => setShowReceipt(false)} saleData={lastSaleData} />}
    </div>
  );
}
