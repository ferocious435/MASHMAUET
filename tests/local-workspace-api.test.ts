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

test("локальный API закрывает полный жизненный цикл данных", async () => {
  const fixture = await startFixture();
  try {
    const initial = await json(fixture.baseUrl, "/local/projects");
    assert.equal(initial.response.status, 200);
    assert.equal(initial.body.projects.length, 1);
    assert.equal(initial.response.headers.get("x-frame-options"), "DENY");
    assert.doesNotMatch(JSON.stringify(initial.body), /sourcePath|extractedTextPath|visionImagePaths|codexThreadId/);

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
    assert.doesNotMatch(JSON.stringify(uploadBody), /sourcePath|extractedTextPath|visionImagePaths/);
    const materialId = uploadBody.material.id as string;

    const reprocessed = await json(fixture.baseUrl, `/local/projects/${projectId}/materials/${materialId}/reprocess`, { method: "POST" });
    assert.equal(reprocessed.body.project.materials[0].status, "ready");

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
    const applied = await json(fixture.baseUrl, `/local/projects/${projectId}/proposals/${proposalId}/apply`, { method: "POST", body: { scope: "project" } });
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

test("проекты изолированы, а ошибка Codex сохраняется контролируемо", async () => {
  const codex = new CapturingCodex();
  const fixture = await startFixture({}, codex, new ReferenceKnowledge());
  try {
    const first = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Первый", description: "Первый проект" } })).body.project;
    const second = (await json(fixture.baseUrl, "/local/projects", { method: "POST", body: { name: "Второй", description: "Второй проект" } })).body.project;
    await fetch(`${fixture.baseUrl}/local/projects/${first.id}/materials`, { method: "POST", headers: { "Content-Type": "text/plain", "X-File-Name": encodeURIComponent("секрет.txt") }, body: "МАТЕРИАЛ_ТОЛЬКО_ПЕРВОГО_ПРОЕКТА" });
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

    codex.fail = true;
    const failed = await json(fixture.baseUrl, `/local/projects/${second.id}/chat`, { method: "POST", body: { message: "Вызови контролируемую ошибку" } });
    assert.equal(failed.response.status, 502);
    assert.equal(failed.body.code, "codex_unavailable");
    const projectAfterFailure = (await json(fixture.baseUrl, `/local/projects/${second.id}`)).body.project;
    assert.match(projectAfterFailure.chat.at(-1).text, /Не удалось получить ответ Codex/);
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

    const analyzed = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/analyze`, { method: "POST", body: {} });
    assert.equal(analyzed.response.status, 200);
    assert.equal(analyzed.body.review.status, "ready");
    assert.equal(analyzed.body.review.lines.length, project.document.boqRows.length);
    const reviewLine = analyzed.body.review.lines.find((line: any) => line.candidates.length > 0);
    assert.ok(reviewLine);
    assert.equal(reviewLine.selectedCode, reviewLine.candidates[0].code);
    assert.equal(reviewLine.quantitySource, "document");
    assert.ok(reviewLine.candidates[0].unitPrice > 0);
    assert.equal(reviewLine.candidates[0].priceIncludesVat, false);

    const selected = reviewLine.candidates[0];
    const updated = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/lines/${reviewLine.id}`, {
      method: "PUT",
      body: { selectedCode: selected.code, quantity: 2.5, included: true },
    });
    assert.equal(updated.body.review.lines.find((line: any) => line.id === reviewLine.id).quantity, 2.5);

    const unapplied = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/apply`, { method: "POST", body: {} });
    assert.equal(unapplied.response.status, 400);

    const applied = await json(fixture.baseUrl, `/local/projects/${project.id}/dekel/apply`, { method: "POST", body: { confirm: true } });
    assert.equal(applied.response.status, 200);
    assert.ok(applied.body.appliedRows >= 1);
    assert.equal(applied.body.review.status, "applied");
    const boqRow = applied.body.project.document.boqRows.find((row: any) => row.id === reviewLine.sourceBoqRowId);
    assert.equal(boqRow.code, selected.code);
    assert.equal(boqRow.unitPrice, selected.unitPrice);
    assert.equal(boqRow.quantity, 2.5);
    const evidence = applied.body.project.document.evidenceNotes.find((note: any) => note.anchorId === boqRow.id && note.kind === "source");
    assert.match(evidence.source.fileName, /\.xlsx$/i);
    assert.match(evidence.source.location, new RegExp(selected.code.replaceAll(".", "\\.")));
    assert.equal(evidence.source.priceIncludesVat, undefined);
  } finally { await fixture.close(); }
});

async function startFixture(localConfig: Record<string, number> = {}, codex: FakeCodex = new FakeCodex(), professionalKnowledgeService: ProfessionalKnowledgeGateway = new EmptyKnowledge()) {
  const dataRoot = await mkdtemp(join(tmpdir(), "mashmauet-api-"));
  const app = createApp({ localDataRootPath: dataRoot, codexClient: codex, localConfig, professionalKnowledgeService });
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
      await rm(dataRoot, { recursive: true, force: true });
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
