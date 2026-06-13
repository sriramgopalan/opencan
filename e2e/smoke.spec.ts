import { expect, test } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Etash");
});
