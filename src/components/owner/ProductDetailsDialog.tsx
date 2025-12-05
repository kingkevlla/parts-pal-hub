import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, TrendingUp, TrendingDown, Warehouse } from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  purchase_price: number;
  selling_price: number;
  description?: string | null;
}

interface StockMovement {
  id: string;
  movement_type: string;
  quantity: number;
  reference_number: string | null;
  notes?: string | null;
  created_at: string | null;
  warehouse_name: string;
}

interface InventoryItem {
  quantity: number;
  warehouse_name: string;
  warehouse_location?: string | null;
}

interface ProductDetailsDialogProps {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductDetailsDialog({ productId, open, onOpenChange }: ProductDetailsDialogProps) {
  const { formatAmount } = useCurrency();
  const [product, setProduct] = useState<Product | null>(null);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (productId && open) {
      fetchProductDetails();
    }
  }, [productId, open]);

  const fetchProductDetails = async () => {
    if (!productId) return;
    
    setLoading(true);
    try {
      // Fetch product info
      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('id, name, sku, purchase_price, selling_price, description')
        .eq('id', productId)
        .single();

      if (productError) throw productError;
      
      setProduct({
        id: productData.id,
        name: productData.name,
        sku: productData.sku,
        purchase_price: productData.purchase_price || 0,
        selling_price: productData.selling_price || 0,
        description: productData.description
      });

      // Fetch stock movements
      const { data: movementsData, error: movementsError } = await supabase
        .from('stock_movements')
        .select('id, movement_type, quantity, reference_number, notes, created_at, warehouses(name)')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (movementsError) throw movementsError;
      
      const movements: StockMovement[] = (movementsData || []).map(m => ({
        id: m.id,
        movement_type: m.movement_type,
        quantity: m.quantity,
        reference_number: m.reference_number,
        notes: m.notes,
        created_at: m.created_at,
        warehouse_name: (m.warehouses as any)?.name || 'Unknown'
      }));
      setStockMovements(movements);

      // Fetch inventory
      const { data: inventoryData, error: inventoryError } = await supabase
        .from('inventory')
        .select('quantity, warehouses(name, location)')
        .eq('product_id', productId);

      if (inventoryError) throw inventoryError;
      
      const inv: InventoryItem[] = (inventoryData || []).map(i => ({
        quantity: i.quantity || 0,
        warehouse_name: (i.warehouses as any)?.name || 'Unknown',
        warehouse_location: (i.warehouses as any)?.location
      }));
      setInventory(inv);

    } catch (error) {
      console.error('Error fetching product details:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTotalStock = () => {
    return inventory.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getTotalStockIn = () => {
    return stockMovements
      .filter(m => m.movement_type === 'in')
      .reduce((sum, m) => sum + m.quantity, 0);
  };

  const getTotalStockOut = () => {
    return stockMovements
      .filter(m => m.movement_type === 'out' || m.movement_type === 'sale')
      .reduce((sum, m) => sum + m.quantity, 0);
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Product Details
          </DialogTitle>
          <DialogDescription>
            Detailed information about stock movements and pricing
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <div className="space-y-6">
              {/* Product Info */}
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-semibold text-lg">{product.name}</h3>
                      <p className="text-sm text-muted-foreground">SKU: {product.sku || 'N/A'}</p>
                      {product.description && (
                        <p className="text-sm text-muted-foreground mt-2">{product.description}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Purchase Price:</span>
                        <span className="font-semibold text-destructive">{formatAmount(product.purchase_price)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Selling Price:</span>
                        <span className="font-semibold text-success">{formatAmount(product.selling_price)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-sm text-muted-foreground">Profit Margin:</span>
                        <span className="font-semibold">
                          {formatAmount(product.selling_price - product.purchase_price)}
                          {product.purchase_price > 0 && (
                            <span className="text-xs ml-1">
                              ({((product.selling_price - product.purchase_price) / product.purchase_price * 100).toFixed(1)}%)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stock Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Stock</p>
                        <p className="text-2xl font-bold">{getTotalStock()}</p>
                      </div>
                      <Package className="h-8 w-8 text-primary opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-success/5">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Stock In</p>
                        <p className="text-2xl font-bold text-success">{getTotalStockIn()}</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-success opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-destructive/5">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Stock Out</p>
                        <p className="text-2xl font-bold text-destructive">{getTotalStockOut()}</p>
                      </div>
                      <TrendingDown className="h-8 w-8 text-destructive opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Inventory by Warehouse */}
              <Card>
                <CardContent className="pt-6">
                  <h4 className="font-semibold mb-4 flex items-center gap-2">
                    <Warehouse className="h-4 w-4" />
                    Current Inventory by Warehouse
                  </h4>
                  {inventory.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No inventory found</p>
                  ) : (
                    <div className="space-y-2">
                      {inventory.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2 rounded bg-muted/50">
                          <div>
                            <p className="font-medium">{item.warehouse_name}</p>
                            {item.warehouse_location && (
                              <p className="text-xs text-muted-foreground">{item.warehouse_location}</p>
                            )}
                          </div>
                          <Badge variant={item.quantity < 10 ? "destructive" : "default"}>
                            {item.quantity} units
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Stock Movements */}
              <Card>
                <CardContent className="pt-6">
                  <h4 className="font-semibold mb-4">Recent Stock Movements</h4>
                  {stockMovements.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No movements found</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Warehouse</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stockMovements.map((movement) => (
                          <TableRow key={movement.id}>
                            <TableCell className="text-sm">
                              {movement.created_at ? new Date(movement.created_at).toLocaleDateString() : 'N/A'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={movement.movement_type === 'in' ? 'default' : 'secondary'}
                                className={
                                  movement.movement_type === 'in'
                                    ? 'bg-success text-success-foreground'
                                    : 'bg-destructive text-destructive-foreground'
                                }
                              >
                                {movement.movement_type === 'in' ? (
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                ) : (
                                  <TrendingDown className="h-3 w-3 mr-1" />
                                )}
                                {movement.movement_type.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{movement.warehouse_name}</TableCell>
                            <TableCell className="font-medium">{movement.quantity}</TableCell>
                            <TableCell className="text-sm">{movement.reference_number || '-'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {movement.notes || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
