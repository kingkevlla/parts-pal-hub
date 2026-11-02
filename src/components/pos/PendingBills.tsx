import { enqueuePendingSave } from '@/lib/pendingBillQueue';
import { useState, useEffect, useCallback , useRef} from 'react';
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
import { offlineMutate, offlineQuery, offlineInsertSingle } from '@/lib/offlineHelpers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardList, Plus, Trash2, ShoppingCart, UserPlus, Clock, Edit } from 'lucide-react';
import { format } from 'date-fns';

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  isManual?: boolean;
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

interface Warehouse {
  id: string;
  name: string;
}

interface PendingBillsProps {
  selectedWarehouse: string;
  warehouses: Warehouse[];
  cart: CartItem[];
  onLoadBill: (items: CartItem[], billId: string, customerName: string, customerPhone: string, warehouseId: string) => void;
  onBillSaved: () => void;
}

export default function PendingBills({ selectedWarehouse, warehouses, cart, onLoadBill, onBillSaved }: PendingBillsProps) {
  const [bills, setBills] = useState<PendingBill[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [billName, setBillName] = useState('');
  const [billPhone, setBillPhone] = useState('');
  const [billNotes, setBillNotes] = useState('');
  const [billWarehouseId, setBillWarehouseId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeBillId, setActiveBillId] = useState<string | null>(null);
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const { user } = useAuth();

  const fetchBills = useCallback(async () => {
    const [billsRes, itemsRes] = await Promise.all([
      offlineQuery<any>('pending_bills', () => supabase.from('pending_bills').select('*')),
      offlineQuery<any>('pending_bill_items', () => supabase.from('pending_bill_items').select('*')),
    ]);

    const billsData = (billsRes.data || [])
      .filter((b: any) => b.status === 'open')
      .sort((a: any, b: any) =>
        new Date(b.updated_at || b.created_at || 0).getTime() -
        new Date(a.updated_at || a.created_at || 0).getTime()
      );

    if (billsData.length === 0) {
      setBills([]);
      return;
    }

    const billIds = new Set(billsData.map((b: any) => b.id));
    const itemsData = (itemsRes.data || []).filter((i: any) => billIds.has(i.bill_id));

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

  const manualIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    fetchBills();
    offlineQuery<any>('products', () => supabase.from('products').select('id, description')).then(({ data }) => {
      manualIdsRef.current = new Set((data || []).filter((p: any) => p.description === 'Manually added via POS').map((p: any) => p.id));
    }).catch(() => {});
  }, [fetchBills]);

  const getBillTotal = (items: PendingBillItem[]) => {
    return items.reduce((sum, item) => sum + item.subtotal, 0);
  };

  const createNewBill = () => {
    if (!billName.trim()) {
      toast({ title: 'Error', description: 'Customer name is required', variant: 'destructive' });
      return;
    }
    if (cart.length === 0) {
      toast({ title: 'Error', description: 'Cart is empty. Add items before creating a bill.', variant: 'destructive' });
      return;
    }
    const warehouseId = billWarehouseId || warehouses.find(w => w.name !== 'Extra')?.id || warehouses[0]?.id;
    const now = new Date().toISOString();
    const billRow: any = {
      id: crypto.randomUUID(), customer_name: billName.trim(), customer_phone: billPhone.trim() || null,
      warehouse_id: warehouseId, notes: billNotes.trim() || null, created_by: user?.id, status: 'open', updated_at: now,
    };
    const items: PendingBillItem[] = cart.map(item => ({
      id: crypto.randomUUID(), bill_id: billRow.id, product_id: item.productId, product_name: item.name,
      quantity: item.quantity, unit_price: item.price, subtotal: item.subtotal,
    }));
    setBills(prev => [{ ...billRow, created_at: now, items } as PendingBill, ...prev]);
    toast({ title: 'Bill Created', description: `Pending bill for "${billRow.customer_name}" saved` });
    setShowCreateDialog(false); setBillName(''); setBillPhone(''); setBillNotes('');
    onBillSaved();
    enqueuePendingSave(() => offlineInsertSingle<any>('pending_bills', billRow), onSaveError);
    enqueuePendingSave(() => offlineMutate('pending_bill_items', 'insert', items), onSaveError);
  };

  const onSaveError = (e: any) => { toast({ title: 'Not saved', description: e?.message || 'Save failed', variant: 'destructive' }); fetchBills(); };

  // Instant: update the list + clear cart right away, save in the background.
  const addCartToBill = (billId: string) => {
    if (cart.length === 0) {
      toast({ title: 'Error', description: 'Cart is empty', variant: 'destructive' });
      return;
    }
    const bill = bills.find(b => b.id === billId);
    if (!bill) return;
    const items = bill.items.map(i => ({ ...i }));
    const toUpdate: PendingBillItem[] = [];
    const toInsert: PendingBillItem[] = [];
    for (const c of cart) {
      const ex = items.find(ei => ei.product_id === c.productId);
      if (ex) {
        ex.quantity += c.quantity; ex.subtotal = ex.quantity * ex.unit_price;
        if (!toUpdate.includes(ex)) toUpdate.push(ex);
      } else {
        const ni: PendingBillItem = { id: crypto.randomUUID(), bill_id: billId, product_id: c.productId, product_name: c.name, quantity: c.quantity, unit_price: c.price, subtotal: c.subtotal };
        items.push(ni); toInsert.push(ni);
      }
    }
    const now = new Date().toISOString();
    setBills(prev => [{ ...bill, items, updated_at: now } as PendingBill, ...prev.filter(b => b.id !== billId)]);
    toast({ title: 'Items Added', description: `${cart.length} item(s) added to ${bill.customer_name}'s bill` });
    onBillSaved();
    enqueuePendingSave(() => Promise.all([
      ...toUpdate.map(u => offlineMutate('pending_bill_items', 'update', { quantity: u.quantity, subtotal: u.subtotal }, { id: u.id })),
      ...(toInsert.length ? [offlineMutate('pending_bill_items', 'insert', toInsert)] : []),
      offlineMutate('pending_bills', 'update', { updated_at: now }, { id: billId }),
    ]), onSaveError);
  };

  const loadBillToCart = (bill: PendingBill) => {
    const items: CartItem[] = bill.items.map(item => ({
      productId: item.product_id, name: item.product_name, quantity: item.quantity,
      price: item.unit_price, subtotal: item.subtotal, isManual: manualIdsRef.current.has(item.product_id),
    }));
    setActiveBillId(bill.id);
    onLoadBill(items, bill.id, bill.customer_name, bill.customer_phone || '', bill.warehouse_id);
  };

  const runBg = (task: () => Promise<any>) => enqueuePendingSave(task, onSaveError);

  const closeBill = (billId: string) => {
    setBills(prev => prev.filter(b => b.id !== billId));
    setActiveBillId(null);
    toast({ title: 'Bill Closed', description: 'Pending bill has been closed' });
    runBg(() => offlineMutate('pending_bills', 'update', { status: 'closed' }, { id: billId }));
  };

  const deleteBill = (billId: string) => {
    setBills(prev => prev.filter(b => b.id !== billId));
    if (activeBillId === billId) setActiveBillId(null);
    setShowDeleteConfirm(null);
    toast({ title: 'Bill Deleted', description: 'Pending bill removed' });
    runBg(() => offlineMutate('pending_bills', 'delete', null, { id: billId }));
  };

  const removeItemFromBill = (billId: string, itemId: string) => {
    const now = new Date().toISOString();
    setBills(prev => prev.map(b => b.id === billId ? { ...b, items: b.items.filter(i => i.id !== itemId), updated_at: now } : b));
    toast({ title: 'Item Removed' });
    runBg(() => Promise.all([
      offlineMutate('pending_bill_items', 'delete', null, { id: itemId }),
      offlineMutate('pending_bills', 'update', { updated_at: now }, { id: billId }),
    ]));
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
              onClick={() => {
                setBillWarehouseId(selectedWarehouse !== 'all' ? selectedWarehouse : '');
                setShowCreateDialog(true);
              }}
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
              <Label>Warehouse (optional)</Label>
              <Select value={billWarehouseId} onValueChange={setBillWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.filter(w => w.name !== 'Extra').map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
