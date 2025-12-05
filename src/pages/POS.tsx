import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Trash2, AlertTriangle, Minus, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import Receipt from '@/components/pos/Receipt';
import POSHeader from '@/components/pos/POSHeader';
import { Badge } from '@/components/ui/badge';

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
  stock?: number;
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
  const { toast } = useToast();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { settings } = useSystemSettings();

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
      .select('id, name, sku, selling_price, min_stock_level')
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

  const processSale = async () => {
    if (cart.length === 0) {
      toast({ title: 'Error', description: 'Cart is empty', variant: 'destructive' });
      return;
    }

    if (!selectedWarehouse) {
      toast({ title: 'Error', description: 'Please select a warehouse', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);

    try {
      const transactionNumber = `TXN-${Date.now()}`;
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert({
          transaction_number: transactionNumber,
          total_amount: getTotalAmount(),
          payment_method: paymentMethod,
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
        payment_method: paymentMethod,
        customer_name: customerName,
        customer_phone: customerPhone,
        sale_date: new Date().toISOString(),
      });

      setShowReceipt(true);
      toast({ title: 'Success', description: 'Sale completed successfully' });

      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setPaymentMethod('cash');
      fetchProductsWithStock(); // Refresh stock

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

      <div className="flex-1 overflow-auto p-4">
        <div className="grid gap-4 md:grid-cols-2 max-w-6xl mx-auto">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Select Warehouse</Label>
              <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Search Products</Label>
              <Input
                placeholder="Search by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            {searchQuery && (
              <div className="max-h-56 overflow-y-auto border rounded-md divide-y">
                {filteredProducts.length === 0 ? (
                  <div className="p-3 text-center text-muted-foreground">No products found</div>
                ) : (
                  filteredProducts.slice(0, 15).map(product => {
                    const stockStatus = getStockStatus(product);
                    return (
                      <button
                        key={product.id}
                        type="button"
                        disabled={stockStatus === 'out'}
                        className="w-full text-left px-3 py-2 hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => {
                          addToCart(product);
                          setSearchQuery('');
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{product.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {product.sku && `SKU: ${product.sku} • `}{formatAmount(product.selling_price)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {stockStatus === 'low' && (
                              <AlertTriangle className="h-4 w-4 text-orange-500" />
                            )}
                            <Badge 
                              variant={stockStatus === 'out' ? 'destructive' : stockStatus === 'low' ? 'secondary' : 'outline'}
                              className={stockStatus === 'low' ? 'bg-orange-100 text-orange-700 border-orange-300' : ''}
                            >
                              {product.stock} in stock
                            </Badge>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {cart.length > 0 && (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item) => (
                      <TableRow key={item.productId}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
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
                              className="w-14 h-7 text-center"
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
                        </TableCell>
                        <TableCell className="text-right">{formatAmount(item.subtotal)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFromCart(item.productId)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total:</span>
                  <span>{formatAmount(getTotalAmount())}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Customer Name (Optional)</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Enter customer name" />
            </div>

            <div className="space-y-2">
              <Label>Phone Number (Optional)</Label>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Enter phone number" />
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full" size="lg" onClick={processSale} disabled={isProcessing || cart.length === 0}>
              {isProcessing ? 'Processing...' : `Complete Sale - ${formatAmount(getTotalAmount())}`}
            </Button>
          </CardContent>
        </Card>
      </div>

      {lastSaleData && (
        <Receipt isOpen={showReceipt} onClose={() => setShowReceipt(false)} saleData={lastSaleData} />
      )}
      </div>
    </div>
  );
}
