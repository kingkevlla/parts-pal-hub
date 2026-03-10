import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import * as XLSX from 'xlsx';

interface ExportImportDialogProps {
  onImportComplete: () => void;
  categories: Array<{ id: string; name: string }>;
}

const parseCSV = (text: string): string[][] => {
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentField = '';
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
      } else if (char === ',') {
        currentLine.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentLine.push(currentField.trim());
        if (currentLine.some(f => f)) lines.push(currentLine);
        currentLine = [];
        currentField = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        currentField += char;
      }
    }
  }

  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some(f => f)) lines.push(currentLine);
  }

  return lines;
};

const escapeCSV = (val: string | number | boolean | null | undefined): string => {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export function ExportImportDialog({ onImportComplete, categories }: ExportImportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState(0);
  const { toast } = useToast();

  const fetchExportData = async () => {
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('*, categories(name)')
      .order('name');
    if (prodError) throw prodError;

    const { data: inventory, error: invError } = await supabase
      .from('inventory')
      .select('product_id, quantity, warehouses(name)');
    if (invError) throw invError;

    const stockMap = new Map<string, number>();
    const warehouseStockMap = new Map<string, Map<string, number>>();
    for (const inv of inventory || []) {
      stockMap.set(inv.product_id, (stockMap.get(inv.product_id) || 0) + (inv.quantity || 0));
      if (!warehouseStockMap.has(inv.product_id)) {
        warehouseStockMap.set(inv.product_id, new Map());
      }
      const whName = (inv.warehouses as any)?.name || 'Unknown';
      warehouseStockMap.get(inv.product_id)!.set(whName, inv.quantity || 0);
    }

    const allWarehouses = new Set<string>();
    for (const map of warehouseStockMap.values()) {
      for (const wh of map.keys()) allWarehouses.add(wh);
    }
    const warehouseList = Array.from(allWarehouses).sort();

    const headers = [
      'name', 'sku', 'barcode', 'description', 'purchase_price',
      'selling_price', 'min_stock_level', 'category', 'expiry_date',
      'is_active', 'total_stock',
      ...warehouseList.map(w => `stock_${w}`),
    ];

    const dataRows = (products || []).map(p => {
      const row: Record<string, string | number | boolean> = {
        name: p.name || '',
        sku: p.sku || '',
        barcode: p.barcode || '',
        description: p.description || '',
        purchase_price: p.purchase_price || 0,
        selling_price: p.selling_price || 0,
        min_stock_level: p.min_stock_level || 0,
        category: (p.categories as any)?.name || '',
        expiry_date: p.expiry_date || '',
        is_active: p.is_active ? 'true' : 'false',
        total_stock: stockMap.get(p.id) || 0,
      };
      for (const w of warehouseList) {
        row[`stock_${w}`] = warehouseStockMap.get(p.id)?.get(w) || 0;
      }
      return row;
    });

    return { headers, dataRows, count: products?.length || 0 };
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      const { headers, dataRows, count } = await fetchExportData();
      const ws = XLSX.utils.json_to_sheet(dataRows, { header: headers });

      // Auto-size columns
      ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 12) }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Products');
      XLSX.writeFile(wb, `products_export_${new Date().toISOString().split('T')[0]}.xlsx`);

      toast({ title: 'Export Complete', description: `Exported ${count} products to Excel` });
    } catch (error: any) {
      toast({ title: 'Export Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
      const { headers, dataRows, count } = await fetchExportData();

      const rows = dataRows.map(r =>
        headers.map(h => escapeCSV(r[h])).join(',')
      );
      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Export Complete', description: `Exported ${count} products to CSV` });
    } catch (error: any) {
      toast({ title: 'Export Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const downloadSampleCSV = async () => {
    // Fetch warehouse names so template includes stock columns
    const { data: warehouses } = await supabase.from('warehouses').select('name').eq('is_active', true).order('name');
    const whNames = (warehouses || []).map(w => w.name);

    const sampleData = [
      ['name', 'sku', 'barcode', 'description', 'purchase_price', 'selling_price', 'min_stock_level', 'category', 'expiry_date', 'is_active', ...whNames.map(w => `stock_${w}`)],
      ['"Sample Product 1"', '"SKU-001"', '"BAR123"', '"A sample product"', '10.00', '15.00', '10', '"Electronics"', '2027-12-31', 'true', ...whNames.map(() => '50')],
      ['"Sample Product 2"', '""', '""', '"No SKU product"', '5.50', '9.99', '20', '"Food"', '', 'true', ...whNames.map(() => '0')],
    ];

    const csvContent = sampleData.map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'products_import_template.csv';
    link.click();
    URL.revokeObjectURL(url);

    toast({ title: 'Downloaded', description: 'Import template with stock columns downloaded' });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Error', description: 'File must be under 5MB', variant: 'destructive' });
      e.target.value = '';
      return;
    }

    setIsImporting(true);
    setImportErrors([]);
    setImportSuccess(0);

    try {
      let rows: string[][];

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
        rows = jsonData.map(r => r.map(c => String(c ?? '').trim()));
      } else {
        const text = await file.text();
        rows = parseCSV(text);
      }

      if (rows.length < 2) {
        throw new Error('CSV must have a header row and at least one data row');
      }

      const headers = rows[0].map(h => h.toLowerCase().trim());
      if (!headers.includes('name')) {
        throw new Error('Missing required column: name');
      }

      const getValue = (row: string[], header: string) => {
        const idx = headers.indexOf(header);
        return idx >= 0 && idx < row.length ? row[idx]?.trim() || '' : '';
      };

      const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));

      // Fetch existing products by SKU for matching
      const { data: existingProducts } = await supabase.from('products').select('id, sku, name');
      const skuMap = new Map<string, string>();
      const nameMap = new Map<string, string>();
      for (const p of existingProducts || []) {
        if (p.sku) skuMap.set(p.sku.toLowerCase(), p.id);
        nameMap.set(p.name.toLowerCase(), p.id);
      }

      // Detect stock_* columns and resolve warehouse names
      const errors: string[] = [];
      let successCount = 0;
      const stockColumns: { headerIdx: number; warehouseName: string }[] = [];
      const { data: warehouses } = await supabase.from('warehouses').select('id, name').eq('is_active', true);
      const warehouseMap = new Map((warehouses || []).map(w => [w.name.toLowerCase(), w.id]));

      headers.forEach((h, idx) => {
        if (h.startsWith('stock_')) {
          stockColumns.push({ headerIdx: idx, warehouseName: h.replace('stock_', '') });
        }
      });

      // Validate warehouse names from stock columns
      const validStockColumns = stockColumns.filter(sc => {
        if (!warehouseMap.has(sc.warehouseName.toLowerCase())) {
          errors.push(`Warning: Warehouse "${sc.warehouseName}" not found, stock column ignored`);
          return false;
        }
        return true;
      });

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1;

        try {
          const name = getValue(row, 'name');
          if (!name) {
            errors.push(`Row ${rowNum}: Name is required, skipping`);
            continue;
          }
          if (name.length > 200) {
            errors.push(`Row ${rowNum}: Name too long (max 200 chars)`);
            continue;
          }

          const sku = getValue(row, 'sku') || null;
          const barcode = getValue(row, 'barcode') || null;
          const description = getValue(row, 'description') || null;

          const purchasePrice = parseFloat(getValue(row, 'purchase_price'));
          const sellingPrice = parseFloat(getValue(row, 'selling_price'));
          const minStock = parseInt(getValue(row, 'min_stock_level'));

          if (getValue(row, 'purchase_price') && (isNaN(purchasePrice) || purchasePrice < 0)) {
            errors.push(`Row ${rowNum}: Invalid purchase price`);
            continue;
          }
          if (getValue(row, 'selling_price') && (isNaN(sellingPrice) || sellingPrice < 0)) {
            errors.push(`Row ${rowNum}: Invalid selling price`);
            continue;
          }

          const categoryName = getValue(row, 'category');
          let categoryId: string | null = null;
          if (categoryName) {
            categoryId = categoryMap.get(categoryName.toLowerCase()) || null;
            if (!categoryId) {
              errors.push(`Row ${rowNum}: Category "${categoryName}" not found, importing without category`);
            }
          }

          const expiryRaw = getValue(row, 'expiry_date');
          let expiryDate: string | null = null;
          if (expiryRaw) {
            const d = new Date(expiryRaw);
            if (isNaN(d.getTime())) {
              errors.push(`Row ${rowNum}: Invalid date "${expiryRaw}", skipping expiry`);
            } else {
              expiryDate = d.toISOString().split('T')[0];
            }
          }

          const isActiveRaw = getValue(row, 'is_active');
          const isActive = isActiveRaw ? isActiveRaw.toLowerCase() !== 'false' : true;

          const productData: any = {
            name,
            sku: sku || null,
            barcode: barcode || null,
            description,
            purchase_price: isNaN(purchasePrice) ? 0 : purchasePrice,
            selling_price: isNaN(sellingPrice) ? 0 : sellingPrice,
            min_stock_level: isNaN(minStock) ? 0 : Math.max(0, minStock),
            category_id: categoryId,
            expiry_date: expiryDate,
            is_active: isActive,
          };

          // Match existing product by SKU first, then by exact name
          let existingId: string | undefined;
          if (sku) existingId = skuMap.get(sku.toLowerCase());
          if (!existingId) existingId = nameMap.get(name.toLowerCase());

          let productId: string;

          if (existingId) {
            const { error } = await supabase
              .from('products')
              .update(productData)
              .eq('id', existingId);
            if (error) {
              errors.push(`Row ${rowNum}: Update failed - ${error.message}`);
              continue;
            }
            productId = existingId;
          } else {
            const { data: inserted, error } = await supabase
              .from('products')
              .insert(productData)
              .select('id')
              .single();
            if (error || !inserted) {
              errors.push(`Row ${rowNum}: Insert failed - ${error?.message || 'Unknown error'}`);
              continue;
            }
            productId = inserted.id;
            // Add to maps so duplicate rows in same CSV are detected
            nameMap.set(name.toLowerCase(), productId);
            if (sku) skuMap.set(sku.toLowerCase(), productId);
          }

          // Process stock columns: set inventory to the specified quantity
          for (const sc of validStockColumns) {
            const rawVal = row[sc.headerIdx]?.trim();
            if (!rawVal) continue;
            const qty = parseInt(rawVal);
            if (isNaN(qty) || qty < 0) {
              errors.push(`Row ${rowNum}: Invalid stock quantity "${rawVal}" for warehouse "${sc.warehouseName}"`);
              continue;
            }
            const warehouseId = warehouseMap.get(sc.warehouseName.toLowerCase())!;

            // Get current inventory for this product+warehouse
            const { data: currentInv } = await supabase
              .from('inventory')
              .select('quantity')
              .eq('product_id', productId)
              .eq('warehouse_id', warehouseId)
              .maybeSingle();

            const currentQty = currentInv?.quantity || 0;
            const diff = qty - currentQty;

            if (diff === 0) continue;

            // Create a stock movement to adjust to the target quantity
            const { error: mvError } = await supabase
              .from('stock_movements')
              .insert({
                product_id: productId,
                warehouse_id: warehouseId,
                quantity: Math.abs(diff),
                movement_type: diff > 0 ? 'in' : 'out',
                notes: `CSV import adjustment: ${currentQty} → ${qty}`,
              });

            if (mvError) {
              errors.push(`Row ${rowNum}: Stock update failed for "${sc.warehouseName}" - ${mvError.message}`);
            }
          }

          successCount++;
        } catch (err: any) {
          errors.push(`Row ${rowNum}: ${err.message}`);
        }
      }

      setImportSuccess(successCount);
      setImportErrors(errors);

      if (successCount > 0) {
        toast({
          title: 'Import Complete',
          description: `${successCount} product(s) imported/updated${errors.length > 0 ? `, ${errors.length} warning(s)` : ''}`,
        });
        onImportComplete();
      } else {
        toast({ title: 'Import Failed', description: 'No products were imported', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setImportErrors([error.message]);
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) {
        setImportErrors([]);
        setImportSuccess(0);
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Export/Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export & Import Products</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="export" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export all products with stock quantities per warehouse. Choose Excel (.xlsx) for best compatibility or CSV for lightweight use.
            </p>
            <Button onClick={exportToExcel} disabled={isExporting} className="w-full gap-2">
              <Download className="h-4 w-4" />
              {isExporting ? 'Exporting...' : 'Export to Excel (.xlsx)'}
            </Button>
            <Button variant="outline" onClick={exportToCSV} disabled={isExporting} className="w-full gap-2">
              <Download className="h-4 w-4" />
              {isExporting ? 'Exporting...' : 'Export to CSV'}
            </Button>
          </TabsContent>

          <TabsContent value="import" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import or update products from CSV. Existing products are matched by SKU or exact name and updated; new ones are created.
            </p>

            <Button variant="outline" onClick={downloadSampleCSV} className="w-full gap-2">
              <Download className="h-4 w-4" />
              Download Sample Template
            </Button>

            <div className="space-y-2">
              <Label htmlFor="csv-file">Upload CSV File</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleImport}
                disabled={isImporting}
              />
            </div>

            {isImporting && (
              <p className="text-sm text-muted-foreground animate-pulse">Importing products...</p>
            )}

            {importSuccess > 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription className="text-emerald-600 dark:text-emerald-400">
                  Successfully imported/updated {importSuccess} product(s)
                </AlertDescription>
              </Alert>
            )}

            {importErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {importErrors.map((err, i) => (
                      <div key={i} className="text-sm">{err}</div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>How it works:</strong></p>
              <ul className="list-disc list-inside space-y-0.5">
                <li><code>name</code> is required; all other fields are optional</li>
                <li>Products with a matching <strong>SKU</strong> or <strong>exact name</strong> will be updated</li>
                <li>New products without a match will be created</li>
                <li>Use YYYY-MM-DD for expiry dates</li>
                <li>Category names must match existing categories</li>
                <li>Add <code>stock_WarehouseName</code> columns to set inventory quantities (creates stock movements automatically)</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
