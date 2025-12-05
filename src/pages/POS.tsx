import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Trash2, AlertTriangle, Minus, Plus, Package, CreditCard, Banknote, Smartphone, Building2, X, Split } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import Receipt from '@/components/pos/Receipt';
import POSHeader from '@/components/pos/POSHeader';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  selling_price: number;
  min_stock_level: number | null;
  image_url: string | null;
  stock?: number;
}

interface SplitPayment {
  method: string;
  amount: number;
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
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
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
  const { toast } = useToast();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { settings } = useSystemSettings();

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: Banknote },
    { value: 'card', label: 'Card', icon: CreditCard },
    { value: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
    { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2 },
  ];

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (selectedWarehouse) {
      fetchProductsWithStock();
    }
  }, [selectedWarehouse]);

  const fetchProductsWithStock = async () => {
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id, name, sku, selling_price, min_stock_level, image_url')
      .eq('is_active', true)
      .order('name');
    
    if (productsError) return;

    const { data: inventoryData } = await supabase
      .from('inventory')
      .select('product_id, quantity')
      .eq('warehouse_id', selectedWarehouse);

    const stockMap = new Map(inventoryData?.map(i => [i.product_id, i.quantity || 0]) || []);
    
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
      if (data && data.length > 0) setSelectedWarehouse(data[0].id);
    }
  };

  const getStockStatus = (product: ProductWithStock) => {
    const stock = product.stock || 0;
    const minStock = product.min_stock_level || settings.low_stock_threshold;
    if (stock === 0) return 'out';
    if (stock <= minStock) return 'low';
    return 'ok';
  };

  const addToCart = (product: ProductWithStock, qty: number = 1) => {
    if (!selectedWarehouse) {
      toast({ title: 'Error', description: 'Please select a warehouse', variant: 'destructive' });
      return;
    }

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

    if (!selectedWarehouse) {
      toast({ title: 'Error', description: 'Please select a warehouse', variant: 'destructive' });
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

  const filteredProducts = products.filter(p => 
    fuzzySearch(p.name, searchQuery) ||
    (p.sku && fuzzySearch(p.sku, searchQuery))
  );

  const handleRefresh = () => {
    fetchProductsWithStock();
    fetchWarehouses();
    toast({ title: 'Refreshed', description: 'Products and stock updated' });
  };

  return (
    <div className="h-screen flex flex-col bg-muted/30">
      <POSHeader 
        cartItemCount={cart.length}
        cartTotal={getTotalAmount()}
        onRefresh={handleRefresh}
      />

      <div className="flex-1 overflow-hidden p-4">
        <div className="grid gap-4 lg:grid-cols-3 h-full max-w-[1600px] mx-auto">
          {/* Products Grid */}
          <Card className="lg:col-span-2 flex flex-col overflow-hidden">
            <CardContent className="p-4 flex flex-col flex-1 overflow-hidden">
              <div className="flex gap-3 mb-4">
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select Warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
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
                  <div className="grid grid-cols-4 gap-1">
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
                    onClick={() => processSale(false)} 
                    disabled={isProcessing || cart.length === 0}
                  >
                    {isProcessing ? 'Processing...' : 'Pay Now'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
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

      {lastSaleData && (
        <Receipt isOpen={showReceipt} onClose={() => setShowReceipt(false)} saleData={lastSaleData} />
      )}
    </div>
  );
}
