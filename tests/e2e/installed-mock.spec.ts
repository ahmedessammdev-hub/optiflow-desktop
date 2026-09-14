import { expect, test, _electron as electron } from "@playwright/test";

test("installed app renders product images from the mock database", async () => {
  const executable = process.env.OPTICAL_INSTALLED;
  test.skip(
    !executable,
    "Set OPTICAL_INSTALLED to verify the installed mock database",
  );
  const app = await electron.launch({ executablePath: executable! });
  const page = await app.firstWindow();
  await page
    .getByLabel("Username / اسم المستخدم", { exact: true })
    .fill("admin");
  await page
    .getByLabel("Password / كلمة المرور", { exact: true })
    .fill("Demo@12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
  const products = await page.evaluate(() =>
    window.optical.invoke("products.list", { page_size: 40 }),
  );
  expect(products.rows).toHaveLength(7);
  expect(
    products.rows.every((row) =>
      String(row.image_data_url).startsWith("data:image/png;base64,"),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "نقطة البيع", exact: true }).click();
  await expect(page.locator("img.product-card-image")).toHaveCount(7);
  await app.close();
});
