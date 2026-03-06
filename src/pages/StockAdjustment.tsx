import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { useDataTable } from "@/hooks/useDataTable";
import { DataTableSearch, DataTablePagination } from "@/components/ui/data-table-controls";
import { AlertTriangle, CheckCircle2, ClipboardEdit } from "lucide-react";
import { Navigate } from "react-router-dom";

interface InventoryRow {
  id: string;
  product_id: string;
  product_name: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
}

interface AdjustmentEntry {
  inventoryId: string;
  productName: string;
  warehouseName: string;
  currentQty: number;
  newQty: number;
  reason: string;
}

export default function StockAdjustment() {
  const { isAdmin, isOwner, isManager, hasPermission, loading: permLoading } = usePermissions();
  const { user } = useAuth();
  const { toast } = useToast();

  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all");
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Adjustment form state
  const [selectedInventory, setSelectedInventory] = useState<InventoryRow | null>(null);
  const [newQuantity, setNewQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History
  const [history, setHistory] = useState<any[]>([]);

  const filtered = selectedWarehouse === "all"
    ? inventoryRows
    : inventoryRows.filter(r => r.warehouse_id === selectedWarehouse);

  const table = useDataTable({
    data: filtered,
    searchFields: ["product_name", "warehouse_name"] as (keyof InventoryRow)[],
    defaultPageSize: 50,
  });

  useEffect(() => {
    fetchWarehouses();
    fetchInventory();
    fetchHistory();
  }, []);

  const fetchWarehouses = async () => {
    const { data } = await supabase
      .from("warehouses")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    setWarehouses(data || []);
  };

  const fetchInventory = async () => {
    setLoadingData(true);
    const { data, error } = await supabase
      .from("inventory")
      .select("id, product_id, quantity, warehouse_id, products(name), warehouses(name)")
      .order("quantity", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoadingData(false);
      return;
    }

    const rows: InventoryRow[] = (data || []).map((row: any) => ({
      id: row.id,
      product_id: row.product_id,
      product_name: row.products?.name || "Unknown",
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouses?.name || "Unknown",
      quantity: row.quantity,
    }));

    setInventoryRows(rows);
    setLoadingData(false);
  };

  const fetchHistory = async () => {
    const { data } = await supabase
      .from("stock_movements")
      .select("*, products(name), warehouses(name)")
      .eq("movement_type", "adjustment")
      .order("created_at", { ascending: false })
      .limit(50);
    setHistory(data || []);
  };

  const handleAdjust = async () => {
    if (!selectedInventory) return;
    const qty = parseInt(newQuantity);
    if (isNaN(qty) || qty < 0) {
      toast({ title: "Error", description: "Enter a valid non-negative quantity", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Error", description: "Please provide a reason for the adjustment", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const diff = qty - selectedInventory.quantity;

      // Direct update inventory quantity
      const { error: updateError } = await supabase
        .from("inventory")
        .update({ quantity: qty, updated_at: new Date().toISOString() })
        .eq("id", selectedInventory.id);
      if (updateError) throw updateError;

      // Log as an adjustment stock movement
      const { error: movError } = await supabase
        .from("stock_movements")
        .insert({
          product_id: selectedInventory.product_id,
          warehouse_id: selectedInventory.warehouse_id,
          quantity: Math.abs(diff),
          movement_type: "adjustment",
          notes: `Adjustment: ${selectedInventory.quantity} → ${qty}. Reason: ${reason}`,
          created_by: user?.id || null,
          reference_number: `ADJ-${Date.now()}`,
        });
      if (movError) throw movError;

      toast({
        title: "Adjustment Saved",
        description: `${selectedInventory.product_name} in ${selectedInventory.warehouse_name}: ${selectedInventory.quantity} → ${qty}`,
      });

      setSelectedInventory(null);
      setNewQuantity("");
      setReason("");
      fetchInventory();
      fetchHistory();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (permLoading) return <div className="p-6">Loading...</div>;
  if (!hasPermission("stock_adjustment")) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Stock Adjustment</h1>
        <p className="text-muted-foreground">
          Manually correct inventory quantities across warehouses
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Adjustment Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardEdit className="h-5 w-5" />
              Adjust Quantity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedInventory ? (
              <>
                <div className="rounded-lg border p-3 space-y-1 bg-muted/50">
                  <p className="font-medium">{selectedInventory.product_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedInventory.warehouse_name}</p>
                  <Badge variant="outline">Current: {selectedInventory.quantity}</Badge>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newQty">New Quantity</Label>
                  <Input
                    id="newQty"
                    type="number"
                    min="0"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    placeholder="Enter corrected quantity"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason *</Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Physical count mismatch, damaged goods..."
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAdjust} disabled={isSubmitting} className="flex-1">
                    {isSubmitting ? "Saving..." : "Save Adjustment"}
                  </Button>
                  <Button variant="outline" onClick={() => { setSelectedInventory(null); setNewQuantity(""); setReason(""); }}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a product row from the table to adjust its quantity.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Inventory Table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Inventory</CardTitle>
            <div className="flex gap-3 flex-wrap items-center mt-2">
              <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by warehouse" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {warehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DataTableSearch
                value={table.searchTerm}
                onChange={table.setSearchTerm}
                placeholder="Search products..."
              />
            </div>
          </CardHeader>
          <CardContent>
            {loadingData ? (
              <p className="text-muted-foreground text-sm">Loading inventory...</p>
            ) : (
              <>
                <div className="rounded-md border overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="w-[80px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {table.paginatedData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            No inventory records found
                          </TableCell>
                        </TableRow>
                      ) : (
                        table.paginatedData.map((row) => (
                          <TableRow
                            key={row.id}
                            className={selectedInventory?.id === row.id ? "bg-accent" : "cursor-pointer hover:bg-muted/50"}
                            onClick={() => {
                              setSelectedInventory(row);
                              setNewQuantity(String(row.quantity));
                              setReason("");
                            }}
                          >
                            <TableCell className="font-medium">{row.product_name}</TableCell>
                            <TableCell>{row.warehouse_name}</TableCell>
                            <TableCell className="text-right">
                              {row.quantity <= 0 ? (
                                <Badge variant="destructive">{row.quantity}</Badge>
                              ) : row.quantity <= 5 ? (
                                <Badge variant="secondary">{row.quantity}</Badge>
                              ) : (
                                row.quantity
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedInventory(row);
                                  setNewQuantity(String(row.quantity));
                                  setReason("");
                                }}
                              >
                                <ClipboardEdit className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4">
                  <DataTablePagination
                    currentPage={table.currentPage}
                    totalPages={table.totalPages}
                    onPageChange={table.goToPage}
                    pageSize={table.pageSize}
                    onPageSizeChange={table.changePageSize}
                    totalItems={table.totalItems}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Adjustment History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Adjustments</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No adjustments recorded yet.</p>
          ) : (
            <div className="rounded-md border overflow-auto max-h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h: any) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm">
                        {new Date(h.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{h.products?.name || "—"}</TableCell>
                      <TableCell>{h.warehouses?.name || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{h.reference_number || "—"}</TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate">{h.notes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
