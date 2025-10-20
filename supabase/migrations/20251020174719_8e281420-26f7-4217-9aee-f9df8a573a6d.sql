-- Add unit field to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS unit text DEFAULT 'piece';

-- Update RLS policies to allow managers to create categories
DROP POLICY IF EXISTS "Managers can create categories" ON public.categories;
CREATE POLICY "Managers can create categories"
ON public.categories
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Update RLS policies to allow staff to insert products
DROP POLICY IF EXISTS "Staff can create products" ON public.products;
CREATE POLICY "Staff can create products"
ON public.products
FOR INSERT
WITH CHECK (true);