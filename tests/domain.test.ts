import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../packages/database/database";
import { Application } from "../packages/domain/application";
import { Backups } from "../packages/database/backup";
import { minor, totals, allocate, growth } from "../packages/shared/money";
import { prescriptionSchema } from "../packages/shared/schemas";
import { periodRange } from "../packages/shared/dates";
import { saleBalance } from "../packages/domain/finance";
let store: Store;
let app: Application;
let folder: string;
const admin = {
  name: "Owner",
  username: "owner",
  password: "Strong-password-123",
};
function customer(name = "Customer") {
  return app.catalog.save("customers", { data: { name, phone: randomUUID() } });
}
function product(stock = 10) {
  const id = app.catalog.save("products", {
    data: {
      name: "Frame A",
      sku: randomUUID(),
      type: "frames",
      unit_cost: 4000,
      unit_price: 10000,
    },
  });
  if (stock)
    app.operations.adjust({
      product_id: id,
      quantity: stock,
      type: "opening_stock",
      reason: "Opening stock",
    });
  return id;
}
function sale(
  productId: string,
  customerId: string,
  extra: Record<string, unknown> = {},
) {
  return app.finance.checkout({
    request_id: randomUUID(),
    customer_id: customerId,
    prescription_id: null,
    items: [{ product_id: productId, quantity: 2 }],
    payments: [{ amount: 5000, method: "cash" }],
    ...extra,
  });
}
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "optical-test-"));
  store = new Store(
    join(folder, "test.sqlite"),
    resolve("packages/database/migrations"),
  );
  app = new Application(store);
  app.auth.setup(admin);
  app.auth.login(admin);
  app.operations.openCash(100000);
});
afterEach(() => {
  if (store.db.open) store.close();
});
describe("Financial and inventory integrity", () => {
  it("uses exact minor units and rejects malformed money", () => {
    expect(minor("0.29")).toBe(29);
    expect(minor("100")).toBe(10000);
    expect(() => minor("NaN")).toThrow();
    expect(() => minor("1.001")).toThrow();
    expect(allocate(5, [1, 1, 1])).toEqual([2, 2, 1]);
    expect(() => totals([{ quantity: 1, unit_price: 100 }], 101, 0)).toThrow();
  });
  it("records a split partial sale atomically and collects debt", () => {
    const c = customer(),
      p = product();
    const s = sale(p, c, {
      payments: [
        { amount: 5000, method: "cash" },
        { amount: 5000, method: "card" },
      ],
    });
    expect(saleBalance(store, s).balance).toBe(10000);
    app.finance.payment({ sale_id: s, amount: 4000, method: "cash" });
    expect(saleBalance(store, s).balance).toBe(6000);
    expect(
      store.get("SELECT stock_quantity FROM products WHERE id=?", p)
        ?.stock_quantity,
    ).toBe(8);
    expect(app.operations.cash().expected).toBe(109000);
  });
  it("rolls back stock, invoice and payments on insufficient stock", () => {
    const c = customer(),
      p = product(1);
    expect(() => sale(p, c)).toThrow("Insufficient stock");
    expect(store.get("SELECT count(*) n FROM sales")?.n).toBe(0);
    expect(
      store.get("SELECT stock_quantity FROM products WHERE id=?", p)
        ?.stock_quantity,
    ).toBe(1);
  });
  it("rejects overpayment, bad discount, negative price and excess aggregate quantity", () => {
    const c = customer(),
      p = product(2);
    expect(() =>
      sale(p, c, { payments: [{ amount: 30000, method: "cash" }] }),
    ).toThrow();
    expect(() => sale(p, c, { discount: 20001 })).toThrow();
    expect(() =>
      sale(p, c, { items: [{ product_id: p, quantity: 1, unit_price: -1 }] }),
    ).toThrow();
    expect(() =>
      sale(p, c, {
        items: [
          { product_id: p, quantity: 2 },
          { product_id: p, quantity: 1 },
        ],
      }),
    ).toThrow();
    expect(
      store.get("SELECT stock_quantity FROM products WHERE id=?", p)
        ?.stock_quantity,
    ).toBe(2);
  });
  it("prevents payment above debt and duplicate checkout retries", () => {
    const c = customer(),
      p = product();
    const request = randomUUID();
    const s = sale(p, c, { request_id: request });
    expect(sale(p, c, { request_id: request })).toBe(s);
    expect(() =>
      app.finance.payment({ sale_id: s, amount: 15001, method: "card" }),
    ).toThrow();
    expect(store.get("SELECT count(*) n FROM sales")?.n).toBe(1);
  });
  it("returns reduce debt first and refund only the paid excess", () => {
    const c = customer(),
      p = product();
    const s = sale(p, c);
    const item = String(app.finance.invoice(s).items[0].id);
    app.finance.returnItems({
      sale_id: s,
      reason: "Wrong frame",
      method: "cash",
      items: [{ sale_item_id: item, quantity: 1, restock: true }],
    });
    expect(saleBalance(store, s)).toMatchObject({
      balance: 5000,
      refunded: 0,
      returned: 10000,
    });
    app.finance.returnItems({
      sale_id: s,
      reason: "Second return",
      method: "cash",
      items: [{ sale_item_id: item, quantity: 1, restock: true }],
    });
    expect(saleBalance(store, s)).toMatchObject({
      balance: 0,
      refunded: 5000,
      returned: 20000,
    });
    expect(
      store.get("SELECT stock_quantity FROM products WHERE id=?", p)
        ?.stock_quantity,
    ).toBe(10);
    expect(() =>
      app.finance.returnItems({
        sale_id: s,
        reason: "Excess",
        method: "cash",
        items: [{ sale_item_id: item, quantity: 1, restock: true }],
      }),
    ).toThrow();
  });
  it("allocates discounted returns without losing pennies", () => {
    const c = customer(),
      p = product();
    const s = sale(p, c, {
      items: [{ product_id: p, quantity: 3, unit_price: 101 }],
      discount: 1,
      payments: [],
    });
    const item = String(app.finance.invoice(s).items[0].id);
    for (let i = 0; i < 3; i++)
      app.finance.returnItems({
        sale_id: s,
        reason: "Return",
        method: "card",
        items: [{ sale_item_id: item, quantity: 1, restock: true }],
      });
    expect(saleBalance(store, s).balance).toBe(0);
    expect(saleBalance(store, s).returned).toBe(302);
  });
  it("uses ledger reversals and prevents double reversal", () => {
    const c = customer(),
      p = product(),
      s = sale(p, c);
    const payment = String(app.finance.invoice(s).payments[0].id);
    app.finance.reverse({
      payment_id: payment,
      reason: "Payment entered twice",
    });
    expect(saleBalance(store, s).balance).toBe(20000);
    expect(() =>
      app.finance.reverse({ payment_id: payment, reason: "Again" }),
    ).toThrow();
    expect(app.finance.invoice(s).payments).toHaveLength(2);
  });
  it("receives purchases once and reconciles expenses and closing cash", () => {
    const supplier = app.catalog.save("suppliers", {
      data: { name: "Supplier" },
    });
    const p = product(0);
    const purchase = app.operations.purchase({
      supplier_id: supplier,
      invoice_number: "P-1",
      paid: 1000,
      method: "cash",
      items: [{ product_id: p, quantity: 5, unit_cost: 2000 }],
    });
    app.operations.receive(purchase);
    expect(() => app.operations.receive(purchase)).toThrow();
    expect(
      store.get("SELECT stock_quantity FROM products WHERE id=?", p)
        ?.stock_quantity,
    ).toBe(5);
    app.operations.expense({
      category: "Rent",
      amount: 2000,
      method: "cash",
      description: "Rent payment",
    });
    expect(app.operations.cash().expected).toBe(97000);
    app.operations.closeCash(96500);
    expect(store.get("SELECT difference FROM cash_sessions")?.difference).toBe(
      -500,
    );
  });
});
describe("History, security and known regressions", () => {
  it("searches records beyond the first ten", () => {
    for (let i = 0; i < 25; i++) {
      customer(`Customer ${i}`);
      app.catalog.save("products", {
        data: {
          name: `Product ${i}`,
          sku: `SKU-${i}`,
          type: "frames",
          unit_cost: 0,
          unit_price: 100,
        },
      });
    }
    expect(
      app.catalog.list("customers", { search: "Customer 24" }).rows,
    ).toHaveLength(1);
    expect(
      app.catalog.list("products", { search: "Product 24" }).rows,
    ).toHaveLength(1);
  });
  it("preserves prescription, customer and product snapshots after edits and archival", () => {
    const c = customer(),
      p = product();
    const rx = app.catalog.prescription({
      customer_id: c,
      exam_date: "2026-01-01",
      od: { sph: -1, pd: 31 },
      os: { sph: -2, pd: 32 },
      ipd: 63,
    });
    const s = sale(p, c, { prescription_id: rx });
    app.catalog.prescription({
      customer_id: c,
      exam_date: "2026-02-01",
      od: { sph: -3 },
      os: { sph: -4 },
    });
    app.catalog.save("products", {
      id: p,
      data: {
        name: "Renamed frame",
        sku: randomUUID(),
        type: "frames",
        unit_cost: 9000,
        unit_price: 15000,
      },
    });
    app.catalog.archive("customers", c);
    app.catalog.archive("products", p);
    const invoice = app.finance.invoice(s);
    expect(JSON.parse(String(invoice.sale.prescription_snapshot)).od.sph).toBe(
      -1,
    );
    expect(invoice.items[0].product_name).toBe("Frame A");
    expect(invoice.items[0].unit_cost).toBe(4000);
    expect(app.catalog.profile(c).prescriptions).toHaveLength(2);
  });
  it("rejects invalid optical ranges while preserving zero and PD", () => {
    expect(() =>
      prescriptionSchema.parse({
        customer_id: randomUUID(),
        exam_date: null,
        od: { axis: 181 },
        os: {},
      }),
    ).toThrow();
    const rx = prescriptionSchema.parse({
      customer_id: randomUUID(),
      exam_date: null,
      od: { sph: 0, pd: 31 },
      os: { pd: 32 },
    });
    expect(rx.od.sph).toBe(0);
    expect(rx.od.pd).toBe(31);
  });
  it("enforces permissions on domain commands regardless of payload", () => {
    app.auth.manage({
      name: "Employee",
      username: "employee",
      password: "employee-password",
      role: "sales",
    });
    app.auth.logout();
    app.auth.login({ username: "employee", password: "employee-password" });
    expect(() =>
      app.execute("inventory.adjust", {
        product_id: randomUUID(),
        quantity: 5,
        reason: "Forged",
        type: "opening_stock",
        role: "admin",
      }),
    ).toThrow("Permission denied");
    expect(() => app.execute("settings.save", {})).toThrow("Permission denied");
    expect(() =>
      app.execute("report.list", { kind: "audit", query: {} }),
    ).toThrow("Permission denied");
  });
  it("makes audit and prescriptions immutable", () => {
    const c = customer();
    const rx = app.catalog.prescription({
      customer_id: c,
      exam_date: null,
      od: {},
      os: {},
    });
    expect(() => store.run("DELETE FROM audit_logs")).toThrow();
    expect(() =>
      store.run("UPDATE prescriptions SET data=? WHERE id=?", "{}", rx),
    ).toThrow();
  });
  it("yesterday excludes today and profit growth uses prior profit", () => {
    const range = periodRange(
      "yesterday",
      "Africa/Cairo",
      new Date("2026-09-12T12:00:00Z"),
    );
    expect(range.from).toBe("2026-09-11");
    expect(range.to).toBe("2026-09-12");
    expect(range.start).toBe("2026-09-10T21:00:00.000Z");
    expect(growth(200, 100)).toBe(100);
    expect(growth(100, 0)).toBeNull();
  });
  it("backs up and restores real database contents", async () => {
    const c = customer("Before backup");
    const backups = new Backups(
      store,
      join(folder, "backups"),
      join(folder, "assets"),
    );
    const file = await backups.create(app.auth.require().id);
    customer("After backup");
    expect(app.catalog.list("customers", {}).total).toBe(2);
    await backups.restore(file, app.auth.require().id);
    store = new Store(
      join(folder, "test.sqlite"),
      resolve("packages/database/migrations"),
    );
    expect(store.get("SELECT name FROM customers WHERE id=?", c)?.name).toBe(
      "Before backup",
    );
    expect(store.get("SELECT count(*) n FROM customers")?.n).toBe(1);
  });
  it("rejects invalid backups and modified migration checksums", async () => {
    const backups = new Backups(
      store,
      join(folder, "backups"),
      join(folder, "assets"),
    );
    const file = join(folder, "bad.opticalbackup");
    writeFileSync(file, "not a backup");
    expect(() => backups.validate(file)).toThrow();
    store.run("UPDATE schema_migrations SET checksum='tampered'");
    store.close();
    expect(
      () =>
        new Store(
          join(folder, "test.sqlite"),
          resolve("packages/database/migrations"),
        ),
    ).toThrow("checksum");
  });
});
