-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'cashier', 'user');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create roles table
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create warehouses table
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create suppliers table
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  barcode TEXT,
  description TEXT,
  category_id UUID REFERENCES public.categories(id),
  supplier_id UUID REFERENCES public.suppliers(id),
  purchase_price DECIMAL(10,2) DEFAULT 0,
  selling_price DECIMAL(10,2) DEFAULT 0,
  min_stock_level INTEGER DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create inventory table
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
  quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (product_id, warehouse_id)
);

-- Create stock_movements table
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  warehouse_id UUID REFERENCES public.warehouses(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'transfer', 'adjustment')),
  quantity INTEGER NOT NULL,
  reference_number TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number TEXT UNIQUE,
  customer_id UUID REFERENCES public.customers(id),
  total_amount DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  payment_method TEXT,
  status TEXT DEFAULT 'completed',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create transaction_items table
CREATE TABLE public.transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create system_settings table
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create loans table
CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id),
  amount DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  due_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create has_role security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if user has any role
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id
  )
$$;

-- Create handle_new_user function for auto-creating profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_loans_updated_at BEFORE UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for roles table
CREATE POLICY "Authenticated users can view roles" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage roles" ON public.roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for categories
CREATE POLICY "Authenticated users can view categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can manage categories" ON public.categories FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- RLS Policies for warehouses
CREATE POLICY "Authenticated users can view warehouses" ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can manage warehouses" ON public.warehouses FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- RLS Policies for suppliers
CREATE POLICY "Authenticated users can view suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can manage suppliers" ON public.suppliers FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- RLS Policies for customers
CREATE POLICY "Authenticated users can view customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage customers" ON public.customers FOR ALL TO authenticated USING (true);

-- RLS Policies for products
CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can manage products" ON public.products FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- RLS Policies for inventory
CREATE POLICY "Authenticated users can view inventory" ON public.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can manage inventory" ON public.inventory FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- RLS Policies for stock_movements
CREATE POLICY "Authenticated users can view stock movements" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create stock movements" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for transactions
CREATE POLICY "Authenticated users can view transactions" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for transaction_items
CREATE POLICY "Authenticated users can view transaction items" ON public.transaction_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create transaction items" ON public.transaction_items FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for system_settings
CREATE POLICY "Authenticated users can view settings" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage settings" ON public.system_settings FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for loans
CREATE POLICY "Authenticated users can view loans" ON public.loans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage loans" ON public.loans FOR ALL TO authenticated USING (true);

-- Insert default system settings
INSERT INTO public.system_settings (key, value) VALUES
  ('currency', '"USD"'),
  ('company_name', '""'),
  ('company_email', '""'),
  ('company_phone', '""'),
  ('tax_rate', '0'),
  ('low_stock_threshold', '10');

-- Insert default roles
INSERT INTO public.roles (name, description, permissions) VALUES
  ('Admin', 'Full system access', '["all"]'),
  ('Manager', 'Can manage inventory and staff', '["inventory", "staff", "reports"]'),
  ('Cashier', 'Can process sales', '["pos", "customers"]'),
  ('User', 'Basic access', '["view"]');

-- Insert a default warehouse
INSERT INTO public.warehouses (name, location, description) VALUES
  ('Main Warehouse', 'Main Location', 'Primary warehouse');