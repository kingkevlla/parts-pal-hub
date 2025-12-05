import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Download, Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ExportImportDialogProps {
  onImportComplete: () => void;
  categories: Array<{ id: string; name: string }>;
}

export function ExportImportDialog({ onImportComplete, categories }: ExportImportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState(0);
  const { toast } = useToast();

  const exportToCSV = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name)')
        .order('name');

      if (error) throw error;

      const headers = [
        'name', 'sku', 'barcode', 'description', 'purchase_price', 
        'selling_price', 'min_stock_level', 'category', 'expiry_date', 'is_active'
      ];

      const csvContent = [
        headers.join(','),
        ...(data || []).map(p => [
          `"${(p.name || '').replace(/"/g, '""')}"`,
          `"${(p.sku || '').replace(/"/g, '""')}"`,
          `"${(p.barcode || '').replace(/"/g, '""')}"`,
          `"${(p.description || '').replace(/"/g, '""')}"`,
          p.purchase_price || 0,
          p.selling_price || 0,
          p.min_stock_level || 0,
          `"${(p.categories as any)?.name || ''}"`,
          p.expiry_date || '',
          p.is_active ? 'true' : 'false'
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Success', description: `Exported ${data?.length || 0} products` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      ['name', 'sku', 'barcode', 'description', 'purchase_price', 'selling_price', 'min_stock_level', 'category', 'expiry_date', 'is_active'],
      ['Sample Product 1', 'SKU-SAMPLE-001', 'BAR123456789', 'Description of product 1', '10.00', '15.00', '10', 'Electronics', '2025-12-31', 'true'],
      ['Sample Product 2', 'SKU-SAMPLE-002', 'BAR987654321', 'Description of product 2', '5.50', '9.99', '20', 'Food & Beverages', '2025-06-15', 'true'],
      ['Sample Product 3', 'SKU-SAMPLE-003', '', 'Product without barcode/expiry', '25.00', '39.99', '5', '', '', 'true'],
    ];

    const csvContent = sampleData.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'products_import_template.csv';
    link.click();
    URL.revokeObjectURL(url);

    toast({ title: 'Downloaded', description: 'Sample CSV template downloaded' });
  };

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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportErrors([]);
    setImportSuccess(0);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length < 2) {
        throw new Error('CSV file must have headers and at least one data row');
      }

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const requiredHeaders = ['name'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

      if (missingHeaders.length > 0) {
        throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`);
      }

      const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));
      const errors: string[] = [];
      const validProducts: any[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1;

        try {
          const getValue = (header: string) => {
            const idx = headers.indexOf(header.toLowerCase());
            return idx >= 0 ? row[idx]?.trim() || '' : '';
          };

          const name = getValue('name');
          if (!name) {
            errors.push(`Row ${rowNum}: Name is required`);
            continue;
          }

          const categoryName = getValue('category');
          const categoryId = categoryName ? categoryMap.get(categoryName.toLowerCase()) : null;

          if (categoryName && !categoryId) {
            errors.push(`Row ${rowNum}: Category "${categoryName}" not found`);
          }

          const expiryDate = getValue('expiry_date');
          let parsedExpiry: string | null = null;
          if (expiryDate) {
            const date = new Date(expiryDate);
            if (isNaN(date.getTime())) {
              errors.push(`Row ${rowNum}: Invalid expiry date format (use YYYY-MM-DD)`);
            } else {
              parsedExpiry = date.toISOString().split('T')[0];
            }
          }

          validProducts.push({
            name,
            sku: getValue('sku') || null,
            barcode: getValue('barcode') || null,
            description: getValue('description') || null,
            purchase_price: parseFloat(getValue('purchase_price')) || 0,
            selling_price: parseFloat(getValue('selling_price')) || 0,
            min_stock_level: parseInt(getValue('min_stock_level')) || 0,
            category_id: categoryId || null,
            expiry_date: parsedExpiry,
            is_active: getValue('is_active').toLowerCase() !== 'false',
          });
        } catch (err: any) {
          errors.push(`Row ${rowNum}: ${err.message}`);
        }
      }

      if (validProducts.length > 0) {
        const { data, error } = await supabase
          .from('products')
          .upsert(validProducts, { onConflict: 'sku', ignoreDuplicates: false })
          .select();

        if (error) {
          errors.push(`Database error: ${error.message}`);
        } else {
          setImportSuccess(data?.length || validProducts.length);
        }
      }

      setImportErrors(errors);

      if (validProducts.length > 0) {
        toast({ 
          title: 'Import Complete', 
          description: `Imported ${validProducts.length} products${errors.length > 0 ? ` with ${errors.length} warnings` : ''}` 
        });
        onImportComplete();
      } else if (errors.length > 0) {
        toast({ title: 'Import Failed', description: 'No valid products found', variant: 'destructive' });
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
              Export all products to a CSV file that can be opened in Excel or Google Sheets.
            </p>
            <Button onClick={exportToCSV} className="w-full gap-2">
              <Download className="h-4 w-4" />
              Export Products to CSV
            </Button>
          </TabsContent>

          <TabsContent value="import" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import products from a CSV file. Download the sample template to see the correct format.
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
              <p className="text-sm text-muted-foreground">Importing...</p>
            )}

            {importSuccess > 0 && (
              <Alert>
                <AlertDescription className="text-green-600">
                  Successfully imported {importSuccess} products
                </AlertDescription>
              </Alert>
            )}

            {importErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="max-h-32 overflow-y-auto">
                    {importErrors.map((err, i) => (
                      <div key={i} className="text-sm">{err}</div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Tips:</strong></p>
              <ul className="list-disc list-inside">
                <li>Name is required, all other fields are optional</li>
                <li>Use YYYY-MM-DD format for expiry dates</li>
                <li>Category names must match existing categories</li>
                <li>Existing products with same SKU will be updated</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
