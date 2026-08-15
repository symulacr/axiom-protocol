import { test, expect } from "@playwright/test";

test("app page loads", async ({ page }) => {
  await page.goto("/app", { waitUntil: "networkidle" });
  await expect(page).toHaveTitle(/Axiom — Own an AI Agent On-Chain/);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Axiom home/i })).toBeVisible();
});
