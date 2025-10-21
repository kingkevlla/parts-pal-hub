-- Drop existing restrictive policies and create permissive ones for authenticated users

-- Categories table - allow all authenticated users to manage
DROP POLICY IF EXISTS "Admins and managers can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Managers can create categories" ON public.categories;
DROP POLICY IF EXISTS "Everyone can view categories" ON public.categories;

CREATE POLICY "Authenticated users can manage categories" 
ON public.categories 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- Products table - allow all authenticated users to manage
DROP POLICY IF EXISTS "Admins and managers can manage products" ON public.products;
DROP POLICY IF EXISTS "Staff can create products" ON public.products;
DROP POLICY IF EXISTS "Everyone can view products" ON public.products;

CREATE POLICY "Authenticated users can manage products" 
ON public.products 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- Stock movements - allow all authenticated users
DROP POLICY IF EXISTS "Admins can delete stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Staff can create stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Everyone can view stock movements" ON public.stock_movements;

CREATE POLICY "Authenticated users can manage stock movements" 
ON public.stock_movements 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- Sales and sale items - allow all authenticated users
DROP POLICY IF EXISTS "Staff can create sales" ON public.sales;
DROP POLICY IF EXISTS "Everyone can view sales" ON public.sales;

CREATE POLICY "Authenticated users can manage sales" 
ON public.sales 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can create sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Everyone can view sale items" ON public.sale_items;

CREATE POLICY "Authenticated users can manage sale items" 
ON public.sale_items 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- Loans and loan payments - allow all authenticated users
DROP POLICY IF EXISTS "Staff can manage loans" ON public.loans;
DROP POLICY IF EXISTS "Everyone can view loans" ON public.loans;

CREATE POLICY "Authenticated users can manage loans" 
ON public.loans 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can create loan payments" ON public.loan_payments;
DROP POLICY IF EXISTS "Everyone can view loan payments" ON public.loan_payments;

CREATE POLICY "Authenticated users can manage loan payments" 
ON public.loan_payments 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- Transactions - allow all authenticated users
DROP POLICY IF EXISTS "Admins can manage transactions" ON public.transactions;
DROP POLICY IF EXISTS "Staff can create transactions" ON public.transactions;
DROP POLICY IF EXISTS "Everyone can view transactions" ON public.transactions;

CREATE POLICY "Authenticated users can manage transactions" 
ON public.transactions 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- Support tickets - allow all authenticated users
DROP POLICY IF EXISTS "Admins can manage all tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Users can create tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Everyone can view tickets" ON public.support_tickets;

CREATE POLICY "Authenticated users can manage support tickets" 
ON public.support_tickets 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- Inventory - allow all authenticated users
DROP POLICY IF EXISTS "Staff can update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Everyone can view inventory" ON public.inventory;

CREATE POLICY "Authenticated users can manage inventory" 
ON public.inventory 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- Warehouses - allow all authenticated users
DROP POLICY IF EXISTS "Admins can manage warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Everyone can view warehouses" ON public.warehouses;

CREATE POLICY "Authenticated users can manage warehouses" 
ON public.warehouses 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- User roles - keep admin-only for security
-- Profiles - keep as is (users can update own profile)