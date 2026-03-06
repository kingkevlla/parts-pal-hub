
-- Trigger function to clamp inventory quantity to 0 if it goes negative
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

-- Attach trigger to inventory table
CREATE TRIGGER clamp_negative_inventory
  BEFORE INSERT OR UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.clamp_inventory_quantity();
