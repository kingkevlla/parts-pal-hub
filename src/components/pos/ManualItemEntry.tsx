import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, PenLine, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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
    // Check if "Extra" warehouse exists
    const { data: existing } = await supabase
      .from('warehouses')
      .select('id')
      .eq('name', EXTRA_WAREHOUSE_NAME)
      .limit(1);

    if (existing && existing.length > 0) {
      return existing[0].id;
    }

    // Create "Extra" warehouse
    const { data: created, error } = await supabase
      .from('warehouses')
      .insert({ name: EXTRA_WAREHOUSE_NAME, location: 'Manual/Extra Items', is_active: true })
      .select('id')
      .single();

    if (error) throw new Error('Failed to create Extra warehouse: ' + error.message);
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

      // Create product record
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          name,
          selling_price: price,
          purchase_price: 0,
          is_active: true,
          min_stock_level: 0,
          description: 'Manually added via POS',
        })
        .select('id')
        .single();

      if (productError) throw productError;

      // Create stock movement (in) to add inventory via trigger
      const { error: movementError } = await supabase
        .from('stock_movements')
        .insert({
          product_id: product.id,
          warehouse_id: warehouseId,
          quantity: qty,
          movement_type: 'in',
          notes: 'Manual POS item - auto stock',
          created_by: user?.id,
        });

      if (movementError) throw movementError;

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
