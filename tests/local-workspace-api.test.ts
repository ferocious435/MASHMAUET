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
import { sha256Text } from "../src/modules/local-workspace/processing-checkpoint.ts";

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
    const firstDekelSelection = codex.prompts.findIndex((prompt) => prompt.includes("DEKEL_CANDIDATE_SELECTION"));
    const firstScopeClosure = codex.prompts.findIndex((prompt) => prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE"));
    assert.ok(firstDekelSelection >= 0 && firstDekelSelection < firstScopeClosure,
      "предметная строка DEKEL должна быть выбрана до решения, какие операции входят в её цену");
    const scopePrompt = codex.prompts[firstScopeClosure];
    assert.match(scopePrompt, /Текущий документ JSON:/);
    assert.doesNotMatch(scopePrompt, /ТЕКУЩИЕ СТРОКИ BOQ:\s*\[/,
      "полный массив строк уже есть в document JSON и не должен оплачиваться повторно в том же запросе");

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

test("повторный полный запуск продолжает с последнего сохранённого AI-этапа", async () => {
  const codex = new FailOnceAtScopeClosureCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST",
      body: { name: "Возобновляемый расчёт", description: "Финальная уборка помещения после ремонта" },
    })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") },
      body: "Выполнить финальную уборку десяти квадратных метров после ремонта.",
    });

    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const failed = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(failed.processing.status, "failed");
    assert.equal(codex.scopeBaseCalls, 1);
    assert.equal(codex.scopeCriticCalls, 2);
    assert.equal(codex.documentSynthesisCalls, 1);
    assert.equal(codex.scopeClosureCalls, 1);
    const checkpointPath = join(fixture.dataRoot, "projects", project.id, "processing-checkpoint.json");
    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    assert.ok(Object.keys(checkpoint.entries).length >= 4);

    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const completed = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(completed.processing.status, "ready", JSON.stringify(completed.processing));
    assert.equal(codex.scopeBaseCalls, 1, "успешный scope base не должен вызываться повторно");
    assert.equal(codex.scopeCriticCalls, 2, "успешные критики не должны вызываться повторно");
    assert.equal(codex.documentSynthesisCalls, 1, "готовый черновик не должен синтезироваться повторно");
    assert.equal(codex.scopeClosureCalls, 2, "повторяется только не завершившийся этап");
    await assert.rejects(readFile(checkpointPath, "utf8"), /ENOENT/);
  } finally { await fixture.close(); }
});

test("неполный scope-ответ автоматически исправляется одним точечным repair без нового запуска", async () => {
  const codex = new IncompleteOnceAtScopeClosureCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST",
      body: { name: "Автоматическое исправление scope", description: "Финальная уборка после ремонта" },
    })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") },
      body: "Выполнить финальную уборку десяти квадратных метров после ремонта.",
    });

    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const completed = await waitForProcessing(fixture.baseUrl, project.id);

    assert.equal(completed.processing.status, "ready", JSON.stringify(completed.processing));
    assert.equal(codex.scopeClosureCalls, 2, "должны быть только исходный ответ и один repair");
    assert.equal(codex.scopeRepairCalls, 1);
  } finally { await fixture.close(); }
});

test("повторно неполный пакет сужается до отсутствующих операций и завершается без полного перезапуска", async () => {
  const codex = new TwiceIncompleteThenTargetedScopeClosureCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST",
      body: { name: "Точечное восстановление scope", description: "Финальная уборка после ремонта" },
    })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") },
      body: "Выполнить финальную уборку десяти квадратных метров после ремонта.",
    });

    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const completed = await waitForProcessing(fixture.baseUrl, project.id);

    assert.equal(completed.processing.status, "ready", JSON.stringify(completed.processing));
    assert.equal(codex.scopeClosureCalls, 3, "ожидаются исходный ответ, полный repair и узкий targeted repair");
    assert.equal(codex.targetedRepairCalls, 1);
  } finally { await fixture.close(); }
});

test("частичный scope-repair проверяет только недостающую операцию и сохраняет принятую соседнюю", async () => {
  const codex = new PartialScopeClosureCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST", body: { name: "Частичное закрытие", description: "Защита пола и уборка после ремонта" },
    })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") },
      body: "Защитить десять квадратных метров пола перед ремонтом и выполнить финальную уборку десяти квадратных метров.",
    });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const completed = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(codex.scopeClosureCalls, 3, "исходный ответ, полный repair, затем один ответ только по отсутствующей операции");
    assert.equal(completed.processing.stage, "complete", JSON.stringify(completed.processing));
    assert.deepEqual(completed.scopeCompleteness.resolutions.map((item: any) => item.operationId).sort(), ["cleaning-primary", "floor-protection"]);
    assert.ok(completed.document.boqRows.some((row: any) => row.id === "boq-final-cleaning" && row.quantity === 10));
  } finally { await fixture.close(); }
});

test("предварительная строка DEKEL не связывает разные помещения с одним оплачиваемым объёмом", async () => {
  const codex = new SeparateRoomsScopeCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST", body: { name: "Два отдельных помещения", description: "Уборка комнаты А 10 м² и комнаты Б 15 м²" },
    })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") },
      body: "Выполнить финальную уборку комнаты А площадью 10 м² и отдельно комнаты Б площадью 15 м².",
    });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const completed = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(codex.scopeClosureCalls, 1, "правильный отказ назначить чужую seed-строку не должен запускать repair");
    assert.equal(completed.processing.stage, "complete", JSON.stringify(completed.processing));
    const roomA = completed.document.boqRows.find((row: any) => row.id === "boq-final-cleaning");
    const roomB = completed.document.boqRows.find((row: any) => row.id === "boq-room-b-cleaning");
    assert.equal(roomA.quantity, 10);
    assert.equal(roomB.quantity, 15);
    assert.equal(roomA.code, "95.69.04.0003");
    assert.equal(roomB.code, roomA.code, "одна расценка применима к двум отдельным физическим объёмам");
    assert.deepEqual(completed.scopeCompleteness.resolutions.map((item: any) => [item.operationId, item.boqRowIds]).sort(),
      [["cleaning-primary", [roomA.id]], ["room-b-cleaning", [roomB.id]]]);
  } finally { await fixture.close(); }
});

for (const checkpointMode of ["valid", "invalid-result", "legacy-turns"] as const) {
test(`исправленный scope-пакет восстанавливается целиком после сбоя следующего пакета (${checkpointMode})`, async () => {
  const codex = new FailAfterRepairedScopePackageCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST", body: { name: "Сохранение исправленного пакета", description: "Защита пола и уборка помещений" },
    })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") },
      body: "Защитить пол и выполнить финальную уборку основного помещения и семи отдельных помещений по десять квадратных метров.",
    });
    const run = () => json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    await run();
    assert.equal((await waitForProcessing(fixture.baseUrl, project.id)).processing.status, "failed");
    assert.equal(codex.scopeClosureCalls, 3, "первый пакет завершён исходным ответом, repair и частичным repair");
    const checkpointPath = join(fixture.dataRoot, "projects", project.id, "processing-checkpoint.json");
    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    const resultKey = Object.keys(checkpoint.entries).find((key) => checkpoint.entries[key].stage === "dekel-scope-package-batch-1-of-2-result");
    assert.ok(resultKey, "целостный принятый пакет должен иметь собственную сохранённую точку");
    if (checkpointMode === "invalid-result") {
      const entry = checkpoint.entries[resultKey];
      const parsed = JSON.parse(entry.responseText);
      parsed.proposedChanges.find((change: any) => change.path === "scopeResolutions").valueJson = "[]";
      entry.responseText = JSON.stringify(parsed);
      entry.responseSha256 = sha256Text(entry.responseText);
    } else if (checkpointMode === "legacy-turns") {
      delete checkpoint.entries[resultKey];
    }
    if (checkpointMode !== "valid") await writeFile(checkpointPath, JSON.stringify(checkpoint));
    await run();
    const completed = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(codex.scopeClosureCalls, checkpointMode === "valid" ? 3 : 5,
      "валидный результат восстанавливается без AI; отклонённый или старый восстанавливается с переиспользованием уже сохранённой частичной починки");
    assert.equal(codex.laterPackageCalls, 2, "повторяется только незавершённый следующий пакет");
    assert.equal(completed.processing.stage, "complete", JSON.stringify(completed.processing));
    assert.deepEqual(completed.scopeCompleteness.resolutions.map((item: any) => item.operationId).sort(),
      ["cleaning-primary", "floor-protection", ...Array.from({ length: 7 }, (_, i) => `annex-cleaning-${i}`)].sort());
    assert.ok(completed.document.boqRows.some((row: any) => row.id === "boq-final-cleaning" && row.quantity === 10));
  } finally { await fixture.close(); }
});
}

test("узкий scope-repair один раз повторяется при отсутствии обязательного JSON-блока", async () => {
  const codex = new MalformedFirstTargetedScopeClosureCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST",
      body: { name: "Повтор узкого repair", description: "Финальная уборка после ремонта" },
    })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") },
      body: "Выполнить финальную уборку десяти квадратных метров после ремонта.",
    });

    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const completed = await waitForProcessing(fixture.baseUrl, project.id);

    assert.equal(completed.processing.status, "ready", JSON.stringify(completed.processing));
    assert.equal(codex.scopeClosureCalls, 4);
    assert.equal(codex.targetedRepairCalls, 2);
  } finally { await fixture.close(); }
});

test("повторно неполный scope-пакет восстанавливается анализом отдельной операции с количеством из материала", async () => {
  const codex = new PerOperationScopeRecoveryCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST",
      body: { name: "Адресное восстановление scope", description: "Финальная уборка после ремонта" },
    })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") },
      body: "Выполнить финальную уборку 37.5 м² после ремонта в основном помещении, а не только прежних 10 м².",
    });

    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    await codex.waitForEvidence();
    const checkpoint = JSON.parse(await readFile(join(fixture.dataRoot, "projects", project.id, "processing-checkpoint.json"), "utf8"));
    assert.ok(Object.values(checkpoint.entries).some((entry: any) => entry.stage.includes("operation-recovery")),
      "проверенный одиночный ответ сохраняется для возобновления");
    codex.releaseEvidence();
    const completed = await waitForProcessing(fixture.baseUrl, project.id);

    assert.equal(completed.processing.stage, "complete", JSON.stringify(completed.processing));
    assert.notEqual(completed.processing.status, "failed", JSON.stringify(completed.processing));
    assert.ok(codex.scopeClosureCalls >= 6, "должны быть исчерпаны обычные и точечные repair до одиночного анализа");
    const inventoryIds = completed.scopeCompleteness.inventory.map((operation: any) => operation.id).sort();
    const resolutionIds = completed.scopeCompleteness.resolutions.map((resolution: any) => resolution.operationId).sort();
    assert.deepEqual(resolutionIds, inventoryIds);
    assert.equal(new Set(resolutionIds).size, resolutionIds.length);
    const boqRows = completed.document.boqRows;
    assert.equal(new Set(boqRows.map((row: any) => row.id)).size, boqRows.length);
    assert.ok(boqRows.every((row: any) => row.code && Number(row.unitPrice) > 0));
    assert.equal(boqRows.find((row: any) => row.id === "boq-final-cleaning")?.quantity, 37.5,
      "сохранённое количество определяется повторным анализом источника, а не старой похожей строкой или единицей");
    assert.equal(codex.singleOperationCalls, 1);
    const operationPrompt = codex.prompts.find((prompt) => prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE_OPERATION_RECOVERY"));
    assert.ok(operationPrompt?.includes("37.5 м²"), "одиночный анализ получает материалы проекта");
  } finally { codex.releaseEvidence(); await fixture.close(); }
});

test("негодный одиночный scope-ответ не заменяется выдуманным покрытием и не сохраняется как готовый", async () => {
  const codex = new PerOperationScopeRecoveryCodex(true);
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST", body: { name: "Неполный одиночный ответ", description: "Финальная уборка после ремонта" },
    })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") },
      body: "Выполнить финальную уборку 37.5 м² после ремонта.",
    });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const completed = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(completed.processing.status, "failed", JSON.stringify(completed.processing));
    assert.equal(codex.singleOperationCalls, 1);
    assert.deepEqual(completed.document, project.document, "негодный анализ не перезаписывает документ");
    const checkpoint = JSON.parse(await readFile(join(fixture.dataRoot, "projects", project.id, "processing-checkpoint.json"), "utf8"));
    assert.equal(Object.values(checkpoint.entries).some((entry: any) => entry.stage.includes("operation-recovery")), false);
  } finally { await fixture.close(); }
});

test("сбой второго критика повторяет только незавершённого критика", async () => {
  const codex = new FailOnceAtSecondCriticCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Сбой критика", description: "Финальная уборка после ремонта" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Выполнить финальную уборку после ремонта.",
    });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    assert.equal((await waitForProcessing(fixture.baseUrl, project.id)).processing.status, "failed");
    assert.equal(codex.scopeBaseCalls, 1);
    assert.equal(codex.scopeCriticCalls, 2);

    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const completed = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(completed.processing.status, "ready", JSON.stringify(completed.processing));
    assert.equal(codex.scopeBaseCalls, 1);
    assert.equal(codex.scopeCriticCalls, 3, "повторён только критик, не вернувший сохранённый ответ");
  } finally { await fixture.close(); }
});

test("изменение исправленного текста материала инвалидирует сохранённые AI-этапы", async () => {
  const codex = new FailOnceAtScopeClosureCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Инвалидация", description: "Финальная уборка" } })).body.project;
    const uploaded = await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Выполнить финальную уборку после ремонта.",
    });
    const materialId = ((await uploaded.json()) as { material: { id: string } }).material.id;
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    assert.equal((await waitForProcessing(fixture.baseUrl, project.id)).processing.status, "failed");
    await json(fixture.baseUrl, `/local/projects/${project.id}/materials/${materialId}/content`, { method: "PUT", body: { text: "Исправлено владельцем: выполнить финальную уборку 10 м² после ремонта." } });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const completed = await waitForProcessing(fixture.baseUrl, project.id);
    assert.equal(completed.processing.status, "ready", JSON.stringify(completed.processing));
    assert.equal(codex.scopeBaseCalls, 2, "изменённый источник не должен читать старую контрольную точку");
    assert.equal(codex.scopeCriticCalls, 4);
    assert.equal(codex.documentSynthesisCalls, 2);
  } finally { await fixture.close(); }
});

test("полная обработка передаёт визуальные материалы в оценку состояния и построение документа", async () => {
  const codex = new VisionCapturingProjectBuildingCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", {
      method: "POST",
      body: { name: "Визуальная проверка", description: "Общий ремонт существующего помещения" },
    })).body.project;
    const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const upload = await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, {
      method: "POST",
      headers: { "Content-Type": "image/png", "X-File-Name": encodeURIComponent("состояние.png") },
      body: tinyPng,
    });
    assert.equal(upload.status, 201);

    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);
    assert.notEqual(current.processing.status, "failed", JSON.stringify(current.processing));

    for (const marker of ["SCOPE_INVENTORY_BEFORE_BOQ", "SCOPE_INVENTORY_INDEPENDENT_CRITIC", "ПОСТРОЙ ПОЛНЫЙ РАБОЧИЙ ДОКУМЕНТ"]) {
      const calls = codex.calls.filter((call) => call.prompt.includes(marker));
      assert.ok(calls.length > 0, `ожидался проход ${marker}`);
      assert.ok(calls.some((call) => call.images.some((imagePath) => imagePath.endsWith("состояние.png"))), `${marker} должен видеть исходное изображение`);
    }
    const dekelCalls = codex.calls.filter((call) => call.prompt.includes("DEKEL_CANDIDATE_SELECTION"));
    assert.ok(dekelCalls.every((call) => call.images.length === 0), "ценовой подбор не должен повторно загружать визуальные материалы");
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

test("полная обработка сводит замечания критиков к самостоятельным DEKEL-операциям и включённым деталям", async () => {
  const codex = new MaterialityAdjudicatingScopeCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Проверка материальности", description: "Критики отделяют оплачиваемые результаты от способов выполнения" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, { method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Требуется финальная уборка после ремонта." });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);
    assert.notEqual(current.processing.error?.code, "scope_inventory_unverified");
    assert.equal(current.processing.status, "needs_review");
    assert.ok(current.scopeCompleteness.inventory.some((operation: any) => operation.id === "waste-removal"));
    const checkpoint = JSON.parse(await readFile(join(fixture.dataRoot, "projects", project.id, "processing-checkpoint.json"), "utf8"));
    assert.ok(Object.values(checkpoint.entries).some((entry: any) => entry.stage === "document-synthesis"),
      "результат с незакрытыми замечаниями должен сохранять завершённые AI-этапы для дальнейшего исправления");
    assert.ok(!current.scopeCompleteness.inventory.some((operation: any) => operation.id === "cleaning-curing-detail"));
    const cleaning = current.scopeCompleteness.inventory.find((operation: any) => operation.id === "cleaning-primary");
    assert.deepEqual(cleaning.includedRequirements, ["המתנה לייבוש חומרי הניקוי לפני בדיקת המסירה"]);
  } finally { await fixture.close(); }
});

test("неполный ответ арбитра полноты исправляется повторным полным ответом без потери пробелов", async () => {
  const codex = new RepairingMaterialityAdjudicatorCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Повтор арбитра", description: "Ни один пробел не должен потеряться" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, { method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Требуется финальная уборка после ремонта." });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);

    assert.notEqual(current.processing.error?.code, "scope_inventory_unverified");
    assert.equal(codex.adjudicatorCalls, 2);
    assert.ok(current.scopeCompleteness.inventory.some((operation: any) => operation.id === "waste-removal"));
    const cleaning = current.scopeCompleteness.inventory.find((operation: any) => operation.id === "cleaning-primary");
    assert.deepEqual(cleaning.includedRequirements, ["המתנה לייבוש חומרי הניקוי לפני בדיקת המסירה"]);
  } finally { await fixture.close(); }
});

test("два неполных ответа арбитра сохраняют все пробелы для консервативного полного поиска DEKEL", async () => {
  const codex = new PersistentlyIncompleteMaterialityAdjudicatorCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Консервативный арбитр", description: "Ни один пробел не должен потеряться" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, { method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Требуется финальная уборка после ремонта." });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);

    assert.notEqual(current.processing.error?.code, "scope_inventory_unverified");
    assert.equal(codex.adjudicatorCalls, 2);
    assert.ok(current.scopeCompleteness.inventory.some((operation: any) => operation.id === "waste-removal"));
    assert.ok(current.scopeCompleteness.inventory.some((operation: any) => operation.id === "cleaning-curing-detail"));
  } finally { await fixture.close(); }
});

test("полная обработка заменяет ошибочный класс вмешательства до поиска DEKEL", async () => {
  const codex = new InterventionAdjudicatingScopeCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Проверка вмешательства", description: "Общий ремонт существующих элементов в плохом состоянии" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, { method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("состояние.txt") }, body: "Существующий элемент в плохом состоянии и не соответствует результату общего ремонта." });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);

    assert.notEqual(current.processing.error?.code, "scope_inventory_unverified");
    const stored = JSON.parse(await readFile(join(fixture.dataRoot, "projects", project.id, "project.json"), "utf8"));
    assert.equal(stored.scopeCompleteness.inventory.some((operation: any) => operation.id === "existing-item-repair"), false);
    assert.equal(stored.scopeCompleteness.inventory.some((operation: any) => operation.id === "existing-item-replacement"), true);
    assert.equal(stored.scopeCompleteness.inventory.some((operation: any) => operation.id === "existing-item-finish"), true);
    assert.equal(stored.document.boqRows.some((row: any) => /תיקון|חיזוק/u.test(String(row.description))), false);
    assert.equal(stored.document.boqRows.some((row: any) => row.id === "boq-existing-item-replacement"), true);
    const inventoryPrompts = codex.prompts.filter((prompt) => prompt.includes("SCOPE_INVENTORY"));
    assert.ok(inventoryPrompts.some((prompt) => prompt.includes("ЕДИНОЕ ПРАВИЛО ВЫБОРА ВМЕШАТЕЛЬСТВА")));
    assert.ok(inventoryPrompts.some((prompt) => prompt.includes("supersededOperations")));
  } finally { await fixture.close(); }
});

test("временный сбой необязательной AI-партии сохраняет документ для проверки вместо потери запуска", async () => {
  const fixture = await startFixture({}, new TransientOptionalBatchFailureCodex());
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Сетевой сбой", description: "Проверка сохранения результата после обязательного анализа" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, { method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Выполнить финальную уборку десяти квадратных метров после ремонта." });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);

    assert.equal(current.processing.status, "needs_review", JSON.stringify(current.processing));
    assert.equal(current.processing.stage, "complete");
    assert.equal(current.processing.progressPercent, 100);
    assert.ok(current.processing.warningCodes.includes("evidence_assumption_fallback"));
    assert.ok(current.document.boqRows.length > 0);
    assert.ok(current.document.evidenceNotes.some((note: any) => note.kind === "inference" && note.confidence === "low"));
    const anchoredRows = new Set(current.document.evidenceNotes.map((note: any) => note.anchorId));
    assert.ok(current.document.boqRows.every((row: any) => anchoredRows.has(row.id)));
  } finally { await fixture.close(); }
});

test("неподобранная работа разлагается один раз, затем повторно ищется по DEKEL без рекурсивного дробления", async () => {
  const codex = new SingleDecompositionPassCodex();
  const fixture = await startFixture({}, codex);
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Контроль дробления", description: "Одна измеримая работа" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, { method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Выполнить финальную уборку десяти квадратных метров после ремонта." });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);
    assert.notEqual(current.processing.status, "failed", JSON.stringify(current.processing));
    assert.equal(codex.decompositionCalls, 1, "должен быть один полный цикл: поиск → разложение → повторный поиск");
    assert.ok(current.document.boqRows.every((row: any) => (String(row.id).match(/dekel-part/g) ?? []).length <= 1));
  } finally { await fixture.close(); }
});

test("длинный ID строки не ломает финальную сноску DEKEL после полного расчёта", async () => {
  const fixture = await startFixture({}, new LongIdentifierTransientBatchFailureCodex());
  try {
    const project = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Длинный ID", description: "Проверка финальной валидации" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${project.id}/materials`, { method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("требования.txt") }, body: "Выполнить финальную уборку десяти квадратных метров после ремонта." });
    await json(fixture.baseUrl, `/local/projects/${project.id}/processing-runs`, { method: "POST", body: { mode: "full", replaceDocument: true } });
    const current = await waitForProcessing(fixture.baseUrl, project.id);

    assert.notEqual(current.processing.status, "failed", JSON.stringify(current.processing));
    assert.ok(current.document.evidenceNotes.every((note: any) => note.id.length <= 120));
    assert.ok(current.document.evidenceNotes.every((note: any) => note.anchorId.length <= 120));
    const rowIds = new Set(current.document.boqRows.map((row: any) => row.id));
    assert.ok(current.scopeCompleteness.resolutions.every((resolution: any) => resolution.boqRowIds.every((id: string) => rowIds.has(id))));
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
    assert.equal(codex.prompts.filter((prompt) => prompt.includes("DEKEL_CANDIDATE_SELECTION")).length, 1, "неизменённый כתב כמויות не должен повторно проходить тот же семантический подбор DEKEL");
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
    assert.match(codex.prompts.at(-1) ?? "", /для каждого релевантного рабочего пакета используй соответствующую главу/);
    assert.match(codex.prompts.at(-1) ?? "", /специальная спецификация, כתב כמויות, чертежи и прямые требования текущего проекта имеют приоритет/);
    assert.match(codex.prompts.at(-1) ?? "", /3210 используй контекстно только для действительно договорных и коммерческих вопросов/);
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
    assert.match(reviewLine.candidates[0].unitCompatibility, /^(exact|compatible|converted_with_evidence|corrected_by_code|mismatch|unknown)$/);
    if (reviewLine.selectedCode) {
      assert.notEqual(reviewLine.candidates.find((candidate: any) => candidate.code === reviewLine.selectedCode)?.unitCompatibility, "mismatch");
    }
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

    const selected = reviewLine.candidates.find((candidate: any) => candidate.unitCompatibility !== "mismatch");
    assert.ok(selected);
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
    if (prompt.includes("DEKEL_CANDIDATE_SELECTION")) {
      const ids = [...new Set([...prompt.matchAll(/"sourceBoqRowId"\s*:\s*"([^"]+)"/g)].map((match) => match[1]))];
      return JSON.stringify({
        answer: "נבחר סעיף הניקיון המתאים מתוך המועמדים שהועברו.",
        proposedChanges: [{ path: "dekelSelections", valueJson: JSON.stringify(ids.map((sourceBoqRowId) => ({ sourceBoqRowId, selectedCode: "95.69.04.0003", confidence: "high", reason: "התאמה מלאה לעבודת ניקיון לאחר שיפוץ במ״ר" }))), reason: "בחירה מקצועית מוגבלת" }],
        proposedProjectRules: [], needsMoreInformation: [],
      });
    }
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
        { path: "boqRowUpserts", valueJson: JSON.stringify([row]), reason: "סגירת היקף" },
        { path: "scopeResolutions", valueJson: JSON.stringify([{ operationId: "cleaning-primary", disposition: "separate_boq_row", boqRowIds: [row.id], reason: "העבודה משולמת בשורה נפרדת" }]), reason: "מיפוי היקף" },
        { path: "supersededBoqRows", valueJson: "[]", reason: "אין חלופות סותרות" },
        { path: "includedBoqRows", valueJson: "[]", reason: "אין שורות להסרה" },
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

class FailOnceAtScopeClosureCodex extends ProjectBuildingCodex {
  scopeBaseCalls = 0;
  scopeCriticCalls = 0;
  documentSynthesisCalls = 0;
  scopeClosureCalls = 0;
  private failClosure = true;

  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (prompt.includes("SCOPE_INVENTORY_BEFORE_BOQ")) this.scopeBaseCalls += 1;
    if (prompt.includes("SCOPE_INVENTORY_INDEPENDENT_CRITIC")) this.scopeCriticCalls += 1;
    if (prompt.includes("ПОСТРОЙ ПОЛНЫЙ РАБОЧИЙ ДОКУМЕНТ")) this.documentSynthesisCalls += 1;
    if (prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) {
      this.scopeClosureCalls += 1;
      if (this.failClosure) {
        this.failClosure = false;
        throw new Error("simulated interruption after document synthesis");
      }
    }
    return await super.runTurn(threadId, projectPath, prompt);
  }
}

class IncompleteOnceAtScopeClosureCodex extends ProjectBuildingCodex {
  scopeClosureCalls = 0;
  scopeRepairCalls = 0;

  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    const raw = await super.runTurn(threadId, projectPath, prompt);
    if (!prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) return raw;
    this.scopeClosureCalls += 1;
    if (prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE_REPAIR")) {
      this.scopeRepairCalls += 1;
      return raw;
    }
    if (this.scopeClosureCalls !== 1) return raw;
    const parsed = JSON.parse(raw);
    const resolutions = parsed.proposedChanges.find((change: any) => change.path === "scopeResolutions");
    resolutions.valueJson = "[]";
    return JSON.stringify(parsed);
  }
}

class TwiceIncompleteThenTargetedScopeClosureCodex extends ProjectBuildingCodex {
  scopeClosureCalls = 0;
  targetedRepairCalls = 0;

  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    const raw = await super.runTurn(threadId, projectPath, prompt);
    if (!prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) return raw;
    this.scopeClosureCalls += 1;
    if (prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE_TARGETED_REPAIR")) {
      this.targetedRepairCalls += 1;
      return raw;
    }
    const parsed = JSON.parse(raw);
    const resolutions = parsed.proposedChanges.find((change: any) => change.path === "scopeResolutions");
    resolutions.valueJson = "[]";
    return JSON.stringify(parsed);
  }
}

class PartialScopeClosureCodex extends ProjectBuildingCodex {
  scopeClosureCalls = 0;
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    const raw = await super.runTurn(threadId, projectPath, prompt);
    const parsed = JSON.parse(raw);
    if (prompt.includes("SCOPE_INVENTORY_BEFORE_BOQ")) {
      const change = parsed.proposedChanges.find((item: any) => item.path === "scopeInventory");
      const inventory = JSON.parse(change.valueJson);
      inventory.push({ id: "floor-protection", packageId: "cleaning", packageTitle: "ניקיון", stage: "preparation", title: "כיסוי והגנת רצפה לפני עבודות", reason: "נדרש בחומר", dekelQuerySeeds: ["כיסוי והגנת רצפה"] });
      change.valueJson = JSON.stringify(inventory);
    }
    if (prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) {
      this.scopeClosureCalls += 1;
      if (prompt.includes("TARGETED_REPAIR") || prompt.includes("PACKAGE_REPAIR")) {
        const row = { id: "boq-floor-protection", code: "", description: "כיסוי והגנת רצפה לפני עבודות", unit: "מ״ר", quantity: 10, unitPrice: 0, category: "הכנה" };
        parsed.proposedChanges.find((item: any) => item.path === "boqRowUpserts").valueJson = JSON.stringify([row]);
        parsed.proposedChanges.find((item: any) => item.path === "scopeResolutions").valueJson = JSON.stringify([
          { operationId: "floor-protection", disposition: "separate_boq_row", boqRowIds: [row.id], reason: "כיסוי לפני העבודות משולם בנפרד מהניקיון הסופי" },
        ]);
      }
    }
    return JSON.stringify(parsed);
  }
}

class SeparateRoomsScopeCodex extends ProjectBuildingCodex {
  scopeClosureCalls = 0;
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    const raw = await super.runTurn(threadId, projectPath, prompt);
    const parsed = JSON.parse(raw);
    if (prompt.includes("SCOPE_INVENTORY_BEFORE_BOQ")) {
      const change = parsed.proposedChanges.find((item: any) => item.path === "scopeInventory");
      const inventory = JSON.parse(change.valueJson);
      inventory[0].title = "ניקיון יסודי לאחר שיפוץ בחדר א";
      inventory.push({ ...inventory[0], id: "room-b-cleaning", packageId: "room-b", packageTitle: "חדר ב", title: "ניקיון יסודי לאחר שיפוץ בחדר ב", reason: "חדר נפרד בשטח 15 מ״ר" });
      change.valueJson = JSON.stringify(inventory);
    }
    if (prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) {
      this.scopeClosureCalls += 1;
      const rows = parsed.proposedChanges.find((item: any) => item.path === "boqRowUpserts");
      const values = JSON.parse(rows.valueJson);
      values.push({ ...values[0], id: "boq-room-b-cleaning", quantity: 15 });
      rows.valueJson = JSON.stringify(values);
      const resolutions = parsed.proposedChanges.find((item: any) => item.path === "scopeResolutions");
      resolutions.valueJson = JSON.stringify([...JSON.parse(resolutions.valueJson), {
        operationId: "room-b-cleaning", disposition: "separate_boq_row", boqRowIds: ["boq-room-b-cleaning"],
        reason: "השורה המוקדמת שייכת לחדר א; חדר ב הוא שטח נפרד של 15 מ״ר עם אותו סעיף מחירון, לא אותו חיוב",
      }]);
    }
    return JSON.stringify(parsed);
  }
}

class FailAfterRepairedScopePackageCodex extends PartialScopeClosureCodex {
  laterPackageCalls = 0;
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    const batch = prompt.match(/ОПЕРАЦИИ И КАНДИДАТЫ DEKEL ЭТОГО ПАКЕТА:\s*\n([^\n]+)/)?.[1];
    if (batch && JSON.parse(batch)[0]?.key === "annex-cleaning-0") {
      this.laterPackageCalls += 1;
      if (this.laterPackageCalls === 1) throw new Error("interruption after repaired scope package");
      const rows = Array.from({ length: 7 }, (_, i) => ({ id: `boq-annex-${i}`, code: "", description: "נקיון יסודי חד פעמי של מבנים לאחר שיפוץ ולפני איכלוס", unit: "מ״ר", quantity: 10, unitPrice: 0, category: "ניקיון" }));
      return JSON.stringify({ answer: "הושלם", proposedChanges: [
        { path: "boqRowUpserts", valueJson: JSON.stringify(rows), reason: "ניקיון בשבעה שטחים נפרדים" },
        { path: "scopeResolutions", valueJson: JSON.stringify(rows.map((row, i) => ({ operationId: `annex-cleaning-${i}`, disposition: "separate_boq_row", boqRowIds: [row.id], reason: "שטח נפרד" }))), reason: "מיפוי" },
        { path: "supersededBoqRows", valueJson: "[]", reason: "אין" },
        { path: "includedBoqRows", valueJson: "[]", reason: "אין" },
      ], proposedProjectRules: [], needsMoreInformation: [] });
    }
    const raw = await super.runTurn(threadId, projectPath, prompt);
    if (!prompt.includes("SCOPE_INVENTORY_BEFORE_BOQ")) return raw;
    const parsed = JSON.parse(raw);
    const change = parsed.proposedChanges.find((item: any) => item.path === "scopeInventory");
    change.valueJson = JSON.stringify([...JSON.parse(change.valueJson), ...Array.from({ length: 7 }, (_, i) => ({
      id: `annex-cleaning-${i}`, packageId: "annex", packageTitle: "ניקיון אגף", stage: "primary_work", title: `ניקיון יסודי לאחר שיפוץ בחדר ${i + 1}`, reason: "שטח נפרד בחומר", dekelQuerySeeds: ["ניקיון יסודי לאחר שיפוץ"],
    }))]);
    return JSON.stringify(parsed);
  }
}

class MalformedFirstTargetedScopeClosureCodex extends TwiceIncompleteThenTargetedScopeClosureCodex {
  private malformedTargetReturned = false;

  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    const raw = await super.runTurn(threadId, projectPath, prompt);
    if (!prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE_TARGETED_REPAIR") || this.malformedTargetReturned) return raw;
    this.malformedTargetReturned = true;
    const parsed = JSON.parse(raw);
    parsed.proposedChanges = parsed.proposedChanges.filter((change: any) => change.path !== "boqRowUpserts");
    return JSON.stringify(parsed);
  }
}

class PerOperationScopeRecoveryCodex extends ProjectBuildingCodex {
  scopeClosureCalls = 0;
  singleOperationCalls = 0;
  private readonly invalidSingle: boolean;
  private enteredEvidence!: () => void;
  private releaseEvidenceGate!: () => void;
  private readonly evidenceEntered = new Promise<void>((resolvePromise) => { this.enteredEvidence = resolvePromise; });
  private readonly evidenceGate = new Promise<void>((resolvePromise) => { this.releaseEvidenceGate = resolvePromise; });

  constructor(invalidSingle = false) {
    super();
    this.invalidSingle = invalidSingle;
  }
  async waitForEvidence() { await this.evidenceEntered; }
  releaseEvidence() { this.releaseEvidenceGate(); }

  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (!this.invalidSingle && prompt.includes("СФОРМИРУЙ ТОЛЬКО evidenceNotes")) {
      this.enteredEvidence();
      await this.evidenceGate;
    }
    const raw = await super.runTurn(threadId, projectPath, prompt);
    if (!prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) return raw;
    this.scopeClosureCalls += 1;
    const parsed = JSON.parse(raw);
    const resolutions = parsed.proposedChanges.find((change: any) => change.path === "scopeResolutions");
    if (prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE_OPERATION_RECOVERY")) {
      this.singleOperationCalls += 1;
      if (!this.invalidSingle) {
        const upserts = parsed.proposedChanges.find((change: any) => change.path === "boqRowUpserts");
        const rows = JSON.parse(upserts.valueJson);
        rows[0].quantity = 37.5;
        upserts.valueJson = JSON.stringify(rows);
        const resolved = JSON.parse(resolutions.valueJson);
        resolved[0].reason = "הכמות 37.5 מ״ר היא השטח המלא של החדר לפי требования.txt; 10 מ״ר בשורה הקודמת אינם מכסים את השטח. יחידת המדידה מ״ר לפי סעיף הניקיון בדקל.";
        resolutions.valueJson = JSON.stringify(resolved);
        return JSON.stringify(parsed);
      }
    }
    if (resolutions) resolutions.valueJson = "[]";
    return JSON.stringify(parsed);
  }
}

class FailOnceAtSecondCriticCodex extends ProjectBuildingCodex {
  scopeBaseCalls = 0;
  scopeCriticCalls = 0;
  private failed = false;

  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (prompt.includes("SCOPE_INVENTORY_BEFORE_BOQ")) this.scopeBaseCalls += 1;
    if (prompt.includes("SCOPE_INVENTORY_INDEPENDENT_CRITIC")) {
      this.scopeCriticCalls += 1;
      if (!this.failed && this.scopeCriticCalls === 2) {
        this.failed = true;
        throw new Error("simulated transient critic failure");
      }
    }
    return await super.runTurn(threadId, projectPath, prompt);
  }
}

class VisionCapturingProjectBuildingCodex extends ProjectBuildingCodex {
  calls: Array<{ prompt: string; images: string[] }> = [];
  override async runTurn(threadId = "", projectPath = "", prompt = "", imagePaths: string[] = []) {
    this.calls.push({ prompt, images: [...imagePaths] });
    return await super.runTurn(threadId, projectPath, prompt);
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

class MaterialityAdjudicatingScopeCodex extends ProjectBuildingCodex {
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (prompt.includes("SCOPE_INVENTORY_INDEPENDENT_CRITIC")) {
      return JSON.stringify({
        answer: "נמצאו פער אפשרי אחד ופרט ביצוע אחד.",
        proposedChanges: [{ path: "scopeInventoryCritique", valueJson: JSON.stringify({ accepted: false, missingOperations: [
          { id: "waste-removal", packageId: "cleaning", packageTitle: "ניקיון", stage: "reinstatement", title: "פינוי פסולת העבודה", reason: "נדרש פינוי נפרד של פסולת הביצוע", dekelQuerySeeds: ["פינוי פסולת בניין"] },
          { id: "cleaning-curing-detail", packageId: "cleaning", packageTitle: "ניקיון", stage: "testing_handover", title: "המתנה לייבוש חומרי הניקוי לפני בדיקת המסירה", reason: "אין לבדוק משטח רטוב", dekelQuerySeeds: ["המתנה לייבוש חומר ניקוי"] },
        ], reasons: [] }), reason: "ביקורת עצמאית" }],
        proposedProjectRules: [],
        needsMoreInformation: [],
      });
    }
    if (prompt.includes("SCOPE_INVENTORY_MATERIALITY_ADJUDICATOR")) {
      return JSON.stringify({
        answer: "כל פער סווג לפי השפעתו על התמחור והכיסוי.",
        proposedChanges: [{ path: "scopeInventoryAdjudication", valueJson: JSON.stringify({
          accepted: true,
          newOperations: [{ id: "waste-removal", packageId: "cleaning", packageTitle: "ניקיון", stage: "reinstatement", title: "פינוי פסולת העבודה", reason: "תוצאה נפרדת הנמדדת ומתומחרת", dekelQuerySeeds: ["פינוי פסולת בניין"], sourceGapIds: ["waste-removal"] }],
          coveredGaps: [{ gapId: "cleaning-curing-detail", disposition: "execution_detail", operationId: "cleaning-primary", reason: "זהו פרט ביצוע מחייב בתוך עבודת הניקיון ולא תוצאה לתמחור נפרד" }],
        }), reason: "הכרעת חומריות וכיסוי" }],
        proposedProjectRules: [],
        needsMoreInformation: [],
      });
    }
    if (prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) {
      const operationDefinitions = [
        { operationId: "cleaning-primary", rowId: "boq-final-cleaning", description: "נקיון יסודי חד פעמי של מבנים לאחר שיפוץ ולפני איכלוס", unit: "מ״ר", quantity: 10 },
        { operationId: "waste-removal", rowId: "boq-waste-removal", description: "איסוף, העמסה ופינוי פסולת בניין לאתר מורשה", unit: "מ״ק", quantity: 1 },
        { operationId: "cleaning-curing-detail", rowId: "boq-cleaning-curing-detail", description: "המתנה לייבוש חומרי ניקוי לפני בדיקת מסירה", unit: "קומפ׳", quantity: 1 },
      ].filter((item) => prompt.includes(`\"key\":\"${item.operationId}\"`));
      return JSON.stringify({
        answer: "כל הפעולות שנמסרו בחבילת הסגירה קיבלו שורת תוצאה מדידה.",
        proposedChanges: [
          { path: "boqRowUpserts", valueJson: JSON.stringify(operationDefinitions.map((item) => ({ id: item.rowId, code: "", description: item.description, unit: item.unit, quantity: item.quantity, unitPrice: 0, category: "ניקיון ופינוי" }))), reason: "סגירת היקף" },
          { path: "scopeResolutions", valueJson: JSON.stringify(operationDefinitions.map((item) => ({ operationId: item.operationId, disposition: "separate_boq_row", boqRowIds: [item.rowId], reason: "תוצאה נפרדת הנמדדת ומתומחרת" }))), reason: "מיפוי מלאי מלא" },
          { path: "supersededBoqRows", valueJson: "[]", reason: "אין חלופות סותרות" },
          { path: "includedBoqRows", valueJson: "[]", reason: "אין שורות להסרה" },
        ],
        proposedProjectRules: [], needsMoreInformation: [],
      });
    }
    return await super.runTurn(threadId, projectPath, prompt);
  }
}

class RepairingMaterialityAdjudicatorCodex extends MaterialityAdjudicatingScopeCodex {
  adjudicatorCalls = 0;
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (prompt.includes("SCOPE_INVENTORY_MATERIALITY_ADJUDICATOR")) {
      this.adjudicatorCalls += 1;
      if (this.adjudicatorCalls === 1) {
        return JSON.stringify({
          answer: "הוחזר מענה חלקי בטעות.",
          proposedChanges: [{ path: "scopeInventoryAdjudication", valueJson: JSON.stringify({ accepted: true, newOperations: [], coveredGaps: [] }), reason: "מענה חלקי" }],
          proposedProjectRules: [], needsMoreInformation: [],
        });
      }
    }
    return await super.runTurn(threadId, projectPath, prompt);
  }
}

class PersistentlyIncompleteMaterialityAdjudicatorCodex extends MaterialityAdjudicatingScopeCodex {
  adjudicatorCalls = 0;
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (prompt.includes("SCOPE_INVENTORY_MATERIALITY_ADJUDICATOR")) {
      this.adjudicatorCalls += 1;
      return JSON.stringify({
        answer: "הוחזר מענה חלקי.",
        proposedChanges: [{ path: "scopeInventoryAdjudication", valueJson: JSON.stringify({ accepted: true, newOperations: [], coveredGaps: [] }), reason: "מענה חלקי" }],
        proposedProjectRules: [], needsMoreInformation: [],
      });
    }
    return await super.runTurn(threadId, projectPath, prompt);
  }
}

class InterventionAdjudicatingScopeCodex extends ProjectBuildingCodex {
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (prompt.includes("SCOPE_INVENTORY")) this.prompts.push(prompt);
    if (prompt.includes("SCOPE_INVENTORY_BEFORE_BOQ")) {
      return JSON.stringify({
        answer: "נבחר בטעות תיקון מקומי לפריט קיים.",
        proposedChanges: [{ path: "scopeInventory", valueJson: JSON.stringify([
          { id: "existing-item-repair", packageId: "existing-item", packageTitle: "פריט קיים", stage: "primary_work", title: "תיקון מקומי של פריט קיים", reason: "נבחר תיקון", dekelQuerySeeds: ["תיקון פריט קיים"] },
          { id: "existing-item-finish", packageId: "existing-item", packageTitle: "פריט קיים", stage: "reinstatement", title: "תיקוני גמר היקפיים", reason: "נדרש לאחר העבודה", dekelQuerySeeds: ["תיקוני גמר היקפיים"] },
        ]), reason: "מלאי ראשון" }],
        proposedProjectRules: [], needsMoreInformation: [],
      });
    }
    if (prompt.includes("SCOPE_INVENTORY_INDEPENDENT_CRITIC")) {
      return JSON.stringify({
        answer: "המצב, הייעוד והקשר השיפוץ מחייבים החלפה.",
        proposedChanges: [{ path: "scopeInventoryCritique", valueJson: JSON.stringify({ accepted: false, missingOperations: [
          { id: "existing-item-replacement", packageId: "existing-item", packageTitle: "פריט קיים", stage: "primary_work", title: "החלפת הפריט הקיים בפריט חדש", reason: "המצב וההתאמה לייעוד אינם מצדיקים תיקון", dekelQuerySeeds: ["פירוק והחלפת פריט קיים", "אספקה והתקנת פריט חדש"] },
        ], reasons: [] }), reason: "בדיקת סוג ההתערבות" }],
        proposedProjectRules: [], needsMoreInformation: [],
      });
    }
    if (prompt.includes("SCOPE_INVENTORY_MATERIALITY_ADJUDICATOR")) {
      return JSON.stringify({
        answer: "התיקון נדחה והוחלף בתוצאה מקצועית מתאימה.",
        proposedChanges: [{ path: "scopeInventoryAdjudication", valueJson: JSON.stringify({
          accepted: true,
          supersededOperations: [{ operationId: "existing-item-repair", replacementOperationIds: ["existing-item-replacement"], reason: "החלפת תרחיש התיקון" }],
          newOperations: [{ id: "existing-item-replacement", packageId: "existing-item", packageTitle: "פריט קיים", stage: "primary_work", title: "החלפת הפריט הקיים בפריט חדש", reason: "המצב, הייעוד והקשר השיפוץ מחייבים החלפה", dekelQuerySeeds: ["פירוק והחלפת פריט קיים", "אספקה והתקנת פריט חדש"], sourceGapIds: ["existing-item-replacement"] }],
          coveredGaps: [],
        }), reason: "הכרעת סוג ההתערבות" }],
        proposedProjectRules: [], needsMoreInformation: [],
      });
    }
    if (prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) {
      const rejectedRepair = { id: "boq-existing-item-repair-copy", code: "", description: "תיקון מקומי וחיזוק הפריט הקיים", unit: "יח׳", quantity: 1, unitPrice: 0, category: "פריט קיים" };
      const replacement = { id: "boq-existing-item-replacement", code: "", description: "פירוק הפריט הפגום ואספקה והתקנה של פריט חדש מתאים לייעוד", unit: "יח׳", quantity: 1, unitPrice: 0, category: "פריט קיים" };
      const finish = { id: "boq-existing-item-finish", code: "", description: "תיקוני גמר היקפיים לאחר התקנת הפריט החדש", unit: "מ״ר", quantity: 2, unitPrice: 0, category: "גמר" };
      return JSON.stringify({
        answer: "הפתרון שנדחה הוחלף בפתרון שנבחר במלאי המאומת.",
        proposedChanges: [
          { path: "boqRowUpserts", valueJson: JSON.stringify([rejectedRepair, replacement, finish]), reason: "יישום תוצאת ההתערבות" },
          { path: "scopeResolutions", valueJson: JSON.stringify([
            { operationId: "existing-item-replacement", disposition: "separate_boq_row", boqRowIds: [replacement.id], reason: "החלפה משולמת בנפרד" },
            { operationId: "existing-item-finish", disposition: "separate_boq_row", boqRowIds: [finish.id], reason: "תיקוני גמר משולמים בנפרד" },
          ]), reason: "מיפוי מלאי" },
          { path: "supersededBoqRows", valueJson: JSON.stringify([{ boqRowId: "boq-existing-item-repair", replacementBoqRowIds: [replacement.id], reason: "תיקון מקומי סותר את החלטת ההחלפה" }]), reason: "הסרת חלופה שנדחתה" },
          { path: "includedBoqRows", valueJson: "[]", reason: "אין שורות להסרה" },
        ],
        proposedProjectRules: [], needsMoreInformation: [],
      });
    }
    if (prompt.includes("ПОСТРОЙ ПОЛНЫЙ РАБОЧИЙ ДОКУМЕНТ")) {
      const parsed = JSON.parse(await super.runTurn(threadId, projectPath, prompt));
      const boq = parsed.proposedChanges.find((change: any) => change.path === "boqRows");
      boq.valueJson = JSON.stringify([{ id: "boq-existing-item-repair", code: "", description: "תיקון מקומי וחיזוק הפריט הקיים", unit: "יח׳", quantity: 1, unitPrice: 0, category: "פריט קיים" }]);
      return JSON.stringify(parsed);
    }
    return await super.runTurn(threadId, projectPath, prompt);
  }
}

class TransientOptionalBatchFailureCodex extends ProjectBuildingCodex {
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    if (prompt.includes("DEKEL_CANDIDATE_SELECTION") || prompt.includes("DEKEL_UNMATCHED_WORK_DECOMPOSITION") || prompt.includes("СФОРМИРУЙ ТОЛЬКО evidenceNotes")) {
      throw new Error("temporary network failure");
    }
    return await super.runTurn(threadId, projectPath, prompt);
  }
}

class SingleDecompositionPassCodex extends ProjectBuildingCodex {
  decompositionCalls = 0;
  override async runTurn(threadId = "", projectPath = "", prompt = "") {
    if (prompt.includes("DEKEL_CANDIDATE_SELECTION")) {
      const ids = [...new Set([...prompt.matchAll(/"sourceBoqRowId"\s*:\s*"([^"]+)"/g)].map((match) => match[1]))];
      return JSON.stringify({
        answer: "לא נמצא עדיין סעיף מתאים.",
        proposedChanges: [{ path: "dekelSelections", valueJson: JSON.stringify(ids.map((sourceBoqRowId) => ({ sourceBoqRowId, selectedCode: null, confidence: "low", reason: "נדרש פירוק מקצועי" }))), reason: "בדיקת מועמדים" }],
        proposedProjectRules: [], needsMoreInformation: [],
      });
    }
    if (prompt.includes("DEKEL_UNMATCHED_WORK_DECOMPOSITION")) {
      this.decompositionCalls += 1;
      const ids = [...new Set([...prompt.matchAll(/"sourceBoqRowId"\s*:\s*"([^"]+)"/g)].map((match) => match[1]))];
      return JSON.stringify({
        answer: "העבודה נשמרה כתוצאה מדידה אחת לאחר פירוק מקצועי.",
        proposedChanges: [{ path: "dekelDecompositions", valueJson: JSON.stringify(ids.map((sourceBoqRowId) => ({ sourceBoqRowId, rows: [{ id: `${sourceBoqRowId}-dekel-part-cleaning`, description: "ניקיון יסודי לאחר שיפוץ לפני מסירה", unit: "מ״ר", quantity: 10, category: "עבודות משלימות" }] }))), reason: "פירוק חד־שלבי" }],
        proposedProjectRules: [], needsMoreInformation: [],
      });
    }
    return await super.runTurn(threadId, projectPath, prompt);
  }
}

class LongIdentifierTransientBatchFailureCodex extends TransientOptionalBatchFailureCodex {
  override async runTurn(threadId?: string, projectPath?: string, prompt = "") {
    const raw = await super.runTurn(threadId, projectPath, prompt);
    const parsed = JSON.parse(raw);
    const longId = `boq-${"long-source-".repeat(14)}`;
    if (prompt.includes("ПОСТРОЙ ПОЛНЫЙ РАБОЧИЙ ДОКУМЕНТ")) {
      const rows = parsed.proposedChanges.find((change: any) => change.path === "boqRows");
      const values = JSON.parse(rows.valueJson);
      values[0].id = longId;
      rows.valueJson = JSON.stringify(values);
      return JSON.stringify(parsed);
    }
    if (!prompt.includes("DEKEL_FULL_CATALOG_SCOPE_CLOSURE")) return raw;
    const preselectedId = prompt.match(/"rowId"\s*:\s*"([^"]+)"/)?.[1] ?? "boq-final-cleaning";
    const rows = parsed.proposedChanges.find((change: any) => change.path === "boqRowUpserts");
    const resolutions = parsed.proposedChanges.find((change: any) => change.path === "scopeResolutions");
    const values = JSON.parse(rows.valueJson);
    values[0].id = preselectedId;
    rows.valueJson = JSON.stringify(values);
    const resolutionValues = JSON.parse(resolutions.valueJson);
    resolutionValues[0].boqRowIds = [preselectedId];
    resolutions.valueJson = JSON.stringify(resolutionValues);
    return JSON.stringify(parsed);
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
