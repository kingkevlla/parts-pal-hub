-- Create support_tickets table
CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view support tickets" 
ON public.support_tickets FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create support tickets" 
ON public.support_tickets FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins and managers can manage support tickets" 
ON public.support_tickets FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample categories
INSERT INTO public.categories (name, description) VALUES
  ('Electronics', 'Electronic devices and accessories'),
  ('Clothing', 'Apparel and fashion items'),
  ('Food & Beverages', 'Consumable food and drink items'),
  ('Office Supplies', 'Stationery and office equipment'),
  ('Home & Garden', 'Home decor and gardening supplies')
ON CONFLICT DO NOTHING;

-- Insert sample warehouses (needed for inventory)
INSERT INTO public.warehouses (name, description, location, is_active) VALUES
  ('Main Warehouse', 'Primary storage facility', 'Downtown', true)
ON CONFLICT DO NOTHING;

-- Insert sample products
INSERT INTO public.products (name, sku, barcode, description, purchase_price, selling_price, min_stock_level, is_active)
VALUES
  ('Laptop Computer', 'SKU-001', 'BAR001', 'High performance laptop', 500, 750, 5, true),
  ('Office Chair', 'SKU-002', 'BAR002', 'Ergonomic office chair', 80, 150, 10, true),
  ('Coffee Beans 1kg', 'SKU-003', 'BAR003', 'Premium roasted coffee', 15, 25, 20, true),
  ('Wireless Mouse', 'SKU-004', 'BAR004', 'Bluetooth wireless mouse', 10, 25, 15, true),
  ('Desk Lamp', 'SKU-005', 'BAR005', 'LED desk lamp adjustable', 20, 45, 10, true)
ON CONFLICT DO NOTHING;