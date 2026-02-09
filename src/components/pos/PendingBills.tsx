import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ClipboardList, Plus, Trash2, ShoppingCart, UserPlus, Clock, Edit } from 'lucide-react';
import { format } from 'date-fns';

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface PendingBill {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_id: string | null;
  warehouse_id: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: PendingBillItem[];
}

interface PendingBillItem {
  id: string;
  bill_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface PendingBillsProps {
  selectedWarehouse: string;
  cart: CartItem[];
  onLoadBill: (items: CartItem[], billId: string, customerName: string, customerPhone: string) => void;
  onBillSaved: () => void;
}

export default function PendingBills({ selectedWarehouse, cart, onLoadBill, onBillSaved }: PendingBillsProps) {
  const [bills, setBills] = useState<PendingBill[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [billName, setBillName] = useState('');
  const [billPhone, setBillPhone] = useState('');
  const [billNotes, setBillNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeBillId, setActiveBillId] = useState<string | null>(null);
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const { user } = useAuth();

  const fetchBills = useCallback(async () => {
    const { data: billsData, error } = await supabase
      .from('pending_bills')
      .select('*')
      .eq('status', 'open')
      .order('updated_at', { ascending: false });

    if (error) return;

    // Fetch items for all bills
    const billIds = (billsData || []).map(b => b.id);
    if (billIds.length === 0) {
      setBills([]);
      return;
    }

    const { data: itemsData } = await supabase
      .from('pending_bill_items')
      .select('*')
      .in('bill_id', billIds);

    const itemsByBill = new Map<string, PendingBillItem[]>();
    (itemsData || []).forEach(item => {
      const existing = itemsByBill.get(item.bill_id) || [];
      existing.push(item);
      itemsByBill.set(item.bill_id, existing);
    });

    setBills((billsData || []).map(b => ({
      ...b,
      items: itemsByBill.get(b.id) || [],
    })));
  }, []);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const getBillTotal = (items: PendingBillItem[]) => {
    return items.reduce((sum, item) => sum + item.subtotal, 0);
  };

  const createNewBill = async () => {
    if (!billName.trim()) {
      toast({ title: 'Error', description: 'Customer name is required', variant: 'destructive' });
      return;
    }
    if (!selectedWarehouse) {
      toast({ title: 'Error', description: 'Please select a warehouse first', variant: 'destructive' });
      return;
    }
    if (cart.length === 0) {
      toast({ title: 'Error', description: 'Cart is empty. Add items before creating a bill.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const { data: bill, error: billError } = await supabase
        .from('pending_bills')
        .insert({
          customer_name: billName.trim(),
          customer_phone: billPhone.trim() || null,
          warehouse_id: selectedWarehouse,
          notes: billNotes.trim() || null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (billError) throw billError;

      const items = cart.map(item => ({
        bill_id: bill.id,
        product_id: item.productId,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: item.subtotal,
      }));

      const { error: itemsError } = await supabase
        .from('pending_bill_items')
        .insert(items);

      if (itemsError) throw itemsError;

      toast({ title: 'Bill Created', description: `Pending bill for "${billName}" saved` });
      setShowCreateDialog(false);
      setBillName('');
      setBillPhone('');
      setBillNotes('');
      fetchBills();
      onBillSaved(); // clears cart
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const addCartToBill = async (billId: string) => {
    if (cart.length === 0) {
      toast({ title: 'Error', description: 'Cart is empty', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const bill = bills.find(b => b.id === billId);
      if (!bill) return;

      // Merge: if product already exists in bill, update quantity; otherwise insert
      const existingItems = bill.items;
      const toUpdate: { id: string; quantity: number; subtotal: number }[] = [];
      const toInsert: { bill_id: string; product_id: string; product_name: string; quantity: number; unit_price: number; subtotal: number }[] = [];

      for (const cartItem of cart) {
        const existing = existingItems.find(ei => ei.product_id === cartItem.productId);
        if (existing) {
          const newQty = existing.quantity + cartItem.quantity;
          toUpdate.push({ id: existing.id, quantity: newQty, subtotal: newQty * existing.unit_price });
        } else {
          toInsert.push({
            bill_id: billId,
            product_id: cartItem.productId,
            product_name: cartItem.name,
            quantity: cartItem.quantity,
            unit_price: cartItem.price,
            subtotal: cartItem.subtotal,
          });
        }
      }

      // Perform updates
      for (const upd of toUpdate) {
        await supabase
          .from('pending_bill_items')
          .update({ quantity: upd.quantity, subtotal: upd.subtotal })
          .eq('id', upd.id);
      }

      // Perform inserts
      if (toInsert.length > 0) {
        const { error } = await supabase.from('pending_bill_items').insert(toInsert);
        if (error) throw error;
      }

      // Touch updated_at
      await supabase.from('pending_bills').update({ updated_at: new Date().toISOString() }).eq('id', billId);

      toast({ title: 'Items Added', description: `${cart.length} item(s) added to ${bill.customer_name}'s bill` });
      fetchBills();
      onBillSaved(); // clears cart
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadBillToCart = (bill: PendingBill) => {
    const items: CartItem[] = bill.items.map(item => ({
      productId: item.product_id,
      name: item.product_name,
      quantity: item.quantity,
      price: item.unit_price,
      subtotal: item.subtotal,
    }));
    setActiveBillId(bill.id);
    onLoadBill(items, bill.id, bill.customer_name, bill.customer_phone || '');
  };

  const closeBill = async (billId: string) => {
    try {
      await supabase.from('pending_bills').update({ status: 'closed' }).eq('id', billId);
      setActiveBillId(null);
      fetchBills();
      toast({ title: 'Bill Closed', description: 'Pending bill has been closed' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const deleteBill = async (billId: string) => {
    try {
      // Items cascade delete
      await supabase.from('pending_bills').delete().eq('id', billId);
      if (activeBillId === billId) setActiveBillId(null);
      setShowDeleteConfirm(null);
      fetchBills();
      toast({ title: 'Bill Deleted', description: 'Pending bill removed' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const removeItemFromBill = async (billId: string, itemId: string) => {
    try {
      await supabase.from('pending_bill_items').delete().eq('id', itemId);
      await supabase.from('pending_bills').update({ updated_at: new Date().toISOString() }).eq('id', billId);
      fetchBills();
      toast({ title: 'Item Removed' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const filteredBills = bills.filter(b =>
    b.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.customer_phone && b.customer_phone.includes(searchQuery))
  );

  const selectedBill = bills.find(b => b.id === activeBillId);

  return (
    <div className="grid gap-4 lg:grid-cols-2 h-full">
      {/* Bills List */}
      <Card className="flex flex-col overflow-hidden">
        <CardContent className="p-4 flex flex-col flex-1 overflow-hidden">
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Search by customer name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              disabled={cart.length === 0}
              className="gap-1 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" /> New Bill
            </Button>
          </div>

          <ScrollArea className="flex-1">
            {filteredBills.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mb-2 opacity-50" />
                <p className="text-sm">No pending bills</p>
                <p className="text-xs mt-1">Add items to cart then create a bill</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredBills.map((bill) => {
                  const total = getBillTotal(bill.items);
                  const itemCount = bill.items.reduce((sum, i) => sum + i.quantity, 0);
                  return (
                    <div
                      key={bill.id}
                      className={`p-3 rounded-lg border transition-all cursor-pointer ${
                        activeBillId === bill.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                      }`}
                      onClick={() => setActiveBillId(activeBillId === bill.id ? null : bill.id)}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <span className="font-medium">{bill.customer_name}</span>
                          {bill.customer_phone && (
                            <p className="text-xs text-muted-foreground">{bill.customer_phone}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {itemCount} items
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(new Date(bill.updated_at), 'PP p')}
                        </div>
                        <span className="font-semibold text-sm">{formatAmount(total)}</span>
                      </div>
                      {bill.notes && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{bill.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Bill Details */}
      <Card className="flex flex-col overflow-hidden">
        <CardContent className="p-4 flex flex-col flex-1 overflow-hidden">
          {selectedBill ? (
            <>
              <div className="p-3 bg-muted rounded-lg mb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">{selectedBill.customer_name}</h3>
                    {selectedBill.customer_phone && (
                      <p className="text-sm text-muted-foreground">{selectedBill.customer_phone}</p>
                    )}
                  </div>
                  <Badge>Open</Badge>
                </div>
                {selectedBill.notes && (
                  <p className="text-sm text-muted-foreground mt-2">{selectedBill.notes}</p>
                )}
              </div>

              <ScrollArea className="flex-1 mb-4">
                <div className="space-y-2">
                  {selectedBill.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">{formatAmount(item.unit_price)} × {item.quantity}</p>
                      </div>
                      <span className="font-medium text-sm w-20 text-right">{formatAmount(item.subtotal)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeItemFromBill(selectedBill.id, item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="border-t pt-3 space-y-3">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>{formatAmount(getBillTotal(selectedBill.items))}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="gap-1"
                    onClick={() => addCartToBill(selectedBill.id)}
                    disabled={cart.length === 0 || isLoading}
                  >
                    <Plus className="h-4 w-4" /> Add Cart Items
                  </Button>
                  <Button
                    className="gap-1"
                    onClick={() => loadBillToCart(selectedBill)}
                  >
                    <ShoppingCart className="h-4 w-4" /> Load to Pay
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="gap-1 text-destructive hover:text-destructive"
                    onClick={() => setShowDeleteConfirm(selectedBill.id)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete Bill
                  </Button>
                  <Button
                    variant="secondary"
                    className="gap-1"
                    onClick={() => closeBill(selectedBill.id)}
                  >
                    Close Bill
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ClipboardList className="h-12 w-12 mb-3 opacity-50" />
              <p className="font-medium">Select a pending bill</p>
              <p className="text-sm mt-1">Or add items to cart and create a new bill</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Bill Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Create Pending Bill
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm">
              <span className="font-medium">{cart.length} item(s)</span> in cart will be saved to this bill
            </div>
            <div className="space-y-2">
              <Label>Customer Name *</Label>
              <Input
                placeholder="Enter customer name"
                value={billName}
                onChange={(e) => setBillName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone (optional)</Label>
              <Input
                placeholder="Phone number"
                value={billPhone}
                onChange={(e) => setBillPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="e.g. Table 5, waiting for more guests..."
                value={billNotes}
                onChange={(e) => setBillNotes(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={createNewBill}
              disabled={isLoading || !billName.trim()}
            >
              {isLoading ? 'Saving...' : 'Save Bill'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Pending Bill?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove this bill and all its items. This action cannot be undone.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => showDeleteConfirm && deleteBill(showDeleteConfirm)}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
