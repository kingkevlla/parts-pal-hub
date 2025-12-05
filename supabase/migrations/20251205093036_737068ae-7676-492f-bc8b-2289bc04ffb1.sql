-- Add new role values to the app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'cashier';

-- Note: 'manager' already exists, 'admin' will be kept as super admin
-- The roles will be: admin (super), owner, manager, cashier, user

-- Insert default role definitions with permissions
INSERT INTO public.roles (name, description, permissions) VALUES
  ('owner', 'Business owner with full access', '["dashboard", "pos", "inventory", "stock_in", "stock_out", "products", "categories", "suppliers", "customers", "transactions", "reports", "loans", "warehouses", "settings", "users"]'),
  ('manager', 'Manager with operational access', '["dashboard", "pos", "inventory", "stock_in", "stock_out", "products", "categories", "suppliers", "customers", "transactions", "reports", "loans", "warehouses"]'),
  ('cashier', 'Cashier with POS access', '["dashboard", "pos", "customers", "transactions"]'),
  ('user', 'Basic user with limited access', '["dashboard"]')
ON CONFLICT (name) DO UPDATE SET 
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions;

-- Add unique constraint on roles name if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roles_name_key'
  ) THEN
    ALTER TABLE public.roles ADD CONSTRAINT roles_name_key UNIQUE (name);
  END IF;
END $$;