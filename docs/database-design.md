# Database design

Identity: users, roles, permissions, role_permissions, user_roles. Business: customers, prescriptions, product_types, categories, brands, products, suppliers, purchase_orders, purchase_items, inventory_movements, sales, sale_items, payments, cash_sessions, cash_transactions, expenses, expense_categories, returns, return_items, refunds. Supporting: app_settings, store_settings, print_settings, attachments, audit_logs, backup_history. Optional appointments/lab_orders are separate extensions.

All referenced historical records use RESTRICT or archival. Sale items snapshot product description/type/brand/model/barcode and unit cost. Sales snapshot customer and prescription. Prescription corrections create a new version; old versions remain readable.

Stock balance is checked nonnegative and each delta has before/after values and an origin. Payment records are authoritative. Return credits reduce receivables first; only paid excess is refunded. A return's line allocation includes its share of discounts/tax, with final-unit remainder handling to prevent rounding drift. Cash methods require an open cash session. Cash expenses/refunds debit that session; card transactions do not.

Indexes cover customer phone/name/code, product barcode/SKU/type/category/supplier, invoice number/date/customer, payments date/sale, prescription customer/date and inventory product/date. Queries search and filter before LIMIT/OFFSET. Migration checksums reject modified or unknown migration history.
