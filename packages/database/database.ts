import { SQLite } from "./sqlite";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Row } from "../shared/schemas";
const synchronizedEntities = new Set([
  "appointments",
  "lab_orders",
  "repairs",
  "customer_followups",
  "quotes",
  "stocktakes",
  "supplier_returns",
  "branches",
  "inventory_transfers",
  "sales",
  "purchase_orders",
  "expenses",
  "cash_sessions",
  "products",
]);
const immutableBackfillTriggers = {
  sales_no_update:
    "CREATE TRIGGER sales_no_update BEFORE UPDATE ON sales BEGIN SELECT RAISE(ABORT,'Completed invoices are immutable'); END",
  movements_no_update:
    "CREATE TRIGGER movements_no_update BEFORE UPDATE ON inventory_movements BEGIN SELECT RAISE(ABORT,'Stock movements are immutable'); END",
  expenses_no_update:
    "CREATE TRIGGER expenses_no_update BEFORE UPDATE ON expenses BEGIN SELECT RAISE(ABORT,'Expenses are immutable'); END",
} as const;
export class Store {
  readonly db: SQLite;
  constructor(
    public readonly file: string,
    migrations: string,
  ) {
    this.db = new SQLite(file);
    this.db.dateFunction();
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)",
    );
    const files = readdirSync(migrations)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const existing of this.all("SELECT name FROM schema_migrations"))
      if (!files.includes(String(existing.name)))
        throw new Error("Unknown database migration");
    for (const name of files) {
      const sql = readFileSync(join(migrations, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = this.get(
        "SELECT checksum FROM schema_migrations WHERE name=?",
        name,
      );
      if (existing && existing.checksum !== checksum)
        throw new Error("Database migration checksum mismatch");
      if (!existing)
        this.tx(() => {
          const protectedBackfill = name === "006_feature_expansion.sql";
          if (protectedBackfill)
            for (const trigger of Object.keys(immutableBackfillTriggers))
              this.db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
          this.db.exec(sql);
          if (protectedBackfill)
            for (const statement of Object.values(immutableBackfillTriggers))
              this.db.exec(statement);
          this.run(
            "INSERT INTO schema_migrations VALUES (?,?)",
            name,
            checksum,
          );
        });
    }
  }
  all(sql: string, ...params: (string | number | null)[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }
  get(sql: string, ...params: (string | number | null)[]): Row | undefined {
    return this.db.prepare(sql).get(...params) as Row | undefined;
  }
  run(sql: string, ...params: (string | number | null)[]) {
    return this.db.prepare(sql).run(...params);
  }
  tx<T>(fn: () => T): T {
    if (this.db.inTransaction) return fn();
    return this.db.transaction(fn).immediate();
  }
  insert(table: string, values: Row) {
    const keys = Object.keys(values);
    this.run(
      `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      ...Object.values(values),
    );
  }
  audit(
    user: string | null,
    action: string,
    entity: string,
    entityId: string,
    before: unknown = null,
    after: unknown = null,
  ) {
    const createdAt = new Date().toISOString();
    this.insert("audit_logs", {
      id: randomUUID(),
      user_id: user,
      action,
      entity,
      entity_id: entityId,
      before_data: JSON.stringify(before),
      after_data: JSON.stringify(after),
      created_at: createdAt,
    });
    if (
      synchronizedEntities.has(entity) &&
      this.get(
        "SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='sync_outbox'",
      )
    )
      this.insert("sync_outbox", {
        id: randomUUID(),
        event_type: `${entity}.${action}`,
        entity_id: entityId,
        payload: JSON.stringify({ before, after }),
        created_at: createdAt,
        synced_at: null,
      });
  }
  close() {
    this.db.close();
  }
}
