import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Download, Upload, AlertCircle, FileUp, CheckCircle2 } from "lucide-react";

interface BulkStockAdjustmentDialogProps {
  onComplete: () => void;
}

interface ParsedRow {
  rowNum: number;
  productName: string;
  warehouseName: string;
  newQuantity: number;
  reason: string;
  // resolved
  productId?: string;
  warehouseId?: string;
  inventoryId?: string;
  currentQty?: number;
  error?: string;
}

export function BulkStockAdjustmentDialog({ onComplete }: BulkStockAdjustmentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<{ success: number; errors: string[] } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const downloadTemplate = () => {
    const headers = ["product_name", "warehouse_name", "new_quantity", "reason"];
    const sample = [
      headers.join(","),
      '"orange","Main Warehouse","50","Physical count correction"',
      '"rewwe","Main Warehouse","100","Recount after audit"',
    ].join("\n");

    const blob = new Blob([sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bulk_stock_adjustment_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentField = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentField += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          currentLine.push(currentField.trim());
          currentField = "";
        } else if (char === "\n" || (char === "\r" && nextChar === "\n")) {
          currentLine.push(currentField.trim());
          if (currentLine.some((f) => f)) lines.push(currentLine);
          currentLine = [];
          currentField = "";
          if (char === "\r") i++;
        } else if (char !== "\r") {
          currentField += char;
        }
      }
    }

    if (currentField || currentLine.length > 0) {
      currentLine.push(currentField.trim());
      if (currentLine.some((f) => f)) lines.push(currentLine);
    }

    return lines;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setResults(null);
    setParsedRows([]);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length < 2) {
        throw new Error("CSV must have headers and at least one data row");
      }

      const headers = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, "_"));
      const required = ["product_name", "warehouse_name", "new_quantity", "reason"];
      const missing = required.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        throw new Error(`Missing required columns: ${missing.join(", ")}`);
      }

      const getValue = (row: string[], header: string) => {
        const idx = headers.indexOf(header);
        return idx >= 0 ? row[idx]?.trim() || "" : "";
      };

      // Parse rows
      const parsed: ParsedRow[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const productName = getValue(row, "product_name");
        const warehouseName = getValue(row, "warehouse_name");
        const qtyStr = getValue(row, "new_quantity");
        const reason = getValue(row, "reason");

        if (!productName) continue;

        const qty = parseInt(qtyStr);
        if (isNaN(qty) || qty < 0) {
          parsed.push({ rowNum: i + 1, productName, warehouseName, newQuantity: 0, reason, error: "Invalid quantity" });
          continue;
        }
        if (!reason) {
          parsed.push({ rowNum: i + 1, productName, warehouseName, newQuantity: qty, reason, error: "Reason is required" });
          continue;
        }

        parsed.push({ rowNum: i + 1, productName, warehouseName, newQuantity: qty, reason });
      }

      // Resolve product and warehouse IDs
      const { data: products } = await supabase.from("products").select("id, name");
      const { data: warehouses } = await supabase.from("warehouses").select("id, name").eq("is_active", true);
      const { data: inventory } = await supabase.from("inventory").select("id, product_id, warehouse_id, quantity");

      const productMap = new Map((products || []).map((p) => [p.name.toLowerCase(), p]));
      const warehouseMap = new Map((warehouses || []).map((w) => [w.name.toLowerCase(), w]));

      for (const row of parsed) {
        if (row.error) continue;

        const product = productMap.get(row.productName.toLowerCase());
        if (!product) {
          row.error = `Product "${row.productName}" not found`;
          continue;
        }
        row.productId = product.id;

        const warehouse = warehouseMap.get(row.warehouseName.toLowerCase());
        if (!warehouse) {
          row.error = `Warehouse "${row.warehouseName}" not found`;
          continue;
        }
        row.warehouseId = warehouse.id;

        const inv = (inventory || []).find(
          (i) => i.product_id === product.id && i.warehouse_id === warehouse.id
        );
        if (!inv) {
          row.error = "No inventory record for this product/warehouse";
          continue;
        }
        row.inventoryId = inv.id;
        row.currentQty = inv.quantity;
      }

      setParsedRows(parsed);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
      e.target.value = "";
    }
  };

  const validRows = parsedRows.filter((r) => !r.error);

  const handleSubmit = async () => {
    if (validRows.length === 0) return;

    setIsSubmitting(true);
    const errors: string[] = [];
    let success = 0;

    for (const row of validRows) {
      try {
        const diff = row.newQuantity - (row.currentQty || 0);

        const { error: updateError } = await supabase
          .from("inventory")
          .update({ quantity: row.newQuantity, updated_at: new Date().toISOString() })
          .eq("id", row.inventoryId!);
        if (updateError) throw updateError;

        const { error: movError } = await supabase.from("stock_movements").insert({
          product_id: row.productId!,
          warehouse_id: row.warehouseId!,
          quantity: Math.abs(diff),
          movement_type: "adjustment",
          notes: `Bulk adjustment: ${row.currentQty} → ${row.newQuantity}. Reason: ${row.reason}`,
          created_by: user?.id || null,
          reference_number: `BADJ-${Date.now()}`,
        });
        if (movError) throw movError;

        success++;
      } catch (err: any) {
        errors.push(`Row ${row.rowNum} (${row.productName}): ${err.message}`);
      }
    }

    setResults({ success, errors });
    setIsSubmitting(false);

    if (success > 0) {
      toast({ title: "Bulk Adjustment Complete", description: `${success} adjustments applied` });
      onComplete();
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setParsedRows([]);
      setResults(null);
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileUp className="h-4 w-4" />
          Bulk CSV Adjust
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Stock Adjustment via CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a CSV file to adjust multiple product quantities at once. Each row sets the new absolute quantity for a product in a specific warehouse.
          </p>

          <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2">
            <Download className="h-4 w-4" />
            Download CSV Template
          </Button>

          <div className="space-y-2">
            <Label htmlFor="bulk-csv">Upload CSV File</Label>
            <Input
              id="bulk-csv"
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={isProcessing || isSubmitting}
            />
          </div>

          {isProcessing && (
            <p className="text-sm text-muted-foreground">Processing CSV...</p>
          )}

          {parsedRows.length > 0 && !results && (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="default">{validRows.length} valid</Badge>
                {parsedRows.length - validRows.length > 0 && (
                  <Badge variant="destructive">{parsedRows.length - validRows.length} errors</Badge>
                )}
              </div>

              <div className="rounded-md border overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">New</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{row.rowNum}</TableCell>
                        <TableCell className="text-sm">{row.productName}</TableCell>
                        <TableCell className="text-sm">{row.warehouseName}</TableCell>
                        <TableCell className="text-right text-sm">
                          {row.currentQty !== undefined ? row.currentQty : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{row.newQuantity}</TableCell>
                        <TableCell>
                          {row.error ? (
                            <span className="text-xs text-destructive">{row.error}</span>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={validRows.length === 0 || isSubmitting}
                className="w-full gap-2"
              >
                <Upload className="h-4 w-4" />
                {isSubmitting ? "Applying..." : `Apply ${validRows.length} Adjustments`}
              </Button>
            </>
          )}

          {results && (
            <div className="space-y-3">
              {results.success > 0 && (
                <Alert>
                  <AlertDescription className="text-green-600">
                    Successfully applied {results.success} stock adjustments.
                  </AlertDescription>
                </Alert>
              )}
              {results.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {results.errors.map((err, i) => (
                        <div key={i} className="text-sm">{err}</div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Required columns:</strong></p>
            <ul className="list-disc list-inside">
              <li><code>product_name</code> — exact product name</li>
              <li><code>warehouse_name</code> — exact warehouse name</li>
              <li><code>new_quantity</code> — absolute quantity to set (≥ 0)</li>
              <li><code>reason</code> — mandatory adjustment reason</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
