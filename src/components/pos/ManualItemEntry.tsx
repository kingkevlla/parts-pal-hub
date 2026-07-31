import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, PenLine, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { offlineQuery, offlineInsertSingle, offlineMutate } from '@/lib/offlineHelpers';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface ManualItemEntryProps {
  onItemAdded: (item: {
    productId: string;
    name: string;
    quantity: number;
    price: number;
    subtotal: number;
  }) => void;
}

const EXTRA_WAREHOUSE_NAME = 'Extra';

export default function ManualItemEntry({ onItemAdded }: ManualItemEntryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemPrice, setItemPrice] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const getOrCreateExtraWarehouse = async (): Promise<string> => {
    // Check if "Extra" warehouse exists (offline-first)
    const { data: warehouses } = await offlineQuery<any>('warehouses', () =>
      supabase.from('warehouses').select('*')
    );
    const existing = (warehouses || []).find((w: any) => w.name === EXTRA_WAREHOUSE_NAME);
    if (existing) return existing.id;

    // Create "Extra" warehouse
    const { data: created, error } = await offlineInsertSingle<any>('warehouses', {
      name: EXTRA_WAREHOUSE_NAME,
      location: 'Manual/Extra Items',
      is_active: true,
    });

    if (error || !created) throw new Error('Failed to create Extra warehouse: ' + (error?.message ?? 'unknown'));
    return created.id;
  };


  const handleAdd = async () => {
    const name = itemName.trim();
    const qty = parseInt(itemQty) || 0;
    const price = parseFloat(itemPrice) || 0;

    if (!name) {
      toast({ title: 'Error', description: 'Item name is required', variant: 'destructive' });
      return;
    }
    if (qty < 1) {
      toast({ title: 'Error', description: 'Quantity must be at least 1', variant: 'destructive' });
      return;
    }
    if (price <= 0) {
      toast({ title: 'Error', description: 'Price must be greater than 0', variant: 'destructive' });
      return;
    }

    setIsAdding(true);
    try {
      const warehouseId = await getOrCreateExtraWarehouse();

      // Create product record (offline-first)
      const { data: product, error: productError } = await offlineInsertSingle<any>('products', {
        name,
        selling_price: price,
        purchase_price: 0,
        is_active: true,
        min_stock_level: 0,
        description: 'Manually added via POS',
      });

      if (productError || !product) throw productError ?? new Error('Failed to create product');

      // Create stock movement (in) to add inventory via trigger
      const movement = await offlineMutate('stock_movements', 'insert', {
        product_id: product.id,
        warehouse_id: warehouseId,
        quantity: qty,
        movement_type: 'in',
        notes: 'Manual POS item - auto stock',
        created_by: user?.id,
      });

      if (!movement.success) throw movement.error ?? new Error('Failed to record stock movement');


      onItemAdded({
        productId: product.id,
        name,
        quantity: qty,
        price,
        subtotal: qty * price,
      });

      // Reset form
      setItemName('');
      setItemQty('1');
      setItemPrice('');
      setIsOpen(false);

      toast({ title: 'Added', description: `"${name}" added to cart` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-t pt-2 mt-2">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full gap-2 text-xs h-8">
          <PenLine className="h-3.5 w-3.5" />
          {isOpen ? 'Close Manual Entry' : 'Add Item Manually'}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        <div>
          <Label className="text-xs">Item Name</Label>
          <Input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="e.g. Custom service"
            className="h-8 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Qty</Label>
            <Input
              type="number"
              min="1"
              value={itemQty}
              onChange={(e) => setItemQty(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Price</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
              placeholder="0"
              className="h-8 text-sm"
            />
          </div>
        </div>
        <Button
          size="sm"
          className="w-full gap-1 h-8"
          onClick={handleAdd}
          disabled={isAdding}
        >
          {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {isAdding ? 'Adding...' : 'Add to Cart'}
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}
