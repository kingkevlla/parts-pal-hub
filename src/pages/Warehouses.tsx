import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Warehouse } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface WarehouseData {
  id: string;
  name: string;
  location: string;
  created_at: string;
}

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseData | null>(null);
  const [deleteWarehouse, setDeleteWarehouse] = useState<WarehouseData | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setWarehouses(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const warehouseData = {
      name: formData.get('name') as string,
      location: formData.get('location') as string,
    };

    let error;
    if (editingWarehouse) {
      const result = await supabase.from('warehouses').update(warehouseData).eq('id', editingWarehouse.id);
      error = result.error;
    } else {
      const result = await supabase.from('warehouses').insert(warehouseData);
      error = result.error;
    }

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: `Warehouse ${editingWarehouse ? 'updated' : 'created'} successfully` });
      setIsOpen(false);
      setEditingWarehouse(null);
      fetchWarehouses();
    }

    setIsLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteWarehouse) return;

    const { error } = await supabase.from('warehouses').delete().eq('id', deleteWarehouse.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Warehouse deleted successfully' });
      fetchWarehouses();
    }
    setDeleteWarehouse(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Warehouse Management</h1>
          <p className="text-muted-foreground">Manage storage locations and inventory</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setEditingWarehouse(null); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Warehouse
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingWarehouse ? 'Edit Warehouse' : 'Add New Warehouse'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Warehouse Name</Label>
                <Input id="name" name="name" required placeholder="e.g., Main Warehouse" defaultValue={editingWarehouse?.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" name="location" required placeholder="e.g., 123 Storage St" defaultValue={editingWarehouse?.location} />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Saving...' : editingWarehouse ? 'Update Warehouse' : 'Create Warehouse'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {warehouses.map((warehouse) => (
          <Card key={warehouse.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{warehouse.name}</CardTitle>
              <Warehouse className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{warehouse.location}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Added {new Date(warehouse.created_at).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Warehouses</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((warehouse) => (
                <TableRow key={warehouse.id}>
                  <TableCell className="font-medium">{warehouse.name}</TableCell>
                  <TableCell>{warehouse.location}</TableCell>
                  <TableCell>{new Date(warehouse.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingWarehouse(warehouse); setIsOpen(true); }}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteWarehouse(warehouse)}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteWarehouse} onOpenChange={(open) => !open && setDeleteWarehouse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteWarehouse?.name}. This action cannot be undone.
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
