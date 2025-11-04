import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, ShoppingCart, CreditCard, DollarSign } from 'lucide-react';
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
  location: string;
}

export default function POS() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [dueDate, setDueDate] = useState('');
  const [interestRate, setInterestRate] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [loans, setLoans] = useState<any[]>([]);
  const [selectedLoan, setSelectedLoan] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSaleData, setLastSaleData] = useState<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();

  useEffect(() => {
    fetchProducts();
    fetchWarehouses();
    fetchLoans();
  }, []);

  const fetchProducts = async () => {
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (!error) setProducts(data || []);
  };

  const fetchWarehouses = async () => {
    const { data, error } = await supabase.from('warehouses').select('*').order('name');
    if (!error) {
      setWarehouses(data || []);
      if (data && data.length > 0) setSelectedWarehouse(data[0].id);
    }
  };

  const fetchLoans = async () => {
    const { data, error } = await supabase
      .from('loans')
      .select('*')
      .in('status', ['active', 'overdue'])
      .order('created_at', { ascending: false });
    if (!error) setLoans(data || []);
  };

  const addToCart = async (item: CartItem) => {
    if (!selectedWarehouse) {
      toast({ title: 'Error', description: 'Please select a warehouse', variant: 'destructive' });
      return;
    }

    // Check available stock
    const { data: inventory } = await supabase
      .from('inventory')
      .select('quantity')
      .eq('product_id', item.productId)
      .eq('warehouse_id', selectedWarehouse)
      .single();

    const currentCartQty = cart.find(i => i.productId === item.productId)?.quantity || 0;
    const totalQty = currentCartQty + item.quantity;

    if (!inventory || inventory.quantity < totalQty) {
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

  const getTotalAmount = () => {
    return cart.reduce((sum, item) => sum + item.subtotal, 0);
  };

  const processSale = async () => {
    if (cart.length === 0) {
      toast({ title: 'Error', description: 'Cart is empty', variant: 'destructive' });
      return;
    }

    if (!selectedWarehouse) {
      toast({ title: 'Error', description: 'Please select a warehouse', variant: 'destructive' });
      return;
    }

    if (paymentMethod === 'credit' && !customerName) {
      toast({ title: 'Error', description: 'Customer name is required for credit sales', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);

    try {
      if (paymentMethod === 'credit') {
        // Create loan instead of immediate sale
        const { data: loan, error: loanError } = await supabase
          .from('loans')
          .insert({
            borrower_name: customerName,
            borrower_phone: customerPhone || null,
            amount: getTotalAmount(),
            amount_paid: 0,
            interest_rate: interestRate,
            status: 'active',
            due_date: dueDate || null,
            user_id: user?.id,
          })
          .select()
          .single();

        if (loanError) throw loanError;

        // Create stock movements for loan items
        const stockMovements = cart.map(item => ({
          product_id: item.productId,
          warehouse_id: selectedWarehouse,
          quantity: item.quantity,
          type: 'sale',
          reference: `LOAN-${loan.id.substring(0, 8)}`,
          notes: `Credit sale to ${customerName} (Loan)`,
          user_id: user?.id,
        }));

        const { error: movementError } = await supabase.from('stock_movements').insert(stockMovements);
        if (movementError) throw movementError;

        toast({ title: 'Success', description: 'Loan created successfully' });
        fetchLoans();
      } else {
        // Regular sale process
        const { data: sale, error: saleError } = await supabase
          .from('sales')
          .insert({
            customer_name: customerName || null,
            customer_phone: customerPhone || null,
            total_amount: getTotalAmount(),
            payment_method: paymentMethod,
            user_id: user?.id,
          })
          .select()
          .single();

        if (saleError) throw saleError;

        const saleItems = cart.map(item => ({
          sale_id: sale.id,
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.price,
          subtotal: item.subtotal,
        }));

        const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
        if (itemsError) throw itemsError;

        const stockMovements = cart.map(item => ({
          product_id: item.productId,
          warehouse_id: selectedWarehouse,
          quantity: item.quantity,
          type: 'sale',
          reference: `SALE-${sale.id.substring(0, 8)}`,
          notes: `POS Sale to ${customerName || 'Walk-in customer'}`,
          user_id: user?.id,
        }));

        const { error: movementError } = await supabase.from('stock_movements').insert(stockMovements);
        if (movementError) throw movementError;

        const { error: transactionError } = await supabase.from('transactions').insert({
          type: 'income',
          amount: getTotalAmount(),
          description: `Sale to ${customerName || 'Walk-in customer'}`,
          category: 'sales',
          user_id: user?.id,
        });

        if (transactionError) throw transactionError;

        // Prepare receipt data
        const receiptData = {
          id: sale.id,
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
        };

        setLastSaleData(receiptData);
        setShowReceipt(true);

        toast({ title: 'Success', description: 'Sale completed successfully' });
      }

      // Reset form
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setPaymentMethod('cash');
      setDueDate('');
      setInterestRate(0);

    } catch (error: any) {
      const errorMsg = error.message.includes('Insufficient stock') 
        ? 'Insufficient stock in warehouse' 
        : error.message;
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const processLoanPayment = async () => {
    if (!selectedLoan || paymentAmount <= 0) {
      toast({ title: 'Error', description: 'Please select a loan and enter payment amount', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);

    try {
      const loan = loans.find(l => l.id === selectedLoan);
      const newAmountPaid = parseFloat(loan.amount_paid) + paymentAmount;
      const totalDue = parseFloat(loan.amount) * (1 + parseFloat(loan.interest_rate) / 100);
      
      const newStatus = newAmountPaid >= totalDue ? 'paid' : 'active';

      // Update loan
      const { error: loanError } = await supabase
        .from('loans')
        .update({ 
          amount_paid: newAmountPaid,
          status: newStatus,
        })
        .eq('id', selectedLoan);

      if (loanError) throw loanError;

      // Create loan payment record
      const { error: paymentError } = await supabase.from('loan_payments').insert({
        loan_id: selectedLoan,
        amount: paymentAmount,
        user_id: user?.id,
      });

      if (paymentError) throw paymentError;

      // Create transaction record
      const { error: transactionError } = await supabase.from('transactions').insert({
        type: 'income',
        amount: paymentAmount,
        description: `Loan payment from ${loan.borrower_name}`,
        category: 'loan_repayment',
        user_id: user?.id,
      });

      if (transactionError) throw transactionError;

      toast({ title: 'Success', description: 'Payment recorded successfully' });
      
      setSelectedLoan('');
      setPaymentAmount(0);
      fetchLoans();

    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Point of Sale</h1>
        <p className="text-muted-foreground">Process sales and manage transactions</p>
      </div>

      <Tabs defaultValue="sale" className="space-y-6">
        <TabsList>
          <TabsTrigger value="sale">
            <ShoppingCart className="h-4 w-4 mr-2" />
            New Sale
          </TabsTrigger>
          <TabsTrigger value="loans">
            <CreditCard className="h-4 w-4 mr-2" />
            Loan Payments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sale" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Shopping Cart
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 space-y-4">
              <div className="space-y-2">
                <Label>Select Warehouse</Label>
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.name} - {warehouse.location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Select Product</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - {formatAmount(product.selling_price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
                <Button
                  className="mt-6"
                  onClick={() => {
                    const product = products.find(p => p.id === selectedProduct);
                    if (product) {
                      addToCart({
                        productId: product.id,
                        name: product.name,
                        quantity,
                        price: product.selling_price,
                        subtotal: product.selling_price * quantity,
                      });
                      setSelectedProduct('');
                      setQuantity(1);
                    }
                  }}
                  disabled={!selectedProduct || !selectedWarehouse}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Cart is empty</p>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item) => (
                      <TableRow key={item.productId}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatAmount(item.price)}</TableCell>
                        <TableCell>{formatAmount(item.subtotal)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFromCart(item.productId)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="border-t pt-4">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span>{formatAmount(getTotalAmount())}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer & Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name">Customer Name (Optional)</Label>
              <Input
                id="customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-phone">Phone Number (Optional)</Label>
              <Input
                id="customer-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Enter phone number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="credit">Credit/Loan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === 'credit' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="due-date">Due Date (Optional)</Label>
                  <Input
                    id="due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="interest-rate">Interest Rate (%)</Label>
                  <Input
                    id="interest-rate"
                    type="number"
                    min="0"
                    step="0.1"
                    value={interestRate}
                    onChange={(e) => setInterestRate(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={processSale}
              disabled={isProcessing || cart.length === 0}
            >
              {isProcessing ? 'Processing...' : paymentMethod === 'credit' 
                ? `Create Loan - ${formatAmount(getTotalAmount())}` 
                : `Complete Sale - ${formatAmount(getTotalAmount())}`}
            </Button>
          </CardContent>
        </Card>
          </div>
        </TabsContent>

        <TabsContent value="loans" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Active Loans</CardTitle>
              </CardHeader>
              <CardContent>
                {loans.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No active loans</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Borrower</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loans.map((loan) => {
                        const totalDue = parseFloat(loan.amount) * (1 + parseFloat(loan.interest_rate) / 100);
                        const balance = totalDue - parseFloat(loan.amount_paid);
                        return (
                          <TableRow 
                            key={loan.id}
                            className="cursor-pointer hover:bg-accent"
                            onClick={() => {
                              setSelectedLoan(loan.id);
                              setPaymentAmount(balance);
                            }}
                          >
                            <TableCell>
                              <div>
                                <div className="font-medium">{loan.borrower_name}</div>
                                {loan.borrower_phone && (
                                  <div className="text-sm text-muted-foreground">{loan.borrower_phone}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{formatAmount(parseFloat(loan.amount))}</TableCell>
                            <TableCell>{formatAmount(parseFloat(loan.amount_paid))}</TableCell>
                            <TableCell className="font-medium">{formatAmount(balance)}</TableCell>
                            <TableCell>
                              <Badge variant={loan.status === 'active' ? 'default' : 'destructive'}>
                                {loan.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Record Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Loan</Label>
                  <Select value={selectedLoan} onValueChange={setSelectedLoan}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a loan" />
                    </SelectTrigger>
                    <SelectContent>
                      {loans.map((loan) => {
                        const totalDue = parseFloat(loan.amount) * (1 + parseFloat(loan.interest_rate) / 100);
                        const balance = totalDue - parseFloat(loan.amount_paid);
                        return (
                          <SelectItem key={loan.id} value={loan.id}>
                            {loan.borrower_name} - Balance: {formatAmount(balance)}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {selectedLoan && (
                  <>
                    <div className="p-4 bg-muted rounded-lg space-y-2">
                      {(() => {
                        const loan = loans.find(l => l.id === selectedLoan);
                        if (!loan) return null;
                        const totalDue = parseFloat(loan.amount) * (1 + parseFloat(loan.interest_rate) / 100);
                        const balance = totalDue - parseFloat(loan.amount_paid);
                        return (
                          <>
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Original Amount:</span>
                              <span className="font-medium">{formatAmount(parseFloat(loan.amount))}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Interest ({loan.interest_rate}%):</span>
                              <span className="font-medium">{formatAmount(totalDue - parseFloat(loan.amount))}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Total Due:</span>
                              <span className="font-medium">{formatAmount(totalDue)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Paid:</span>
                              <span className="font-medium">{formatAmount(parseFloat(loan.amount_paid))}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2">
                              <span className="font-semibold">Balance:</span>
                              <span className="font-bold text-lg">{formatAmount(balance)}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="payment-amount">Payment Amount</Label>
                      <Input
                        id="payment-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={processLoanPayment}
                      disabled={isProcessing || !selectedLoan || paymentAmount <= 0}
                    >
                      {isProcessing ? 'Processing...' : `Record Payment - $${paymentAmount.toFixed(2)}`}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Receipt Dialog */}
      {lastSaleData && (
        <Receipt
          isOpen={showReceipt}
          onClose={() => setShowReceipt(false)}
          saleData={lastSaleData}
        />
      )}
    </div>
  );
}
