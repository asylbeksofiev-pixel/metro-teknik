import { expect, test } from "@playwright/test";
import { ensureFullscreen, login, startSeededAssessment } from "./helpers";

test.describe.configure({ mode: "serial" });

let attemptUrl = "";

test("student takes the assessment: autosave, refresh restore, submit", async ({ page }) => {
  await login(page, "daniyar.n");
  await startSeededAssessment(page);
  attemptUrl = page.url();
  await page.locator("label").filter({ hasText: "B." }).first().click();
  await expect(page.locator("header [aria-live]")).toContainText("Сохранено");
  await page.getByRole("button", { name: /^8/ }).click();
  await page.locator("textarea").fill("x + x + 5 = 25, x = 10. Ответ: 10 и 15.");
  await expect(page.locator("header [aria-live]")).toContainText("Сохранено");

  await page.reload();
  await page.waitForSelector("[role=timer]");
  await ensureFullscreen(page);
  await expect(page.getByText("Отвечено: 2 из 8").first()).toBeVisible();

  await page.getByRole("button", { name: "Сдать работу" }).first().click();
  await expect(page.getByText("Без ответа: 6")).toBeVisible();
  await page.getByRole("button", { name: "Сдать", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Работа сдана" })).toBeVisible({ timeout: 30_000 });

  // Revisiting the attempt shows the locked confirmation, not the questions.
  await page.goto(attemptUrl);
  await expect(page.getByRole("heading", { name: "Работа сдана" })).toBeVisible();
  await expect(page.locator("[role=timer]")).toHaveCount(0);
});

test("teacher grades the essay, approves and releases; student sees the result", async ({ browser }) => {
  const attemptId = attemptUrl.split("/").pop()!;
  const teacher = await (await browser.newContext()).newPage();
  await login(teacher, "teacher@gym1.edusor.local");
  await teacher.goto(`/teacher/submissions/${attemptId}/review`);
  const essay = teacher.locator("article", { hasText: "Развёрнутый ответ" });
  await essay.getByLabel("Баллы").fill("3");
  await essay.getByRole("button", { name: "Сохранить балл" }).click();
  await expect(teacher.getByText("Все вопросы проверены")).toBeVisible();
  await teacher.getByRole("button", { name: "Утвердить оценку" }).click();
  await expect(teacher.getByRole("button", { name: "Опубликовать результаты" })).toBeVisible();
  await teacher.getByRole("button", { name: "Опубликовать результаты" }).click();
  await expect(teacher.getByText("Опубликовано").first()).toBeVisible();

  const student = await (await browser.newContext()).newPage();
  await login(student, "daniyar.n");
  await student.goto(`/student/results/${attemptId}`);
  await expect(student.getByText("Ваш результат")).toBeVisible();
  await expect(student.locator("main")).toContainText("4 / 17");
  await student.getByRole("link", { name: "Разбор ошибок" }).click();
  await expect(student.getByText("Правильный ответ").first()).toBeVisible();
});
