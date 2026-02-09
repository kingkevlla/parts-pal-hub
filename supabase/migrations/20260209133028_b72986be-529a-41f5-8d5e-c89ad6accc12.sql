
-- Pending bills (open tabs) - each bill is tied to a customer/name
CREATE TABLE public.pending_bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_id UUID REFERENCES public.customers(id),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Items within each pending bill
CREATE TABLE public.pending_bill_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID NOT NULL REFERENCES public.pending_bills(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  subtotal NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_bill_items ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can read pending_bills" ON public.pending_bills FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage pending_bills" ON public.pending_bills FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can read pending_bill_items" ON public.pending_bill_items FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage pending_bill_items" ON public.pending_bill_items FOR ALL USING (auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER update_pending_bills_updated_at
  BEFORE UPDATE ON public.pending_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
