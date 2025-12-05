-- Insert sample inventory records (linking products to warehouse with quantities)
INSERT INTO public.inventory (product_id, warehouse_id, quantity)
SELECT p.id, w.id, 
  CASE 
    WHEN p.name = 'Laptop Computer' THEN 25
    WHEN p.name = 'Office Chair' THEN 50
    WHEN p.name = 'Coffee Beans 1kg' THEN 100
    WHEN p.name = 'Wireless Mouse' THEN 75
    WHEN p.name = 'Desk Lamp' THEN 40
    ELSE 10
  END
FROM public.products p
CROSS JOIN (SELECT id FROM public.warehouses WHERE name = 'Main Warehouse' LIMIT 1) w
WHERE p.name IN ('Laptop Computer', 'Office Chair', 'Coffee Beans 1kg', 'Wireless Mouse', 'Desk Lamp')
ON CONFLICT DO NOTHING;