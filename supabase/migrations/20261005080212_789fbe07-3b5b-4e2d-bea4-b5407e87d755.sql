REVOKE EXECUTE ON FUNCTION public.clamp_inventory_quantity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_inventory_on_stock_movement() FROM PUBLIC, anon, authenticated;