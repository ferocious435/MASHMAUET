import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../src/app/create-app.ts";
import type { CodexGateway } from "../src/modules/local-workspace/codex-app-server-client.ts";
import type { ProfessionalKnowledgeContext, ProfessionalKnowledgeGateway } from "../src/modules/references/services/professional-knowledge-service.ts";
import type { AudioTranscriptionGateway, AudioTranscriptionResult, MediaProbeResult } from "../src/modules/local-workspace/media-audio-transcription.ts";

test("локальный API закрывает полный жизненный цикл данных", async () => {
  const fixture = await startFixture();
  try {
    const initial = await json(fixture.baseUrl, "/local/projects");
    assert.equal(initial.response.status, 200);
    assert.equal(initial.body.projects.length, 1);
    assert.equal(initial.response.headers.get("x-frame-options"), "DENY");
    assert.doesNotMatch(JSON.stringify(initial.body), /sourcePath|extractedTextPath|analysisTextPath|correctedTextPath|visionImagePaths|codexThreadId/);

    const invalid = await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "", description: "x", unexpected: true } });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.body.code, "validation_error");

    const created = await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "API-проект", description: "Проверка полного цикла" } });
    assert.equal(created.response.status, 201);
    const projectId = created.body.project.id as string;

    const wrongPdf = await fetch(`${fixture.baseUrl}/local/projects/${projectId}/materials`, {
      method: "POST", headers: { "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent("подмена.pdf") }, body: "это не pdf",
    });
    assert.equal(wrongPdf.status, 415);
    assert.equal(((await wrongPdf.json()) as { code: string }).code, "file_signature_mismatch");

    const uploaded = await fetch(`${fixture.baseUrl}/local/projects/${projectId}/materials`, {
      method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("описание.txt") }, body: "Локальный тестовый материал",
    });
    assert.equal(uploaded.status, 201);
    const uploadBody = (await uploaded.json()) as { material: { id: string; status: string } };
    assert.equal(uploadBody.material.status, "ready");
    assert.doesNotMatch(JSON.stringify(uploadBody), /sourcePath|extractedTextPath|analysisTextPath|correctedTextPath|visionImagePaths/);
    const materialId = uploadBody.material.id as string;

    const originalContent = await json(fixture.baseUrl, `/local/projects/${projectId}/materials/${materialId}/content`);
    assert.equal(originalContent.body.content.originalText, "Локальный тестовый материал");
    assert.equal(originalContent.body.content.hasCorrection, false);
    const corrected = await json(fixture.baseUrl, `/local/projects/${projectId}/materials/${materialId}/content`, { method: "PUT", body: { text: "Исправленный владельцем текст" } });
    assert.equal(corrected.body.content.effectiveText, "Исправленный владельцем текст");
    assert.equal(corrected.body.project.materials[0].hasCorrection, true);

    const reprocessed = await json(fixture.baseUrl, `/local/projects/${projectId}/materials/${materialId}/reprocess`, { method: "POST" });
    assert.equal(reprocessed.body.project.materials[0].status, "ready");
    assert.equal(reprocessed.body.project.materials[0].correctionNeedsReview, true);
    assert.equal((await json(fixture.baseUrl, `/local/projects/${projectId}/materials/${materialId}/content`)).body.content.effectiveText, "Исправленный владельцем текст");
    const resetContent = await json(fixture.baseUrl, `/local/projects/${projectId}/materials/${materialId}/content`, { method: "PUT", body: { text: null } });
    assert.equal(resetContent.body.content.hasCorrection, false);
    assert.equal(resetContent.body.content.effectiveText, "Локальный тестовый материал");
    const analyzedContent = await json(fixture.baseUrl, `/local/projects/${projectId}/materials/${materialId}/analyze`, { method: "POST" });
    assert.match(analyzedContent.body.content.analysisText, /Проверено/);

    const videoBytes = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
    const videoUpload = await fetch(`${fixture.baseUrl}/local/projects/${projectId}/materials`, {
      method: "POST", headers: { "Content-Type": "video/mp4", "X-File-Name": encodeURIComponent("осмотр.mp4") }, body: videoBytes,
    });
    assert.equal(videoUpload.status, 201);
    const videoBody = await videoUpload.json() as { material: { id: string } };
    const frame = await fetch(`${fixture.baseUrl}/local/projects/${projectId}/materials/${videoBody.material.id}/video-frames?timestampSeconds=2.5&durationSeconds=20`, {
      method: "POST", headers: { "Content-Type": "image/jpeg" }, body: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 0, 0xff, 0xd9]),
    });
    assert.equal(frame.status, 201);
    assert.equal(((await frame.json()) as { project: { materials: Array<{ id: string; videoFrameCount: number }> } }).project.materials.find((item) => item.id === videoBody.material.id)?.videoFrameCount, 1);
    const preview = await fetch(`${fixture.baseUrl}/local/projects/${projectId}/materials/${videoBody.material.id}/preview`);
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get("content-disposition") ?? "", /^inline;/);

    await json(fixture.baseUrl, `/local/projects/${projectId}`, { method: "PUT", body: { document: { ...created.body.project.document, objective: "Версия A" } } });
    const versionCreated = await json(fixture.baseUrl, `/local/projects/${projectId}/versions`, { method: "POST", body: { label: "Контрольная версия" } });
    const versionId = versionCreated.body.project.versions.at(-1).id as string;
    await json(fixture.baseUrl, `/local/projects/${projectId}`, { method: "PUT", body: { document: { ...created.body.project.document, objective: "Версия B" } } });
    const restoredVersion = await json(fixture.baseUrl, `/local/projects/${projectId}/versions/${versionId}/restore`, { method: "POST" });
    assert.equal(restoredVersion.body.project.document.objective, "Версия A");
    assert.ok(restoredVersion.body.project.versions.length >= 2);

    const chatPromise = json(fixture.baseUrl, `/local/projects/${projectId}/chat`, { method: "POST", body: { message: "Уникальный секрет теста 7391: предложи новую цель" } });
    await delay(20);
    const duringChat = await json(fixture.baseUrl, `/local/projects/${projectId}`, { method: "PUT", body: { document: { ...created.body.project.document, objective: "Изменено во время ответа" } } });
    assert.equal(duringChat.response.status, 200);
    const chat = await chatPromise;
    assert.equal(chat.response.status, 200);
    assert.equal(chat.body.proposals.length, 1);
    const afterChat = await json(fixture.baseUrl, `/local/projects/${projectId}`);
    assert.equal(afterChat.body.project.document.objective, "Изменено во время ответа");
    assert.ok(afterChat.body.project.chat.some((item: { role: string }) => item.role === "assistant"));

    const proposalId = chat.body.proposals[0].id as string;
    const forbiddenGlobal = await json(fixture.baseUrl, `/local/projects/${projectId}/proposals/${proposalId}/apply`, { method: "POST", body: { scope: "global", confirmGlobal: true } });
    assert.equal(forbiddenGlobal.response.status, 400);
    assert.equal(forbiddenGlobal.body.code, "validation_error");
    const stale = await json(fixture.baseUrl, `/local/projects/${projectId}/proposals/${proposalId}/apply`, { method: "POST", body: { scope: "project" } });
    assert.equal(stale.response.status, 409);
    assert.equal(stale.body.code, "stale_chat_proposal");
    const refreshedChat = await json(fixture.baseUrl, `/local/projects/${projectId}/chat`, { method: "POST", body: { message: "Подготовь цель ещё раз по текущей версии" } });
    const refreshedProposalId = refreshedChat.body.proposals[0].id as string;
    const applied = await json(fixture.baseUrl, `/local/projects/${projectId}/proposals/${refreshedProposalId}/apply`, { method: "POST", body: { scope: "project" } });
    assert.equal(applied.body.project.document.objective, "Цель от Codex");

    const backup = await json(fixture.baseUrl, "/local/backups", { method: "POST", body: { label: "Контрольная копия" } });
    assert.equal(backup.response.status, 201);
    const backupId = backup.body.backup.id as string;
    await json(fixture.baseUrl, `/local/projects/${projectId}`, { method: "PUT", body: { document: { ...applied.body.project.document, objective: "После копии" } } });
    const unconfirmedRestore = await json(fixture.baseUrl, `/local/backups/${backupId}/restore`, { method: "POST", body: {} });
    assert.equal(unconfirmedRestore.response.status, 400);
    const restoredBackup = await json(fixture.baseUrl, `/local/backups/${backupId}/restore`, { method: "POST", body: { confirm: true } });
    assert.equal(restoredBackup.response.status, 200);
    assert.equal((await json(fixture.baseUrl, `/local/projects/${projectId}`)).body.project.document.objective, "Цель от Codex");

    const archived = await json(fixture.baseUrl, `/local/projects/${projectId}/archive`, { method: "POST", body: { confirm: true } });
    assert.equal(archived.body.archived, true);
    assert.equal((await json(fixture.baseUrl, "/local/archived-projects")).body.projects.length, 1);
    const archiveRestored = await json(fixture.baseUrl, `/local/archived-projects/${projectId}/restore`, { method: "POST" });
    assert.equal(archiveRestored.body.project.id, projectId);

    const health = await json(fixture.baseUrl, "/local/health");
    assert.equal(health.body.writable, true);
    assert.deepEqual(health.body.corruptEntries, []);
    assert.ok(health.body.backups >= 3);

    const crossSite = await fetch(`${fixture.baseUrl}/local/projects`, { headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" } });
    assert.equal(crossSite.status, 403);

    const logs = await readFile(join(fixture.dataRoot, "logs", "application.log"), "utf8");
    assert.match(logs, /local_api_request/);
    assert.doesNotMatch(logs, /Уникальный секрет теста 7391/);
  } finally { await fixture.close(); }
});

test("публичный документ не может подделать системное происхождение почасовой строки", async () => {
  const fixture = await startFixture();
  try {
    const project = (await json(fixture.baseUrl, "/local/projects")).body.projects[0];
    const document = structuredClone(project.document);
    document.boqRows[0] = { ...document.boqRows[0], unit: "שעה", pricingBasis: "system_decomposed_residual" };
    const updated = await json(fixture.baseUrl, `/local/projects/${project.id}`, { method: "PUT", body: { document } });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.project.document.boqRows[0].pricingBasis, undefined);
    const stored = JSON.parse(await readFile(join(fixture.dataRoot, "projects", project.id, "project.json"), "utf8"));
    assert.equal(stored.document.boqRows[0].pricingBasis, undefined);
  } finally { await fixture.close(); }
});

test("лимит запросов возвращает контролируемый 429", async () => {
  const fixture = await startFixture({ generalRequestsPerMinute: 2 });
  try {
    assert.equal((await fetch(`${fixture.baseUrl}/local/projects`)).status, 200);
    assert.equal((await fetch(`${fixture.baseUrl}/local/projects`)).status, 200);
    const limited = await fetch(`${fixture.baseUrl}/local/projects`);
    assert.equal(limited.status, 429);
    assert.equal(((await limited.json()) as { code: string }).code, "rate_limit");
  } finally { await fixture.close(); }
});

test("API обработки проекта сообщает сохранённое состояние и не запускается без материалов", async () => {
  const fixture = await startFixture();
  try {
    const created = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST",
      body: { name: "Пустой объект", description: "Ожидает загрузку исходных материалов" },
    })).body.project;
    const status = await json(fixture.baseUrl, `/local/projects/${created.id}/processing`);
    assert.equal(status.response.status, 200);
    assert.equal(status.body.processing.status, "idle");
    assert.equal(status.body.processing.stage, "awaiting_materials");
    assert.equal(status.body.processing.readyForExport, false);

    const started = await json(fixture.baseUrl, `/local/projects/${created.id}/processing-runs`, {
      method: "POST",
      body: { mode: "full", replaceDocument: true },
    });
    assert.equal(started.response.status, 409);
    assert.equal(started.body.code, "project_has_no_materials");
  } finally { await fixture.close(); }
});

test("полная обработка читает материал, заменяет пустую смету и применяет глобальный DEKEL", async () => {
  const codex = new ProjectBuildingCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST",
      body: { name: "Объект для расчёта", description: "Финальная уборка помещения после ремонта" },
    })).body.project;
    const upload = await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") },
      body: "Выполнить финальную уборку десяти квадратных метров после ремонта.",
    });
    assert.equal(upload.status, 201);

    const started = await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, {
      method: "POST",
      body: { mode: "full", replaceDocument: true },
    });
    assert.equal(started.response.status, 202);
    assert.match(started.body.processing.status, /^(queued|running)$/);
    assert.ok(started.body.processing.runId);

    let current: any;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      current = (await json(fixture.baseUrl, `/local/projects/${project.id}`)).body.project;
      if (["ready", "failed", "needs_review", "stale"].includes(current.processing.status)) break;
      await delay(25);
    }
    assert.equal(current.processing.status, "ready", JSON.stringify(current.processing));
    assert.equal(current.processing.stage, "complete");
    assert.equal(current.processing.readyForExport, true);
    assert.deepEqual(current.processing.warningCodes, []);
    assert.ok(current.processing.baseDocumentFingerprint);
    assert.ok(current.versions.some((version: any) => /לפני עיבוד מלא/.test(version.label)));
    assert.equal(current.document.boqRows.length, 1);
    assert.ok(current.document.boqRows.every((row: any) => !String(row.id).startsWith("boq-example-")));
    assert.equal(current.document.boqRows[0].code, "95.69.04.0003");
    assert.ok(current.document.boqRows[0].unitPrice > 0);
    assert.ok(current.document.evidenceNotes.some((note: any) => note.anchorId === current.document.boqRows[0].id));
    assert.equal(current.dekelReview.status, "applied");
    assert.equal(current.dekelReview.financialAudit.valid, true);
    assert.ok(codex.prompts.some((prompt) => /точное профессиональное чтение одного материала/.test(prompt)));
    assert.ok(codex.prompts.some((prompt) => /ПОСТРОЙ ПОЛНЫЙ РАБОЧИЙ ДОКУМЕНТ/.test(prompt)));
    assert.ok(codex.prompts.some((prompt) => /СФОРМИРУЙ ТОЛЬКО evidenceNotes/.test(prompt)));

    const changedDocument = structuredClone(current.document);
    changedDocument.objective = "Ручное изменение после проверки";
    const changed = await json(fixture.baseUrl, `/local/projects/${project.id}`, { method: "PUT", body: { document: changedDocument } });
    assert.equal(changed.response.status, 200);
    assert.equal(changed.body.project.processing.readyForExport, false);
    assert.equal(changed.body.project.processing.validatedDocumentFingerprint, null);
    assert.notEqual(changed.body.project.processing.status, "ready");

    const materialId = changed.body.project.materials[0].id;
    const corrected = await json(fixture.baseUrl, `/local/projects/${project.id}/materials/${materialId}/content`, { method: "PUT", body: { text: "Исправленное требование владельца" } });
    assert.equal(corrected.body.project.processing.readyForExport, false);
    assert.equal(corrected.body.project.processing.sourceFingerprint, null);
  } finally { await fixture.close(); }
});

test("полная обработка не принимает непроверенный inventory от первого AI-прохода", async () => {
  const fixture = await startFixture({}, new RejectingScopeCriticCodex());
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Проверка полноты", description: "Нужна независимая проверка" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, { method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Требуется финальная уборка." });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(current.processing.status, "failed");
    assert.equal(current.processing.error.code, "scope_inventory_unverified");
    assert.equal(current.processing.readyForExport, false);
  } finally { await fixture.close(); }
});

test("полная обработка повторно проверяет inventory после каждого дополнения критика", async () => {
  const codex = new ProgressiveScopeCriticCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Последовательная проверка", description: "Критик находит технологические операции слоями" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, { method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Требуется финальная уборка после ремонта." });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(codex.criticCalls, 3);
    assert.notEqual(current.processing.error?.code, "scope_inventory_unverified");
    assert.match(current.processing.status, /^(ready|needs_review)$/);
  } finally { await fixture.close(); }
});

test("большой כתב כמויות формирует доказательства партиями без одного чрезмерного ответа", async () => {
  const codex = new BatchedEvidenceProjectBuildingCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST",
      body: { name: "Многострочный объект", description: "Проверка пакетного анализа" },
    })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("объём.txt") },
      body: "Нужно сформировать полный многострочный כתב כמויות.",
    });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, {
      method: "POST",
      body: { mode: "full", replaceDocument: true },
    });
    const current = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(current.processing.status, "needs_review", JSON.stringify(current.processing));
    assert.ok(current.document.boqRows.length >= 23);
    const rowIds = new Set(current.document.boqRows.map((row: any) => row.id));
    const coveredIds = new Set(current.document.evidenceNotes.map((note: any) => note.anchorId));
    assert.ok(current.document.boqRows.every((row: any) => coveredIds.has(row.id)));
    assert.ok(current.document.evidenceNotes.every((note: any) => rowIds.has(note.anchorId)));
    assert.ok(current.processing.warningCodes.includes("evidence_assumption_fallback"));
    assert.equal(current.document.evidenceNotes.find((note: any) => note.anchorId === "batch-boq-23")?.kind, "inference");
    const evidencePrompts = codex.prompts.filter((prompt) => /СФОРМИРУЙ ТОЛЬКО evidenceNotes/.test(prompt));
    assert.equal(evidencePrompts.length, Math.ceil(current.document.boqRows.length / 10));
    assert.ok(evidencePrompts.every((prompt) => new Set(prompt.match(/batch-boq-\d+/g) ?? []).size <= 10));
  } finally { await fixture.close(); }
});

test("два одновременных запуска дают один run, а правка во время run блокируется", async () => {
  const codex = new BlockingProjectBuildingCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST", body: { name: "Проверка гонки", description: "Один запуск и безопасная правка" },
    })).body.project;
    const upload = await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Выполнить финальную уборку десяти квадратных метров после ремонта.",
    });
    assert.equal(upload.status, 201);

    const [first, second] = await Promise.all([
      json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } }),
      json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } }),
    ]);
    assert.deepEqual([first.response.status, second.response.status].sort(), [202, 409]);
    await codex.waitUntilBlocked();

    const changedDocument = structuredClone(project.document);
    changedDocument.objective = "Эта правка не должна быть затёрта rollback";
    const edit = await json(fixture.baseUrl, `/local/projects/${project.id}`, { method: "PUT", body: { document: changedDocument } });
    assert.equal(edit.response.status, 409);
    assert.equal(edit.body.code, "processing_in_progress");
    codex.release();
    const completed = await waitForProcessing(fixture.baseUrl, project.id);
    assert.match(completed.processing.status, /^(ready|needs_review)$/);
  } finally {
    codex.release();
    await fixture.close();
  }
});

test("автоматический DEKEL сохраняет неподобранную работу и требует проверки", async () => {
  const fixture = await startFixture({}, new UnmatchedProjectBuildingCodex());
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Редкая работа", description: "Нет надёжного соответствия DEKEL" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Выполнить специальную работу ZZZ_NONMATCH_987.",
    });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(current.processing.status, "needs_review", JSON.stringify(current.processing));
    assert.equal(current.processing.readyForExport, false);
    const unmatched = current.document.boqRows.find((row: any) => row.id === "boq-unmatched");
    assert.ok(unmatched);
    assert.equal(unmatched.unitPrice, 0);
    assert.match(current.dekelReview.warnings.join("\n"), /בדיקה|ביטחון|התאמה|יחידת/);
  } finally { await fixture.close(); }
});

test("полная обработка семантически выбирает реальный סעיף DEKEL из кандидатов и применяет цену", async () => {
  const codex = new SemanticDekelProjectBuildingCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "אולם ספורט", description: "ניקוי סופי לאחר שיפוץ" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Нужна финальную уборку зала площадью 10 м² после ремонта.",
    });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(current.processing.status, "ready", JSON.stringify(current.processing));
    assert.equal(current.document.boqRows.length, 1);
    assert.equal(current.document.boqRows[0].code, "95.69.04.0003");
    assert.ok(current.document.boqRows[0].unitPrice > 0);
    assert.match(current.document.boqRows[0].description, /נקיון יסודי/);
    assert.ok(codex.prompts.some((prompt) => prompt.includes("DEKEL_CANDIDATE_SELECTION")));
  } finally { await fixture.close(); }
});

test("полная обработка удаляет вымышленный источник evidence и требует проверки", async () => {
  const fixture = await startFixture({}, new InvalidEvidenceProjectBuildingCodex());
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Проверка evidence", description: "Источник должен существовать" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Выполнить финальную уборку десяти квадратных метров после ремонта.",
    });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(current.processing.status, "needs_review", JSON.stringify(current.processing));
    assert.ok(current.processing.warningCodes.includes("evidence_source_downgraded"));
    assert.equal(current.document.boqRows.length, 1);
    assert.equal(current.document.evidenceNotes[0].kind, "inference");
    assert.equal(current.document.evidenceNotes[0].quantityBasis, "inferred");
    assert.equal(current.document.evidenceNotes[0].source, undefined);
  } finally { await fixture.close(); }
});

test("расшифровка звука видео с временными метками входит в анализ Codex", async () => {
  const codex = new ProjectBuildingCodex();
  const audio = new ScriptedAudioTranscription();
  const fixture = await startFixture({}, codex, new EmptyKnowledge(), audio);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST",
      body: { name: "Видеообъект", description: "Требования объяснены голосом" },
    })).body.project;
    const fakeMp4 = Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
    const upload = await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST",
      headers: { "Content-Type": "video/mp4", "X-File-Name": encodeURIComponent("объяснение.mp4") },
      body: fakeMp4,
    });
    assert.equal(upload.status, 201);
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    let current: any;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      current = (await json(fixture.baseUrl, `/local/projects/${project.id}`)).body.project;
      if (["ready", "failed", "needs_review", "stale"].includes(current.processing.status)) break;
      await delay(25);
    }
    assert.equal(current.processing.status, "ready", JSON.stringify(current.processing));
    assert.equal(current.materials[0].audioStatus, "completed");
    assert.equal(current.materials[0].audioTranscriptLanguage, "he");
    assert.equal(current.materials[0].audioTranscriptSegmentCount, 1);
    const materialPrompt = codex.prompts.find((prompt) => /точное профессиональное чтение одного материала/.test(prompt)) ?? "";
    assert.match(materialPrompt, /00:00:02–00:00:07/);
    assert.match(materialPrompt, /יש לבצע ניקיון יסודי לאחר השיפוץ/);
    assert.match(materialPrompt, /отличай сказанное от видимого/);

    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      current = (await json(fixture.baseUrl, `/local/projects/${project.id}`)).body.project;
      if (["ready", "failed", "needs_review", "stale"].includes(current.processing.status)) break;
      await delay(25);
    }
    assert.equal(current.processing.status, "ready", JSON.stringify(current.processing));
    assert.equal(audio.transcriptionCalls, 1, "неизменённое видео не должно распознаваться повторно");
  } finally { await fixture.close(); }
});

test("проекты изолированы, а ошибка Codex сохраняется контролируемо", async () => {
  const codex = new CapturingCodex();
  const fixture = await startFixture({}, codex, new ReferenceKnowledge());
  try {
    const first = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Первый", description: "Первый проект" } })).body.project;
    const second = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Второй", description: "Второй проект" } })).body.project;
    const firstUpload = await fetch(`${fixture.baseUrl}/local/projects/${first.id}/materials`, { method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("секрет.txt") }, body: "МАТЕРИАЛ_ТОЛЬКО_ПЕРВОГО_ПРОЕКТА" });
    const firstMaterialId = ((await firstUpload.json()) as { material: { id: string } }).material.id;
    await json(fixture.baseUrl, `/local/projects/${first.id}/materials/${firstMaterialId}/content`, { method: "PUT", body: { text: "ИСПРАВЛЕННЫЙ_ТЕКСТ_ВЛАДЕЛЬЦА" } });
    await json(fixture.baseUrl, `/local/projects/${first.id}/chat`, { method: "POST", body: { message: "Прочитай исправленный материал" } });
    assert.match(codex.prompts.at(-1) ?? "", /ИСПРАВЛЕННЫЙ_ТЕКСТ_ВЛАДЕЛЬЦА/);
    assert.match(codex.prompts.at(-1) ?? "", /исправлено владельцем; этот текст имеет приоритет/);
    assert.doesNotMatch(codex.prompts.at(-1) ?? "", /МАТЕРИАЛ_ТОЛЬКО_ПЕРВОГО_ПРОЕКТА/);
    const secondChat = await json(fixture.baseUrl, `/local/projects/${second.id}/chat`, { method: "POST", body: { message: "Что есть в моём проекте?" } });
    assert.equal(secondChat.response.status, 200);
    assert.doesNotMatch(codex.prompts.at(-1) ?? "", /МАТЕРИАЛ_ТОЛЬКО_ПЕРВОГО_ПРОЕКТА/);
    assert.match(codex.prompts.at(-1) ?? "", /DEKEL — постоянный глобальный прайс-лист системы/);
    assert.match(codex.prompts.at(-1) ?? "", /независимо от того, где он сохранён — в проекте, глобальной папке или другом каталоге/);
    assert.match(codex.prompts.at(-1) ?? "", /Никогда не спрашивай и не предлагай сменить прайс-лист/);
    assert.match(codex.prompts.at(-1) ?? "", /Скрытый профессиональный справочный контекст/);
    assert.match(codex.prompts.at(-1) ?? "", /חוזה מדף 3210 2019\.pdf/);
    assert.match(codex.prompts.at(-1) ?? "", /не считается автоматически включённым в договор/);
    assert.match(codex.prompts.at(-1) ?? "", /Местоположение: страница 8/);
    assert.match(codex.prompts.at(-1) ?? "", /не меняют структуру, формулировки, внешний вид или финансовые правила итогового документа/);
    assert.match(codex.prompts.at(-1) ?? "", /специальную спецификацию, כתב כמויות, чертежи или иные материалы текущего проекта/);
    await json(fixture.baseUrl, `/local/projects/${second.id}/chat`, { method: "POST", body: { message: "Продолжи с учётом нашего разговора" } });
    const continuedPrompt = codex.prompts.at(-1) ?? "";
    assert.match(continuedPrompt, /Недавний диалог только этого проекта/);
    assert.match(continuedPrompt, /Владелец: Что есть в моём проекте\?/);
    assert.match(continuedPrompt, /Codex: Изолированный ответ/);
    assert.match(continuedPrompt, /Внутренний чат не может создавать, изменять или удалять общие правила системы/);
    assert.match(continuedPrompt, /Контрольный финансовый расчёт текущего документа/);

    codex.fail = true;
    const failed = await json(fixture.baseUrl, `/local/projects/${second.id}/chat`, { method: "POST", body: { message: "Вызови контролируемую ошибку" } });
    assert.equal(failed.response.status, 502);
    assert.equal(failed.body.code, "codex_unavailable");
    const projectAfterFailure = (await json(fixture.baseUrl, `/local/projects/${second.id}`)).body.project;
    assert.match(projectAfterFailure.chat.at(-1).text, /Codex לא הצליח להשיב/);
    assert.equal(projectAfterFailure.chat.at(-1).status, "failed");
    assert.equal(projectAfterFailure.chat.at(-1).retryOfMessageId, projectAfterFailure.chat.at(-2).id);
    const failedUserId = projectAfterFailure.chat.at(-2).id as string;
    codex.fail = false;
    const retried = await json(fixture.baseUrl, `/local/projects/${second.id}/chat`, { method: "POST", body: { retryOfMessageId: failedUserId } });
    assert.equal(retried.response.status, 200);
    assert.equal(retried.body.project.chat.filter((item: any) => item.id === failedUserId).length, 1);
    assert.equal(retried.body.project.chat.some((item: any) => item.status === "failed" && item.retryOfMessageId === failedUserId), false);
    assert.equal(retried.body.project.chat.at(-1).replyToMessageId, failedUserId);
  } finally { await fixture.close(); }
});

test("повреждение данных видно в диагностике, а API не раскрывает детали", async () => {
  const fixture = await startFixture({ maxUploadBytes: 5 });
  try {
    const project = (await json(fixture.baseUrl, "/local/projects")).body.projects[0];
    const oversized = await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, { method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("large.txt") }, body: "123456" });
    assert.equal(oversized.status, 413);

    const brokenDirectory = join(fixture.dataRoot, "projects", "broken-project");
    await mkdir(brokenDirectory, { recursive: true });
    await writeFile(join(brokenDirectory, "project.json"), "{broken", "utf8");
    const health = await json(fixture.baseUrl, "/local/health");
    assert.deepEqual(health.body.corruptEntries, ["broken-project"]);
    assert.doesNotMatch(JSON.stringify(health.body), new RegExp(fixture.dataRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const unknown = await json(fixture.baseUrl, "/local/does-not-exist");
    assert.equal(unknown.response.status, 404);
    assert.equal(unknown.body.code, "route_not_found");
  } finally { await fixture.close(); }
});

test("чтение проектов выдерживает параллельную локальную нагрузку", async () => {
  const fixture = await startFixture();
  try {
    const startedAt = performance.now();
    const responses = await Promise.all(Array.from({ length: 50 }, () => fetch(`${fixture.baseUrl}/local/projects`)));
    assert.ok(responses.every((response) => response.status === 200));
    assert.ok(performance.now() - startedAt < 5_000);
  } finally { await fixture.close(); }
});

test("DEKEL проходит полный путь внутри локального проекта", async () => {
  const fixture = await startFixture();
  try {
    const project = (await json(fixture.baseUrl, "/local/projects")).body.projects[0];
    const status = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel`);
    assert.equal(status.response.status, 200);
    assert.equal(status.body.catalog.exists, true);
    assert.ok(status.body.catalog.billableRowsCount > 0);
    assert.equal(status.body.catalog.workbookPath, undefined);
    assert.equal(status.body.catalog.isSystemDefault, true);
    assert.equal(status.body.catalog.scope, "system");
    assert.equal(status.body.catalog.askToSwitch, false);
    assert.equal(status.body.catalog.sourcePolicy, "dekel_only_until_explicit_file_request");
    assert.equal(status.body.catalog.ignoresUnrequestedPricebooksEverywhere, true);
    assert.equal(status.body.catalog.workbookSelectionPolicy, "fixed_global_manifest");
    assert.equal(status.body.catalog.workbookManifestFile, "default-dekel.json");

    const analyzed = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/analyze`, { method: "POST", body: {} });
    assert.equal(analyzed.response.status, 200);
    assert.equal(analyzed.body.review.status, "ready");
    assert.equal(analyzed.body.review.lines.length, project.document.boqRows.length);
    const reviewLine = analyzed.body.review.lines.find((line: any) => line.candidates.length > 0);
    assert.ok(reviewLine);
    assert.equal(reviewLine.selectedCode, reviewLine.included ? reviewLine.candidates[0].code : null);
    assert.equal(reviewLine.quantitySource, "document");
    assert.match(reviewLine.quantitySourceReason, /כתב הכמויות/);
    assert.ok(reviewLine.candidates[0].unitPrice > 0);
    assert.equal(reviewLine.candidates[0].priceIncludesVat, false);
    assert.match(reviewLine.candidates[0].unitCompatibility, /^(exact|compatible|corrected_by_code|unknown)$/);
    if (reviewLine.originalCode && reviewLine.selectedCode === reviewLine.originalCode) {
      assert.equal(reviewLine.selectionMethod, "lexical_exact");
      assert.equal(reviewLine.semanticConfidence, "high");
      assert.ok(!analyzed.body.review.warnings.some((warning: string) => warning.includes(reviewLine.originalCode) && /אומדן מקצועי שמרני/.test(warning)));
    }
    assert.equal(analyzed.body.review.financialAudit.valid, true);
    assert.equal(analyzed.body.review.financialAudit.vatRate, 0.18);
    assert.equal(analyzed.body.review.financialAudit.estimateRows <= 5, true);
    assert.deepEqual(analyzed.body.review.financialAudit.fees.map((fee: any) => fee.rate), [0.074, 0.054, 0.027]);
    if (analyzed.body.review.lines.every((line: any) => line.included && line.selectedCode) && analyzed.body.review.financialAudit.valid) {
      assert.equal(analyzed.body.project.processing.status, "idle");
      assert.equal(analyzed.body.project.processing.readyForExport, false);
      assert.ok(analyzed.body.project.processing.warningCodes.includes("dekel_review_changed"));
    }

    const foreignCandidate = analyzed.body.review.lines.flatMap((line: any) => line.candidates).find((candidate: any) => !reviewLine.candidates.some((item: any) => item.code === candidate.code));
    assert.ok(foreignCandidate);
    const manuallySelected = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/lines/${reviewLine.id}`, {
      method: "PUT", body: { selectedCode: foreignCandidate.code },
    });
    const manualLine = manuallySelected.body.review.lines.find((line: any) => line.id === reviewLine.id);
    assert.equal(manualLine.selectedCode, foreignCandidate.code);
    assert.equal(manualLine.candidates.find((candidate: any) => candidate.code === foreignCandidate.code).score, 1);
    assert.equal(manualLine.candidates.find((candidate: any) => candidate.code === foreignCandidate.code).priceIncludesVat, false);

    const selected = reviewLine.candidates[0];
    const updated = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/lines/${reviewLine.id}`, {
      method: "PUT",
      body: { selectedCode: selected.code, quantity: 2.5, included: true },
    });
    assert.equal(updated.body.review.lines.find((line: any) => line.id === reviewLine.id).quantity, 2.5);
    for (const line of updated.body.review.lines.filter((item: any) => item.id !== reviewLine.id)) {
      await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/lines/${line.id}`, { method: "PUT", body: line.selectedCode ? { selectedCode: line.selectedCode, quantity: line.quantity, included: true } : { included: false } });
    }

    const unapplied = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/apply`, { method: "POST", body: {} });
    assert.equal(unapplied.response.status, 400);

    const applied = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/apply`, { method: "POST", body: { confirm: true } });
    assert.equal(applied.response.status, 200, JSON.stringify(applied.body));
    assert.ok(applied.body.appliedRows >= 1);
    assert.equal(applied.body.review.status, "applied");
    assert.equal(applied.body.review.financialAudit.valid, true);
    assert.equal(applied.body.project.processing.status, "needs_review");
    assert.equal(applied.body.project.processing.readyForExport, false);
    assert.ok(applied.body.project.processing.warningCodes.includes("scope_completeness_review_required"));
    assert.equal(applied.body.review.financialAudit.vat, Math.round(applied.body.review.financialAudit.subtotalNet * 18) / 100);
    assert.equal(applied.body.review.financialAudit.grandTotal, Math.round((applied.body.review.financialAudit.totalWithVat + applied.body.review.financialAudit.feesTotal) * 100) / 100);
    const boqRow = applied.body.project.document.boqRows.find((row: any) => row.id === reviewLine.sourceBoqRowId);
    assert.equal(boqRow.code, selected.code);
    assert.equal(boqRow.unitPrice, selected.unitPrice);
    assert.equal(boqRow.quantity, 2.5);
    const evidence = applied.body.project.document.evidenceNotes.find((note: any) => note.anchorId === boqRow.id && note.kind === "source");
    assert.match(evidence.source.fileName, /\.xlsx$/i);
    assert.match(evidence.source.location, new RegExp(selected.code.replaceAll(".", "\\.")));
    assert.equal(evidence.source.priceIncludesVat, undefined);

    const repeated = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/analyze`, { method: "POST", body: {} });
    assert.equal(repeated.response.status, 200);
    const repeatedNotes = repeated.body.project.document.evidenceNotes.filter((note: any) => note.anchorId === boqRow.id && note.title === "מחיר ושורה ממחירון דקל");
    assert.equal(repeatedNotes.length, 1, "повторная проверка DEKEL должна обновлять сноску, а не дублировать её");
  } finally { await fixture.close(); }
});

test("DEKEL блокирует устаревшую проверку и удаляет явно исключённые строки", async () => {
  const fixture = await startFixture();
  try {
    let project = (await json(fixture.baseUrl, "/local/projects")).body.projects[0];
    let analyzed = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/analyze`, { method: "POST", body: {} });
    const changedDocument = structuredClone(project.document);
    changedDocument.boqRows[0].quantity += 1;
    project = (await json(fixture.baseUrl, `/local/projects/${project.id}`, { method: "PUT", body: { document: changedDocument } })).body.project;
    const stale = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/apply`, { method: "POST", body: { confirm: true } });
    assert.equal(stale.response.status, 409);
    assert.equal(stale.body.code, "stale_dekel_review");

    analyzed = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/analyze`, { method: "POST", body: {} });
    const excluded = analyzed.body.review.lines.at(-1);
    const updated = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/lines/${excluded.id}`, { method: "PUT", body: { included: false } });
    assert.match(updated.body.review.warnings.join("\n"), /תימחק מכתב הכמויות/);
    for (const line of updated.body.review.lines.filter((item: any) => item.id !== excluded.id)) {
      await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/lines/${line.id}`, { method: "PUT", body: line.selectedCode ? { selectedCode: line.selectedCode, quantity: line.quantity, included: true } : { included: false } });
    }
    const applied = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/apply`, { method: "POST", body: { confirm: true } });
    assert.equal(applied.response.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.project.document.boqRows.some((row: any) => row.id === excluded.sourceBoqRowId), false);
    assert.equal(applied.body.project.document.evidenceNotes.some((note: any) => note.anchorId === excluded.sourceBoqRowId), false);
    assert.equal(applied.body.review.financialAudit.valid, true);
  } finally { await fixture.close(); }
});

async function startFixture(
  localConfig: Record<string, number> = {},
  codex: FakeCodex = new FakeCodex(),
  professionalKnowledgeService: ProfessionalKnowledgeGateway = new EmptyKnowledge(),
  audioTranscriptionGateway?: AudioTranscriptionGateway,
) {
  const dataRoot = await mkdtemp(join(tmpdir(), "mashmauet-api-"));
  const app = createApp({ localDataRootPath: dataRoot, codexClient: codex, localConfig, professionalKnowledgeService, audioTranscriptionGateway });
  const server = createServer(app.handleRequest);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Не удалось запустить тестовый сервер");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    dataRoot,
    close: async () => {
      app.close();
      await closeServer(server);
      await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
      assert.equal(codex.closed, true);
    },
  };
}

async function json(baseUrl: string, path: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { response, body: await response.json() as any };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => server.close((error) => error ? rejectPromise(error) : resolvePromise()));
}

class FakeCodex implements CodexGateway {
  closed = false;
  async getAccount() { return { account: { planType: "test" }, requiresOpenaiAuth: false }; }
  async startChatGptLogin() { return { type: "test" }; }
  async startThread() { return "thread-test"; }
  async resumeThread() {}
  async runTurn() {
    await delay(80);
    return JSON.stringify({ answer: "Проверено", proposedChanges: [{ path: "objective", valueJson: JSON.stringify("Цель от Codex"), reason: "Тест" }], proposedProjectRules: [], needsMoreInformation: [] });
  }
  close() { this.closed = true; }
}

class CapturingCodex extends FakeCodex {
  prompts: string[] = [];
  fail = false;
  override async runTurn(_threadId?: string, _projectPath?: string, prompt = "") {
    this.prompts.push(prompt);
    await delay(20);
    if (this.fail) throw new Error("test failure");
    return JSON.stringify({ answer: "Изолированный ответ", proposedChanges: [], proposedProjectRules: [], needsMoreInformation: [] });
  }
}

class ProjectBuildingCodex extends FakeCodex {
  prompts: string[] = [];
  override async runTurn(_threadId?: string, _projectPath?: string, prompt = "") {
    this.prompts.push(prompt);
    await delay(10);
    if (/точное профессиональное чтение одного материала/.test(prompt)) {
      return JSON.stringify({ answer: "מקור: требования.txt. נדרשת עבודת ניקיון יסודי לאחר שיפוץ בשטח 10 מ״ר.", proposedChanges: [], proposedProjectRules: [], needsMoreInformation: [] });
    }
    if (prompt.includes("SCOPE_INVENTORY_BEFORE_BOQ")) {
      return JSON.stringify({ answer: "זוהתה עבודת ניקיון נדרשת.", proposedChanges: [{ path: "scopeInventory", valueJson: JSON.stringify([{ id: "cleaning-primary", packageId: "cleaning", packageTitle: "ניקיון", stage: "primary_work", title: "ניקיון יסודי לאחר שיפוץ", reason: "העבודה נדרשה בחומר", dekelQuerySeeds: ["ניקיון יסודי לאחר שיפוץ", "ניקיון לפני מסירה"] }]), reason: "מלאי עבודות עצמאי" }], proposedProjectRules: [], needsMoreInformation: [] });
    }
    if (prompt.includes("SCOPE_INVENTORY_INDEPENDENT_CRITIC")) {
      return JSON.stringify({ answer: "המלאי נבדק מחדש מול החומר.", proposedChanges: [{ path: "scopeInventoryCritique", valueJson: JSON.stringify({ accepted: true, missingOperations: [], reasons: [] }), reason: "ביקורת עצמאית" }], proposedProjectRules: [], needsMoreInformation: [] });
    }
    if (prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) {
      const row = { id: "boq-final-cleaning", code: "", description: "נקיון יסודי חד פעמי של מבנים לאחר שיפוץ ולפני איכלוס", unit: "מ״ר", quantity: 10, unitPrice: 0, category: "עבודות משלימות" };
      return JSON.stringify({ answer: "היקף העבודה נסגר מול כתב הכמויות.", proposedChanges: [
        { path: "boqRows", valueJson: JSON.stringify([row]), reason: "סגירת היקף" },
        { path: "scopeResolutions", valueJson: JSON.stringify([{ operationId: "cleaning-primary", disposition: "separate_boq_row", boqRowIds: [row.id], reason: "העבודה משולמת בשורה נפרדת" }]), reason: "מיפוי היקף" },
      ], proposedProjectRules: [], needsMoreInformation: [] });
    }
    const sourceFileName = /объяснение\.mp4/.test(prompt) ? "объяснение.mp4" : "требования.txt";
    const sourceExcerpt = sourceFileName === "объяснение.mp4" ? "יש לבצע ניקיון יסודי לאחר השיפוץ" : "финальную уборку";
    const rowId = "boq-final-cleaning";
    const values: Record<string, unknown> = {
      subject: "מסמך משמעויות לפרויקט אובייקט",
      background: "נדרשת עבודת ניקיון לאחר שיפוץ בהתאם לחומר שהועלה.",
      objective: "השלמת ניקיון ומסירת השטח.",
      scope: ["ניקיון יסודי לאחר שיפוץ."],
      estimateNotes: ["המחירים ייקבעו לפי מחירון DEKEL הגלובלי."],
      scheduleRows: [{ id: "schedule-generated", phase: "ביצוע", duration: "יום", dependency: "לאחר סיום עבודות השיפוץ", notes: "תיאום עם מנהל הפרויקט" }],
      scheduleNotes: "משך הביצוע מבוסס על הכמות שנמדדה.",
      riskRows: [{ id: "risk-generated", risk: "עבודות שיפוץ שטרם הסתיימו", impact: "עיכוב במסירה", mitigation: "תיאום לפני תחילת ניקיון" }],
      additionalNotes: "הכמות תיבדק לפני ביצוע.",
      boqRows: [{ id: rowId, code: "95.69.04.0003", description: "נקיון יסודי חד פעמי של מבנים הכוללים שטחים ציבוריים לאחר שיפוץ ולפני איכלוס. שטחים ציבוריים כוללים: חצרות, חדרי מדרגות, חניונים, חדרי שרות, חלונות פנים וחוץ - קומפלט לרבות פנים המשרדים. (השטחים הציבוריים נכללים אך לא נמדדים)", unit: "מטר", quantity: 10, unitPrice: 0, category: "עבודות משלימות" }],
      evidenceNotes: [{ id: "evidence-final-cleaning", anchorType: "boqRow", anchorId: rowId, kind: "source", quantityBasis: "documented", title: "דרישת ניקיון", explanation: "העבודה נדרשה בחומר הפרויקט.", reason: "נכתב במפורש בקובץ שהעלה הבעלים.", confidence: "high", source: { fileName: sourceFileName, location: "טקסט מלא", excerpt: sourceExcerpt } }],
    };
    return JSON.stringify({
      answer: "המסמך נבנה מחומר הפרויקט.",
      proposedChanges: Object.entries(values).map(([path, value]) => ({ path, valueJson: JSON.stringify(value), reason: "בניית מסמך מלאה" })),
      proposedProjectRules: [],
      needsMoreInformation: [],
    });
  }
}

class BlockingProjectBuildingCodex extends ProjectBuildingCodex {
  private blocked = false;
  private releaseBlocked?: () => void;
  private markEntered!: () => void;
  private readonly entered = new Promise<void>((resolvePromise) => { this.markEntered = resolvePromise; });
  private readonly gate = new Promise<void>((resolvePromise) => { this.releaseBlocked = resolvePromise; });
  async waitUntilBlocked() { await this.entered; }
  release() { this.releaseBlocked?.(); }
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (!this.blocked && /точное профессиональное чтение одного материала/.test(prompt)) {
      this.blocked = true;
      this.markEntered();
      await this.gate;
    }
    return await super.runTurn(threadId, projectPath, prompt);
  }
}

class RejectingScopeCriticCodex extends ProjectBuildingCodex {
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (prompt.includes("SCOPE_INVENTORY_INDEPENDENT_CRITIC")) {
      return JSON.stringify({ answer: "הביקורת לא אישרה את המלאי.", proposedChanges: [{ path: "scopeInventoryCritique", valueJson: JSON.stringify({ accepted: false, missingOperations: [], reasons: ["נדרשת בדיקה נוספת"] }), reason: "ביקורת עצמאית" }], proposedProjectRules: [], needsMoreInformation: [] });
    }
    return await super.runTurn(threadId, projectPath, prompt);
  }
}

class ProgressiveScopeCriticCodex extends ProjectBuildingCodex {
  criticCalls = 0;
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (prompt.includes("SCOPE_INVENTORY_INDEPENDENT_CRITIC")) {
      this.criticCalls += 1;
      const missingOperations = this.criticCalls === 1
        ? [{ id: "cleaning-preparation", packageId: "cleaning", packageTitle: "ניקיון", stage: "preparation", title: "הכנת השטח לניקיון", reason: "נדרשת הכנה לפני העבודה", dekelQuerySeeds: ["הכנת שטח לניקיון"] }]
        : this.criticCalls === 2
          ? [{ id: "cleaning-handover", packageId: "cleaning", packageTitle: "ניקיון", stage: "testing_handover", title: "בדיקת ניקיון ומסירה", reason: "נדרשת בדיקת התוצאה לפני מסירה", dekelQuerySeeds: ["בדיקת ניקיון לפני מסירה"] }]
          : [];
      return JSON.stringify({
        answer: "המלאי נבדק בשכבה נוספת.",
        proposedChanges: [{ path: "scopeInventoryCritique", valueJson: JSON.stringify({ accepted: missingOperations.length === 0, missingOperations, reasons: [] }), reason: "ביקורת עצמאית" }],
        proposedProjectRules: [],
        needsMoreInformation: [],
      });
    }
    return await super.runTurn(threadId, projectPath, prompt);
  }
}

class UnmatchedProjectBuildingCodex extends ProjectBuildingCodex {
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    const raw = await super.runTurn(threadId, projectPath, prompt);
    if (/точное профессиональное чтение одного материала/.test(prompt) || prompt.includes("SCOPE_INVENTORY_BEFORE_BOQ") || prompt.includes("SCOPE_INVENTORY_INDEPENDENT_CRITIC") || prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) return raw;
    const parsed = JSON.parse(raw);
    const boq = parsed.proposedChanges.find((change: any) => change.path === "boqRows");
    boq.valueJson = JSON.stringify([{ id: "boq-unmatched", code: "", description: "ZZZ_NONMATCH_987 עבודת חלל מיוחדת", unit: "парсек", quantity: 3, unitPrice: 0, category: "עבודות מיוחדות" }]);
    const notes = parsed.proposedChanges.find((change: any) => change.path === "evidenceNotes");
    notes.valueJson = JSON.stringify([{ id: "evidence-unmatched", anchorType: "boqRow", anchorId: "boq-unmatched", kind: "source", quantityBasis: "documented", title: "דרישה מפורשת", explanation: "העבודה מופיעה בחומר.", reason: "הקובץ דורש אותה.", confidence: "high", source: { fileName: "требования.txt", location: "טקסט מלא", excerpt: "ZZZ_NONMATCH_987" } }]);
    return JSON.stringify(parsed);
  }
}

class InvalidEvidenceProjectBuildingCodex extends ProjectBuildingCodex {
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    const raw = await super.runTurn(threadId, projectPath, prompt);
    if (/точное профессиональное чтение одного материала/.test(prompt) || prompt.includes("SCOPE_INVENTORY_BEFORE_BOQ") || prompt.includes("SCOPE_INVENTORY_INDEPENDENT_CRITIC") || prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) return raw;
    const parsed = JSON.parse(raw);
    const notes = parsed.proposedChanges.find((change: any) => change.path === "evidenceNotes");
    const value = JSON.parse(notes.valueJson);
    value[0].source = { fileName: "несуществующий-файл.txt", location: "страница 99", excerpt: "вымышленный фрагмент" };
    notes.valueJson = JSON.stringify(value);
    return JSON.stringify(parsed);
  }
}

class SemanticDekelProjectBuildingCodex extends ProjectBuildingCodex {
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (prompt.includes("DEKEL_CANDIDATE_SELECTION")) {
      this.prompts.push(prompt);
      const lineId = prompt.match(/"sourceBoqRowId"\s*:\s*"([^"]+)"/)?.[1] ?? "boq-final-cleaning";
      assert.match(prompt, /95\.69\.04\.0003/);
      return JSON.stringify({
        answer: "נבחר סעיף מדויק ממחירון דקל.",
        proposedChanges: [{
          path: "dekelSelections",
          valueJson: JSON.stringify([{ sourceBoqRowId: lineId, selectedCode: "95.69.04.0003", confidence: "high", reason: "הסעיף מתאר ניקיון יסודי לאחר שיפוץ ונמדד במ״ר." }]),
          reason: "בחירה סמנטית מוגבלת למועמדי DEKEL",
        }],
        proposedProjectRules: [], needsMoreInformation: [],
      });
    }
    const raw = await super.runTurn(threadId, projectPath, prompt);
    if (/точное профессиональное чтение одного материала/.test(prompt) || /СФОРМИРУЙ ТОЛЬКО evidenceNotes/.test(prompt) || prompt.includes("SCOPE_INVENTORY_BEFORE_BOQ") || prompt.includes("SCOPE_INVENTORY_INDEPENDENT_CRITIC") || prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) return raw;
    const parsed = JSON.parse(raw);
    const boq = parsed.proposedChanges.find((change: any) => change.path === "boqRows");
    boq.valueJson = JSON.stringify([{ id: "boq-final-cleaning", code: "", description: "ניקוי סופי של אולם לאחר שיפוץ והכנתו למסירה", unit: "מ״ר", quantity: 10, unitPrice: 0, category: "ניקוי ומסירה" }]);
    return JSON.stringify(parsed);
  }
}

class BatchedEvidenceProjectBuildingCodex extends ProjectBuildingCodex {
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (/СФОРМИРУЙ ТОЛЬКО evidenceNotes/.test(prompt)) {
      this.prompts.push(prompt);
      const ids = [...new Set(prompt.match(/batch-boq-\d+/g) ?? [])];
      const returnedIds = ids.includes("batch-boq-23") ? ids.filter((id) => id !== "batch-boq-23") : ids;
      return JSON.stringify({
        answer: "נבנו הערות ראיה עבור האצווה.",
        proposedChanges: [{
          path: "evidenceNotes",
          valueJson: JSON.stringify(returnedIds.map((id) => ({
            id: `evidence-${id}`,
            anchorType: "boqRow",
            anchorId: id,
            kind: "inference",
            quantityBasis: "inferred",
            title: "כמות תכנון",
            explanation: "הכמות נועדה לשמור על שלמות כתב הכמויות.",
            reason: "אין מדידה מפורשת בחומר הבדיקה.",
            confidence: "medium",
          }))),
          reason: "ראיות לפי אצווה",
        }],
        proposedProjectRules: [], needsMoreInformation: [],
      });
    }
    if (prompt.includes("DEKEL_CANDIDATE_SELECTION")) {
      this.prompts.push(prompt);
      return JSON.stringify({ answer: "אין התאמה אוטומטית.", proposedChanges: [{ path: "dekelSelections", valueJson: "[]", reason: "נדרשת בדיקה" }], proposedProjectRules: [], needsMoreInformation: [] });
    }
    const raw = await super.runTurn(threadId, projectPath, prompt);
    if (/точное профессиональное чтение одного материала/.test(prompt) || prompt.includes("SCOPE_INVENTORY_BEFORE_BOQ") || prompt.includes("SCOPE_INVENTORY_INDEPENDENT_CRITIC") || prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) return raw;
    const parsed = JSON.parse(raw);
    const boq = parsed.proposedChanges.find((change: any) => change.path === "boqRows");
    boq.valueJson = JSON.stringify(Array.from({ length: 23 }, (_, index) => ({
      id: `batch-boq-${index + 1}`,
      code: "",
      description: `עבודה מיוחדת נפרדת מספר ${index + 1}`,
      unit: "יח׳",
      quantity: index + 1,
      unitPrice: 0,
      category: "עבודות מיוחדות",
    })));
    return JSON.stringify(parsed);
  }
}

async function waitForProcessing(baseUrl: string, projectId: string) {
  let current: any;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    current = (await json(baseUrl, `/local/projects/${projectId}`)).body.project;
    if (["ready", "failed", "needs_review", "stale"].includes(current.processing.status)) return current;
    await delay(25);
  }
  return current;
}

class ScriptedAudioTranscription implements AudioTranscriptionGateway {
  transcriptionCalls = 0;
  async validateCache() { return { valid: true } as const; }
  async probe(): Promise<MediaProbeResult> { return { status: "unavailable", stage: "probe", reasonCode: "ffprobe_unavailable", message: "not used" }; }
  async transcribe(): Promise<AudioTranscriptionResult> {
    this.transcriptionCalls += 1;
    return {
      status: "completed",
      probe: {
        durationSeconds: 10,
        container: "mp4",
        streamCount: 2,
        audio: { codec: "aac", sampleRate: 48_000, channels: 1 },
        video: { codec: "h264", width: 478, height: 850 },
        provenance: { sourceSha256: "a".repeat(64), generatedAt: new Date().toISOString(), ffprobeVersion: "test" },
      },
      transcript: {
        language: "he",
        text: "יש לבצע ניקיון יסודי לאחר השיפוץ",
        speechDetected: true,
        segments: [{ startSeconds: 2, endSeconds: 7, text: "יש לבצע ניקיון יסודי לאחר השיפוץ" }],
        generatedAt: new Date().toISOString(),
      },
      provenance: {
        sourceSha256: "a".repeat(64), generatedAt: new Date().toISOString(), ffprobeVersion: "test",
        engine: "whisper.cpp", engineVersion: "test", ffmpegVersion: "test", modelName: "test.bin", modelSha256: "b".repeat(64),
      },
    };
  }
}

class EmptyKnowledge implements ProfessionalKnowledgeGateway {
  async search(): Promise<ProfessionalKnowledgeContext> { return { used: false, policy: "reference_only", results: [], alerts: [] }; }
}

class ReferenceKnowledge implements ProfessionalKnowledgeGateway {
  async search(): Promise<ProfessionalKnowledgeContext> {
    return {
      used: true,
      policy: "reference_only",
      alerts: [],
      results: [{
        sourceId: "REF-3210-TEST",
        sourceKind: "contract_3210",
        fileName: "חוזה מדף 3210 2019.pdf",
        chapterCode: null,
        isCorrection: false,
        page: 8,
        excerpt: "סתירות במסמכים ועדיפות בין מסמכים",
        score: 10,
        intents: ["contract"],
      }],
    };
  }
}
