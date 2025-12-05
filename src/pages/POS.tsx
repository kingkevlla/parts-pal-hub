import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, ShoppingCart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import Receipt from '@/components/pos/Receipt';

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

export default function POS() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSaleData, setLastSaleData] = useState<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();

  useEffect(() => {
    fetchProducts();
    fetchWarehouses();
  }, []);

  const fetchProducts = async () => {
    const { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('name');
    if (!error) setProducts(data || []);
  };

  const fetchWarehouses = async () => {
    const { data, error } = await supabase.from('warehouses').select('*').eq('is_active', true).order('name');
    if (!error) {
      setWarehouses(data || []);
      if (data && data.length > 0) setSelectedWarehouse(data[0].id);
    }
  };

  const addToCart = async (item: CartItem) => {
    if (!selectedWarehouse) {
      toast({ title: 'Error', description: 'Please select a warehouse', variant: 'destructive' });
      return;
    }

    const { data: inventory } = await supabase
      .from('inventory')
      .select('quantity')
      .eq('product_id', item.productId)
      .eq('warehouse_id', selectedWarehouse)
      .maybeSingle();

    const currentCartQty = cart.find(i => i.productId === item.productId)?.quantity || 0;
    const totalQty = currentCartQty + item.quantity;

    if (!inventory || (inventory.quantity || 0) < totalQty) {
      toast({ 
        title: 'Error', 
        description: `Insufficient stock. Available: ${inventory?.quantity || 0}`, 
        variant: 'destructive' 
      });
      return;
    }

    setCart(prev => {
      const existing = prev.find(i => i.productId === item.productId);
      if (existing) {
        return prev.map(i => 
          i.productId === item.productId 
            ? { ...i, quantity: i.quantity + item.quantity, subtotal: (i.quantity + item.quantity) * i.price }
            : i
        );
      }
      return [...prev, item];
    });
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
      // Create transaction
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
        notes: `POS Sale to ${customerName || 'Walk-in customer'}`,
        created_by: user?.id,
      }));

      const { error: movementError } = await supabase.from('stock_movements').insert(stockMovements);
      if (movementError) throw movementError;

      // Prepare receipt data
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

      // Reset form
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setPaymentMethod('cash');

    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  return (
    <div className="h-full p-4">
      <div className="flex items-center gap-2 mb-4">
        <ShoppingCart className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Point of Sale</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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
              />
            </div>

            {searchQuery && (
              <div className="max-h-48 overflow-y-auto border rounded-md">
                {filteredProducts.slice(0, 10).map(product => (
                  <button
                    key={product.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
                    onClick={() => {
                      addToCart({
                        productId: product.id,
                        name: product.name,
                        quantity,
                        price: product.selling_price,
                        subtotal: product.selling_price * quantity,
                      });
                      setSearchQuery('');
                      setQuantity(1);
                    }}
                  >
                    <div className="font-medium">{product.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {product.sku && `SKU: ${product.sku} - `}{formatAmount(product.selling_price)}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)} />
            </div>

            {cart.length > 0 && (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item) => (
                      <TableRow key={item.productId}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatAmount(item.subtotal)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeFromCart(item.productId)}>
                            <Trash2 className="h-4 w-4" />
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
  );
}
