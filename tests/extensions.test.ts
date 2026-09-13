import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID, createHash } from "node:crypto";
import { Store } from "../packages/database/database";
import { Application } from "../packages/domain/application";
import { LegacyImporter } from "../packages/domain/importer";
import { Backups } from "../packages/database/backup";
let app: Application;
let store: Store;
let folder: string;
const owner = {
  name: "Owner",
  username: "owner",
  password: "owner-password-123",
};
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "optical-extended-"));
  store = new Store(
    join(folder, "db.sqlite"),
    resolve("packages/database/migrations"),
  );
  app = new Application(store);
  app.auth.setup(owner);
  app.auth.login(owner);
});
afterEach(() => {
  if (store.db.open) store.close();
});
it("persists edited role permissions after application restart", () => {
  app.auth.updateRole({ role: "sales", permissions: ["customers.view"] });
  const next = new Application(store);
  next.auth.login(owner);
  expect(
    next.auth.roles().roles.find((r) => r.id === "sales")?.permissions,
  ).toEqual(["customers.view"]);
});
it("protects the last administrator and resets employee passwords", () => {
  const admin = app.auth.require().id;
  expect(() =>
    app.auth.updateUser({
      id: admin,
      name: "Owner",
      role: "sales",
      archived: false,
    }),
  ).toThrow();
  const employee = app.auth.manage({
    name: "Employee",
    username: "employee",
    password: "old-password-123",
    role: "sales",
  });
  app.auth.resetPassword({ id: employee, password: "new-password-123" });
  app.auth.logout();
  expect(() =>
    app.auth.login({ username: "employee", password: "old-password-123" }),
  ).toThrow();
  expect(
    app.auth.login({ username: "employee", password: "new-password-123" }).id,
  ).toBe(employee);
});
it("supplier ledger reconciles and prohibits overpayment", () => {
  const supplier = app.catalog.save("suppliers", {
    data: { name: "Supplier" },
  });
  const product = app.catalog.save("products", {
    data: {
      name: "Frame",
      sku: "F1",
      type: "frames",
      unit_cost: 100,
      unit_price: 200,
    },
  });
  const purchase = app.operations.purchase({
    supplier_id: supplier,
    invoice_number: "PI1",
    paid: 100,
    method: "card",
    items: [{ product_id: product, quantity: 5, unit_cost: 100 }],
  });
  app.operations.paySupplier({
    purchase_id: purchase,
    amount: 250,
    method: "card",
  });
  expect(app.operations.purchaseDetail(purchase).payments).toHaveLength(2);
  expect(app.queries.list("supplier_balances", {}).rows[0].balance).toBe(150);
  expect(() =>
    app.operations.paySupplier({
      purchase_id: purchase,
      amount: 151,
      method: "card",
    }),
  ).toThrow();
});
it("analytical reports agree after tax, discount and a partial return", () => {
  const c = app.catalog.save("customers", { data: { name: "Customer" } });
  const p = app.catalog.save("products", {
    data: {
      name: "Frame",
      sku: "F1",
      type: "frames",
      unit_cost: 30,
      unit_price: 100,
    },
  });
  app.operations.adjust({
    product_id: p,
    quantity: 3,
    type: "opening_stock",
    reason: "Open",
  });
  const sale = app.finance.checkout({
    request_id: randomUUID(),
    customer_id: c,
    prescription_id: null,
    items: [{ product_id: p, quantity: 3 }],
    discount: 1,
    tax: 30,
    payments: [],
  });
  const item = app.finance.invoice(sale).items[0];
  app.finance.returnItems({
    sale_id: sale,
    reason: "Return",
    method: "card",
    items: [{ sale_item_id: item.id, quantity: 1, restock: true }],
  });
  const dashboard = app.queries.dashboard({ period: "today" });
  const report = app.queries.list("profit", {});
  expect(report.rows.reduce((n, r) => n + Number(r.profit), 0)).toBe(
    dashboard.metrics.profit,
  );
  expect(report.rows.reduce((n, r) => n + Number(r.revenue), 0)).toBe(
    dashboard.metrics.revenue,
  );
  expect(dashboard.top_products[0].amount).toBe(dashboard.metrics.revenue);
  expect(dashboard.profit_trend.reduce((n, r) => n + Number(r.amount), 0)).toBe(
    dashboard.metrics.profit,
  );
  expect(dashboard.recent_sales[0].id).toBe(sale);
  expect(dashboard.outstanding[0].balance).toBeGreaterThan(0);
  expect(
    app.queries.list("product_performance", { product_id: p }).rows[0].quantity,
  ).toBe(2);
  expect(
    app.queries.list("product_performance", { product_id: randomUUID() }).total,
  ).toBe(0);
});
const date = "2026-01-01T12:00:00Z";
function legacy() {
  return {
    customers: [
      {
        id: 1,
        name: "Legacy",
        phone: "123",
        address: "Cairo",
        created_at: date,
        medical_info: {
          od: { sph: "0", pd: "31" },
          os: { pd: "32" },
          ipd: "63",
        },
      },
    ],
    categories: [],
    products: [
      {
        id: 1,
        brand: "Brand",
        model_code: "Model",
        type: "frames",
        price: "100.00",
        wholesale_price: "40.00",
        stock_quantity: 5,
        created_at: date,
      },
    ],
    invoices: [
      {
        id: 1,
        customer_id: 1,
        user_id: 1,
        subtotal: "100",
        discount: "0",
        tax: "0",
        total: "100",
        amount_paid: "50",
        created_at: date,
      },
    ],
    invoice_items: [
      { id: 1, invoice_id: 1, product_id: 1, quantity: 1, price: "100" },
    ],
    payments: [
      {
        id: 1,
        invoice_id: 1,
        amount: "50",
        payment_method: "cash",
        created_at: date,
      },
    ],
  };
}
it("imports legacy data with PD and unknown cost without double stock deduction", async () => {
  const backups = new Backups(
    store,
    join(folder, "backups"),
    join(folder, "assets"),
  );
  const backup = await backups.create(app.auth.require().id);
  const importer = new LegacyImporter(store, app.auth);
  const report = importer.import(JSON.stringify(legacy()), backup);
  expect(report.failed).toBe(0);
  expect(store.get("SELECT stock_quantity FROM products")?.stock_quantity).toBe(
    5,
  );
  const rx = JSON.parse(
    String(store.get("SELECT data FROM prescriptions")?.data),
  );
  expect(rx.od.pd).toBe(31);
  expect(rx.os.pd).toBe(32);
  expect(rx.exam_date).toBeNull();
  expect(
    store.get("SELECT prescription_snapshot FROM sales")?.prescription_snapshot,
  ).toBeNull();
  expect(app.queries.list("profit", {}).rows[0].profit).toBeNull();
  expect(importer.import(JSON.stringify(legacy()), backup).duplicate).toBe(1);
});
it("rolls back the entire legacy import when payment totals disagree", async () => {
  const backup = await new Backups(
    store,
    join(folder, "backups"),
    join(folder, "assets"),
  ).create(app.auth.require().id);
  const input = legacy();
  input.invoices[0].amount_paid = "60";
  expect(() =>
    new LegacyImporter(store, app.auth).import(JSON.stringify(input), backup),
  ).toThrow("reconcile");
  expect(store.get("SELECT count(*) n FROM customers")?.n).toBe(0);
  expect(store.get("SELECT count(*) n FROM products")?.n).toBe(0);
});
it("rejects backup path traversal and tampered triggers", async () => {
  const backups = new Backups(
    store,
    join(folder, "backups"),
    join(folder, "assets"),
  );
  const original = await backups.create(app.auth.require().id);
  const bundle = JSON.parse(gunzipSync(readFileSync(original)).toString());
  bundle.assets = [
    {
      name: "../escape.pdf",
      data: "",
      checksum: createHash("sha256").update("").digest("hex"),
    },
  ];
  const malicious = join(folder, "malicious.opticalbackup");
  writeFileSync(malicious, gzipSync(JSON.stringify(bundle)));
  expect(() => backups.validate(malicious)).toThrow();
});
it("customer invoice pagination includes records beyond 100", () => {
  const c = app.catalog.save("customers", { data: { name: "Many invoices" } });
  const p = app.catalog.save("products", {
    data: {
      name: "Frame",
      sku: "F1",
      type: "frames",
      unit_cost: 0,
      unit_price: 0,
    },
  });
  app.operations.adjust({
    product_id: p,
    quantity: 105,
    type: "opening_stock",
    reason: "Test",
  });
  for (let i = 0; i < 105; i++)
    app.finance.checkout({
      request_id: randomUUID(),
      customer_id: c,
      prescription_id: null,
      items: [{ product_id: p, quantity: 1 }],
      payments: [],
    });
  const page = app.queries.list("sales", {
    customer_id: c,
    page: 6,
    page_size: 20,
  });
  expect(page.rows).toHaveLength(5);
  expect(page.total).toBe(105);
});
