-- Add receipt settings to system_settings
INSERT INTO system_settings (key, value, category, description) VALUES
('receipt_logo_url', '""', 'receipt', 'URL for receipt logo image'),
('receipt_header_text', '"RECEIPT"', 'receipt', 'Header text for receipts'),
('receipt_company_info', 'true', 'receipt', 'Show company information on receipt'),
('receipt_footer_text', '"Thank you for your business!"', 'receipt', 'Footer text at bottom of receipt'),
('receipt_show_qr', 'true', 'receipt', 'Show QR code on receipt'),
('receipt_tax_label', '"VAT"', 'receipt', 'Tax label to display'),
('receipt_paper_size', '"80mm"', 'receipt', 'Receipt paper size (58mm or 80mm)'),
('receipt_show_customer_info', 'true', 'receipt', 'Show customer information on receipt')
ON CONFLICT (key) DO NOTHING;