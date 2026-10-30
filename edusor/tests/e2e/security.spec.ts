import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("a student cannot open teacher or admin areas", async ({ page }) => {
  await login(page, "aruzhan.k");
  await page.goto("/teacher/dashboard");
  await expect(page).toHaveURL(/\/student\/dashboard/);
  await page.goto("/admin/students");
  await expect(page).toHaveURL(/\/student\/dashboard/);
});

test("a teacher from another school cannot open school 1 assessments", async ({ page, request }) => {
  await login(page, "teacher@gym1.edusor.local");
  await page.goto("/teacher/assessments");
  const href = await page.getByRole("link", { name: /Линейные уравнения/ }).first().getAttribute("href");
  expect(href).toBeTruthy();
  await page.context().clearCookies();
  await login(page, "teacher@lyc2.edusor.local");
  const res = await page.goto(href!);
  expect(res?.status()).toBe(404);
  const csv = await page.request.get(`/api${href!.replace("/teacher", "")}/export`);
  expect(csv.status()).toBe(404);
  void request;
});

test("job runner rejects calls without the cron secret", async ({ request }) => {
  const res = await request.post("/api/jobs/run");
  expect(res.status()).toBe(401);
});
