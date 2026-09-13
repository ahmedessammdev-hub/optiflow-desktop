import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../packages/database/database";
import { Application } from "../packages/domain/application";
import { saleBalance } from "../packages/domain/finance";
import { MAIN_BRANCH_ID } from "../packages/domain/stock";

let store: Store;
let app: Application;
beforeEach(() => {
  const folder = mkdtempSync(join(tmpdir(), "optical-features-"));
  store = new Store(
    join(folder, "db.sqlite"),
    resolve("packages/database/migrations"),
  );
  app = new Application(store);
  const owner = {
    name: "Owner",
    username: "owner",
    password: "strong-password-123",
  };
  app.auth.setup(owner);
  app.auth.login(owner);
});
afterEach(() => store.close());

function seed() {
  const customer = app.catalog.save("customers", {
    data: { name: "Customer" },
  });
  const product = app.catalog.save("products", {
    data: {
      name: "Frame",
      sku: randomUUID(),
      type: "frames",
      unit_cost: 40,
      unit_price: 100,
    },
  });
  app.operations.adjust({
    product_id: product,
    quantity: 10,
    type: "opening_stock",
    reason: "opening",
  });
  return { customer, product };
}

it("runs customer fulfilment workflows with controlled states", () => {
  const { customer } = seed();
  const now = new Date().toISOString();
  const appointment = app.expansion.saveWorkflow("appointments", {
    customer_id: customer,
    starts_at: now,
    status: "scheduled",
    purpose: "Exam",
  });
  app.expansion.saveWorkflow("appointments", {
    id: appointment,
    customer_id: customer,
    starts_at: now,
    status: "confirmed",
    purpose: "Exam",
  });
  expect(app.expansion.list("appointments", {}).rows[0].status).toBe(
    "confirmed",
  );
  expect(() =>
    app.expansion.saveWorkflow("appointments", {
      id: appointment,
      customer_id: customer,
      starts_at: now,
      status: "scheduled",
      purpose: "Exam",
    }),
  ).toThrow();
  expect(
    app.expansion.saveWorkflow("lab_orders", {
      customer_id: customer,
      lab_name: "Lab",
      cost: 50,
    }),
  ).toBeTruthy();
  expect(
    app.expansion.saveWorkflow("repairs", {
      customer_id: customer,
      item_description: "Frame",
      issue: "Hinge",
      cost: 20,
      received_at: now,
    }),
  ).toBeTruthy();
  expect(
    app.expansion.saveWorkflow("customer_followups", {
      customer_id: customer,
      type: "exam",
      due_at: now,
    }),
  ).toBeTruthy();
});

it("converts a quote with its deposit exactly once", () => {
  const { customer, product } = seed();
  const quote = app.expansion.createQuote({
    customer_id: customer,
    items: [{ product_id: product, quantity: 2 }],
    discount: 0,
    tax: 0,
  });
  app.expansion.quoteDeposit({ quote_id: quote, amount: 50, method: "card" });
  const sale = app.expansion.convertQuote({
    quote_id: quote,
    payments: [{ amount: 150, method: "card" }],
  });
  expect(saleBalance(store, sale).balance).toBe(0);
  expect(app.finance.invoice(sale).items[0].quantity).toBe(2);
  expect(() => app.expansion.convertQuote({ quote_id: quote })).toThrow();
});

it("posts stocktakes, supplier returns, variants and balanced branch transfers", () => {
  const { product } = seed();
  const variant = app.catalog.save("products", {
    data: {
      name: "Frame Blue",
      sku: randomUUID(),
      type: "frames",
      parent_product_id: product,
      color: "Blue",
      unit_cost: 40,
      unit_price: 100,
    },
  });
  expect(
    store.get("SELECT parent_product_id FROM products WHERE id=?", variant)
      ?.parent_product_id,
  ).toBe(product);
  const stocktake = app.expansion.startStocktake("Annual count");
  for (const item of app.expansion.stocktakeDetail(stocktake).items)
    app.expansion.countStock({
      stocktake_id: stocktake,
      product_id: item.product_id,
      counted_quantity: item.product_id === product ? 8 : 0,
    });
  app.expansion.postStocktake(stocktake);
  expect(
    store.get("SELECT stock_quantity FROM products WHERE id=?", product)
      ?.stock_quantity,
  ).toBe(8);
  const supplier = app.catalog.save("suppliers", {
    data: { name: "Supplier" },
  });
  const purchase = app.operations.purchase({
    supplier_id: supplier,
    invoice_number: "P1",
    paid: 0,
    method: "card",
    items: [{ product_id: product, quantity: 2, unit_cost: 40 }],
  });
  app.operations.receive(purchase);
  const purchaseItem = app.operations.purchaseDetail(purchase).items[0];
  app.expansion.supplierReturn({
    purchase_id: purchase,
    reason: "Defect",
    items: [{ purchase_item_id: purchaseItem.id, quantity: 1 }],
  });
  expect(app.queries.list("supplier_balances", {}).rows[0].balance).toBe(40);
  const branch = app.expansion.createBranch({ code: "B2", name: "Branch 2" });
  const aggregate = Number(
    store.get("SELECT stock_quantity FROM products WHERE id=?", product)
      ?.stock_quantity,
  );
  const transfer = app.expansion.transfer({
    from_branch_id: MAIN_BRANCH_ID,
    to_branch_id: branch,
    items: [{ product_id: product, quantity: 2 }],
  });
  expect(
    app.expansion.branchStock(branch).find((row) => row.id === product)
      ?.quantity,
  ).toBe(2);
  expect(
    Number(
      store.get("SELECT stock_quantity FROM products WHERE id=?", product)
        ?.stock_quantity,
    ),
  ).toBe(aggregate);
  expect(
    store.get(
      "SELECT count(*) n FROM sync_outbox WHERE event_type='inventory_transfers.post' AND entity_id=?",
      transfer,
    )?.n,
  ).toBe(1);
});

it("isolates active branch stock for catalogue and checkout", () => {
  const { customer, product } = seed();
  const branch = app.expansion.createBranch({ code: "B3", name: "Branch 3" });
  app.expansion.transfer({
    from_branch_id: MAIN_BRANCH_ID,
    to_branch_id: branch,
    items: [{ product_id: product, quantity: 2 }],
  });
  app.expansion.selectBranch(branch);
  expect(app.expansion.activeBranch()?.id).toBe(branch);
  expect(
    app.catalog.list("products", {}).rows.find((row) => row.id === product)
      ?.stock_quantity,
  ).toBe(2);
  expect(() =>
    app.finance.checkout({
      request_id: randomUUID(),
      customer_id: customer,
      prescription_id: null,
      items: [{ product_id: product, quantity: 3 }],
      payments: [],
    }),
  ).toThrow("Insufficient stock");
  const sale = app.finance.checkout({
    request_id: randomUUID(),
    customer_id: customer,
    prescription_id: null,
    items: [{ product_id: product, quantity: 2 }],
    payments: [],
  });
  expect(
    store.get("SELECT branch_id FROM sales WHERE id=?", sale)?.branch_id,
  ).toBe(branch);
  expect(
    app.expansion.branchStock(branch).find((row) => row.id === product)
      ?.quantity,
  ).toBe(0);
});

it("reserves quote stock and releases it on cancellation", () => {
  const { customer, product } = seed();
  const quote = app.expansion.createQuote({
    customer_id: customer,
    reserve_stock: true,
    items: [{ product_id: product, quantity: 4 }],
  });
  expect(
    store.get(
      "SELECT sum(quantity) n FROM stock_reservations WHERE quote_id=? AND status='active'",
      quote,
    )?.n,
  ).toBe(4);
  expect(() =>
    app.finance.checkout({
      request_id: randomUUID(),
      customer_id: customer,
      prescription_id: null,
      items: [{ product_id: product, quantity: 7 }],
      payments: [],
    }),
  ).toThrow("reserved");
  app.expansion.quoteDeposit({ quote_id: quote, amount: 10, method: "card" });
  app.expansion.cancelQuote(quote);
  expect(
    store.get("SELECT status FROM stock_reservations WHERE quote_id=?", quote)
      ?.status,
  ).toBe("released");
  expect(
    store.get("SELECT amount FROM quote_refunds WHERE quote_id=?", quote)
      ?.amount,
  ).toBe(10);
});
