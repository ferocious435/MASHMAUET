/// <reference lib="dom" />

import { readFile } from "node:fs/promises";

import { fixWebmDuration } from "@fix-webm-duration/fix";
import { expect, test, type Page } from "@playwright/test";

import { installMockLocalApi } from "./mock-local-api.js";

const READY_PROJECT = "בדיקת מוכנות וייצוא";

async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "פרויקט חדש" }).click();
  const dialog = page.locator("#project-dialog");
  await dialog.getByLabel("שם הפרויקט", { exact: true }).fill(name);
  await dialog.getByLabel("תיאור העבודה", { exact: true }).fill("בדיקת מסלול מקומי מלא עם חומר מקור ועיבוד מקצועי.");
  await dialog.getByRole("button", { name: "פתיחת הפרויקט", exact: true }).click();
  await expect(page.locator("#workspace-title")).toHaveText(name);
}

async function uploadTextMaterial(page: Page, name = "דרישות-הפרויקט.txt"): Promise<void> {
  await page.locator("#material-input").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from("מידות 12 מ״ר. נדרש ריצוף מלא, הכנת תשתית, בדיקות וניקיון למסירה.", "utf8"),
  });
}

test("blank → upload → processing → ready: export stays blocked until verified and becomes stale after a server-side edit", async ({ page }) => {
  const api = await installMockLocalApi(page);
  await page.goto("/");
  await createProject(page, READY_PROJECT);

  await expect(page.locator("#project-processing")).toHaveAttribute("data-workflow-state", "idle");
  await expect(page.locator("#document-readiness")).toContainText("אינו מוכן");
  for (const selector of ["#dekel-review-button", "#export-button", "#print-button"]) await expect(page.locator(selector)).toBeDisabled();
  expect(api.runCount(READY_PROJECT)).toBe(0);

  await uploadTextMaterial(page);
  await expect(page.locator("#project-processing")).toHaveAttribute("data-workflow-state", /queued|running/);
  await expect(page.locator("#export-button")).toBeDisabled();
  await expect(page.locator("#project-processing")).toHaveAttribute("data-workflow-state", "ready", { timeout: 10_000 });
  await expect(page.locator("#document-readiness")).toContainText("מוכן לבדיקה");
  for (const selector of ["#dekel-review-button", "#export-button", "#print-button"]) await expect(page.locator(selector)).toBeEnabled();
  await expect(page.locator("#document-stage")).toContainText("ריצוף מלא לרבות הכנת התשתית");
  expect(api.runCount(READY_PROJECT)).toBe(1);

  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#export-button").click()]);
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const html = await readFile(downloadPath!, "utf8");
  expect(html).toContain(READY_PROJECT);
  expect(html).toContain("כתב כמויות");

  await page.locator("#project-settings-button").click();
  await page.locator("#settings-project-description").fill("תיאור ששונה אחרי האימות ולכן דורש עיבוד מחודש.");
  await page.locator("#project-settings-form").getByRole("button", { name: "שמירת פרטים", exact: true }).click();
  await expect(page.locator("#project-processing")).toHaveAttribute("data-workflow-state", "stale");
  for (const selector of ["#dekel-review-button", "#export-button", "#print-button"]) await expect(page.locator(selector)).toBeDisabled();
});

test("needs_review and failed never unlock export; retry starts a new run and only ready unlocks it", async ({ page }) => {
  const api = await installMockLocalApi(page);
  const reviewName = "בדיקת needs review";
  const failedName = "בדיקת failed retry";
  api.setTerminal(reviewName, "needs_review");
  api.setTerminal(failedName, "failed");
  await page.goto("/");

  await createProject(page, reviewName);
  await uploadTextMaterial(page, "חומר-דורש-בדיקה.txt");
  await expect(page.locator("#project-processing")).toHaveAttribute("data-workflow-state", "needs_review", { timeout: 10_000 });
  await expect(page.locator("#workflow-error")).toBeVisible();
  await expect(page.locator("#retry-workflow-button")).toBeVisible();
  await expect(page.locator("#dekel-review-button")).toBeEnabled();
  await expect(page.locator("#export-button")).toBeDisabled();
  await expect(page.locator("#print-button")).toBeDisabled();

  await createProject(page, failedName);
  await uploadTextMaterial(page, "חומר-כשל.txt");
  await expect(page.locator("#project-processing")).toHaveAttribute("data-workflow-state", "failed", { timeout: 10_000 });
  await expect(page.locator("#workflow-error")).toContainText("נכשלה באופן מבוקר");
  for (const selector of ["#dekel-review-button", "#export-button", "#print-button"]) await expect(page.locator(selector)).toBeDisabled();

  await page.locator("#retry-workflow-button").click();
  await expect(page.locator("#project-processing")).toHaveAttribute("data-workflow-state", /queued|running/);
  await expect(page.locator("#export-button")).toBeDisabled();
  await expect(page.locator("#project-processing")).toHaveAttribute("data-workflow-state", "ready", { timeout: 10_000 });
  await expect(page.locator("#export-button")).toBeEnabled();
  expect(api.runCount(failedName)).toBe(2);
});

test("polling continues independently and resumes when switching back to a running project", async ({ page }) => {
  const api = await installMockLocalApi(page);
  const firstName = "פרויקט עיבוד ארוך";
  const secondName = "פרויקט עיבוד קצר";
  await page.goto("/");

  await createProject(page, firstName);
  api.hold(firstName);
  await uploadTextMaterial(page, "ראשון.txt");
  await expect(page.locator("#project-processing")).toHaveAttribute("data-workflow-state", "running", { timeout: 5_000 });

  await createProject(page, secondName);
  await uploadTextMaterial(page, "שני.txt");
  await expect(page.locator("#project-processing")).toHaveAttribute("data-workflow-state", "ready", { timeout: 10_000 });

  api.release(firstName);
  await page.locator("#project-list [data-project-id]").filter({ hasText: firstName }).click();
  await expect(page.locator("#workspace-title")).toHaveText(firstName);
  await expect(page.locator("#project-processing")).toHaveAttribute("data-workflow-state", "ready", { timeout: 5_000 });
  await expect(page.locator("#export-button")).toBeEnabled();
});

test("video: Chromium extracts analysis frames before the mocked professional workflow starts", async ({ page }) => {
  test.setTimeout(60_000);
  const api = await installMockLocalApi(page);
  const projectName = "בדיקת וידאו אוטומטית";
  const videoName = "browser-video-smoke.webm";
  await page.goto("/");
  await createProject(page, projectName);

  const generated = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    const mimeType = ["video/webm;codecs=vp8", "video/webm"].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error("Chromium cannot record WebM");
    const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 400_000 });
    const chunks: Blob[] = [];
    recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.addEventListener("error", () => reject(new Error("MediaRecorder failed")), { once: true });
    });
    recorder.start();
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const draw = (time: number) => {
        const elapsed = time - startedAt;
        context.fillStyle = `hsl(${Math.round(elapsed / 7) % 360} 70% 45%)`;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "white";
        context.font = "bold 26px sans-serif";
        context.fillText(`MASHMAUET ${Math.round(elapsed)}ms`, 18, 96);
        if (elapsed >= 1_800) resolve(); else requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    });
    recorder.stop();
    await stopped;
    const durationMs = performance.now() - startedAt;
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: mimeType });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { base64: btoa(binary), durationMs, mimeType };
  });

  const rawVideo = Uint8Array.from(Buffer.from(generated.base64, "base64"));
  const fixedVideo = await fixWebmDuration(new Blob([rawVideo], { type: generated.mimeType }), generated.durationMs, { logger: false });
  const fixedBuffer = Buffer.from(await fixedVideo.arrayBuffer());
  await page.locator("#material-input").setInputFiles({ name: videoName, mimeType: "video/webm", buffer: fixedBuffer });

  const materialButton = page.locator("#material-list [data-material-id]").filter({ hasText: videoName });
  await expect(materialButton).toContainText(/\d+ פריימים מוכנים לניתוח/);
  await expect(page.locator("#project-processing")).toHaveAttribute("data-workflow-state", "ready", { timeout: 10_000 });
  expect(api.runCount(projectName)).toBe(1);
  const text = await materialButton.textContent();
  expect(Number(text?.match(/(\d+) פריימים/)?.[1])).toBeGreaterThanOrEqual(3);
});

test("mobile: navigation switches between project, document and chat panels", async ({ page }) => {
  await installMockLocalApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "ניווט ראשי" });
  await expect(navigation).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-mobile-view", "document");
  await navigation.getByRole("button", { name: "פרויקטים", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mobile-view", "projects");
  await navigation.getByRole("button", { name: "צ׳אט", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mobile-view", "chat");
  await navigation.getByRole("button", { name: "מסמך", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mobile-view", "document");
});
