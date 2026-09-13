import { afterEach, expect, it } from "vitest";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../packages/database/database";
import { MAIN_BRANCH_ID } from "../packages/domain/stock";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

it("upgrades an operational pre-expansion database without weakening immutable ledgers", () => {
  const folder = mkdtempSync(join(tmpdir(), "optical-upgrade-"));
  folders.push(folder);
  const migrations = join(folder, "migrations");
  const source = resolve("packages/database/migrations");
  mkdirSync(migrations);
  for (const name of readdirSync(source).filter((name) => name < "006_"))
    copyFileSync(join(source, name), join(migrations, name));

  const database = join(folder, "optical.sqlite");
  let store = new Store(database, migrations);
  const user = randomUUID();
  const customer = randomUUID();
  const product = randomUUID();
  const sale = randomUUID();
  const expense = randomUUID();
  const movement = randomUUID();
  const now = new Date().toISOString();
  store.insert("users", {
    id: user,
    name: "Owner",
    username: "owner",
    password_hash: "fixture",
    created_at: now,
  });
  store.insert("customers", {
    id: customer,
    customer_code: "C-1",
    name: "Customer",
    created_at: now,
    updated_at: now,
  });
  store.insert("products", {
    id: product,
    name: "Frame",
    sku: "FRAME-1",
    type: "frames",
    unit_cost: 50,
    unit_price: 100,
    stock_quantity: 1,
    created_at: now,
    updated_at: now,
  });
  store.insert("inventory_movements", {
    id: movement,
    product_id: product,
    quantity_change: 1,
    quantity_before: 0,
    quantity_after: 1,
    type: "opening_stock",
    reference_type: "opening_stock",
    reference_id: movement,
    reason: "Opening stock",
    user_id: user,
    created_at: now,
  });
  store.insert("sales", {
    id: sale,
    request_id: randomUUID(),
    invoice_number: "INV-1",
    customer_id: customer,
    prescription_id: null,
    customer_snapshot: JSON.stringify({ name: "Customer" }),
    prescription_snapshot: null,
    seller_id: user,
    subtotal: 100,
    discount: 0,
    tax: 0,
    total: 100,
    notes: "Existing invoice",
    created_at: now,
  });
  store.insert("expenses", {
    id: expense,
    category: "Utilities",
    amount: 10,
    method: "card",
    description: "Internet",
    user_id: user,
    created_at: now,
  });
  store.close();

  copyFileSync(
    join(source, "006_feature_expansion.sql"),
    join(migrations, "006_feature_expansion.sql"),
  );
  store = new Store(database, migrations);
  expect(
    store.get("SELECT branch_id FROM sales WHERE id=?", sale)?.branch_id,
  ).toBe(MAIN_BRANCH_ID);
  expect(
    store.get("SELECT branch_id FROM expenses WHERE id=?", expense)?.branch_id,
  ).toBe(MAIN_BRANCH_ID);
  expect(
    store.get(
      "SELECT count(*) n FROM inventory_movements WHERE branch_id=?",
      MAIN_BRANCH_ID,
    )?.n,
  ).toBeGreaterThan(0);
  expect(() =>
    store.run("UPDATE sales SET notes='changed' WHERE id=?", sale),
  ).toThrow("Completed invoices are immutable");
  expect(() =>
    store.run("UPDATE expenses SET description='changed' WHERE id=?", expense),
  ).toThrow("Expenses are immutable");
  store.close();
});
