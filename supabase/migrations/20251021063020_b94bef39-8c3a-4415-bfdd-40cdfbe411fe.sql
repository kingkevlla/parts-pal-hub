-- Add 'sale' to stock_movements type check constraint
ALTER TABLE public.stock_movements 
DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE public.stock_movements 
ADD CONSTRAINT stock_movements_type_check 
CHECK (type = ANY (ARRAY['in'::text, 'out'::text, 'sale'::text, 'transfer'::text, 'adjustment'::text]));