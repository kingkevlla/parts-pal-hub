-- POS RLS fix: allow unauthenticated (public) role to perform POS operations
-- This will replace previous authenticated-only policies with public-access ones

-- Stock movements
DROP POLICY IF EXISTS "Authenticated users can manage stock movements" ON public.stock_movements;
CREATE POLICY "Public can manage stock movements"
ON public.stock_movements
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Sales
DROP POLICY IF EXISTS "Authenticated users can manage sales" ON public.sales;
CREATE POLICY "Public can manage sales"
ON public.sales
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Sale items
DROP POLICY IF EXISTS "Authenticated users can manage sale items" ON public.sale_items;
CREATE POLICY "Public can manage sale items"
ON public.sale_items
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Transactions
DROP POLICY IF EXISTS "Authenticated users can manage transactions" ON public.transactions;
CREATE POLICY "Public can manage transactions"
ON public.transactions
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Inventory (trigger updates will still work, but allow direct access too)
DROP POLICY IF EXISTS "Authenticated users can manage inventory" ON public.inventory;
CREATE POLICY "Public can manage inventory"
ON public.inventory
FOR ALL
TO public
USING (true)
WITH CHECK (true);
