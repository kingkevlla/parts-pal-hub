
-- Fix existing negative inventory values by setting them to 0
UPDATE public.inventory SET quantity = 0, updated_at = now() WHERE quantity < 0;
