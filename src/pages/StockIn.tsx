import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface StockMovement {
  id: string;
  created_at: string;
  reference: string;
  notes: string;
  quantity: number;
  products: { name: string };
  warehouses: { name: string };
}

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface Warehouse {
  id: string;
  name: string;
}

export default function StockIn() {
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteMovement, setDeleteMovement] = useState<StockMovement | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchStockMovements();
    fetchProducts();
    fetchWarehouses();
  }, []);

  const fetchStockMovements = async () => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*, products(name), warehouses(name)')
      .eq('type', 'in')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setStockMovements(data || []);
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase.from('products').select('id, name, sku').order('name');
    if (!error) setProducts(data || []);
  };

  const fetchWarehouses = async () => {
    const { data, error } = await supabase.from('warehouses').select('id, name').order('name');
    if (!error) setWarehouses(data || []);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const productId = formData.get('product_id') as string;
    const warehouseId = formData.get('warehouse_id') as string;
    const quantity = parseInt(formData.get('quantity') as string);

    // Create stock movement
    const { error: movementError } = await supabase.from('stock_movements').insert({
      product_id: productId,
      warehouse_id: warehouseId,
      type: 'in',
      quantity,
      reference: formData.get('reference') as string,
      notes: formData.get('notes') as string,
      user_id: user?.id,
    });

    if (movementError) {
      toast({ title: 'Error', description: movementError.message, variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    // Update inventory
    const { data: existingInventory } = await supabase
      .from('inventory')
      .select('*')
      .eq('product_id', productId)
      .eq('warehouse_id', warehouseId)
      .single();

    if (existingInventory) {
      await supabase
        .from('inventory')
        .update({ quantity: existingInventory.quantity + quantity })
        .eq('id', existingInventory.id);
    } else {
      await supabase.from('inventory').insert({
        product_id: productId,
        warehouse_id: warehouseId,
        quantity,
      });
    }

    toast({ title: 'Success', description: 'Stock in recorded successfully' });
    setIsOpen(false);
    fetchStockMovements();
    setIsLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteMovement) return;

    const { error } = await supabase.from('stock_movements').delete().eq('id', deleteMovement.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Stock movement deleted successfully' });
      fetchStockMovements();
    }
    setDeleteMovement(null);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Stock In</h1>
          <p className="text-muted-foreground">Record incoming inventory from suppliers</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Stock In
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Stock In</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product_id">Product</Label>
                <Select name="product_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} ({product.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse_id">Warehouse</Label>
                <Select name="warehouse_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" name="quantity" type="number" min="1" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Reference (PO#, Invoice#)</Label>
                <Input id="reference" name="reference" placeholder="PO-12345" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" placeholder="Additional notes" />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Recording...' : 'Record Stock In'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Stock In Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Date</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Product</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Warehouse</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Quantity</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Reference</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stockMovements.map((movement) => (
                  <tr key={movement.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="py-3 px-4 text-sm">{new Date(movement.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-4 font-medium">{movement.products.name}</td>
                    <td className="py-3 px-4">{movement.warehouses.name}</td>
                    <td className="py-3 px-4 text-green-600 font-medium">+{movement.quantity}</td>
                    <td className="py-3 px-4">{movement.reference || 'N/A'}</td>
                    <td className="py-3 px-4">
                      <Button variant="ghost" size="sm" onClick={() => setDeleteMovement(movement)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteMovement} onOpenChange={(open) => !open && setDeleteMovement(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this stock movement. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
