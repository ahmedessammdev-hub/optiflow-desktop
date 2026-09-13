ALTER TABLE sale_items ADD COLUMN category_id TEXT REFERENCES categories(id);
