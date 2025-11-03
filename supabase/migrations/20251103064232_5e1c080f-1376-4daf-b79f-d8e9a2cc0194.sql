-- Create permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

-- Enable RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Permissions policies
CREATE POLICY "Admins can manage permissions"
ON public.permissions
FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view permissions"
ON public.permissions
FOR SELECT
USING (true);

-- Role permissions policies
CREATE POLICY "Admins can manage role permissions"
ON public.role_permissions
FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view role permissions"
ON public.role_permissions
FOR SELECT
USING (true);

-- Insert default permissions
INSERT INTO public.permissions (name, description, resource, action) VALUES
  ('view_dashboard', 'View dashboard', 'dashboard', 'view'),
  ('manage_users', 'Create, edit, delete users', 'users', 'manage'),
  ('view_users', 'View users list', 'users', 'view'),
  ('manage_inventory', 'Full inventory management', 'inventory', 'manage'),
  ('view_inventory', 'View inventory', 'inventory', 'view'),
  ('manage_products', 'Create, edit, delete products', 'products', 'manage'),
  ('view_products', 'View products', 'products', 'view'),
  ('manage_sales', 'Process sales and refunds', 'sales', 'manage'),
  ('view_sales', 'View sales records', 'sales', 'view'),
  ('manage_loans', 'Create, edit loans', 'loans', 'manage'),
  ('view_loans', 'View loans', 'loans', 'view'),
  ('manage_warehouses', 'Create, edit warehouses', 'warehouses', 'manage'),
  ('view_warehouses', 'View warehouses', 'warehouses', 'view'),
  ('manage_categories', 'Create, edit categories', 'categories', 'manage'),
  ('view_categories', 'View categories', 'categories', 'view'),
  ('manage_suppliers', 'Create, edit suppliers', 'suppliers', 'manage'),
  ('view_suppliers', 'View suppliers', 'suppliers', 'view'),
  ('manage_reports', 'Generate and export reports', 'reports', 'manage'),
  ('view_reports', 'View reports', 'reports', 'view'),
  ('manage_settings', 'Change system settings', 'settings', 'manage'),
  ('view_settings', 'View system settings', 'settings', 'view')
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to roles
-- Admin gets all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Manager gets most permissions except user management
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'manager'
  AND p.name NOT IN ('manage_users', 'manage_settings')
ON CONFLICT DO NOTHING;

-- Staff gets view and basic operation permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'staff'
  AND p.action = 'view'
ON CONFLICT DO NOTHING;

-- Add basic manage permissions for staff
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'staff'
  AND p.name IN ('manage_sales', 'manage_inventory', 'manage_loans')
ON CONFLICT DO NOTHING;

-- Create helper function to check permissions
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = _user_id
      AND p.name = _permission_name
  );
END;
$$;

-- Update profiles RLS to allow admins to manage
CREATE POLICY "Admins can manage all profiles"
ON public.profiles
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Add policy for admins to delete user roles
CREATE POLICY "Admins can delete user roles"
ON public.user_roles
FOR DELETE
USING (has_role(auth.uid(), 'admin'));