
-- =============================================
-- PROFILES
-- =============================================
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- USER ROLES
-- =============================================
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all roles" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage roles" ON public.user_roles FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- SYSTEM SETTINGS
-- =============================================
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read settings" ON public.system_settings FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage settings" ON public.system_settings FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- CATEGORIES
-- =============================================
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage categories" ON public.categories FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- PRODUCTS
-- =============================================
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  description TEXT,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  selling_price NUMERIC NOT NULL DEFAULT 0,
  min_stock_level INTEGER NOT NULL DEFAULT 0,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  expiry_date DATE,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage products" ON public.products FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- WAREHOUSES
-- =============================================
CREATE TABLE public.warehouses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read warehouses" ON public.warehouses FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage warehouses" ON public.warehouses FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- INVENTORY
-- =============================================
CREATE TABLE public.inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, warehouse_id)
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read inventory" ON public.inventory FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage inventory" ON public.inventory FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- STOCK MOVEMENTS
-- =============================================
CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  movement_type TEXT NOT NULL,
  reference_number TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read stock_movements" ON public.stock_movements FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage stock_movements" ON public.stock_movements FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- CUSTOMERS
-- =============================================
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read customers" ON public.customers FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage customers" ON public.customers FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- SUPPLIERS
-- =============================================
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read suppliers" ON public.suppliers FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage suppliers" ON public.suppliers FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- TRANSACTIONS
-- =============================================
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_number TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  payment_method TEXT,
  status TEXT DEFAULT 'completed',
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read transactions" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage transactions" ON public.transactions FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- TRANSACTION ITEMS
-- =============================================
CREATE TABLE public.transaction_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read transaction_items" ON public.transaction_items FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage transaction_items" ON public.transaction_items FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- LOANS
-- =============================================
CREATE TABLE public.loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  paid_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  due_date DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read loans" ON public.loans FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage loans" ON public.loans FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- LOAN PAYMENTS
-- =============================================
CREATE TABLE public.loan_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_method TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read loan_payments" ON public.loan_payments FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage loan_payments" ON public.loan_payments FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- EXPENSE CATEGORIES
-- =============================================
CREATE TABLE public.expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  budget NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read expense_categories" ON public.expense_categories FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage expense_categories" ON public.expense_categories FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- EXPENSES
-- =============================================
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  vendor TEXT,
  expense_date DATE NOT NULL,
  payment_method TEXT,
  receipt_url TEXT,
  status TEXT DEFAULT 'pending',
  is_recurring BOOLEAN DEFAULT false,
  recurring_frequency TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read expenses" ON public.expenses FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage expenses" ON public.expenses FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- BUDGETS
-- =============================================
CREATE TABLE public.budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read budgets" ON public.budgets FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage budgets" ON public.budgets FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- EMPLOYEES
-- =============================================
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  hire_date DATE NOT NULL,
  department TEXT,
  position TEXT,
  employment_type TEXT DEFAULT 'full_time',
  salary NUMERIC DEFAULT 0,
  salary_type TEXT DEFAULT 'monthly',
  status TEXT DEFAULT 'active',
  avatar_url TEXT,
  address TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read employees" ON public.employees FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage employees" ON public.employees FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- EMPLOYEE ATTENDANCE
-- =============================================
CREATE TABLE public.employee_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  status TEXT DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read attendance" ON public.employee_attendance FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage attendance" ON public.employee_attendance FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- EMPLOYEE LEAVE
-- =============================================
CREATE TABLE public.employee_leave (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'pending',
  reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_leave ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read leave" ON public.employee_leave FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage leave" ON public.employee_leave FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- EMPLOYEE PAYROLL
-- =============================================
CREATE TABLE public.employee_payroll (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  base_salary NUMERIC NOT NULL DEFAULT 0,
  deductions NUMERIC DEFAULT 0,
  bonuses NUMERIC DEFAULT 0,
  net_pay NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT,
  status TEXT DEFAULT 'pending',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_payroll ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read payroll" ON public.employee_payroll FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage payroll" ON public.employee_payroll FOR ALL USING (auth.uid() IS NOT NULL);

-- =============================================
-- TRIGGER: Auto-update inventory on stock movements
-- =============================================
CREATE OR REPLACE FUNCTION public.update_inventory_on_stock_movement()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_inventory_on_stock_movement
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_on_stock_movement();

-- =============================================
-- TRIGGER: Auto-update updated_at
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- TRIGGER: Auto-create profile on signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- STORAGE: Product images bucket
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

CREATE POLICY "Public read product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Authenticated upload product images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated update product images" ON storage.objects FOR UPDATE USING (bucket_id = 'product-images' AND auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated delete product images" ON storage.objects FOR DELETE USING (bucket_id = 'product-images' AND auth.uid() IS NOT NULL);

-- =============================================
-- DEFAULT SYSTEM SETTINGS
-- =============================================
INSERT INTO public.system_settings (key, value) VALUES
  ('currency', '"USD"'),
  ('company_name', '"My Business"'),
  ('company_email', '""'),
  ('company_phone', '""'),
  ('company_address', '""'),
  ('tax_rate', '0'),
  ('low_stock_threshold', '10'),
  ('expiry_alert_days', '30');
