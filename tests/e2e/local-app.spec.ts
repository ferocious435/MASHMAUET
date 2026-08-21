/// <reference lib="dom" />

import { readFile } from "node:fs/promises";

import { fixWebmDuration } from "@fix-webm-duration/fix";
import { expect, test, type Page } from "@playwright/test";

const PROJECT_NAME = "בדיקת דפדפן אוטומטית";

test.beforeEach(async ({ page }) => {
  await page.route("**/local/codex/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ connected: false, state: "disconnected" }),
    });
  });
});

async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "פרויקט חדש" }).click();
  const projectDialog = page.locator("#project-dialog");
  await projectDialog.getByLabel("שם הפרויקט", { exact: true }).fill(name);
  await projectDialog.getByLabel("תיאור העבודה", { exact: true }).fill("בדיקת מסלול עבודה מקומי מלא ללא שליחת הודעה ל-Codex.");
  await projectDialog.getByRole("button", { name: "פתיחת הפרויקט", exact: true }).click();
  await expect(page.locator("#workspace-title")).toHaveText(name);
}

test("desktop: creates a local project and exposes document, chat, DEKEL and HTML export", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#workspace-title")).not.toBeEmpty();
  await expect(page.locator(".projects-panel")).toBeVisible();
  await expect(page.locator(".chat-panel")).toBeVisible();

  await createProject(page, PROJECT_NAME);

  await expect(page.locator("#document-stage")).toContainText(PROJECT_NAME);
  await expect(page.getByRole("heading", { name: "Codex לפרויקט הנוכחי" })).toBeVisible();
  await expect(page.locator("#chat-state-message")).toContainText("נדרש קישור חד־פעמי");

  await page.getByRole("button", { name: "בדיקת DEKEL", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "בדיקת כתב הכמויות מול DEKEL" })).toBeVisible();
  await expect(page.locator("#dekel-catalog-status")).toContainText("שורות מחיר ללא מע״מ", { timeout: 15_000 });
  await page.locator("#dekel-dialog .dialog-close").first().click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "ייצוא HTML", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const html = await readFile(downloadPath!, "utf8");
  expect(html).toContain(PROJECT_NAME);
  expect(html).toContain("כתב כמויות");
});

test("video: Chromium decodes an uploaded WebM and the project stores at least three analysis frames", async ({ page }) => {
  test.setTimeout(60_000);
  const projectName = "בדיקת וידאו אוטומטית";
  const videoName = "browser-video-smoke.webm";

  await page.goto("/");
  await expect(page.locator("#workspace-title")).not.toBeEmpty();
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
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.addEventListener("error", () => reject(new Error("MediaRecorder failed")), { once: true });
    });

    recorder.start();
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const draw = (now: number) => {
        const elapsed = now - startedAt;
        context.fillStyle = `hsl(${Math.round(elapsed / 7) % 360} 70% 45%)`;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "white";
        context.font = "bold 26px sans-serif";
        context.fillText(`MASHMAUET ${Math.round(elapsed)}ms`, 18, 96);
        if (elapsed >= 1_800) resolve();
        else requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    });
    recorder.stop();
    await stopped;
    const durationMs = performance.now() - startedAt;
    stream.getTracks().forEach((track) => track.stop());

    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) throw new Error("Generated WebM is empty");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { base64: btoa(binary), bytes: blob.size, durationMs, mimeType };
  });

  expect(generated.bytes).toBeGreaterThan(1_000);
  const rawVideo = Uint8Array.from(Buffer.from(generated.base64, "base64"));
  const fixedVideo = await fixWebmDuration(new Blob([rawVideo], { type: generated.mimeType }), generated.durationMs, { logger: false });
  const fixedBuffer = Buffer.from(await fixedVideo.arrayBuffer());
  const fixedBase64 = fixedBuffer.toString("base64");
  const metadata = await page.evaluate(async ({ base64, type }) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    try {
      await new Promise<void>((resolve, reject) => {
        video.addEventListener("loadedmetadata", () => resolve(), { once: true });
        video.addEventListener("error", () => reject(new Error("Fixed WebM metadata cannot be read")), { once: true });
      });
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }, { base64: fixedBase64, type: fixedVideo.type });
  expect(metadata).toEqual({ duration: expect.any(Number), width: 320, height: 180 });
  expect(Number.isFinite(metadata.duration)).toBe(true);
  expect(metadata.duration).toBeGreaterThan(1);
  await page.locator("#material-input").setInputFiles({
    name: videoName,
    mimeType: "video/webm",
    buffer: fixedBuffer,
  });
  await expect(page.locator("#save-indicator")).toHaveText("כל החומרים נקראו ונשמרו", { timeout: 30_000 });
  const materialButton = page.locator("#material-list [data-material-id]").filter({ hasText: videoName });
  await expect(materialButton).toContainText(/\d+ פריימים מוכנים לניתוח/);

  const project = await page.evaluate(async (name) => {
    const response = await fetch("/local/projects");
    const body = await response.json() as { projects: Array<{ name: string; materials: Array<{ name: string; videoFrameCount?: number; visionImageCount?: number }> }> };
    return body.projects.find((candidate: { name: string }) => candidate.name === name);
  }, projectName);
  const material = project?.materials.find((candidate: { name: string }) => candidate.name === videoName);
  expect(material?.videoFrameCount).toBeGreaterThanOrEqual(3);
  expect(material?.visionImageCount).toBe(material?.videoFrameCount);

  await materialButton.click();
  await expect(page.locator("#material-dialog video")).toBeVisible();
  await expect(page.locator("#material-details")).toContainText("פריימים לניתוח");
  await expect(page.locator("#analyze-material-button")).toBeEnabled();
});

test("mobile: navigation switches between project, document and chat panels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "ניווט ראשי" });
  await expect(navigation).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-mobile-view", "document");
  await expect(page.locator(".workspace")).toBeVisible();

  await navigation.getByRole("button", { name: "פרויקטים", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mobile-view", "projects");
  await expect(page.locator(".projects-panel")).toBeVisible();
  await expect(page.locator(".workspace")).toBeHidden();

  await navigation.getByRole("button", { name: "צ׳אט", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mobile-view", "chat");
  await expect(page.locator(".chat-panel")).toBeVisible();
  await expect(page.locator(".projects-panel")).toBeHidden();

  await navigation.getByRole("button", { name: "מסמך", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mobile-view", "document");
  await expect(page.locator(".workspace")).toBeVisible();
  await expect(page.locator(".chat-panel")).toBeHidden();
});
