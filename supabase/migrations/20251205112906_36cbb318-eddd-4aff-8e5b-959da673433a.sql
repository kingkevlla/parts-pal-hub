-- Create function to update inventory on stock movements
CREATE OR REPLACE FUNCTION public.update_inventory_on_stock_movement()
RETURNS TRIGGER AS $$
DECLARE
  current_qty INTEGER;
  new_qty INTEGER;
BEGIN
  -- Get current inventory quantity
  SELECT quantity INTO current_qty
  FROM public.inventory
  WHERE product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id;

  -- Calculate new quantity based on movement type
  IF NEW.movement_type IN ('in', 'adjustment_in') THEN
    new_qty := COALESCE(current_qty, 0) + NEW.quantity;
  ELSIF NEW.movement_type IN ('out', 'sale', 'adjustment_out') THEN
    new_qty := COALESCE(current_qty, 0) - NEW.quantity;
  ELSE
    -- For other types like 'transfer', handle based on specific logic
    new_qty := COALESCE(current_qty, 0) - NEW.quantity;
  END IF;

  -- Ensure quantity doesn't go negative
  IF new_qty < 0 THEN
    new_qty := 0;
  END IF;

  -- Update or insert inventory record
  IF current_qty IS NOT NULL THEN
    UPDATE public.inventory
    SET quantity = new_qty, updated_at = now()
    WHERE product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id;
  ELSE
    INSERT INTO public.inventory (product_id, warehouse_id, quantity)
    VALUES (NEW.product_id, NEW.warehouse_id, new_qty);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on stock_movements
DROP TRIGGER IF EXISTS trigger_update_inventory_on_stock_movement ON public.stock_movements;
CREATE TRIGGER trigger_update_inventory_on_stock_movement
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_on_stock_movement();