import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { LocalProjectStore } from "../src/modules/local-workspace/local-project-store.ts";
import { extractMaterial } from "../src/modules/local-workspace/material-extractor.ts";
import { applyClosestDekelFallbacks, applyDekelDecompositions, buildLocalDekelCandidates, buildPricedBoqDescription, createProposals, deriveHourlyBasisForReview, expandCompositeBoqRowsForDekel, normalizeBoqUnitForDocument, parseCodexAnswer, refreshEstimateNotesAfterDekel, stripDekelPriceAppendix } from "../src/modules/local-workspace/local-workspace-service.ts";
import { CodexAppServerClient } from "../src/modules/local-workspace/codex-app-server-client.ts";
import { auditScopeIntegrity, sanitizeScopeInventory } from "../src/modules/local-workspace/boq-scope-completeness.ts";

test("единицы измерения כתב כמויות всегда выводятся в едином профессиональном формате на иврите", () => {
  const cases = new Map([
    ["unit", "יח׳"], ["יחידה", "יח׳"], ["m", "מ׳"], ["מטר", "מ׳"],
    ["m2", "מ״ר"], ["מ\"ר", "מ״ר"], ["m3", "מ״ק"], ["קומ", "קומפ׳"],
    ["נק", "נק׳"], ["נקודה", "נק׳"], ["hour", "שעה"], ["kg", "ק״ג"],
  ]);
  for (const [raw, expected] of cases) assert.equal(normalizeBoqUnitForDocument(raw), expected, raw);
});

test("повторный подбор DEKEL не самоподтверждает ранее добавленное описание цены", () => {
  assert.equal(
    stripDekelPriceAppendix("שיפוץ לוח חשמל קיים\nתכולת סעיף DEKEL 95.08.57.0057: מבנה לוח מתח גבוה 24kV SF6"),
    "שיפוץ לוח חשמל קיים",
  );
});

test("чужой существующий код DEKEL повторно проверяется по смыслу и исключается", () => {
  const item = {
    itemId: "foreign", pricebookId: "dekel-live", code: "95.08.57.0057",
    description: "מבנה לוח מתח גבוה מודולארי 24kV עם מפסק SF6",
    normalizedDescription: "מבנה לוח מתח גבוה מודולארי 24kv עם מפסק sf6",
    unit: "unit", unitPrice: 91_500, section: "08", subsection: "57",
    tagsJson: [], synonymsJson: [], activeFlag: true,
    metadataJson: { dekel_chapter_code: "08", source_row: "100" },
  };
  const candidates = buildLocalDekelCandidates("שיפוץ לוח חשמל ראשי קיים עד 36 מאמ״תים", item.code, "יח׳", [item]);
  assert.ok(candidates.every((candidate) => candidate.code !== item.code));
});

test("работа без подходящей строки DEKEL раскладывается на измеряемые подработы без выдуманных цен", () => {
  const document = {
    subject: "בדיקה", background: "", objective: "", scope: [], estimateNotes: [], scheduleRows: [], scheduleNotes: "", riskRows: [], additionalNotes: "", evidenceNotes: [],
    boqRows: [{ id: "boq-complex", code: "", description: "עבודה מורכבת", unit: "קומפ׳", quantity: 1, unitPrice: 0, category: "כללי" }],
  };
  const result = applyDekelDecompositions(document, [{
    sourceBoqRowId: "boq-complex",
    rows: [
      { id: "boq-complex-a", description: "פירוק רכיב קיים", unit: "יח׳", quantity: 2, category: "פירוק" },
      { id: "boq-complex-b", description: "אספקה והתקנת רכיב חדש", unit: "יח׳", quantity: 2, category: "התקנה" },
    ],
  }]);
  const rows = result.boqRows as Array<Record<string, unknown>>;
  assert.ok(rows.every((row) => String(row.id).startsWith("boq-complex-dekel-part-")));
  assert.ok(rows.every((row) => row.code === "" && row.unitPrice === 0));
});

test("после разложения выбирается ближайшая совместимая строка DEKEL и сохраняется объяснение", () => {
  const review = {
    lines: [{
      included: false, selectedCode: null, ownerExcluded: false, ownerConfirmed: false,
      selectionMethod: undefined, semanticConfidence: undefined, selectionReason: undefined,
      candidates: [
        { code: "95.01", score: 0.39, unitCompatibility: "mismatch" },
        { code: "95.02", score: 0.54, unitCompatibility: "compatible" },
      ],
    }],
  } as never;
  assert.equal(applyClosestDekelFallbacks(review), 1);
  const line = (review as { lines: Array<Record<string, unknown>> }).lines[0];
  assert.equal(line.selectedCode, "95.02");
  assert.equal(line.semanticConfidence, "medium");
  assert.match(String(line.selectionReason), /DEKEL/u);
});

test("почасовая ставка не заменяет основную установленную работу DEKEL", () => {
  const review = {
    lines: [{
      workDescription: "אספקה והתקנת לוח חשמל חדש",
      included: false, selectedCode: null, ownerExcluded: false, ownerConfirmed: false,
      candidates: [
        { code: "95.hour", description: "חשמלאי מקצועי לפי שעות עבודה", unit: "hour", score: 0.58, unitCompatibility: "compatible" },
        { code: "95.install", description: "אספקה והתקנת לוח חשמל קומפלט", unit: "unit", score: 0.46, unitCompatibility: "compatible" },
      ],
    }],
  } as never;
  assert.equal(applyClosestDekelFallbacks(review), 1);
  assert.equal((review as { lines: Array<Record<string, unknown>> }).lines[0].selectedCode, "95.install");
});

test("непочасовая работа не заменяется единственным найденным почасовым סעיף DEKEL", () => {
  const review = {
    lines: [{
      workDescription: "תיקון מקומי של מסגרת דלת",
      originalUnit: "יח׳",
      included: false, selectedCode: null, ownerExcluded: false, ownerConfirmed: false,
      candidates: [
        { code: "95.hour", description: "מסגר מקצועי לפי שעות עבודה", unit: "hour", score: 0.91, unitCompatibility: "compatible" },
      ],
    }],
  } as never;
  assert.equal(applyClosestDekelFallbacks(review), 0);
  assert.equal((review as { lines: Array<Record<string, unknown>> }).lines[0].selectedCode, null);
});

test("предварительная единица модели не блокирует измеримую строку DEKEL и не делает часы приоритетом", () => {
  const review = { lines: [{
    workDescription: "אספקה והתקנת מזגן מיני מרכזי 40000 BTU כולל חיבורים והפעלה",
    originalUnit: "שעה", hourlyBasis: "unverified",
    included: false, selectedCode: null, ownerExcluded: false, ownerConfirmed: false,
    candidates: [
      { code: "95.hour", description: "טכנאי מיזוג לפי שעות עבודה", unit: "hour", score: 0.95, unitCompatibility: "exact" },
      { code: "95.install", description: "אספקה והתקנת מזגן מיני מרכזי 41000 BTU/HR", unit: "unit", score: 0.82, unitCompatibility: "unknown" },
    ],
  }] } as never;
  assert.equal(applyClosestDekelFallbacks(review), 1);
  assert.equal((review as { lines: Array<Record<string, unknown>> }).lines[0].selectedCode, "95.install");
});

test("описание модели не доказывает почасовую оплату без прямой фразы в проверенном источнике", () => {
  const basis = deriveHourlyBasisForReview({
    originalUnit: "שעה",
    description: "עבודה לפי שעות עבודה",
    quantityEvidence: [{ kind: "source", quantityBasis: "documented", source: { excerpt: "נדרש לבצע תיקון מקומי בדלת" } }],
    candidates: [],
  });
  assert.equal(basis, "unverified");
});

test("поддельный id разложения не создаёт право на почасовую оплату", () => {
  const basis = deriveHourlyBasisForReview({
    originalUnit: "שעה",
    description: "תיקון מקומי נקודתי",
    pricingBasis: undefined,
    quantityEvidence: [],
    candidates: [{ code: "95.hour", description: "מסגר לפי שעה", unit: "hour", unitPrice: 200, score: 0.8, matchReason: "", sourceRow: "1", sourceActivityNumber: null, sourceChapterCode: "60", priceIncludesVat: false, unitCompatibility: "exact" }],
  });
  assert.equal(basis, "unverified");
});

test("системный остаток допускает DEKEL שעה только после отсутствия измеримого кандидата", () => {
  const hourlyCandidate = { code: "95.hour", description: "מסגר לפי שעה", unit: "hour", unitPrice: 200, score: 0.8, matchReason: "", sourceRow: "1", sourceActivityNumber: null, sourceChapterCode: "60", priceIncludesVat: false, unitCompatibility: "exact" } as const;
  assert.equal(deriveHourlyBasisForReview({
    originalUnit: "שעה", description: "תיקון מקומי נקודתי", pricingBasis: "system_decomposed_residual", quantityEvidence: [], candidates: [hourlyCandidate],
  }), "decomposed_residual");
  assert.equal(deriveHourlyBasisForReview({
    originalUnit: "שעה", description: "תיקון מקומי נקודתי", pricingBasis: "system_decomposed_residual", quantityEvidence: [], candidates: [hourlyCandidate, { ...hourlyCandidate, code: "95.unit", description: "תיקון דלת לפי יחידה", unit: "unit", score: 0.7, unitCompatibility: "unknown" }],
  }), "unverified");
});

test("реальная почасовая работа допускает 3 минуты, 4.5 или 13 часов без искусственных порогов", () => {
  for (const quantity of [0.05, 4.5, 13]) {
    const review = {
      lines: [{
        workDescription: "עבודת מסגר לפי שעה לתיקון מקומי",
        originalUnit: "שעה", quantity, hourlyBasis: "decomposed_residual",
        included: false, selectedCode: null, ownerExcluded: false, ownerConfirmed: false,
        candidates: [
          { code: "95.hour", description: "מסגר מקצועי לפי שעות עבודה", unit: "hour", score: 0.91, unitCompatibility: "exact" },
        ],
      }],
    } as never;
    assert.equal(applyClosestDekelFallbacks(review), 1);
    const line = (review as { lines: Array<Record<string, unknown>> }).lines[0];
    assert.equal(line.selectedCode, "95.hour");
    assert.equal(line.quantity, quantity);
  }
});

test("измеримая основная работа не превращается в часы из-за ошибочной единицы или неудачного поиска", () => {
  const review = {
    lines: [{
      workDescription: "אספקה והתקנת ציוד כולל חיבורים והפעלה",
      originalUnit: "שעה", quantity: 18,
      included: false, selectedCode: null, ownerExcluded: false, ownerConfirmed: false,
      candidates: [
        { code: "95.hour", description: "טכנאי מיזוג לפי שעות עבודה", unit: "hour", score: 0.95, unitCompatibility: "exact" },
      ],
    }],
  } as never;
  assert.equal(applyClosestDekelFallbacks(review), 0);
  assert.equal((review as { lines: Array<Record<string, unknown>> }).lines[0].selectedCode, null);
});

test("явно заданная повременная оплата остаётся допустимой независимо от вида и масштаба работы", () => {
  const review = {
    lines: [{
      workDescription: "עבודת התקנה לפי שעות עבודה בהתאם לתנאי האתר",
      originalUnit: "שעה", quantity: 18, quantitySource: "material", hourlyBasis: "source_explicit",
      included: false, selectedCode: null, ownerExcluded: false, ownerConfirmed: false,
      candidates: [
        { code: "95.hour", description: "מתקין מקצועי לפי שעות עבודה", unit: "hour", score: 0.95, unitCompatibility: "exact" },
      ],
    }],
  } as never;
  assert.equal(applyClosestDekelFallbacks(review), 1);
  assert.equal((review as { lines: Array<Record<string, unknown>> }).lines[0].selectedCode, "95.hour");
});

test("одной фразы про часы недостаточно, если количество является системным предположением основной работы", () => {
  const review = {
    lines: [{
      workDescription: "אספקה והתקנת מערכת מלאה לפי שעות עבודה",
      originalUnit: "שעה", quantity: 500, quantitySource: "estimated", hourlyBasis: "unverified",
      included: false, selectedCode: null, ownerExcluded: false, ownerConfirmed: false,
      candidates: [
        { code: "95.hour", description: "מתקין מקצועי לפי שעות עבודה", unit: "hour", score: 0.95, unitCompatibility: "exact" },
      ],
    }],
  } as never;
  assert.equal(applyClosestDekelFallbacks(review), 0);
});

test("системное разложение ремонта двери не создаёт фиксированные часы специалистов", () => {
  const document = {
    subject: "בדיקה", background: "", objective: "", scope: [], estimateNotes: [], scheduleRows: [], scheduleNotes: "", riskRows: [], additionalNotes: "", evidenceNotes: [],
    boqRows: [{ id: "boq-door", code: "", description: "שיקום דלת כניסה דו־כנפית כולל יישור, פרזול, קורוזיה ואיטום", unit: "יח׳", quantity: 2, unitPrice: 0, category: "מסגרות" }],
  };
  const expanded = expandCompositeBoqRowsForDekel(document);
  const rows = expanded.boqRows as Array<Record<string, unknown>>;
  assert.ok(rows.every((row) => row.unit !== "שעה"));
  assert.ok(rows.every((row) => !/הונחו\s+\d+\s+שעות/u.test(String(row.description))));
});

test("нейтральный аудит полноты блокирует операцию без проверяемой связи с כתב כמויות", () => {
  const inventory = sanitizeScopeInventory([{ id: "roof-test", packageId: "roof", packageTitle: "קירוי", stage: "testing_handover", title: "בדיקת אטימות", reason: "נדרש למסירה", dekelQuerySeeds: ["בדיקת אטימות גג"] }]);
  const result = auditScopeIntegrity({ inventory, resolutions: [], boqRows: [{ id: "roof-cover" }], sourceFingerprint: "source", boqFingerprint: "boq" });
  assert.equal(result.status, "needs_review");
  assert.deepEqual(result.unresolvedOperationIds, ["roof-test"]);
});

test("полнота подтверждается только существующей и оценённой строкой DEKEL", () => {
  const inventory = sanitizeScopeInventory([{ id: "pipe-test", packageId: "pipe", packageTitle: "צנרת", stage: "testing_handover", title: "בדיקת לחץ", reason: "נדרש לפני מסירה", dekelQuerySeeds: ["בדיקת לחץ לצנרת"] }]);
  const resolutions = [{ operationId: "pipe-test", disposition: "separate_boq_row" as const, boqRowIds: ["row-test"], reason: "משולם בנפרד" }];
  const blocked = auditScopeIntegrity({ inventory, resolutions, boqRows: [{ id: "row-test" }], selectedDekelByRowId: new Map(), sourceFingerprint: "source", boqFingerprint: "boq" });
  assert.equal(blocked.status, "needs_review");
  const complete = auditScopeIntegrity({ inventory, resolutions, boqRows: [{ id: "row-test" }], selectedDekelByRowId: new Map([["row-test", "95.01"]]), sourceFingerprint: "source", boqFingerprint: "boq" });
  assert.equal(complete.status, "complete");
});

test("название помещения само не создаёт акустику, доступность или другие специальные работы", async () => {
  const source = await readFile(resolve("src/modules/local-workspace/boq-scope-completeness.ts"), "utf8");
  assert.doesNotMatch(source, /חדר\s+כושר|אולם\s+ספורט|\bgym\b|accessibility_readiness|acoustic_readiness/iu);
});

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
