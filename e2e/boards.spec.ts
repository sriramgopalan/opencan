import { expect, test } from "@playwright/test";

test("public board index loads and shows empty state", async ({ page }) => {
  const response = await page.goto("/boards");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();
});

test("non-existent board returns 404", async ({ page }) => {
  const response = await page.goto("/boards/this-board-does-not-exist-xyz");
  expect(response?.status()).toBe(404);
});

test("dashboard boards page redirects unauthenticated users to sign-in", async ({ page }) => {
  await page.goto("/dashboard/boards");
  await expect(page).toHaveURL(/\/auth\/signin/);
});

test("new board page redirects unauthenticated users to sign-in", async ({ page }) => {
  await page.goto("/dashboard/boards/new");
  await expect(page).toHaveURL(/\/auth\/signin/);
});
