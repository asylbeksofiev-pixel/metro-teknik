import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("protected routes redirect anonymous users to login", async ({ page }) => {
  await page.goto("/teacher/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fteacher%2Fdashboard/);
});

test("wrong password shows an error and does not sign in", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#identifier", "teacher@gym1.edusor.local");
  await page.fill("#password", "wrong-password");
  await page.click("button[type=submit]");
  await expect(page.getByText("Неверный email/логин или пароль.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("teacher logs in, switches language to Kazakh and logs out", async ({ page }) => {
  await login(page, "teacher@gym1.edusor.local");
  await expect(page).toHaveURL(/\/teacher\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Здравствуйте");
  await page.getByRole("button", { name: "Қаз" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Сәлеметсіз бе");
  await page.getByRole("button", { name: "Рус" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Здравствуйте");
  await page.locator("header").getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("password recovery form never reveals whether an email exists", async ({ page }) => {
  await page.goto("/forgot-password", { waitUntil: "networkidle" });
  await page.fill("#email", "nobody@example.com");
  await page.getByRole("button", { name: "Отправить ссылку" }).click();
  await expect(page.getByRole("status")).toContainText("Если аккаунт");
});
