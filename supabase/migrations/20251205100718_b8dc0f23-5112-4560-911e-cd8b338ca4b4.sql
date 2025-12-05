-- Add expiry_date column to products (optional)
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS expiry_date DATE DEFAULT NULL;

-- Add expiry alert threshold to system_settings (days before expiry to warn)
INSERT INTO public.system_settings (key, value) 
VALUES ('expiry_alert_days', '30')
ON CONFLICT (key) DO NOTHING;