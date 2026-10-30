import { expect, type Page } from "@playwright/test";

export const PASSWORD = "EduSor-dev-2026";

export async function login(page: Page, identifier: string) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#identifier", identifier);
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
}

/** Lockdown assessments ask to (re-)enter fullscreen; click through if shown. */
export async function ensureFullscreen(page: Page) {
  const btn = page.getByRole("button", { name: /полноэкранный/ });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

export async function startSeededAssessment(page: Page) {
  await page.goto("/student/dashboard", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Начать" }).first().click();
  await page.waitForURL(/instructions/);
  await expect(page.getByText("Режим блокировки")).toBeVisible();
  await page.getByRole("checkbox").check();
  await Promise.all([page.waitForURL(/\/student\/attempts\//), page.getByRole("button", { name: "Начать" }).click()]);
  await page.waitForSelector("[role=timer]");
  await ensureFullscreen(page);
}
