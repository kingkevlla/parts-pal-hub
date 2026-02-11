import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, AlertTriangle, Upload, X, RefreshCw, Image, Wand2, PackagePlus, ArrowRightLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compressImage, generateSKU } from "@/lib/imageCompression";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { useDataTable } from "@/hooks/useDataTable";
import { DataTableSearch, DataTablePagination, DataTableBulkActions, SelectAllCheckbox } from "@/components/ui/data-table-controls";
import { ExportImportDialog } from "@/components/inventory/ExportImportDialog";
import { BarcodeScanner } from "@/components/inventory/BarcodeScanner";
import { ExpiryAlert, getExpiryStatus } from "@/components/inventory/ExpiryAlert";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  purchase_price: number;
  selling_price: number;
  min_stock_level: number;
  category_id: string | null;
  categories: { name: string } | null;
  expiry_date: string | null;
  image_url: string | null;
}

interface ProductWithStock extends Product {
  total_stock: number;
  isExtra?: boolean;
}

interface Category {
  id: string;
  name: string;
}

// Bulk SKU regeneration for products without SKU
const handleBulkGenerateSKUs = async (products: ProductWithStock[], toast: any, fetchProducts: () => void) => {
  const productsWithoutSKU = products.filter(p => !p.sku);
  if (productsWithoutSKU.length === 0) {
    toast({ title: 'Info', description: 'All products already have SKUs' });
    return;
  }

  const updates = productsWithoutSKU.map(p => ({
    id: p.id,
    sku: generateSKU(),
  }));

  for (const update of updates) {
    await supabase.from('products').update({ sku: update.sku }).eq('id', update.id);
  }

  toast({ title: 'Success', description: `Generated SKUs for ${updates.length} products` });
  fetchProducts();
};

export default function Inventory() {
  const [activeTab, setActiveTab] = useState("inventory");
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expiryFilter, setExpiryFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductWithStock | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<ProductWithStock | null>(null);
  const [moveProduct, setMoveProduct] = useState<ProductWithStock | null>(null);
  const [moveCategory, setMoveCategory] = useState('');
  const [moveWarehouse, setMoveWarehouse] = useState('');
  const [moveWarehouses, setMoveWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [formSku, setFormSku] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { formatAmount } = useCurrency();

  // Separate regular and extra products
  const regularProducts = products.filter(p => !p.isExtra);
  const extraProducts = products.filter(p => p.isExtra);

  // Filter regular products
  const filteredByCategory = selectedCategory === "all" 
    ? regularProducts 
    : regularProducts.filter(p => p.category_id === selectedCategory);

  const filteredByExpiry = expiryFilter === "all"
    ? filteredByCategory
    : filteredByCategory.filter(p => {
        const status = getExpiryStatus(p.expiry_date);
        if (expiryFilter === "expired") return status === 'expired';
        if (expiryFilter === "expiring") return status === 'warning';
        if (expiryFilter === "has_expiry") return p.expiry_date !== null;
        return true;
      });

  const table = useDataTable({
    data: filteredByExpiry,
    searchFields: ['name', 'sku', 'barcode', 'description'] as (keyof ProductWithStock)[],
    defaultPageSize: 100,
  });

  const extraTable = useDataTable({
    data: extraProducts,
    searchFields: ['name', 'sku', 'description'] as (keyof ProductWithStock)[],
    defaultPageSize: 100,
  });

  // Expiry alerts count
  const expiredCount = regularProducts.filter(p => getExpiryStatus(p.expiry_date) === 'expired').length;
  const expiringCount = regularProducts.filter(p => getExpiryStatus(p.expiry_date) === 'warning').length;

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchMoveWarehouses();
  }, []);

  const fetchMoveWarehouses = async () => {
    const { data } = await supabase
      .from('warehouses')
      .select('id, name')
      .eq('is_active', true)
      .neq('name', 'Extra')
      .order('name');
    setMoveWarehouses(data || []);
  };

  const handleMoveToRegular = async () => {
    if (!moveProduct || !moveCategory || !moveWarehouse) {
      toast({ title: 'Error', description: 'Please select a category and warehouse', variant: 'destructive' });
      return;
    }

    setIsMoving(true);
    try {
      // Update product with category
      const { error: updateError } = await supabase
        .from('products')
        .update({ category_id: moveCategory })
        .eq('id', moveProduct.id);
      if (updateError) throw updateError;

      // Get Extra warehouse ID
      const { data: extraWh } = await supabase
        .from('warehouses')
        .select('id')
        .eq('name', 'Extra')
        .maybeSingle();

      if (extraWh && moveProduct.total_stock > 0) {
        // Move stock: create 'out' from Extra, 'in' to target warehouse
        const { error: outError } = await supabase
          .from('stock_movements')
          .insert({
            product_id: moveProduct.id,
            warehouse_id: extraWh.id,
            quantity: moveProduct.total_stock,
            movement_type: 'out',
            notes: `Moved to regular inventory (${moveWarehouses.find(w => w.id === moveWarehouse)?.name})`,
          });
        if (outError) throw outError;

        const { error: inError } = await supabase
          .from('stock_movements')
          .insert({
            product_id: moveProduct.id,
            warehouse_id: moveWarehouse,
            quantity: moveProduct.total_stock,
            movement_type: 'in',
            notes: `Moved from Extra inventory`,
          });
        if (inError) throw inError;
      }

      toast({ title: 'Success', description: `"${moveProduct.name}" moved to regular inventory` });
      setMoveProduct(null);
      setMoveCategory('');
      setMoveWarehouse('');
      fetchProducts();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsMoving(false);
    }
  };

  const fetchProducts = async () => {
    // Fetch the Extra warehouse ID
    const { data: extraWarehouse } = await supabase
      .from('warehouses')
      .select('id')
      .eq('name', 'Extra')
      .maybeSingle();

    const extraWarehouseId = extraWarehouse?.id;

    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('*, categories(name)')
      .order('name');

    if (productsError) {
      toast({ title: 'Error', description: productsError.message, variant: 'destructive' });
      return;
    }

    const productsWithStock = await Promise.all(
      (productsData || []).map(async (product) => {
        const { data: inventoryData } = await supabase
          .from('inventory')
          .select('quantity, warehouse_id')
          .eq('product_id', product.id);

        const total_stock = inventoryData?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;

        // A product is "extra" if it ONLY exists in the Extra warehouse
        const isExtra = extraWarehouseId
          ? (inventoryData || []).length > 0 && (inventoryData || []).every(inv => inv.warehouse_id === extraWarehouseId)
          : false;

        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          description: product.description,
          purchase_price: product.purchase_price || 0,
          selling_price: product.selling_price || 0,
          min_stock_level: product.min_stock_level || 0,
          category_id: product.category_id,
          categories: product.categories,
          expiry_date: product.expiry_date,
          image_url: product.image_url,
          total_stock,
          isExtra,
        };
      })
    );

    setProducts(productsWithStock);
  };

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name')
      .order('name');

    if (!error) setCategories(data || []);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'Error', description: 'Image must be less than 10MB', variant: 'destructive' });
        return;
      }
      try {
        // Compress image before setting
        const compressed = await compressImage(file);
        setImageFile(compressed);
        setImagePreview(URL.createObjectURL(compressed));
        toast({ title: 'Image compressed', description: `Reduced from ${(file.size/1024).toFixed(0)}KB to ${(compressed.size/1024).toFixed(0)}KB` });
      } catch {
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
      }
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `products/${fileName}`;

    const { error } = await supabase.storage
      .from('product-images')
      .upload(filePath, file);

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      let imageUrl = editingProduct?.image_url || null;

      // Upload image if selected
      if (imageFile) {
        setIsUploadingImage(true);
        const uploadedUrl = await uploadImage(imageFile);
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
        }
        setIsUploadingImage(false);
      }

      const productData = {
        name: formData.get('name') as string,
        sku: formSku || null,
        barcode: formData.get('barcode') as string || null,
        description: formData.get('description') as string || null,
        purchase_price: parseFloat(formData.get('purchase_price') as string) || 0,
        selling_price: parseFloat(formData.get('selling_price') as string) || 0,
        min_stock_level: parseInt(formData.get('min_stock_level') as string) || 0,
        category_id: formData.get('category_id') as string || null,
        expiry_date: formData.get('expiry_date') as string || null,
        image_url: imageUrl,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) {
          toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: 'Success', description: 'Product updated successfully' });
          setIsOpen(false);
          setEditingProduct(null);
          resetForm();
          fetchProducts();
        }
      } else {
        const { error } = await supabase.from('products').insert(productData);

        if (error) {
          toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: 'Success', description: 'Product created successfully' });
          setIsOpen(false);
          resetForm();
          fetchProducts();
        }
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }

    setIsLoading(false);
  };

  const resetForm = () => {
    setFormSku('');
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleEdit = (product: ProductWithStock) => {
    setEditingProduct(product);
    setFormSku(product.sku || '');
    setImagePreview(product.image_url);
    setIsOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteProduct) return;

    const { error } = await supabase.from('products').delete().eq('id', deleteProduct.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Product deleted successfully' });
      fetchProducts();
    }
    setDeleteProduct(null);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(table.selectedIds);
    const { error } = await supabase.from('products').delete().in('id', ids);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: `${ids.length} products deleted successfully` });
      table.clearSelection();
      fetchProducts();
    }
  };

  const handleBarcodeFound = (product: any) => {
    setEditingProduct({
      ...product,
      purchase_price: product.purchase_price || 0,
      selling_price: product.selling_price || 0,
      min_stock_level: product.min_stock_level || 0,
      image_url: product.image_url || null,
      total_stock: 0,
    });
    setFormSku(product.sku || '');
    setImagePreview(product.image_url || null);
    setIsOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Expiry Alerts */}
      {(expiredCount > 0 || expiringCount > 0) && (
        <Alert variant={expiredCount > 0 ? "destructive" : "default"} className="border-orange-500">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Expiry Alerts</AlertTitle>
          <AlertDescription>
            {expiredCount > 0 && <span className="font-medium text-red-600">{expiredCount} product(s) expired. </span>}
            {expiringCount > 0 && <span className="font-medium text-orange-600">{expiringCount} product(s) expiring soon.</span>}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Inventory</h1>
          <p className="text-muted-foreground">Manage all products in stock</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <BarcodeScanner onProductFound={handleBarcodeFound} />
          <ExportImportDialog onImportComplete={fetchProducts} categories={categories} />
          <Button variant="outline" onClick={() => handleBulkGenerateSKUs(products, toast, fetchProducts)} className="gap-2">
            <Wand2 className="h-4 w-4" />
            Bulk Generate SKUs
          </Button>
          <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) {
              setEditingProduct(null);
              resetForm();
            } else if (!editingProduct) {
              // Auto-generate SKU for new products
              setFormSku(generateSKU());
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Product Name *</Label>
                    <Input id="name" name="name" required defaultValue={editingProduct?.name} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU (Auto-generated)</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="sku" 
                        value={formSku} 
                        onChange={(e) => setFormSku(e.target.value)}
                        placeholder="Auto-generated" 
                        className="flex-1"
                      />
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="icon"
                        onClick={() => setFormSku(generateSKU())}
                        title="Generate new SKU"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Image Upload */}
                <div className="space-y-2">
                  <Label>Product Image (Optional)</Label>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                        id="product-image"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4" />
                        {imageFile ? 'Change Image' : 'Upload Image'}
                      </Button>
                      {imageFile && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{imageFile.name}</p>
                      )}
                    </div>
                    {(imagePreview || editingProduct?.image_url) && (
                      <div className="relative">
                        <img 
                          src={imagePreview || editingProduct?.image_url || ''} 
                          alt="Preview" 
                          className="h-20 w-20 object-cover rounded-lg border"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6"
                          onClick={clearImage}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="barcode">Barcode (Optional)</Label>
                    <Input id="barcode" name="barcode" defaultValue={editingProduct?.barcode || ''} placeholder="Scan or enter barcode" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiry_date">Expiry Date (Optional)</Label>
                    <Input id="expiry_date" name="expiry_date" type="date" defaultValue={editingProduct?.expiry_date || ''} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" defaultValue={editingProduct?.description || ''} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="purchase_price">Purchase Price</Label>
                    <Input id="purchase_price" name="purchase_price" type="number" step="0.01" min="0" required defaultValue={editingProduct?.purchase_price} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selling_price">Selling Price</Label>
                    <Input id="selling_price" name="selling_price" type="number" step="0.01" min="0" required defaultValue={editingProduct?.selling_price} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="min_stock_level">Min Stock</Label>
                    <Input id="min_stock_level" name="min_stock_level" type="number" min="0" required defaultValue={editingProduct?.min_stock_level || 10} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category_id">Category</Label>
                  <Select name="category_id" defaultValue={editingProduct?.category_id || undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading || isUploadingImage}>
                  {isLoading ? (isUploadingImage ? 'Uploading Image...' : 'Saving...') : editingProduct ? 'Update Product' : 'Create Product'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="inventory">Inventory ({regularProducts.length})</TabsTrigger>
          <TabsTrigger value="extra" className="gap-2">
            <PackagePlus className="h-4 w-4" />
            Extra Inventory ({extraProducts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <DataTableSearch
                  value={table.searchTerm}
                  onChange={table.setSearchTerm}
                  placeholder="Search by name, SKU, barcode..."
                />
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={expiryFilter} onValueChange={setExpiryFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Expiry Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    <SelectItem value="expired">Expired Only</SelectItem>
                    <SelectItem value="expiring">Expiring Soon</SelectItem>
                    <SelectItem value="has_expiry">Has Expiry Date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DataTableBulkActions
                selectedCount={table.selectedIds.size}
                onDelete={handleBulkDelete}
                itemName="products"
              />
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="py-3 px-2 text-left">
                        <SelectAllCheckbox
                          isAllSelected={table.isAllSelected}
                          isSomeSelected={table.isSomeSelected}
                          onToggle={table.selectAll}
                        />
                      </th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">SKU</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Product</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Category</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Stock</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Price</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Expiry</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.paginatedData.map((product) => (
                      <tr key={product.id} className="border-b transition-colors hover:bg-muted/50">
                        <td className="py-3 px-2">
                          <Checkbox
                            checked={table.selectedIds.has(product.id)}
                            onCheckedChange={() => table.toggleSelect(product.id)}
                          />
                        </td>
                        <td className="py-3 px-2 font-mono text-sm">{product.sku || '-'}</td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-3">
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} className="h-10 w-10 rounded object-cover" />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                <Image className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <span className="font-medium">{product.name}</span>
                              {product.barcode && (
                                <span className="block text-xs text-muted-foreground">#{product.barcode}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          {product.categories ? (
                            <Badge variant="secondary">{product.categories.name}</Badge>
                          ) : '-'}
                        </td>
                        <td className="py-3 px-2">
                          <span className={product.total_stock < product.min_stock_level ? "font-medium text-destructive" : "text-green-600"}>
                            {product.total_stock}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-medium">{formatAmount(product.selling_price)}</td>
                        <td className="py-3 px-2">
                          <ExpiryAlert expiryDate={product.expiry_date} />
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(product)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteProduct(product)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DataTablePagination
                currentPage={table.currentPage}
                totalPages={table.totalPages}
                pageSize={table.pageSize}
                totalItems={table.totalItems}
                onPageChange={table.goToPage}
                onPageSizeChange={table.changePageSize}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extra">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackagePlus className="h-5 w-5" />
                Extra Inventory
              </CardTitle>
              <p className="text-sm text-muted-foreground">Items added manually via POS that are not part of regular inventory</p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center mt-2">
                <DataTableSearch
                  value={extraTable.searchTerm}
                  onChange={extraTable.setSearchTerm}
                  placeholder="Search extra items..."
                />
              </div>
            </CardHeader>
            <CardContent>
              {extraProducts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <PackagePlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No extra items yet</p>
                  <p className="text-sm">Items added manually in the POS will appear here</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Product</th>
                          <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Stock</th>
                          <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Price</th>
                          <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Added</th>
                          <th className="py-3 px-2 text-left text-sm font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extraTable.paginatedData.map((product) => (
                          <tr key={product.id} className="border-b transition-colors hover:bg-muted/50">
                            <td className="py-3 px-2">
                              <div>
                                <span className="font-medium">{product.name}</span>
                                <span className="block text-xs text-muted-foreground">{product.description || 'Manually added'}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2">{product.total_stock}</td>
                            <td className="py-3 px-2 font-medium">{formatAmount(product.selling_price)}</td>
                            <td className="py-3 px-2 text-sm text-muted-foreground">
                              {new Date(product.expiry_date || '').toLocaleDateString() || '-'}
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => {
                                  setMoveProduct(product);
                                  setMoveCategory('');
                                  setMoveWarehouse('');
                                }} title="Move to Regular Inventory">
                                  <ArrowRightLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteProduct(product)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <DataTablePagination
                    currentPage={extraTable.currentPage}
                    totalPages={extraTable.totalPages}
                    pageSize={extraTable.pageSize}
                    totalItems={extraTable.totalItems}
                    onPageChange={extraTable.goToPage}
                    onPageSizeChange={extraTable.changePageSize}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Move to Regular Inventory Dialog */}
      <Dialog open={!!moveProduct} onOpenChange={(open) => { if (!open) setMoveProduct(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Regular Inventory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Move <span className="font-medium text-foreground">"{moveProduct?.name}"</span> (Stock: {moveProduct?.total_stock}) to regular inventory.
            </p>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={moveCategory} onValueChange={setMoveCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Warehouse *</Label>
              <Select value={moveWarehouse} onValueChange={setMoveWarehouse}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {moveWarehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setMoveProduct(null)}>Cancel</Button>
              <Button onClick={handleMoveToRegular} disabled={isMoving || !moveCategory || !moveWarehouse}>
                {isMoving ? 'Moving...' : 'Move to Regular'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteProduct} onOpenChange={(open) => !open && setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteProduct?.name}". This action cannot be undone.
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
