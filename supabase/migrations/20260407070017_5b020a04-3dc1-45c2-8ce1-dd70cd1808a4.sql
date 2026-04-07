
-- Add unit fields to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS stock_unit text DEFAULT 'piece',
ADD COLUMN IF NOT EXISTS selling_unit text DEFAULT 'piece',
ADD COLUMN IF NOT EXISTS unit_conversion_factor numeric DEFAULT 1;

-- Change inventory quantity from integer to numeric to support fractional units
ALTER TABLE public.inventory 
ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

-- Change stock_movements quantity from integer to numeric
ALTER TABLE public.stock_movements
ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

-- Change transaction_items quantity to numeric
ALTER TABLE public.transaction_items
ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

-- Change pending_bill_items quantity to numeric  
ALTER TABLE public.pending_bill_items
ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

-- Update the clamp function to work with numeric
CREATE OR REPLACE FUNCTION public.clamp_inventory_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.quantity < 0 THEN
    NEW.quantity := 0;
  END IF;
  RETURN NEW;
END;
$$;

-- Update the stock movement trigger to work with numeric
CREATE OR REPLACE FUNCTION public.update_inventory_on_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.movement_type = 'in' THEN
    INSERT INTO public.inventory (product_id, warehouse_id, quantity)
    VALUES (NEW.product_id, NEW.warehouse_id, NEW.quantity)
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET quantity = inventory.quantity + NEW.quantity, updated_at = now();
  ELSIF NEW.movement_type IN ('out', 'sale') THEN
    UPDATE public.inventory
    SET quantity = quantity - NEW.quantity, updated_at = now()
    WHERE product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id;
  END IF;
  RETURN NEW;
END;
$$;
