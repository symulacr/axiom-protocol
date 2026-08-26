import { test, expect } from "@playwright/test";

/*
  v2 smoke (post-cutover): public surfaces render, internal routes are held
  behind the wallet gate (LockedRoute), unknown routes recover safely, and
  the v1 compat redirects fold into the v2 IA.
*/

test("landing renders with wallet CTA", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveTitle(/Axiom — Own an AI Agent On-Chain/);
  await expect(page.locator(".landing-page")).toBeVisible();
  await expect(page.locator(".wallet-cta").first()).toBeVisible();
});

test("internal route is locked behind the wallet gate", async ({ page }) => {
  await page.goto("/app", { waitUntil: "networkidle" });
  await expect(page.locator(".locked-route-shell")).toBeVisible();
  await expect(page.getByText("wallet not connected")).toBeVisible();
});

test("public SEO hub renders (agents)", async ({ page }) => {
  await page.goto("/agents", { waitUntil: "networkidle" });
  await expect(page.locator(".seo-public--agents")).toBeVisible();
  await expect(page.locator(".seo-console-link")).toBeVisible();
});

test("/features alias resolves to the same public hub", async ({ page }) => {
  await page.goto("/features/storage", { waitUntil: "networkidle" });
  await expect(page.locator(".seo-public--storage")).toBeVisible();
});

test("v1 compat redirect /dashboard folds to /app (locked)", async ({
  page,
}) => {
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator(".locked-route-shell")).toBeVisible();
});

test("unknown route recovers with 404 surface", async ({ page }) => {
  await page.goto("/definitely-not-a-route", { waitUntil: "networkidle" });
  await expect(page.locator(".recovery-404")).toBeVisible();
});
