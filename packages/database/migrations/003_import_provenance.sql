ALTER TABLE sale_items ADD COLUMN historical_cost_known INTEGER NOT NULL DEFAULT 1 CHECK(historical_cost_known IN (0,1));
ALTER TABLE sales ADD COLUMN provenance TEXT NOT NULL DEFAULT 'native';
CREATE TABLE legacy_source_records (source_key TEXT PRIMARY KEY, raw_json TEXT NOT NULL CHECK(json_valid(raw_json)));
