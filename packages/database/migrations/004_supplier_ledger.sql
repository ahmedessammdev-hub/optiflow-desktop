CREATE TABLE supplier_payments (id TEXT PRIMARY KEY,purchase_id TEXT NOT NULL REFERENCES purchase_orders(id),amount INTEGER NOT NULL CHECK(amount>0),method TEXT NOT NULL,notes TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
CREATE INDEX supplier_payments_purchase ON supplier_payments(purchase_id,created_at);
INSERT INTO supplier_payments SELECT 'opening-'||id,id,paid,method,'Initial payment migrated from purchase',created_by,created_at FROM purchase_orders WHERE paid>0;
CREATE TRIGGER supplier_payments_immutable_update BEFORE UPDATE ON supplier_payments BEGIN SELECT RAISE(ABORT,'Supplier payments are immutable'); END;
CREATE TRIGGER supplier_payments_immutable_delete BEFORE DELETE ON supplier_payments BEGIN SELECT RAISE(ABORT,'Supplier payments are immutable'); END;
ALTER TABLE purchase_orders ADD COLUMN supplier_snapshot TEXT;
ALTER TABLE purchase_items ADD COLUMN product_snapshot TEXT;
UPDATE purchase_orders SET supplier_snapshot=(SELECT json_object('name',name,'phone',phone,'address',address) FROM suppliers WHERE id=purchase_orders.supplier_id);
UPDATE purchase_items SET product_snapshot=(SELECT json_object('name',name,'sku',sku) FROM products WHERE id=purchase_items.product_id);
