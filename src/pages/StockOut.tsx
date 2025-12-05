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
  created_at: string | null;
  reference_number: string | null;
  notes: string | null;
  quantity: number;
  product_name: string;
  warehouse_name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
}

interface Warehouse {
  id: string;
  name: string;
}

export default function StockOut() {
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
      .select('id, created_at, reference_number, notes, quantity, movement_type, products(name), warehouses(name)')
      .eq('movement_type', 'out')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      const movements: StockMovement[] = (data || []).map(m => ({
        id: m.id,
        created_at: m.created_at,
        reference_number: m.reference_number,
        notes: m.notes,
        quantity: m.quantity,
        product_name: (m.products as any)?.name || 'Unknown',
        warehouse_name: (m.warehouses as any)?.name || 'Unknown'
      }));
      setStockMovements(movements);
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

    const { error } = await supabase.from('stock_movements').insert({
      product_id: productId,
      warehouse_id: warehouseId,
      movement_type: 'out',
      quantity,
      reference_number: formData.get('reference') as string || null,
      notes: formData.get('notes') as string || null,
      created_by: user?.id,
    });

    if (error) {
      toast({ 
        title: 'Error', 
        description: error.message.includes('Insufficient stock') 
          ? 'Insufficient stock in selected warehouse' 
          : error.message, 
        variant: 'destructive' 
      });
    } else {
      toast({ title: 'Success', description: 'Stock out recorded successfully' });
      setIsOpen(false);
      fetchStockMovements();
    }

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
          <h1 className="text-3xl font-bold">Stock Out</h1>
          <p className="text-muted-foreground">Record parts sold to customers and workshops</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Stock Out
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Stock Out</DialogTitle>
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
                        {product.name} {product.sku && `(${product.sku})`}
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
                <Label htmlFor="reference">Reference (Customer, Order#)</Label>
                <Input id="reference" name="reference" placeholder="Mike's Garage" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" placeholder="Additional notes" />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Recording...' : 'Record Stock Out'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Stock Out Transactions</CardTitle>
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
                {stockMovements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No stock movements found
                    </td>
                  </tr>
                ) : (
                  stockMovements.map((movement) => (
                    <tr key={movement.id} className="border-b transition-colors hover:bg-muted/50">
                      <td className="py-3 px-4 text-sm">
                        {movement.created_at ? new Date(movement.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="py-3 px-4 font-medium">{movement.product_name}</td>
                      <td className="py-3 px-4">{movement.warehouse_name}</td>
                      <td className="py-3 px-4 text-red-600 font-medium">-{movement.quantity}</td>
                      <td className="py-3 px-4">{movement.reference_number || 'N/A'}</td>
                      <td className="py-3 px-4">
                        <Button variant="ghost" size="sm" onClick={() => setDeleteMovement(movement)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
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
