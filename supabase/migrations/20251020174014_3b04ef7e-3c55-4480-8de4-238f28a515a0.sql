-- Create function to automatically update inventory when stock movements occur
CREATE OR REPLACE FUNCTION public.update_inventory_on_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- For stock in, add to inventory
  IF NEW.type = 'in' THEN
    INSERT INTO public.inventory (product_id, warehouse_id, quantity)
    VALUES (NEW.product_id, NEW.warehouse_id, NEW.quantity)
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET 
      quantity = inventory.quantity + NEW.quantity,
      last_updated = now();
      
  -- For stock out or sale, subtract from inventory
  ELSIF NEW.type IN ('out', 'sale') THEN
    -- Check if sufficient stock exists
    IF NOT EXISTS (
      SELECT 1 FROM public.inventory 
      WHERE product_id = NEW.product_id 
      AND warehouse_id = NEW.warehouse_id 
      AND quantity >= NEW.quantity
    ) THEN
      RAISE EXCEPTION 'Insufficient stock in warehouse';
    END IF;
    
    UPDATE public.inventory
    SET 
      quantity = quantity - NEW.quantity,
      last_updated = now()
    WHERE product_id = NEW.product_id 
    AND warehouse_id = NEW.warehouse_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on stock_movements table
DROP TRIGGER IF EXISTS trigger_update_inventory ON public.stock_movements;
CREATE TRIGGER trigger_update_inventory
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_on_stock_movement();

-- Add unique constraint to inventory to prevent duplicates
ALTER TABLE public.inventory 
DROP CONSTRAINT IF EXISTS inventory_product_warehouse_unique;

ALTER TABLE public.inventory
ADD CONSTRAINT inventory_product_warehouse_unique 
UNIQUE (product_id, warehouse_id);

-- Update RLS policy for stock_movements to allow deletion for admins
DROP POLICY IF EXISTS "Admins can delete stock movements" ON public.stock_movements;
CREATE POLICY "Admins can delete stock movements"
ON public.stock_movements
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));