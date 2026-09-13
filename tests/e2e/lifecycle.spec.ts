import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
test("desktop lifecycle, IPC security, print preview and persistence", async () => {
  const folder = mkdtempSync(join(tmpdir(), "optical-e2e-"));
  const launch = () =>
    electron.launch({
      args: [resolve(".")],
      env: { ...process.env, OPTICAL_TEST_DATA: folder },
    });
  let app = await launch();
  let page = await app.firstWindow();
  await page.getByLabel("Name / الاسم", { exact: true }).fill("Owner");
  await page
    .getByLabel("Username / اسم المستخدم", { exact: true })
    .fill("owner");
  await page
    .getByLabel("Password / كلمة المرور", { exact: true })
    .fill("test-password-123");
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(
    page.getByRole("heading", { name: "Shop overview" }),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const api = window.optical;
    await api.invoke("cash.open", 100000);
    const customer = await api.invoke("customers.save", {
      data: {
        name: "Lifecycle customer",
        phone: "01012345678",
        address: "Cairo",
      },
    });
    const prescription = await api.invoke("prescriptions.create", {
      customer_id: customer,
      exam_date: "2026-09-12",
      od: { sph: -1, pd: 31 },
      os: { sph: -2, pd: 32 },
      ipd: 63,
    });
    const product = await api.invoke("products.save", {
      data: {
        name: "Lifecycle frame",
        sku: "LIFE-1",
        barcode: "123456",
        type: "frames",
        unit_cost: 5000,
        unit_price: 10000,
      },
    });
    await api.invoke("inventory.adjust", {
      product_id: product,
      quantity: 5,
      type: "opening_stock",
      reason: "Test stock",
    });
    return { customer, prescription, product };
  });
  await page
    .getByRole("button", { name: "Point of sale", exact: true })
    .click();
  await page.getByPlaceholder("Scan barcode or search products").fill("123456");
  await page.getByPlaceholder("Scan barcode or search products").press("Enter");
  await expect(page.locator(".cart-line")).toHaveCount(1);
  await page
    .getByPlaceholder("Search customer", { exact: true })
    .fill("Lifecycle");
  await page
    .getByRole("button", { name: "Lifecycle customer · 01012345678" })
    .click();
  await page.locator(".cart>select").selectOption(result.prescription);
  await page.getByPlaceholder("Amount", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "Complete sale", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "INV-0000001" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await page.getByRole("dialog").last().getByLabel("Amount").fill("25");
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Save", exact: true })
    .click();
  const invoice = await page.evaluate(async () => {
    const rows = await window.optical.invoke("report.list", {
      kind: "sales",
      query: {},
    });
    return window.optical.invoke("sales.get", rows.rows[0].id);
  });
  expect(invoice.balance).toBe(2500);
  const previewPromise = app.waitForEvent("window");
  await page
    .getByRole("button", { name: "Invoice + prescription", exact: true })
    .click();
  const preview = await previewPromise;
  await preview.waitForLoadState();
  await expect(preview.getByText("OD / Right")).toBeVisible();
  await page.evaluate(async (saleId) => {
    const invoice = await window.optical.invoke("sales.get", saleId);
    await window.optical.invoke("returns.create", {
      sale_id: saleId,
      reason: "Lifecycle return",
      method: "cash",
      items: [
        { sale_item_id: invoice.items[0].id, quantity: 1, restock: true },
      ],
    });
  }, String(invoice.sale.id));
  const after = await page.evaluate(
    async (ids) => ({
      invoice: await window.optical.invoke("sales.get", ids.sale),
      products: await window.optical.invoke("products.list", {
        search: "LIFE-1",
      }),
      backup: await window.optical.invoke("backup.create"),
    }),
    { sale: String(invoice.sale.id) },
  );
  expect(after.invoice.balance).toBe(0);
  expect(after.products.rows[0].stock_quantity).toBe(5);
  expect(after.backup).toContain(".opticalbackup");
  await page.screenshot({
    path: "test-results/desktop-lifecycle.png",
    fullPage: true,
  });
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page
    .getByLabel("Username / اسم المستخدم", { exact: true })
    .fill("owner");
  await page
    .getByLabel("Password / كلمة المرور", { exact: true })
    .fill("test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Shop overview" }),
  ).toBeVisible();
  const persisted = await page.evaluate(async () => ({
    customers: await window.optical.invoke("customers.list", {}),
    secure:
      typeof (window as unknown as { require?: unknown }).require ===
      "undefined",
  }));
  expect(persisted.customers.total).toBe(1);
  expect(persisted.secure).toBe(true);
  await app.close();
});
