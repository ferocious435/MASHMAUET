import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { LocalProjectStore } from "../src/modules/local-workspace/local-project-store.ts";
import { extractMaterial } from "../src/modules/local-workspace/material-extractor.ts";
import { buildPricedBoqDescription, createProposals, expandCompositeBoqRowsForDekel, parseCodexAnswer, refreshEstimateNotesAfterDekel } from "../src/modules/local-workspace/local-workspace-service.ts";
import { CodexAppServerClient } from "../src/modules/local-workspace/codex-app-server-client.ts";

test("составные работы разделяются на отдельные измеряемые позиции DEKEL", () => {
  const document = {
    subject: "בדיקה", background: "", objective: "", scope: [], estimateNotes: [], scheduleRows: [], scheduleNotes: "", riskRows: [], additionalNotes: "", evidenceNotes: [],
    boqRows: [
      { id: "boq-electrical-demolition", code: "", description: "ניתוק בטוח ופירוק של נקודות, כבלים, קופסאות ותעלות חשמל ישנות; כמות אומדנית", unit: "יח׳", quantity: 20, unitPrice: 0, category: "פירוק ופינוי" },
      { id: "boq-existing-windows", code: "", description: "שיקום ארבעה חלונות הזזה קיימים במידה 3.05×0.66 מ׳, כולל פרזול ואיטום היקפי", unit: "יח׳", quantity: 4, unitPrice: 0, category: "מעטפת ומסגרות" },
      { id: "boq-main-panel", code: "", description: "שיקום או החלפת לוח חשמל ראשי תלת פאזי כולל סימון מעגלים, איזון פאזות והגנת פחת", unit: "יח׳", quantity: 1, unitPrice: 0, category: "חשמל ובטיחות" },
    ],
  };

  const expanded = expandCompositeBoqRowsForDekel(document);
  const rows = expanded.boqRows as Array<Record<string, unknown>>;

  assert.deepEqual(rows.filter((row) => String(row.id).startsWith("boq-electrical-demolition-")).map((row) => row.unit), ["יח׳", "יח׳", "מ׳", "מ׳"]);
  assert.deepEqual(rows.filter((row) => String(row.id).startsWith("boq-existing-windows-")).map((row) => row.quantity), [4, 29.68, 29.68]);
  assert.deepEqual(rows.filter((row) => String(row.id).startsWith("boq-main-panel-")).map((row) => row.quantity), [1, 20, 1, 1]);
  assert.ok(rows.every((row) => row.code === "" && row.unitPrice === 0));
});

test("после подбора DEKEL сохраняется полное проектное описание работы", () => {
  const description = buildPricedBoqDescription(
    "עבודת מסגר מקצועי ליישור כנפי הדלת, חיזוק עיגונים וכיוון פתיחה וסגירה",
    "מסגר מרכיב, מקצועי",
    "95.60.10.0018",
  );

  assert.match(description, /יישור כנפי הדלת/);
  assert.match(description, /95\.60\.10\.0018/);
  assert.match(description, /מסגר מרכיב, מקצועי/);
  assert.equal(buildPricedBoqDescription("מסגר מרכיב, מקצועי", "מסגר מרכיב, מקצועי", "95.60.10.0018"), "מסגר מרכיב, מקצועי");
});

test("после расчёта DEKEL удаляются устаревшие заметки о нулевых ценах", () => {
  const document = {
    estimateNotes: [
      "כל קודי DEKEL הושארו ריקים וכל מחירי היחידה נקבעו ל־0 עד לביצוע בדיקת DEKEL.",
      "פירוט האומדן יוצג לאחר בדיקת DEKEL ב־3–5 קבוצות.",
      "הערה מקצועית שנשארת במסמך.",
    ],
  };

  refreshEstimateNotesAfterDekel(document, 44, 5);

  assert.ok((document.estimateNotes as string[]).some((note) => /44 שורות/.test(note)));
  assert.ok((document.estimateNotes as string[]).some((note) => /5 קבוצות/.test(note)));
  assert.ok((document.estimateNotes as string[]).includes("הערה מקצועית שנשארת במסמך."));
  assert.ok((document.estimateNotes as string[]).every((note) => !/נקבעו ל־0|יוצג לאחר/.test(note)));
});

test("локальные проекты сохраняются между экземплярами хранилища", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-store-"));
  try {
    const first = new LocalProjectStore(root);
    await first.initialize();
    const project = await first.create("Проверка", "Локальное сохранение");
    project.rules.push("Правило проекта");
    await first.save(project);
    const second = new LocalProjectStore(root);
    const restored = await second.get(project.id);
    assert.equal(restored.name, "Проверка");
    assert.deepEqual(restored.rules, ["Правило проекта"]);
    assert.throws(() => second.projectPath("../outside"), /идентификатор/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("новый рабочий проект не получает демонстрационные работы и цены", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-blank-project-"));
  try {
    const store = new LocalProjectStore(root);
    await store.initialize();
    const project = await store.create("Реальный объект", "Материалы будут загружены владельцем");
    const rows = project.document.boqRows as Array<Record<string, unknown>>;
    const notes = project.document.evidenceNotes as Array<Record<string, unknown>>;

    assert.deepEqual(rows, []);
    assert.deepEqual(notes, []);
    assert.equal(project.processing.runId, null);
    assert.equal(project.processing.status, "idle");
    assert.equal(project.processing.stage, "awaiting_materials");
    assert.equal(project.processing.sourceFingerprint, null);
    assert.equal(project.processing.baseDocumentFingerprint, null);
    assert.equal(project.processing.validatedDocumentFingerprint, null);
    assert.deepEqual(project.processing.warningCodes, []);
    assert.equal(project.processing.readyForExport, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("прерванный запуск после перезапуска становится повторяемой ошибкой", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-interrupted-processing-"));
  try {
    const first = new LocalProjectStore(root);
    await first.initialize();
    const project = await first.create("Прерванный объект", "Проверка восстановления после остановки приложения");
    project.processing = {
      ...project.processing,
      runId: "abandoned-run",
      status: "running",
      stage: "analyzing_materials",
      readyForExport: false,
      progressPercent: 35,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await first.save(project);

    const reopened = new LocalProjectStore(root);
    await reopened.initialize();
    const restored = await reopened.get(project.id);
    assert.equal(restored.processing.status, "failed");
    assert.equal(restored.processing.readyForExport, false);
    assert.equal(restored.processing.runId, null);
    assert.equal(restored.processing.error?.code, "processing_interrupted");
    assert.equal(restored.processing.error?.retryable, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("реальные PDF, Excel и фото подготавливаются к чтению", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-extract-"));
  try {
    const pdf = await extractMaterial(resolve("HOMER/MISMAH LE DUGMA/MISMAH 1/מסמך 1.pdf"), join(root, "pdf"), material("sample.pdf", "application/pdf"));
    assert.equal(pdf.status, "ready");
    assert.equal(pdf.pageCount, 3);
    assert.equal(pdf.visionImagePaths?.length, 3);

    const excel = await extractMaterial(resolve("HOMER/DEKEL/כל חוזה דקל 17.6.25.xlsx"), join(root, "excel"), material("dekel.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    assert.equal(excel.status, "ready");
    assert.ok((excel.sheetCount ?? 0) >= 1);
    assert.match(await readFile(excel.extractedTextPath!, "utf8"), /פריט SSC/);

    const imagePath = resolve("HOMER/KTAV YAD/IMG_20260414_094821.jpg");
    const image = await extractMaterial(imagePath, join(root, "image"), material("photo.jpg", "image/jpeg"));
    assert.deepEqual(image.visionImagePaths, [imagePath]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Codex может только предложить разрешённые изменения", () => {
  const parsed = parseCodexAnswer(JSON.stringify({
    answer: "Готово",
    proposedChanges: [
      { path: "objective", valueJson: JSON.stringify("Новая цель"), reason: "Уточнение" },
      { path: "system", valueJson: JSON.stringify("Нельзя"), reason: "Запрещено" },
    ],
    proposedProjectRules: [{ rule: "Всегда сверять итог", reason: "Исправление" }],
    needsMoreInformation: [],
  }));
  const proposals = createProposals(parsed);
  assert.equal(proposals.length, 2);
  assert.equal(proposals[0].path, "objective");
  assert.equal(proposals[1].target, "projectRule");
  assert.ok(proposals.every((proposal) => proposal.status === "pending"));
});

test("проект хранит стабильные привязки и доказательные сноски к строкам сметы", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-evidence-"));
  try {
    const store = new LocalProjectStore(root);
    await store.initialize();
    const project = (await store.list())[0];
    const rows = project.document.boqRows as Array<{ id?: string }>;
    const notes = project.document.evidenceNotes as Array<{ id: string; anchorId: string; reason: string; confidence: string }>;
    assert.ok(rows.every((row) => typeof row.id === "string" && row.id.length > 0));
    assert.ok(notes.length >= 1);
    assert.ok(rows.some((row) => row.id === notes[0].anchorId));
    assert.ok(notes[0].reason.length > 0);
    assert.match(notes[0].confidence, /^(high|medium|low)$/);

    await store.save(project);
    const restored = await store.get(project.id);
    assert.deepEqual(restored.document.evidenceNotes, project.document.evidenceNotes);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Codex может предложить обновление доказательных сносок", () => {
  const note = [{
    id: "note-1", anchorType: "boqRow", anchorId: "row-1", kind: "inference",
    title: "Добавлена сопутствующая работа", explanation: "Добавлена подготовка основания",
    reason: "Технологически необходима", confidence: "high",
  }];
  const proposals = createProposals(parseCodexAnswer(JSON.stringify({
    answer: "Добавил пояснение",
    proposedChanges: [{ path: "evidenceNotes", valueJson: JSON.stringify(note), reason: "Связь допущения со строкой" }],
    proposedProjectRules: [], needsMoreInformation: [],
  })));
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].path, "evidenceNotes");
  assert.deepEqual(proposals[0].value, note);
});

test("проектный чат не может подменить DEKEL и применяет взаимосвязанные изменения одной операцией", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-chat-proposal-"));
  try {
    const store = new LocalProjectStore(root);
    await store.initialize();
    const project = (await store.list())[0];
    const currentRows = structuredClone(project.document.boqRows) as Array<Record<string, unknown>>;
    const proposedRows = structuredClone(currentRows);
    proposedRows[0].code = "FAKE.CODE";
    proposedRows[0].unitPrice = 999_999;
    proposedRows[0].quantity = Number(proposedRows[0].quantity) + 1;
    proposedRows.push({ id: "chat-new-row", code: "FAKE.NEW", description: "עבודה נלווית חדשה", unit: "יח׳", quantity: 2, unitPrice: 555, category: "עבודות משלימות" });
    const proposedNotes = [...structuredClone(project.document.evidenceNotes) as Array<Record<string, unknown>>, {
      id: "note-chat-new", anchorType: "boqRow", anchorId: "chat-new-row", kind: "inference",
      title: "עבודה נלווית", explanation: "נוספה לפי ההקשר", reason: "נדרשת להשלמת העבודה", confidence: "medium",
    }];
    const warnings: string[] = [];
    const proposals = createProposals(parseCodexAnswer(JSON.stringify({
      answer: "הכנתי שינוי",
      proposedChanges: [
        { path: "boqRows", valueJson: JSON.stringify(proposedRows), reason: "עדכון כתב כמויות" },
        { path: "evidenceNotes", valueJson: JSON.stringify(proposedNotes), reason: "קישור ההנחה" },
      ],
      proposedProjectRules: [], needsMoreInformation: [],
    })), project.document, warnings);
    assert.deepEqual(warnings, []);
    assert.equal(proposals.length, 1);
    assert.deepEqual(proposals[0].changes?.map((change) => change.path), ["boqRows", "evidenceNotes"]);
    const rows = proposals[0].changes?.find((change) => change.path === "boqRows")?.value as Array<Record<string, unknown>>;
    assert.equal(rows[0].code, currentRows[0].code);
    assert.equal(rows[0].unitPrice, currentRows[0].unitPrice);
    assert.equal(rows.at(-1)?.code, "");
    assert.equal(rows.at(-1)?.unitPrice, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("проектный чат отклоняет сноску без существующей строки כתב כמויות", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-chat-evidence-"));
  try {
    const store = new LocalProjectStore(root);
    await store.initialize();
    const project = (await store.list())[0];
    const warnings: string[] = [];
    const proposals = createProposals(parseCodexAnswer(JSON.stringify({
      answer: "הכנתי הערה",
      proposedChanges: [{ path: "evidenceNotes", valueJson: JSON.stringify([{
        id: "bad-note", anchorType: "boqRow", anchorId: "missing-row", kind: "inference",
        title: "הערה", explanation: "הסבר", reason: "סיבה", confidence: "low",
      }]), reason: "בדיקה" }],
      proposedProjectRules: [], needsMoreInformation: [],
    })), project.document, warnings);
    assert.equal(proposals.length, 0);
    assert.match(warnings.join("\n"), /отсутствующую строку/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("временное error-уведомление Codex не завершает локальный сервер", () => {
  const client = new CodexAppServerClient();
  const internal = client as unknown as { handleLine(line: string): void };
  assert.doesNotThrow(() => internal.handleLine(JSON.stringify({
    method: "error",
    params: {
      error: { message: "Reconnecting... 1/2" },
      willRetry: true,
      threadId: "thread-1",
      turnId: "turn-1",
    },
  })));
});

function material(name: string, type: string) {
  return { id: "material-1", name, size: 1, type, addedAt: new Date().toISOString(), status: "processing" as const };
}
