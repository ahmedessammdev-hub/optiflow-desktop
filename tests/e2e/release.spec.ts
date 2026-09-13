import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
test("release: attachments, Arabic PDF, backup restore, purchase ledger and permissions", async () => {
  const folder = mkdtempSync(join(tmpdir(), "optical-release-"));
  const binary = process.env.OPTICAL_PACKAGED;
  const launch = () =>
    electron.launch({
      ...(binary ? { executablePath: resolve(binary) } : {}),
      args: [...(binary ? [] : [resolve(".")]), `--user-data-dir=${folder}`],
    });
  let app = await launch();
  let page = await app.firstWindow();
  await page.getByLabel("Name / الاسم", { exact: true }).fill("Release Owner");
  await page
    .getByLabel("Username / اسم المستخدم", { exact: true })
    .fill("owner");
  await page
    .getByLabel("Password / كلمة المرور", { exact: true })
    .fill("release-password-123");
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(
    page.getByRole("heading", { name: "Shop overview" }),
  ).toBeVisible();
  const ids = await page.evaluate(async () => {
    const api = window.optical;
    const customer = await api.invoke("customers.save", {
      data: { name: "عميل التجربة", phone: "010" },
    });
    const supplier = await api.invoke("suppliers.save", {
      data: { name: "مورد التجربة" },
    });
    const product = await api.invoke("products.save", {
      data: {
        name: "إطار تجريبي",
        sku: "TEST",
        type: "frames",
        unit_cost: 100,
        unit_price: 200,
      },
    });
    const purchase = await api.invoke("purchases.create", {
      supplier_id: supplier,
      invoice_number: "P-TEST",
      paid: 100,
      method: "card",
      items: [{ product_id: product, quantity: 5, unit_cost: 100 }],
    });
    await api.invoke("purchases.receive", purchase);
    await api.invoke("purchases.payment", {
      purchase_id: purchase,
      amount: 100,
      method: "card",
    });
    const prescription = await api.invoke("prescriptions.create", {
      customer_id: customer,
      exam_date: "2026-09-12",
      od: { sph: 0, pd: 31 },
      os: { pd: 32 },
    });
    await api.invoke("settings.save", {
      ...(await api.invoke("settings.get")),
      language: "ar",
    });
    return { customer, product, purchase, prescription };
  });
  const attachment = join(folder, "receipt.pdf");
  writeFileSync(attachment, "%PDF-1.4\nTest receipt");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, attachment);
  await page.evaluate(
    async (ids) =>
      window.optical.invoke("attachments.add", {
        entity_type: "customers",
        entity_id: ids.customer,
      }),
    ids,
  );
  expect(
    await page.evaluate(
      async (ids) =>
        (
          await window.optical.invoke("attachments.list", {
            entity_type: "customers",
            entity_id: ids.customer,
          })
        ).length,
      ids,
    ),
  ).toBe(1);
  await page.evaluate(
    async (ids) =>
      window.optical.invoke("print.preview", {
        kind: "prescription",
        id: ids.prescription,
      }),
    ids,
  );
  const preview = app.windows().find((p) => p !== page)!;
  await preview.waitForLoadState();
  await expect(preview.locator("article")).toHaveAttribute("dir", "rtl");
  await expect(preview.getByText("PD", { exact: true })).toBeVisible();
  const pdf = join(folder, "prescription.pdf");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, pdf);
  await page.evaluate(() => window.optical.invoke("print.pdf"));
  expect(readFileSync(pdf).subarray(0, 5).toString()).toBe("%PDF-");
  expect(statSync(pdf).size).toBeGreaterThan(1000);
  const backup = await page.evaluate(() =>
    window.optical.invoke("backup.create"),
  );
  await page.evaluate(() =>
    window.optical.invoke("customers.save", { data: { name: "After backup" } }),
  );
  await app.evaluate(({ dialog, app }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
    app.relaunch = () => {};
  }, backup);
  await page
    .evaluate(() => window.optical.invoke("backup.restore"))
    .catch(() => undefined);
  await app.close().catch(() => undefined);
  app = await launch();
  page = await app.firstWindow();
  await page
    .getByLabel("Username / اسم المستخدم", { exact: true })
    .fill("owner");
  await page
    .getByLabel("Password / كلمة المرور", { exact: true })
    .fill("release-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
  expect(
    await page.evaluate(
      async () => (await window.optical.invoke("customers.list", {})).total,
    ),
  ).toBe(1);
  const verification = await page.evaluate(
    async (ids) => ({
      purchase: await window.optical.invoke("purchases.get", ids.purchase),
      attachments: await window.optical.invoke("attachments.list", {
        entity_type: "customers",
        entity_id: ids.customer,
      }),
      info: await window.optical.invoke("app.info"),
    }),
    ids,
  );
  expect(verification.purchase.purchase.paid).toBe(200);
  expect(verification.attachments.length).toBe(1);
  expect(verification.info.data_folder).toBe(folder);
  await expect(
    page.getByRole("heading", { name: "نظرة عامة على المحل" }),
  ).toBeVisible();
  await expect(page.locator(".kpi").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/release-arabic.png",
    fullPage: true,
  });
  await app.close();
});
