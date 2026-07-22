import { test, expect } from "@playwright/test";

test("agents page loads", async ({ page }) => {
  await page.goto("/agents", { waitUntil: "networkidle" });
  await expect(page).toHaveTitle(/Axiom Protocol/i);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Axiom Protocol/i })).toBeVisible();
});