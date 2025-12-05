import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Barcode, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BarcodeScannerProps {
  onProductFound: (product: any) => void;
}

export function BarcodeScanner({ onProductFound }: BarcodeScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Listen for barcode scanner input (rapid key entry)
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = 0;

    const handleKeyPress = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      
      // If time between keys is > 50ms, reset buffer (manual typing)
      if (currentTime - lastKeyTime > 50) {
        buffer = '';
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter' && buffer.length >= 8) {
        // Barcode detected
        searchByBarcode(buffer);
        buffer = '';
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, []);

  const searchByBarcode = async (code: string) => {
    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name)')
        .eq('barcode', code)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        onProductFound(data);
        toast({ title: 'Product Found', description: data.name });
        setIsOpen(false);
        setBarcode('');
      } else {
        toast({ 
          title: 'Not Found', 
          description: `No product with barcode: ${code}`,
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcode.trim()) {
      searchByBarcode(barcode.trim());
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Scan Barcode">
          <Barcode className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Barcode className="h-5 w-5" />
            Barcode Scanner
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Scan a barcode or enter it manually to find a product.
            </p>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Enter or scan barcode..."
                autoFocus
              />
              <Button type="submit" disabled={isSearching || !barcode.trim()}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: Physical barcode scanners work automatically - just scan anywhere on the page!
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
