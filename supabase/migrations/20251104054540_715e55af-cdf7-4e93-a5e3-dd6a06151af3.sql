-- Insert default system settings if they don't exist
INSERT INTO public.system_settings (key, value, category, description)
VALUES 
  ('currency', '"USD"', 'general', 'Default currency for the system'),
  ('company_name', '""', 'general', 'Company name'),
  ('company_email', '""', 'general', 'Company email address'),
  ('company_phone', '""', 'general', 'Company phone number'),
  ('tax_rate', '0', 'sales', 'Tax rate percentage'),
  ('low_stock_threshold', '10', 'inventory', 'Low stock alert threshold')
ON CONFLICT (key) DO NOTHING;