import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { LocalProjectStore } from "../src/modules/local-workspace/local-project-store.ts";
import { extractMaterial } from "../src/modules/local-workspace/material-extractor.ts";
import { applyClosestDekelFallbacks, applyDekelDecompositions, blueBookExcerptSupportsInclusion, buildLocalDekelCandidates, buildPreselectedScopeRows, buildPricedBoqDescription, buildScopeClosureKnowledgeQuery, createProposals, deriveHourlyBasisForReview, expandCompositeBoqRowsForDekel, extractCoolingCapacityBtu, filterRepresentableDekelDecompositions, findProfessionalDefaultDekelCandidate, groupFullDekelScopeCoverageByPackage, groupScopeClosureRepairCoverage, invalidateStaleAutomaticDekelReview, isWorkIncludedInDekelPrice, normalizeBoqUnitForDocument, normalizeGeneratedDocument, parseCodexAnswer, primaryWorkIntentCompatible, refreshEstimateNotesAfterDekel, remapScopeResolutionsForDocument, retainScopeClosureRows, stripDekelPriceAppendix, validateExactDekelDecompositionIds } from "../src/modules/local-workspace/local-workspace-service.ts";
import { CodexAppServerClient } from "../src/modules/local-workspace/codex-app-server-client.ts";
import { applyScopeInventoryAdjudication, auditScopeIntegrity, boqRowConflictsWithScopeIntervention, inventoryAsScopeGaps, mergeScopeCandidatesConservatively, mergeScopeCriticCandidates, sanitizeScopeInventory, sanitizeScopeResolutions, validateExactScopeResolutionIds, validateScopeResolutionStructure } from "../src/modules/local-workspace/boq-scope-completeness.ts";
import { DEKEL_PAID_RESULT_SEMANTIC_REVISION, normalizePaidResultText, paidResultCoreText, paidResultRelation, paidResultSignature } from "../src/modules/local-workspace/dekel-paid-result-semantics.ts";
import { createProcessingCheckpoint } from "../src/modules/local-workspace/processing-checkpoint.ts";

function testDekelItem(code: string, description: string, unit: string, unitPrice: number) {
  return {
    itemId: code, pricebookId: "dekel-live", code, description,
    normalizedDescription: description.toLocaleLowerCase("he"), unit, unitPrice,
    section: code.split(".")[1] ?? "", subsection: code.split(".")[2] ?? "",
    tagsJson: [], synonymsJson: [], activeFlag: true,
    metadataJson: { dekel_chapter_code: code.split(".")[1] ?? "", dekel_row_number: code },
  };
}

test("единицы измерения כתב כמויות всегда выводятся в едином профессиональном формате на иврите", () => {
  const cases = new Map([
    ["unit", "יח׳"], ["יחידה", "יח׳"], ["m", "מ׳"], ["מטר", "מ׳"],
    ["m2", "מ״ר"], ["מ\"ר", "מ״ר"], ["m3", "מ״ק"], ["קומ", "קומפ׳"],
    ["נק", "נק׳"], ["נקודה", "נק׳"], ["hour", "שעה"], ["kg", "ק״ג"],
  ]);
  for (const [raw, expected] of cases) assert.equal(normalizeBoqUnitForDocument(raw), expected, raw);
});

test("период аренды из текста DEKEL определяет единицу и количество вместо технического unit", () => {
  const work = "השכרת במת הרמה לחמישה ימי עבודה";
  const candidates = buildLocalDekelCandidates(work, "", "יום", [
    testDekelItem(
      "95.60.45.0026",
      "במת הרמה חשמלית מספריים - מחיר ההשכרה הינו ליח׳ במה לשבוע, לא כולל הובלה",
      "unit",
      1130,
    ),
  ] as never, 5);
  assert.equal(candidates[0]?.unit, "week");
  assert.equal(candidates[0]?.unitCompatibility, "converted_with_evidence");
  if (candidates[0]) candidates[0].score = 1;
  const review = {
    semanticRevision: DEKEL_PAID_RESULT_SEMANTIC_REVISION,
    lines: [{
      sourceBoqRowId: "access", workDescription: work, originalUnit: "יום", quantity: 5,
      quantitySource: "document", included: false, ownerExcluded: false, ownerConfirmed: false,
      candidates,
    }],
  } as never;
  assert.equal(applyClosestDekelFallbacks(review), 1);
  assert.equal((review as { lines: Array<{ quantity: number }> }).lines[0].quantity, 1);
  assert.equal(normalizeBoqUnitForDocument(candidates[0]?.unit), "שבוע");
});

test("повторный подбор DEKEL не самоподтверждает ранее добавленное описание цены", () => {
  assert.equal(
    stripDekelPriceAppendix("שיפוץ לוח חשמל קיים\nתכולת סעיף DEKEL 95.08.57.0057: מבנה לוח מתח גבוה 24kV SF6"),
    "שיפוץ לוח חשמל קיים",
  );
});

test("подбор DEKEL не считает метраж совместимым с ценой за точку дренажа", () => {
  const work = "צנרת ניקוז מי עיבוי";
  const candidates = buildLocalDekelCandidates(work, "95.07.10.0235", "מ׳", [
    testDekelItem("95.07.10.0235", "צנרת ניקוז מי עיבוי, כולל צינור באורך עד 4 מ׳ לנקודה", "יח׳", 350),
  ] as never, 14);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].unitCompatibility, "mismatch");
  assert.equal(findProfessionalDefaultDekelCandidate(work, candidates), undefined);
});

for (const [code, unit, includedLength, quantity] of [
  ["95.07.10.0235", "יח׳", 4, 14],
  ["95.07.10.0235", "נק׳", 4, 0.5],
  ["95.drain-package", "קומפ׳", 6, 31],
] as const) {
  test(`включённая длина ${includedLength} м не преобразует ${quantity} м в количество ${unit} (${code})`, () => {
    const work = `צנרת ניקוז מי עיבוי, כולל צינור באורך עד ${includedLength} מ׳ לנקודה`;
    const review = { lines: [{
      workDescription: work, originalUnit: "מ׳", quantity,
      quantitySource: "document", quantitySourceReason: "אורך מתועד בתכנית",
      included: false, selectedCode: null, ownerExcluded: false, ownerConfirmed: false,
      candidates: [{ code, description: work, unit, score: 1, unitCompatibility: "compatible" }],
    }] } as never;

    applyClosestDekelFallbacks(review);

    const line = (review as { lines: Array<Record<string, unknown>> }).lines[0];
    assert.equal(line.quantity, quantity, "сохранён исходный метраж, без деления на включённую длину");
    assert.equal(line.quantitySource, "document", "расчёт не выдаётся за измеренное количество точек");
    assert.equal(line.quantitySourceReason, "אורך מתועד בתכנית");
    assert.equal(line.included, false, "метры не могут быть оплачены как комплекты");
    assert.equal(line.selectedCode, null);
    assert.equal((line.candidates as Array<{ unitCompatibility: string }>)[0].unitCompatibility, "mismatch");
    assert.match(String(line.selectionReason), /כמות.*(?:נקודות|יחידות)|מספר.*(?:נקודות|יחידות)/u);
  });
}

test("дренаж сохраняет документированное число точек и линейный метраж при совпадающих единицах", () => {
  for (const unit of ["מ׳", "נק׳", "קומפ׳"]) {
    const work = "צנרת ניקוז מי עיבוי, כולל צינור באורך עד 4 מ׳ לנקודה";
    const review = { lines: [{
      workDescription: work, originalUnit: unit, quantity: 7,
      quantitySource: "document", quantitySourceReason: "כמות מתועדת",
      included: false, selectedCode: null, ownerExcluded: false, ownerConfirmed: false,
      candidates: [{ code: "95.07.10.0235", description: work, unit, score: 1, unitCompatibility: "exact" }],
    }] } as never;

    applyClosestDekelFallbacks(review);

    const line = (review as { lines: Array<Record<string, unknown>> }).lines[0];
    assert.equal(line.quantity, 7);
    assert.equal(line.quantitySource, "document");
    assert.equal(line.included, true);
    assert.equal(line.selectedCode, "95.07.10.0235");
  }
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

test("подбор DEKEL не подменяет металлическую дверь деревянной из-за совпадения размеров и слова дверь", () => {
  const items = [
    {
      itemId: "wood-door", pricebookId: "dekel-live", code: "95.06.10.0010",
      description: "דלת לבודה דו כנפית עם מעטפת מזונית ומשקוף פח במידות 120/210 ס״מ",
      normalizedDescription: "דלת לבודה דו כנפית עם מעטפת מזונית ומשקוף פח במידות 120/210 ס״מ",
      unit: "unit", unitPrice: 2690, section: "06", subsection: "10",
      tagsJson: [], synonymsJson: [], activeFlag: true,
      metadataJson: { dekel_chapter_code: "06" },
    },
    {
      itemId: "steel-door", pricebookId: "dekel-live", code: "95.06.20.0100",
      description: "דלת פלדה דו כנפית חדשה עם משקוף פלדה, פרזול, אספקה והתקנה במידות 120/210 ס״מ",
      normalizedDescription: "דלת פלדה דו כנפית חדשה עם משקוף פלדה פרזול אספקה והתקנה במידות 120/210 ס״מ",
      unit: "unit", unitPrice: 7400, section: "06", subsection: "20",
      tagsJson: [], synonymsJson: [], activeFlag: true,
      metadataJson: { dekel_chapter_code: "06" },
    },
    {
      itemId: "steel-door-repair", pricebookId: "dekel-live", code: "95.06.60.0095",
      description: "ציפוי מחדש של כנף דלת פלדה קיימת לרבות פירוק והתקנת הכנף",
      normalizedDescription: "ציפוי מחדש של כנף דלת פלדה קיימת לרבות פירוק והתקנת הכנף",
      unit: "unit", unitPrice: 670, section: "06", subsection: "60",
      tagsJson: [], synonymsJson: [], activeFlag: true,
      metadataJson: { dekel_chapter_code: "06" },
    },
  ];
  const candidates = buildLocalDekelCandidates("פירוק דלת כניסה קיימת ואספקה והתקנת דלת פלדה דו־כנפית חדשה עם משקוף פלדה", "", "יח׳", items as never);
  assert.ok(candidates.some((candidate) => candidate.code === "95.06.20.0100"));
  assert.equal(candidates.some((candidate) => candidate.code === "95.06.10.0010"), false);
  assert.equal(candidates.some((candidate) => candidate.code === "95.06.60.0095"), false);
});

test("подбор DEKEL не выдаёт цилиндр или целую дверь за замену дверной петли", () => {
  const items = [
    {
      itemId: "cylinder", pricebookId: "dekel-live", code: "95.06.60.0090",
      description: "החלפת צילינדר בדלת פלדה קיימת לרבות פירוק הצילינדר הישן",
      normalizedDescription: "החלפת צילינדר בדלת פלדה קיימת לרבות פירוק הצילינדר הישן",
      unit: "unit", unitPrice: 300, section: "06", subsection: "60",
      tagsJson: [], synonymsJson: [], activeFlag: true,
      metadataJson: { dekel_chapter_code: "06" },
    },
    {
      itemId: "hinge", pricebookId: "dekel-live", code: "95.06.60.0200",
      description: "החלפת ציר כבד בדלת פלדה קיימת לרבות פירוק, אספקה, התקנה וכיוון",
      normalizedDescription: "החלפת ציר כבד בדלת פלדה קיימת לרבות פירוק אספקה התקנה וכיוון",
      unit: "unit", unitPrice: 420, section: "06", subsection: "60",
      tagsJson: [], synonymsJson: [], activeFlag: true,
      metadataJson: { dekel_chapter_code: "06" },
    },
  ];
  const candidates = buildLocalDekelCandidates("פירוק ציר כבד פגום ואספקה והתקנת ציר כבד חדש בדלת פלדה קיימת", "", "יח׳", items as never);
  assert.ok(candidates.some((candidate) => candidate.code === "95.06.60.0200"));
  assert.equal(candidates.some((candidate) => candidate.code === "95.06.60.0090"), false);
});

test("подбор DEKEL сохраняет предмет работы и не заменяет кабель, штукатурку или измерение самим оборудованием", () => {
  const items = [
    {
      itemId: "fan", pricebookId: "dekel-live", code: "95.15.15.0075",
      description: "מפוח אוורור צירי תעשייתי לרבות אספקה והתקנה",
      normalizedDescription: "מפוח אוורור צירי תעשייתי לרבות אספקה והתקנה",
      unit: "unit", unitPrice: 4100, section: "15", subsection: "15", tagsJson: [], synonymsJson: [], activeFlag: true,
      metadataJson: { dekel_chapter_code: "15" },
    },
    {
      itemId: "cable", pricebookId: "dekel-live", code: "95.08.20.0100",
      description: "אספקה והשחלת כבל נחושת להזנת מנוע או מפוח לרבות חיבורים",
      normalizedDescription: "אספקה והשחלת כבל נחושת להזנת מנוע או מפוח לרבות חיבורים",
      unit: "m", unitPrice: 38, section: "08", subsection: "20", tagsJson: [], synonymsJson: [], activeFlag: true,
      metadataJson: { dekel_chapter_code: "08" },
    },
    {
      itemId: "plaster", pricebookId: "dekel-live", code: "95.09.60.0007",
      description: "תיקוני טיח פנים קיים לרבות סיתות והתאמת העובי לקיים",
      normalizedDescription: "תיקוני טיח פנים קיים לרבות סיתות והתאמת העובי לקיים",
      unit: "m2", unitPrice: 44, section: "09", subsection: "60", tagsJson: [], synonymsJson: [], activeFlag: true,
      metadataJson: { dekel_chapter_code: "09" },
    },
    {
      itemId: "airflow-test", pricebookId: "dekel-live", code: "95.15.80.0100",
      description: "מדידת ספיקת אוויר בשבכה לאחר ויסות מערכת אוורור לרבות דו״ח",
      normalizedDescription: "מדידת ספיקת אוויר בשבכה לאחר ויסות מערכת אוורור לרבות דוח",
      unit: "unit", unitPrice: 220, section: "15", subsection: "80", tagsJson: [], synonymsJson: [], activeFlag: true,
      metadataJson: { dekel_chapter_code: "15" },
    },
  ];

  const cable = buildLocalDekelCandidates("אספקה והשחלת כבל הזנה למפוח אוורור", "", "מ׳", items as never);
  assert.deepEqual(cable.map((candidate) => candidate.code), ["95.08.20.0100"]);
  const plaster = buildLocalDekelCandidates("תיקוני טיח פנים סביב מעבר תעלת אוורור", "", "מ״ר", items as never);
  assert.deepEqual(plaster.map((candidate) => candidate.code), ["95.09.60.0007"]);
  const airflow = buildLocalDekelCandidates("מדידת ספיקת אוויר בשבכת פליטה לאחר ויסות", "", "יח׳", items as never);
  assert.deepEqual(airflow.map((candidate) => candidate.code), ["95.15.80.0100"]);
});

test("предметный поиск различает надземный кабельный лоток и земляную траншею", () => {
  const items = [
    testDekelItem("95.08.10.0064", "חפירה של תעלות לכבלים לרבות מילוי חוזר והידוק", "m", 138),
    testDekelItem("95.08.15.0153", "תעלות כבלים מחורצות מפח מגולוון לרבות חיזוקים, קשתות, תמיכות, מתלים, מחברים ומהדקי הארקה", "m", 90),
  ];
  const candidates = buildLocalDekelCandidates(
    "תוואי כבלים גלוי חדש בתעלות פח עם מכסים, תליות ועיגון",
    "",
    "מ׳",
    items as never,
  );
  assert.equal(candidates[0]?.code, "95.08.15.0153");
  assert.equal(candidates.some((candidate) => candidate.code === "95.08.10.0064"), false);
});

test("פרямоугольный оцинкованный воздуховод не заменяется круглым спиральным", () => {
  const items = [
    testDekelItem("95.15.35.0001", "תעלות פח מגולוון ללחץ נמוך בעובי פח 0.8 מ\"מ", "m2", 140),
    testDekelItem("95.15.35.0019", "תעלות עגולות ספירקל מפח מגולוון בקוטר 12 אינץ'", "m", 187),
  ];
  const candidates = buildLocalDekelCandidates(
    "אספקה והתקנת תעלות אוויר מלבניות חדשות מפח מגולוון בלחץ נמוך",
    "",
    "מ״ר",
    items as never,
  );
  assert.equal(candidates[0]?.code, "95.15.35.0001");
  assert.equal(candidates.some((candidate) => candidate.code === "95.15.35.0019"), false);
});

test("опора наружного блока и местный разъединитель не подменяются всей системой HVAC", () => {
  const items = [
    testDekelItem("95.06.40.0020", "תושבת תליה למזגן מפוצל מפרופיל פלדה מגולוון וצבוע", "unit", 488),
    testDekelItem("95.08.40.0052", "מפסק זרם פקט תלת קוטבי 25A בתיבה מוגנת מים", "unit", 260),
    testDekelItem("95.15.10.0195", "יחידת מיזוג אוויר עצמאית מסוג PACKAGE עם מעבה ומאייד", "unit", 25_000),
  ];
  const support = buildLocalDekelCandidates(
    "תושבת פלדה מגולוונת ליחידת מיזוג חיצונית כולל עיגון",
    "",
    "יח׳",
    items as never,
  );
  assert.deepEqual(support.map((candidate) => candidate.code), ["95.06.40.0020"]);
  const disconnect = buildLocalDekelCandidates(
    "מפסק ניתוק מקומי אטום ליחידת מיזוג חיצונית",
    "",
    "יח׳",
    items as never,
  );
  assert.deepEqual(disconnect.map((candidate) => candidate.code), ["95.08.40.0052"]);
});

test("металлические жалюзи, доступный порог и стальные элементы находят свои предметные строки", () => {
  const items = [
    testDekelItem("95.06.60.0103", "פירוק חלונות/רפפות פח ומשקופיהם בשטח עד 2.0 מ\"ר", "unit", 210),
    testDekelItem("95.12.60.0066", "פירוק רשתות יתושים, לרבות מסגרת", "m2", 47),
    testDekelItem("95.10.51.0026", "נגיש- סף אלומיניום קטום לגישור בפתח דלת כניסה", "m", 92),
    testDekelItem("95.19.10.0006", "מרישים לגג מפרופילי פלדה מגולוונים", "ton", 15_580),
  ];
  const louvres = buildLocalDekelCandidates(
    "פירוק רפפות, רשתות ומסגרות מתכת קיימות מ־31 פתחים בגודל 0.80×0.37 מ׳",
    "",
    "יח׳",
    items as never,
    31,
  );
  assert.equal(louvres[0]?.code, "95.06.60.0103");
  const threshold = buildLocalDekelCandidates(
    "סף מתכת לפי פרט נגישות בפתח דלת כניסה",
    "",
    "מ׳",
    items as never,
    2.8,
  );
  assert.deepEqual(threshold.map((candidate) => candidate.code), ["95.10.51.0026"]);
  const purlins = buildLocalDekelCandidates(
    "החלפת מרישים פגומים בגג בפרופילי פלדה מגולוונים",
    "",
    "ק״ג",
    items as never,
    150,
  );
  assert.equal(purlins[0]?.code, "95.19.10.0006");
  assert.equal(purlins[0]?.unitCompatibility, "converted_with_evidence");
});

test("утеплённая металлическая кровля и подготовка бетонного пола не уходят в чужие работы", () => {
  const items = [
    testDekelItem("95.19.30.0018", "סיכוך גגות בפנל מבודד בעובי 50 מ\"מ מפח מגולוון", "m2", 250),
    testDekelItem("95.19.30.0060", "תוספת לסיכוך גגות בפנלים מבודדים עבור שיפוע מעל 10%", "m2", 24),
    testDekelItem("95.02.60.0012", "סיתות וחספוס פני בטון קיימים בעומק עד 2 ס\"מ", "m2", 50),
    testDekelItem("95.41.10.0001", "הסרת צמחיה וניקוי השטח", "m2", 20),
  ];
  const roof = buildLocalDekelCandidates(
    "אספקה והתקנת חיפוי גג חדש מלוחות מתכת מבודדים לגג משופע",
    "",
    "מ״ר",
    items as never,
  );
  assert.deepEqual(roof.map((candidate) => candidate.code), ["95.19.30.0018"]);
  const floor = buildLocalDekelCandidates(
    "הסרת שכבות רופפות מתשתית רצפת בטון עד מצע יציב",
    "",
    "מ״ר",
    items as never,
  );
  assert.equal(floor[0]?.code, "95.02.60.0012");
  assert.equal(floor.some((candidate) => candidate.code === "95.41.10.0001"), false);
});

test("комплектный электрощит не получает цену одной вспомогательной операции или компонента", () => {
  const items = [
    testDekelItem("95.08.35.0100", "מבנה ללוח חשמל בלבד ללא ציוד", "unit", 3_400),
    testDekelItem("95.08.36.0200", "ממסר פחת ארבע קוטבי 40 אמפר", "unit", 420),
    testDekelItem("95.08.25.0065", "מוליך הארקה ללוח חשמל", "m", 34),
    testDekelItem("95.08.63.0009", "התקנת לוח חשמל מוכן וחיבורו בלבד", "unit", 1_200),
    testDekelItem("95.08.63.0015", "איזון פאזות ומיון מעגלים בלוח קיים", "unit", 640),
  ];
  const candidates = buildLocalDekelCandidates(
    "אספקה והתקנת לוח חשמל חדש מושלם הכולל ארון, פסי צבירה, מפסקים, ממסר פחת, הגנות ומהדקים",
    "",
    "יח׳",
    items as never,
  );
  assert.deepEqual(candidates, []);
});

test("смысловой инвариант не принимает упоминание объекта за сам оплачиваемый результат", () => {
  assert.equal(primaryWorkIntentCompatible(
    "מיון והעמסת פסולת שיפוץ מעורבת מדלתות, חלונות וכבלים",
    "סורג מתקפל לדלתות וחלונות מפלדה מגולוונת",
  ), false);
  assert.equal(primaryWorkIntentCompatible(
    "מיון והעמסת פסולת שיפוץ מעורבת מדלתות, חלונות וכבלים",
    "פינוי פסולת בניין מעורבת לרבות העמסה והובלה",
  ), true);
  assert.equal(primaryWorkIntentCompatible(
    "סט מנעול צילינדר וידיות מתכת לדלת פלדה חדשה",
    "דלת פלדה דו כנפית חדשה עם משקוף, מנעול וידיות",
  ), false);
  assert.equal(primaryWorkIntentCompatible(
    "סט מנעול צילינדר וידיות מתכת לדלת פלדה חדשה",
    "מנעול צילינדר וידיות לדלת פלדה לרבות התקנה",
  ), true);
  assert.equal(primaryWorkIntentCompatible(
    "כיוון, תיאום סגירת שתי הכנפיים ובדיקת תפקוד מלאה של דלת דו־כנפית לאחר התקנת הפרזול",
    "דלת לבודה דו כנפית חדשה עם משקוף",
  ), false);
  assert.equal(primaryWorkIntentCompatible(
    "בדיקת התנגדות בידוד של מעגלי החשמל ותיעוד התוצאות",
    "משגוח בידוד חד מופעי עם התראה קולית",
  ), false);
});

test("оплачиваемый результат отделяется от включений, цели и случайных совпадений", () => {
  assert.equal(normalizePaidResultText("מוליך הארקה ומוליכים"), "מוליכ הארקה ומוליכימ");
  assert.equal(
    paidResultCoreText("חיבור מוליך ההארקה הראשי ללוח החשמל, לרבות נעלי כבל ושילוט בטיחות"),
    "חיבור מוליך ההארקה הראשי ללוח החשמל,",
  );
  const incompatiblePairs = [
    ["חיבור מוליך הארקה ראשי לפס ההארקה בלוח החשמל", "מפוח צנטריפוגלי לבטיחות אש"],
    ["מדידת ייצור ותיעוד מידות של פתחים עליונים", "שרוול PVC דרך גג קיים ליחידת מיזוג"],
    ["יישום שכבת יסוד מקשרת על רצפת בטון", "ניקיון יסודי לאחר בנייה לפני איכלוס"],
    ["סדרת בדיקות חוזק ויציבות של תשתית הרצפה", "שטיח לולאות מפוליפרופילן על גומי"],
  ];
  for (const [work, candidate] of incompatiblePairs) assert.equal(primaryWorkIntentCompatible(work, candidate), false, `${work} -> ${candidate}`);
});

test("слово יצירת не превращает устройство нового проёма в дверную петлю", () => {
  assert.equal(paidResultSignature("יצירת פתח חדש והתקנת דלת פלדה חדשה").object, "door_system");
  assert.notEqual(paidResultSignature("יצירת פתח חדש והתקנת דלת פלדה חדשה").object, "door_hardware");
});

test("подстрока גדר внутри הגדרת не превращает настройку пожарной панели во временное ограждение", () => {
  assert.equal(paidResultSignature("תכנות והגדרת אזורים ברכזת גילוי האש").object, "fire_control_panel");
  assert.notEqual(paidResultSignature("תכנות והגדרת אזורים ברכזת גילוי האש").object, "temporary_fence");
});

test("пожарный кабель распознаётся раньше общего электрического кабеля при обоих вариантах написания", () => {
  assert.equal(paidResultSignature("כבל תקני לחווט מערכת גילוי אש").object, "fire_cabling");
  assert.equal(paidResultSignature("כבל תקני לחיווט מערכת גילוי אש").object, "fire_cabling");
});

test("неопределённый результат не получает право на автоматическую прямую цену", () => {
  assert.equal(paidResultRelation("פעולה מקצועית מיוחדת באתר", "שירות מקצועי כללי באתר"), "unknown");
  assert.equal(primaryWorkIntentCompatible("פעולה מקצועית מיוחדת באתר", "שירות מקצועי כללי באתר"), false);
});

test("трубопровод HVAC остаётся трубопроводом, а не полной системой из-за слов контекста", () => {
  const piping = "אספקה והתקנה של זוג צינורות נחושת מבודדים למערכת מיזוג מפוצלת, בין יחידת פנים ליחידת חוץ";
  const system = "יחידת מיזוג אוויר מפוצל עם מעבה ומאייד לתפוקת קירור 5 טון";
  assert.equal(paidResultSignature(piping).object, "hvac_refrigerant_piping");
  assert.equal(paidResultSignature(system).object, "hvac_system");
  assert.notEqual(paidResultRelation(piping, system), "direct_price");
});

test("семантика DEKEL различает систему механической вентиляции, оборудование и воздуховоды", () => {
  assert.equal(paidResultSignature("מערכת אוורור מכני").object, "hvac_system");
  assert.equal(paidResultSignature("מפוח אוורור מכני").object, "hvac_equipment");
  assert.equal(paidResultSignature("יחידת אוורור לאולם").object, "hvac_equipment");
  assert.equal(paidResultSignature("תעלות אוורור למבנה").object, "hvac_ductwork");
  assert.equal(paidResultSignature("תריסי אוויר ורשתות אוורור").object, "hvac_air_terminal");
});

test("удаление существующего покрытия не получает цену нового покрытия", () => {
  const removal = "הסרת שכבות ריצוף וגמר קיימות שאינן מתאימות לקבלת מערכת ריצוף גומי חדשה";
  const installed = "ריצוף ביריעות גומי על משטח מיושר וקשיח";
  assert.equal(paidResultSignature(removal).action, "demolish");
  assert.equal(paidResultRelation(removal, installed), "incompatible");
});

test("текст в скобках не превращает снятие кровельной изоляции в герметизацию", () => {
  const sealing = "עיגון, הבזקים ואיטום היקפי של סגירות פתחים במפגש עם הגג";
  const stripping = "קילוף שכבות בידוד מעל גג קיים (קילוף שכבות איטום נמדד בנפרד)";
  assert.equal(paidResultSignature(stripping).action, "prepare");
  assert.equal(paidResultRelation(sealing, stripping), "incompatible");
});

test("демонтаж остаётся действием над физическим объектом, а не общим объектом demolition", () => {
  const door = paidResultSignature("פירוק דלת פלדה קיימת ומשקופה");
  const window = paidResultSignature("פירוק חלון אלומיניום קיים ומסגרתו");
  assert.equal(door.action, "demolish");
  assert.equal(door.object, "door_system");
  assert.equal(window.action, "demolish");
  assert.equal(window.object, "window_system");
  assert.equal(paidResultRelation("פירוק דלת פלדה קיימת", "פירוק חלון אלומיניום קיים"), "incompatible");
});

test("новое изделие не принимает замену компонента существующего изделия", () => {
  const newPanicHardware = "אספקה והתקנה של מנגנון בהלה חדש לדלת חדשה";
  const existingDoorRepair = "החלפת מנגנון רב בריח בדלת פלדה קיימת לרבות פירוק המנגנון הקיים";
  assert.equal(paidResultSignature(newPanicHardware).scenario, "new_install");
  assert.equal(paidResultSignature(existingDoorRepair).scenario, "replace_existing");
  assert.equal(paidResultRelation(newPanicHardware, existingDoorRepair), "incompatible");
});

test("временная защита кровли не получает цену постоянной кровельной системы", () => {
  const temporaryCover = "כיסוי זמני אטום ועמיד לרוח ולגשם למקטעי גג ולפתחים במהלך השיפוץ, לרבות קיבוע ופירוק";
  const permanentRoof = "מערכת קירוי מלוחות פוליקרבונט שטוח בעובי 4 מ״מ, לרבות אספקה והתקנה קבועה";
  assert.equal(paidResultSignature(temporaryCover).object, "temporary_protection");
  assert.equal(paidResultSignature(permanentRoof).object, "roof_work");
  assert.equal(paidResultRelation(temporaryCover, permanentRoof), "incompatible");
});

test("дверной доводчик, антипаника, замок и петля являются разными оплачиваемыми изделиями", () => {
  const closer = "מחזיר דלת הידראולי תעשייתי לכנף פעילה כבדה, לרבות זרוע, התקנה וכיוון";
  const panic = "מנגנון בהלה תקני לדלת יציאה דו־כנפית, מותקן ומכוון, לרבות מוטות וידיות";
  const lock = "פריצת מנעול רגיל של דלת פלדה נעולה, לרבות התקנת צילינדר חדש";
  const hinge = "החלפת ציר כבד בדלת פלדה קיימת";
  assert.equal(paidResultSignature(closer).object, "door_closer");
  assert.equal(paidResultSignature(panic).object, "door_panic_hardware");
  assert.equal(paidResultSignature(lock).object, "door_lock");
  assert.equal(paidResultSignature(hinge).object, "door_hinge");
  assert.equal(paidResultRelation(closer, lock), "incompatible");
  assert.equal(paidResultRelation(panic, lock), "incompatible");
});

test("кабельные лотки не получают цену кабеля, а новый электрощит — цену его аксессуара или ремонта", () => {
  const tray = "תעלת פח או סולם כבלים גלוי, לרבות מחברים, אבזרים ותמיכות";
  const cable = "כבלים חסיני אש מסוג FE180 E90 NHXH, לרבות חיבור בשני הקצוות";
  const newPanel = "לוח חשמל חדש לאולם במבנה מתכת IP32, מאובזר במפסק ראשי, מותקן ומחובר";
  const panelAccessory = "מפסק גבול גלגלת פלסטי ללוח חשמל";
  const panelRepair = "שיפוץ בלבד של לוח חשמל עד 16 מאמ״תים";
  assert.equal(paidResultSignature(tray).object, "electrical_containment");
  assert.equal(paidResultSignature(cable).object, "electrical_cable");
  assert.equal(paidResultSignature(panelAccessory).object, "electrical_panel_accessory");
  assert.equal(paidResultRelation(tray, cable), "incompatible");
  assert.equal(paidResultRelation(newPanel, panelAccessory), "included_component");
  assert.equal(paidResultRelation(newPanel, panelRepair), "incompatible");
});

test("воздуховоды, внутренние воздухораспределители и наружные дождезащитные решётки не взаимозаменяемы", () => {
  const duct = "תעלות אוויר מפח מגולוון לרבות קשתות, הסתעפויות ואוגנים";
  const supplyGrille = "מפזר אוויר קירי לאספקה עם וסת כמות אוויר";
  const returnGrille = "שבכת אוויר חוזר צבועה בתנור";
  const weatherLouvre = "תריס נגד גשם לרבות רשת נגד ציפורים לפתח פליטת אוויר";
  assert.equal(paidResultSignature(duct).object, "hvac_ductwork");
  assert.equal(paidResultSignature(supplyGrille).object, "hvac_air_terminal");
  assert.equal(paidResultSignature(returnGrille).object, "hvac_air_terminal");
  assert.equal(paidResultSignature(weatherLouvre).object, "hvac_weather_louvre");
  assert.equal(paidResultRelation(duct, supplyGrille), "incompatible");
  assert.equal(paidResultRelation(supplyGrille, weatherLouvre), "incompatible");
});

test("датчик, звуковой оповещатель и ручной извещатель пожарной системы являются отдельными изделиями", () => {
  const detector = "גלאי עשן אופטי למערכת גילוי אש, לרבות בסיס והתקנה";
  const sounder = "צופר התרעה אלקטרוני למערכת גילוי אש";
  const callPoint = "לחצן אש ידני להפעלת התרעה, לרבות התקנה";
  assert.equal(paidResultSignature(detector).object, "fire_detector");
  assert.equal(paidResultSignature(sounder).object, "fire_sounder");
  assert.equal(paidResultSignature(callPoint).object, "fire_manual_call_point");
  assert.equal(paidResultRelation(detector, sounder), "incompatible");
  assert.equal(paidResultRelation(sounder, callPoint), "incompatible");
});

test("временный электрощит, наружная решётка и световой указатель находят тот же оплачиваемый результат DEKEL", () => {
  assert.equal(paidResultRelation(
    "אספקה והפעלת לוח חשמל זמני מוגן למשך עבודות השיפוץ",
    "לוח זמני לאתר בניה 3X25 אמפר מוגן מים IP55, לרבות מאזים וציוד",
  ), "direct_price");
  assert.equal(paidResultRelation(
    "אספקה והתקנה של תריסי חוץ עמידים לגשם ולמזיקים בפתחי פליטת האוויר",
    "תריס נגד גשם צבוע בתנור לרבות רשת נגד ציפורים",
  ), "direct_price");
  assert.equal(paidResultRelation(
    "אספקה והתקנה של שלט יציאה מואר עם גיבוי",
    "שלט הכוונה חירום, תאורת LED בעל קיבולת 3 שעות עם כיתוב יציאה",
  ), "direct_price");
});

test("предметная строка DEKEL без глагола получает действие из природы результата", () => {
  assert.equal(paidResultSignature("סגירת פתחים בקירות בלוק קיימים").action, "install");
  assert.equal(paidResultSignature("מצע מדה מתפלסת בעובי 1 ס״מ").action, "prepare");
  assert.equal(paidResultSignature("חיפוי תפרים אופקיים בגג בפח אבץ").action, "install");
});

test("площадь изделия преобразуется в число штук только по документированным размерам", () => {
  const work = "אספקה והתקנה של דלת פלדה דו כנפית במידה 2.80×1.95 מ׳";
  const items = [testDekelItem("95.06.30.0016", "דלת פלדה דו כנפית חדשה עם משקוף, אספקה והתקנה", "unit", 6060)];
  const candidates = buildLocalDekelCandidates(work, "", "מ״ר", items as never, 10.92);
  assert.equal(candidates[0]?.unitCompatibility, "converted_with_evidence");
  if (candidates[0]) candidates[0].score = 1;
  const review = {
    semanticRevision: DEKEL_PAID_RESULT_SEMANTIC_REVISION,
    lines: [{
      sourceBoqRowId: "door", workDescription: work, originalUnit: "מ״ר", quantity: 10.92,
      quantitySource: "document", included: false, ownerExcluded: false, ownerConfirmed: false,
      candidates,
    }],
  } as never;
  assert.equal(applyClosestDekelFallbacks(review), 1);
  assert.equal((review as { lines: Array<{ quantity: number }> }).lines[0].quantity, 2);

  const withoutDimensions = buildLocalDekelCandidates("אספקה והתקנה של דלת פלדה דו כנפית", "", "מ״ר", items as never, 10.92);
  assert.equal(withoutDimensions[0]?.unitCompatibility, "mismatch");

  const explicitCount = buildLocalDekelCandidates("סגירה קבועה של 31 פתחים תחתונים", "", "מ״ר", [
    testDekelItem("95.04.60.0026", "סגירת פתחים בקירות בלוק קיימים", "unit", 365),
  ] as never, 9.18);
  assert.equal(explicitCount[0]?.unitCompatibility, "converted_with_evidence");
});

test("мощность HVAC извлекается из разных профессиональных форматов без привязки к одному примеру", () => {
  assert.equal(extractCoolingCapacityBtu("תפוקת קירור 36,000 BTU/HR"), 36_000);
  assert.equal(extractCoolingCapacityBtu("מערכת 33500 BTU"), 33_500);
  assert.equal(extractCoolingCapacityBtu("מזגן בתפוקה 3.5 טון קירור"), 42_000);
  assert.equal(extractCoolingCapacityBtu("מזגן 4 ט״ק"), 48_000);
});

test("новое алюминиевое окно сопоставляется с полным изделием, а не с заменой стекла", () => {
  const items = [
    testDekelItem("95.12.30.0007", "ויטרינה מאלומיניום וזכוכית לרבות מסגרת, זיגוג, אספקה והתקנה", "m2", 2180),
    testDekelItem("95.06.60.0139", "החלפת זיגוג זכוכית בחלון קיים", "m2", 231),
  ];
  const work = "פירוק החלון הקיים ואספקה והתקנת חלון אלומיניום חדש עם זכוכית ומסגרת";
  const candidates = buildLocalDekelCandidates(work, "", "מ״ר", items as never);
  assert.ok(candidates.some((candidate) => candidate.code === "95.12.30.0007"));
  assert.equal(candidates.some((candidate) => candidate.code === "95.06.60.0139"), false);
  assert.equal(findProfessionalDefaultDekelCandidate(work, candidates)?.code, "95.12.30.0007");
});

test("предметная строка не теряется за глобальным лексическим top-K", () => {
  const distractors = Array.from({ length: 60 }, (_, index) => testDekelItem(
    `95.06.60.${String(index).padStart(4, "0")}`,
    `החלפת זכוכית בחלון אלומיניום חדש עם מסגרת ופרזול, אספקה והתקנה ${index}`,
    "m2",
    200 + index,
  ));
  const target = testDekelItem("95.12.99.9999", "חלון אלומיניום חדש לרבות מסגרת, פרזול וזכוכית", "m2", 2100);
  const work = "אספקה והתקנת חלון אלומיניום חדש עם מסגרת, פרזול וזכוכית";
  const candidates = buildLocalDekelCandidates(work, "", "מ״ר", [...distractors, target] as never);
  assert.ok(candidates.some((candidate) => candidate.code === target.code));
  assert.ok(candidates.every((candidate) => !candidate.description.startsWith("החלפת זכוכית")));
});

test("изменение версии семантики инвалидирует старый автоматический review, но текущий сохраняет", () => {
  const baseProject = {
    materials: [{ id: "m" }],
    processing: { status: "ready", stage: "complete", readyForExport: true, progressPercent: 100, warningCodes: [], updatedAt: new Date(0).toISOString() },
    dekelReview: { semanticRevision: "old", lines: [] },
  } as never;
  assert.equal(invalidateStaleAutomaticDekelReview(baseProject), true);
  assert.equal((baseProject as { dekelReview?: unknown }).dekelReview, undefined);
  assert.equal((baseProject as { processing: { status: string; warningCodes: string[] } }).processing.status, "needs_review");
  assert.ok((baseProject as { processing: { warningCodes: string[] } }).processing.warningCodes.includes("dekel_semantics_changed"));

  const currentProject = {
    materials: [{ id: "m" }],
    processing: { status: "ready", stage: "complete", readyForExport: true, progressPercent: 100, warningCodes: [], updatedAt: new Date(0).toISOString() },
    dekelReview: { semanticRevision: DEKEL_PAID_RESULT_SEMANTIC_REVISION, lines: [] },
  } as never;
  assert.equal(invalidateStaleAutomaticDekelReview(currentProject), false);
  assert.ok((currentProject as { dekelReview?: unknown }).dekelReview);
});

test("полная система HVAC выбирается по ближайшей мощности и не подменяется отдельным блоком или монтажом без поставки", () => {
  const items = [
    testDekelItem("95.15.25.0088", "מזגן מיני מרכזי לתפוקת קירור 36000BTU/HR לרבות אספקה, התקנה בסיסית והפעלה", "unit", 9000),
    testDekelItem("95.15.25.0500", "יחידת עיבוי חיצונית 36000BTU/HR חומר בלבד", "unit", 4100),
    testDekelItem("95.15.25.0501", "התקנה בלבד של מזגן מיני מרכזי 36000BTU/HR, ללא אספקת הציוד", "unit", 2200),
  ];
  const work = "אספקה והתקנת מערכת מיזוג מיני מרכזית חדשה בתפוקה 35,000 BTU/HR לרבות הפעלה";
  const candidates = buildLocalDekelCandidates(work, "", "יח׳", items as never);
  assert.deepEqual(candidates.map((candidate) => candidate.code), ["95.15.25.0088"]);
  assert.equal(findProfessionalDefaultDekelCandidate(work, candidates)?.code, "95.15.25.0088");
});

test("רכזת גילוי אש נשארת לוח בקרה ולא מוחלפת בכרטיס, גלאי או חיווט", () => {
  const items = [
    testDekelItem("95.34.10.0011", "רכזת גילוי אש ל-4 אזורים לרבות אספקה והתקנה", "unit", 4900),
    testDekelItem("95.34.20.0100", "כרטיס תקשורת לרכזת גילוי אש", "unit", 800),
    testDekelItem("95.34.30.0100", "גלאי עשן אופטי למערכת גילוי אש", "unit", 190),
    testDekelItem("95.34.40.0100", "כבל חסין אש לחיווט מערכת גילוי אש", "m", 22),
  ];
  const work = "אספקה והתקנת רכזת גילוי אש חדשה ל-4 אזורים";
  const candidates = buildLocalDekelCandidates(work, "", "יח׳", items as never);
  assert.deepEqual(candidates.map((candidate) => candidate.code), ["95.34.10.0011"]);
  assert.equal(findProfessionalDefaultDekelCandidate(work, candidates)?.code, "95.34.10.0011");
});

test("разложение принимается только когда каждая подработа представима реальной строкой DEKEL", () => {
  const sourceRows = [{ id: "hvac-source", description: "אספקה והתקנת מערכת מיזוג מיני מרכזית חדשה 36000BTU", unit: "יח׳" }];
  const items = [
    testDekelItem("95.15.25.0088", "מזגן מיני מרכזי לתפוקת קירור 36000BTU/HR לרבות אספקה והתקנה", "unit", 9000),
    testDekelItem("95.15.25.0500", "יחידת עיבוי חיצונית 36000BTU/HR לרבות אספקה והתקנה", "unit", 4100),
    testDekelItem("95.08.20.0100", "אספקה והשחלת כבל נחושת להזנת מערכת מיזוג לרבות חיבורים", "m", 38),
  ];
  const valid = [{ sourceBoqRowId: "hvac-source", rows: [
    { description: "אספקה והתקנת מזגן מיני מרכזי חדש 36000BTU", unit: "יח׳", quantity: 1 },
    { description: "אספקה והשחלת כבל נחושת להזנת מערכת מיזוג לרבות חיבורים", unit: "מ׳", quantity: 20 },
  ] }];
  assert.equal(filterRepresentableDekelDecompositions(valid, sourceRows, items as never).length, 1);
  const invalid = [{ sourceBoqRowId: "hvac-source", rows: [
    ...valid[0].rows,
    { description: "פעולה מיוחדת שאינה קיימת במחירון", unit: "יח׳", quantity: 1 },
  ] }];
  assert.equal(filterRepresentableDekelDecompositions(invalid, sourceRows, items as never).length, 0);

  const doublePricedSystem = [{ sourceBoqRowId: "hvac-source", rows: [
    { description: "אספקה והתקנת מזגן מיני מרכזי חדש 36000BTU", unit: "יח׳", quantity: 1 },
    { description: "אספקה והתקנת יחידת עיבוי חיצונית 36000BTU", unit: "יח׳", quantity: 1 },
  ] }];
  assert.equal(filterRepresentableDekelDecompositions(doublePricedSystem, sourceRows, items as never).length, 0);
});

test("пакет разложения DEKEL обязан вернуть каждую неподобранную работу ровно один раз", () => {
  const incomplete = [
    { sourceBoqRowId: "row-a", rows: [{ id: "row-a-1", description: "עבודה א", unit: "יח׳", quantity: 1, category: "א" }] },
  ];
  assert.deepEqual(validateExactDekelDecompositionIds(incomplete, ["row-a", "row-b"]), ["dekel_decomposition_missing:row-b"]);

  const duplicateAndForeign = [
    ...incomplete,
    { sourceBoqRowId: "row-a", rows: [{ id: "row-a-2", description: "עבודה א", unit: "יח׳", quantity: 1, category: "א" }] },
    { sourceBoqRowId: "row-foreign", rows: [{ id: "x", description: "עבודה זרה", unit: "יח׳", quantity: 1, category: "א" }] },
  ];
  assert.deepEqual(validateExactDekelDecompositionIds(duplicateAndForeign, ["row-a"]), [
    "dekel_decomposition_duplicate:row-a",
    "dekel_decomposition_foreign:row-foreign",
  ]);
});

test("scope closure не удаляет основные результаты без явной проверенной замены или включения", () => {
  const initial = [
    { id: "door", description: "אספקה והתקנה של דלת חדשה", category: "דלתות" },
    { id: "window", description: "אספקה והתקנה של חלון חדש", category: "חלונות" },
    { id: "panel", description: "אספקה והתקנה של לוח חשמל חדש", category: "חשמל" },
    { id: "sport-floor", description: "אספקה והתקנה של ריצוף גומי ספורטיבי", category: "רצפה" },
    { id: "hvac", description: "אספקה והתקנה של יחידות מיזוג", category: "מיזוג" },
  ];
  assert.deepEqual(retainScopeClosureRows([], initial, new Set(), new Set()).map((row) => row.id), initial.map((row) => row.id));
  assert.deepEqual(retainScopeClosureRows([], initial, new Set(["door"]), new Set(["window"])).map((row) => row.id), ["panel", "sport-floor", "hvac"]);
  const repair = { id: "repair", description: "תיקון מקומי וחיזוק הפריט הקיים", category: "פריט קיים", unit: "יח׳" };
  const repairCopy = { ...repair, id: "repair-copy" };
  const replacement = { id: "replacement", description: "החלפת הפריט הקיים בפריט חדש", category: "פריט קיים", unit: "יח׳" };
  assert.deepEqual(
    retainScopeClosureRows([repairCopy, replacement], [repair], new Set(["repair"]), new Set()).map((row) => row.id),
    ["replacement"],
  );
});

test("операция замены не конфликтует с ремонтом другого рабочего пакета по служебным словам", () => {
  const inventory = sanitizeScopeInventory([
    { id: "door-replace", packageId: "doors", packageTitle: "החלפת דלתות כניסה", stage: "primary_work", title: "אספקה והתקנה של דלתות חדשות", reason: "נדרשת החלפה", dekelQuerySeeds: ["דלת פלדה חדשה"] },
    { id: "floor-repair", packageId: "floor", packageTitle: "שיקום מלא של רצפת הבסיס", stage: "primary_work", title: "תיקון מלא של רצפת בטון", reason: "נדרש תיקון", dekelQuerySeeds: ["תיקון רצפה"] },
  ]);
  assert.equal(boqRowConflictsWithScopeIntervention({ category: "דלתות כניסה", description: "אספקה והתקנה של שתי דלתות פלדה חדשות עם משקופים" }, inventory), false);
});

test("выбор DEKEL ставит совместимую единицу выше лексически похожего изделия", () => {
  const items = [
    {
      itemId: "feeder-box", pricebookId: "dekel-live", code: "95.box",
      description: "קופסת הזנה לחיבור כבלים להזנת פס צבירה",
      normalizedDescription: "קופסת הזנה לחיבור כבלים להזנת פס צבירה",
      unit: "unit", unitPrice: 500, section: "08", subsection: "21", tagsJson: [], synonymsJson: [], activeFlag: true,
      metadataJson: { dekel_chapter_code: "08" },
    },
    {
      itemId: "cable", pricebookId: "dekel-live", code: "95.cable",
      description: "כבלי נחושת מסוג N2XY/FR בחתך 3X1.5 ממ״ר לרבות חיבור בשני הקצוות",
      normalizedDescription: "כבלי נחושת מסוג n2xy/fr בחתך 3x1.5 ממ״ר לרבות חיבור בשני הקצוות",
      unit: "m", unitPrice: 11.5, section: "08", subsection: "20", tagsJson: [], synonymsJson: [], activeFlag: true,
      metadataJson: { dekel_chapter_code: "08" },
    },
  ];
  const candidates = buildLocalDekelCandidates("אספקה והשחלת כבל נחושת N2XY/FR בחתך 3×1.5 ממ״ר", "", "מ׳", items as never);
  assert.equal(candidates[0]?.code, "95.cable");
  assert.equal(candidates.some((candidate) => candidate.code === "95.box"), false);
});

test("сопутствующая операция схлопывается только по точному доказательству включения в цену", () => {
  const dekel = "דלת פלדה דו כנפית חדשה עם משקוף, לרבות מנעול צילינדר וידיות מתכת; ללא מחזיר דלת";
  assert.equal(isWorkIncludedInDekelPrice(
    "מנעול צילינדר וידיות מתכת לדלת הפלדה",
    dekel,
    "לרבות מנעול צילינדר וידיות מתכת",
  ), true);
  assert.equal(isWorkIncludedInDekelPrice(
    "מחזיר דלת הידראולי",
    dekel,
    "ללא מחזיר דלת",
  ), false);
  assert.equal(isWorkIncludedInDekelPrice(
    "מנעול צילינדר וידיות מתכת לדלת הפלדה",
    dekel,
    "דלת פלדה דו כנפית חדשה",
  ), false);
});

test("работа без подходящей строки DEKEL раскладывается на измеряемые подработы без выдуманных цен", () => {
  const document = {
    subject: "בדיקה", background: "", objective: "", scope: [], estimateNotes: [], scheduleRows: [], scheduleNotes: "", riskRows: [], additionalNotes: "", evidenceNotes: [],
    boqRows: [{ id: "boq-complex", code: "", description: "עבודה מורכבת", unit: "קומפ׳", quantity: 1, unitPrice: 0, category: "כללי" }],
  };
  const idRemap = new Map<string, string[]>();
  const result = applyDekelDecompositions(document, [{
    sourceBoqRowId: "boq-complex",
    rows: [
      { id: "boq-complex-a", description: "פירוק רכיב קיים", unit: "יח׳", quantity: 2, category: "פירוק" },
      { id: "boq-complex-b", description: "אספקה והתקנת רכיב חדש", unit: "יח׳", quantity: 2, category: "התקנה" },
    ],
  }], idRemap);
  const rows = result.boqRows as Array<Record<string, unknown>>;
  assert.ok(rows.every((row) => String(row.id).startsWith("boq-complex-dekel-part-")));
  assert.ok(rows.every((row) => row.code === "" && row.unitPrice === 0));
  assert.deepEqual(idRemap.get("boq-complex"), rows.map((row) => row.id));
});

test("невалидное разложение DEKEL не удаляет исходную работу и её сноску", () => {
  const document = {
    subject: "בדיקה", background: "", objective: "", scope: [], estimateNotes: [], scheduleRows: [], scheduleNotes: "", riskRows: [], additionalNotes: "",
    boqRows: [{ id: "boq-source", code: "", description: "עבודה קיימת", unit: "יח׳", quantity: 1, unitPrice: 0, category: "כללי" }],
    evidenceNotes: [{ id: "evidence-source", anchorType: "boqRow", anchorId: "boq-source", kind: "source", quantityBasis: "documented", title: "מקור", explanation: "תועד", reason: "נדרש", confidence: "high" }],
  };
  const idRemap = new Map<string, string[]>();
  const result = applyDekelDecompositions(document, [{ sourceBoqRowId: "boq-source", rows: [{ description: "", unit: "", quantity: 1 }] }], idRemap);
  assert.deepEqual(result.boqRows, document.boqRows);
  assert.deepEqual(result.evidenceNotes, document.evidenceNotes);
  assert.equal(idRemap.size, 0);
});

test("разложение DEKEL не может удалить основной оплачиваемый результат", () => {
  const document = {
    subject: "בדיקה", background: "", objective: "", scope: [], estimateNotes: [], scheduleRows: [], scheduleNotes: "", riskRows: [], additionalNotes: "", evidenceNotes: [],
    boqRows: [{ id: "boq-hvac", code: "", description: "אספקה והתקנת יחידות מיזוג חדשות", unit: "יח׳", quantity: 3, unitPrice: 0, category: "מיזוג" }],
  };
  const rejected = applyDekelDecompositions(document, [{
    sourceBoqRowId: "boq-hvac",
    rows: [
      { description: "אספקת כבלי פיקוד למערכת", unit: "מ׳", quantity: 40 },
      { description: "הפעלה ראשונית ובדיקת ביצועים", unit: "יח׳", quantity: 3 },
    ],
  }]);
  assert.deepEqual(rejected.boqRows, document.boqRows);

  const accepted = applyDekelDecompositions(document, [{
    sourceBoqRowId: "boq-hvac",
    rows: [
      { description: "אספקה והתקנת מזגן מפוצל חדש", unit: "יח׳", quantity: 3 },
      { description: "אספקת כבלי פיקוד למערכת", unit: "מ׳", quantity: 40 },
    ],
  }]);
  assert.equal((accepted.boqRows as Array<Record<string, unknown>>).length, 2);
  assert.ok((accepted.boqRows as Array<Record<string, unknown>>).some((row) => String(row.description).includes("מזגן")));
});

test("повторное разложение DEKEL сохраняет уникальные идентификаторы строк в допустимой длине", () => {
  let document: Record<string, unknown> = {
    subject: "בדיקה", background: "", objective: "", scope: [], estimateNotes: [], scheduleRows: [], scheduleNotes: "", riskRows: [], additionalNotes: "", evidenceNotes: [],
    boqRows: [{ id: `boq-${"long-source-".repeat(9)}`, code: "", description: "עבודה מורכבת", unit: "קומפ׳", quantity: 1, unitPrice: 0, category: "כללי" }],
  };

  for (let round = 0; round < 8; round += 1) {
    const sourceId = String((document.boqRows as Array<Record<string, unknown>>)[0].id);
    document = applyDekelDecompositions(document, [{
      sourceBoqRowId: sourceId,
      rows: [
        { description: `תת עבודה א ${round}`, unit: "יח׳", quantity: 1, category: "כללי" },
        { description: `תת עבודה ב ${round}`, unit: "יח׳", quantity: 1, category: "כללי" },
      ],
    }]);
    const decomposedRows = document.boqRows as Array<Record<string, unknown>>;
    assert.ok(decomposedRows.every((row) => String(row.id).length <= 120));
    assert.equal(new Set(decomposedRows.map((row) => String(row.id))).size, decomposedRows.length);
    document.boqRows = [decomposedRows[0]];
  }
});

test("нормализация документа ограничивает ID строк и сносок, сохраняя их связь", () => {
  const longRowId = `boq-${"very-long-source-".repeat(10)}`;
  const longNoteId = `evidence-${"professional-assumption-".repeat(8)}`;
  const normalized = normalizeGeneratedDocument({
    subject: "בדיקה", background: "", objective: "", scope: [], estimateNotes: [], scheduleRows: [], scheduleNotes: "", riskRows: [], additionalNotes: "",
    boqRows: [{ id: longRowId, code: "", description: "עבודה נמדדת", unit: "יח׳", quantity: 1, unitPrice: 0, category: "כללי" }],
    evidenceNotes: [{
      id: longNoteId, anchorType: "boqRow", anchorId: longRowId, kind: "inference", quantityBasis: "inferred",
      title: "הנחה", explanation: "הסבר", reason: "סיבה", confidence: "medium",
    }],
  }, true);

  const row = (normalized.boqRows as Array<Record<string, unknown>>)[0];
  const note = (normalized.evidenceNotes as Array<Record<string, unknown>>)[0];
  assert.ok(String(row.id).length <= 120);
  assert.ok(String(note.id).length <= 120);
  assert.equal(note.anchorId, row.id);
});

test("после разложения выбирается ближайшая совместимая строка DEKEL и сохраняется объяснение", () => {
  const review = {
    lines: [{
      workDescription: "עבודה נמדדת לפי סעיף DEKEL",
      included: false, selectedCode: null, ownerExcluded: false, ownerConfirmed: false,
      selectionMethod: undefined, semanticConfidence: undefined, selectionReason: undefined,
      candidates: [
        { code: "95.01", description: "עבודה נמדדת לפי סעיף DEKEL", unit: "unit", score: 0.39, unitCompatibility: "mismatch", paidResultRelation: "direct_price" },
        { code: "95.02", description: "עבודה נמדדת לפי סעיף DEKEL", unit: "unit", score: 0.54, unitCompatibility: "compatible", paidResultRelation: "direct_price" },
      ],
    }],
  } as never;
  assert.equal(applyClosestDekelFallbacks(review), 1);
  const line = (review as { lines: Array<Record<string, unknown>> }).lines[0];
  assert.equal(line.selectedCode, "95.02");
  assert.equal(line.selectionMethod, "lexical_fallback");
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

test("арбитр полноты сохраняет технологическую деталь внутри предметной операции", () => {
  const inventory = sanitizeScopeInventory([{ id: "paint-primary", packageId: "paint", packageTitle: "צביעה", stage: "primary_work", title: "צביעת פלדה", reason: "נדרש גמר מגן", dekelQuerySeeds: ["צביעת פלדה"] }]);
  const gaps = sanitizeScopeInventory([{ id: "paint-curing", packageId: "paint", packageTitle: "צביעה", stage: "testing_handover", title: "המתנה לייבוש הצבע לפני בדיקה", reason: "נדרשת התקשות", dekelQuerySeeds: ["ייבוש צבע"] }]);
  const result = applyScopeInventoryAdjudication(inventory, gaps, {
    accepted: true,
    newOperations: [],
    coveredGaps: [{ gapId: "paint-curing", disposition: "execution_detail", operationId: "paint-primary", reason: "כלול במחזור הצביעה" }],
  });
  assert.deepEqual(result?.[0].includedRequirements, ["המתנה לייבוש הצבע לפני בדיקה"]);
  assert.equal(result?.length, 1);
});

test("арбитр заменяет ошибочный способ вмешательства, а не оставляет ремонт рядом с заменой", () => {
  const inventory = sanitizeScopeInventory([
    { id: "opening-repair", packageId: "openings", packageTitle: "פתחים", stage: "primary_work", title: "תיקון פריט קיים", reason: "נבחר תיקון נקודתי", dekelQuerySeeds: ["תיקון פריט קיים"] },
    { id: "opening-finish", packageId: "openings", packageTitle: "פתחים", stage: "reinstatement", title: "תיקוני גמר היקפיים", reason: "נדרש לאחר העבודה", dekelQuerySeeds: ["תיקוני גמר סביב פתח"] },
  ]);
  const gaps = sanitizeScopeInventory([
    { id: "opening-replacement", packageId: "openings", packageTitle: "פתחים", stage: "primary_work", title: "החלפת פריט קיים בפריט חדש", reason: "המצב, הייעוד והקשר השיפוץ מצדיקים החלפה ולא תיקון", dekelQuerySeeds: ["פירוק והחלפת פריט קיים", "אספקה והתקנת פריט חדש"] },
  ]);
  const result = applyScopeInventoryAdjudication(inventory, gaps, {
    accepted: true,
    supersededOperations: [{ operationId: "opening-repair", replacementOperationIds: ["opening-replacement"], reason: "החלפה מקצועית של תרחיש התיקון" }],
    newOperations: [{
      id: "opening-replacement",
      packageId: "openings",
      packageTitle: "פתחים",
      stage: "primary_work",
      title: "החלפת פריט קיים בפריט חדש",
      reason: "הכרעה מקצועית לפי מצב, התאמה לייעוד והקשר הפרויקט",
      dekelQuerySeeds: ["פירוק והחלפת פריט קיים", "אספקה והתקנת פריט חדש"],
      sourceGapIds: ["opening-replacement"],
    }],
    coveredGaps: [],
  });

  assert.ok(result);
  assert.equal(result?.some((operation) => operation.id === "opening-repair"), false);
  assert.equal(result?.some((operation) => operation.id === "opening-replacement"), true);
  assert.equal(result?.some((operation) => operation.id === "opening-finish"), true);
});

test("арбитр не может удалить нейтральную операцию только из-за общего packageId", () => {
  const inventory = sanitizeScopeInventory([
    { id: "opening-repair", packageId: "openings", packageTitle: "פתחים", stage: "primary_work", title: "תיקון פריט קיים", reason: "תרחיש תיקון", dekelQuerySeeds: ["תיקון"] },
    { id: "opening-demolition", packageId: "openings", packageTitle: "פתחים", stage: "demolition_enabling", title: "פירוק מבוקר", reason: "נדרש גם בהחלפה", dekelQuerySeeds: ["פירוק"] },
  ]);
  const gaps = sanitizeScopeInventory([{ id: "opening-replacement", packageId: "openings", packageTitle: "פתחים", stage: "primary_work", title: "החלפת פריט", reason: "נדרשת החלפה", dekelQuerySeeds: ["החלפה"] }]);
  const result = applyScopeInventoryAdjudication(inventory, gaps, {
    accepted: true,
    supersededOperations: [{ operationId: "opening-demolition", replacementOperationIds: ["opening-replacement"], reason: "ניסיון מחיקה שגוי" }],
    newOperations: [{ id: "opening-replacement", packageId: "openings", packageTitle: "פתחים", stage: "primary_work", title: "החלפת פריט", reason: "נדרשת החלפה", dekelQuerySeeds: ["החלפה"], sourceGapIds: ["opening-replacement"] }],
    coveredGaps: [],
  });
  assert.equal(result, null);
});

test("одна лишняя попытка supersession не отбрасывает остальные проверенные решения арбитра", () => {
  const inventory = sanitizeScopeInventory([
    { id: "roof-local", packageId: "roof", packageTitle: "גג", stage: "primary_work", title: "החלפה מקומית של פחי גג פגומים", reason: "תרחיש מקומי ישן", dekelQuerySeeds: ["החלפת לוח פח פגום בגג"] },
    { id: "roof-inspection", packageId: "roof", packageTitle: "גג", stage: "preparation", title: "בדיקת חיפוי הגג הקיים", reason: "בדיקה קיימת", dekelQuerySeeds: ["בדיקת גג פח קיים"] },
  ]);
  const gaps = sanitizeScopeInventory([
    { id: "roof-full", packageId: "roof", packageTitle: "גג", stage: "primary_work", title: "אספקה והתקנה של חיפוי גג מתכת חדש במלוא השטח", reason: "נבחרה החלפה מלאה", dekelQuerySeeds: ["אספקה והתקנת גג פח חדש בכל השטח"] },
    { id: "roof-structure-check", packageId: "roof", packageTitle: "גג", stage: "preparation", title: "בדיקת מרישים לאחר פירוק הגג", reason: "נדרש לאחר חשיפה", dekelQuerySeeds: ["בדיקת מרישי פלדה לאחר פירוק גג"] },
  ]);
  const result = applyScopeInventoryAdjudication(inventory, gaps, {
    accepted: true,
    supersededOperations: [
      { operationId: "roof-local", replacementOperationIds: ["roof-full"], reason: "העבודה המלאה מחליפה את ההחלפה המקומית" },
      { operationId: "roof-inspection", replacementOperationIds: ["roof-structure-check"], reason: "ניסיון מיותר למחוק בדיקה אחרת" },
    ],
    newOperations: gaps.map((operation) => ({ ...operation, sourceGapIds: [operation.id] })),
    coveredGaps: [],
  });
  assert.ok(result);
  assert.equal(result?.some((operation) => operation.id === "roof-local"), false);
  assert.equal(result?.some((operation) => operation.id === "roof-full"), true);
  assert.equal(result?.some((operation) => operation.id === "roof-inspection"), true);
  assert.equal(result?.some((operation) => operation.id === "roof-structure-check"), true);
});

test("арбитр отклоняет итог с одновременными ремонтом и заменой одного рабочего пакета", () => {
  const inventory = sanitizeScopeInventory([{ id: "door-repair-old", packageId: "door", packageTitle: "דלת", stage: "primary_work", title: "תיקון דלת קיימת", reason: "תרחיש ישן", dekelQuerySeeds: ["תיקון דלת"] }]);
  const gaps = sanitizeScopeInventory([
    { id: "door-replace", packageId: "door", packageTitle: "דלת", stage: "primary_work", title: "החלפת דלת קיימת בדלת חדשה", reason: "נדרשת החלפה", dekelQuerySeeds: ["החלפת דלת"] },
    { id: "door-repair-new", packageId: "door", packageTitle: "דלת", stage: "primary_work", title: "חיזוק ותיקון דלת קיימת", reason: "חלופת תיקון", dekelQuerySeeds: ["חיזוק דלת"] },
  ]);
  const result = applyScopeInventoryAdjudication(inventory, gaps, {
    accepted: true,
    supersededOperations: [{ operationId: "door-repair-old", replacementOperationIds: ["door-replace"], reason: "נבחרה החלפה" }],
    newOperations: [
      { ...gaps[0], sourceGapIds: ["door-replace"] },
      { ...gaps[1], sourceGapIds: ["door-repair-new"] },
    ],
    coveredGaps: [],
  });
  assert.equal(result, null);
});

test("консервативный fallback вмешательства не зависит от порядка и предпочитает замену ремонту", () => {
  const inventory = sanitizeScopeInventory([{ id: "door-repair-old", packageId: "door", packageTitle: "דלת", stage: "primary_work", title: "תיקון דלת קיימת", reason: "תרחיש ישן", dekelQuerySeeds: ["תיקון דלת"] }]);
  const repair = sanitizeScopeInventory([{ id: "door-repair-new", packageId: "door", packageTitle: "דלת", stage: "primary_work", title: "חיזוק דלת קיימת", reason: "חלופת תיקון", dekelQuerySeeds: ["חיזוק דלת"] }])[0];
  const replacement = sanitizeScopeInventory([{ id: "door-replace", packageId: "door", packageTitle: "דלת", stage: "primary_work", title: "החלפת דלת קיימת בדלת חדשה", reason: "נדרשת החלפה", dekelQuerySeeds: ["החלפת דלת"] }])[0];
  const forward = mergeScopeCandidatesConservatively(inventory, [replacement, repair]);
  const reverse = mergeScopeCandidatesConservatively(inventory, [repair, replacement]);
  assert.deepEqual(forward.map((operation) => operation.id).sort(), reverse.map((operation) => operation.id).sort());
  assert.deepEqual(forward.map((operation) => operation.id), ["door-replace"]);
});

test("одинаковый ID разных пробелов критиков не скрывает ни одну работу", () => {
  const groups = [
    sanitizeScopeInventory([{ id: "shared-gap", packageId: "doors", packageTitle: "דלתות", stage: "primary_work", title: "החלפת דלת", reason: "מצב ירוד", dekelQuerySeeds: ["החלפת דלת"] }]),
    sanitizeScopeInventory([{ id: "shared-gap", packageId: "roof", packageTitle: "גג", stage: "primary_work", title: "איטום גג", reason: "חדירת מים", dekelQuerySeeds: ["איטום גג"] }]),
  ];
  const merged = mergeScopeCriticCandidates(groups);
  assert.equal(merged.length, 2);
  assert.equal(new Set(merged.map((operation) => operation.id)).size, 2);
  assert.deepEqual(new Set(merged.map((operation) => operation.packageId)), new Set(["doors", "roof"]));
});

test("критики с разными формулировками не дублируют одну и ту же операцию кровли", () => {
  const groups = [
    sanitizeScopeInventory([{ id: "roof-cover-a", packageId: "roof", packageTitle: "גג", stage: "primary_work", title: "Поставка и монтаж нового металлического покрытия кровли по всей площади", reason: "Нужна замена", dekelQuerySeeds: ["אספקה והתקנת גג פח חדש", "לוחות כיסוי מתכת לגג משופע"] }]),
    sanitizeScopeInventory([{ id: "roof-cover-b", packageId: "roof", packageTitle: "גג", stage: "primary_work", title: "Поставка и монтаж нового металлического покрытия кровли", reason: "Подтверждено вторым чтением", dekelQuerySeeds: ["אספקה והתקנת גג פח חדש", "גג מפח פרופילי"] }]),
  ];

  const merged = mergeScopeCriticCandidates(groups);

  assert.equal(merged.length, 1);
  assert.deepEqual(new Set(merged[0].dekelQuerySeeds), new Set(["אספקה והתקנת גג פח חדש", "לוחות כיסוי מתכת לגג משופע", "גג מפח פרופילי"]));
});

test("разные предметные результаты одной стадии не сливаются из-за общего рабочего пакета", () => {
  const groups = [
    sanitizeScopeInventory([{ id: "vent-equipment", packageId: "vent", packageTitle: "אוורור", stage: "primary_work", title: "Поставка и монтаж вентиляционных установок", reason: "Нужно оборудование", dekelQuerySeeds: ["מפוח אוורור מכני", "יחידת אוורור לאולם"] }]),
    sanitizeScopeInventory([{ id: "vent-ducts", packageId: "vent", packageTitle: "אוורור", stage: "primary_work", title: "Монтаж воздуховодов, фасонных частей и решёток", reason: "Нужна сеть", dekelQuerySeeds: ["תעלות מיזוג ואוורור", "אביזרי תעלות אוויר", "רשתות אוורור"] }]),
  ];

  const merged = mergeScopeCriticCandidates(groups);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((operation) => operation.id), ["vent-equipment", "vent-ducts"]);
});

test("варианты одного вентиляционного пакета объединяются без дублирования комплексной строки", () => {
  const groups = [
    sanitizeScopeInventory([
      { id: "vent-plan", packageId: "replacement-ventilation", packageTitle: "Компенсирующая вентиляция", stage: "preparation", title: "Обмер помещения и определение трасс вентиляции", reason: "Нужны исходные данные", dekelQuerySeeds: ["מדידת מערכת אוורור מכני", "תכנון תוואי תעלות אוורור"] },
      { id: "vent-system", packageId: "replacement-ventilation", packageTitle: "Компенсирующая вентиляция", stage: "primary_work", title: "Поставка и монтаж механической вентиляции", reason: "Нужна готовая система", dekelQuerySeeds: ["מערכת אוורור מכני", "מפוחי אספקה ופליטת אוויר", "תעלות אוורור למבנה", "תריסי אוויר ורשתות"] },
      { id: "vent-interfaces-a", packageId: "replacement-ventilation", packageTitle: "Компенсирующая вентиляция", stage: "interfaces_connections", title: "Подвесы, проходки, питание, управление и герметизация вентиляции", reason: "Нужны интерфейсы", dekelQuerySeeds: ["תליות לתעלות אוורור", "איטום חדירת תעלת אוורור", "הזנת חשמל למפוח", "בקרת מערכת אוורור"] },
      { id: "vent-test-a", packageId: "replacement-ventilation", packageTitle: "Компенсирующая вентиляция", stage: "testing_handover", title: "Пуск, балансировка и проверка расхода воздуха", reason: "Нужна приёмка", dekelQuerySeeds: ["הפעלה ואיזון מערכת אוורור", "מדידת ספיקת אוויר"] },
    ]),
    sanitizeScopeInventory([
      { id: "vent-equipment", packageId: "mechanical-ventilation", packageTitle: "Новая механическая вентиляция", stage: "primary_work", title: "Поставка и монтаж вентиляционных установок или вентиляторов", reason: "Нужно оборудование", dekelQuerySeeds: ["מפוח אוורור מכני", "יחידת אוורור לאולם"] },
      { id: "vent-ducts", packageId: "mechanical-ventilation", packageTitle: "Новая механическая вентиляция", stage: "primary_work", title: "Воздуховоды, фасонные части, решётки и наружные жалюзи", reason: "Нужна сеть", dekelQuerySeeds: ["תעלות מיזוג ואוורור", "אביזרי תעלות אוויר", "תריסי אוויר ורשתות אוורור"] },
      { id: "vent-interfaces-b", packageId: "mechanical-ventilation", packageTitle: "Новая механическая вентиляция", stage: "interfaces_connections", title: "Подвесы, проходки, герметизация, питание и управление вентиляцией", reason: "Нужны интерфейсы", dekelQuerySeeds: ["מתלים לתעלות אוויר", "איטום מעבר תעלת אוויר", "הזנת חשמל למפוח", "בקרת מערכת אוורור"] },
      { id: "vent-test-b", packageId: "mechanical-ventilation", packageTitle: "Новая механическая вентиляция", stage: "testing_handover", title: "Пуск, проверка расходов воздуха и балансировка вентиляции", reason: "Нужна приёмка", dekelQuerySeeds: ["הפעלת מערכת אוורור", "מדידת ספיקות אוויר", "איזון מערכת אוורור"] },
    ]),
  ];

  const merged = mergeScopeCriticCandidates(groups);

  assert.equal(merged.length, 5);
  assert.equal(new Set(merged.map((operation) => operation.packageId)).size, 1);
  assert.equal(merged.some((operation) => operation.id === "vent-system"), false);
  assert.equal(merged.some((operation) => operation.id === "vent-equipment"), true);
  assert.equal(merged.some((operation) => operation.id === "vent-ducts"), true);
  assert.equal(merged.filter((operation) => operation.stage === "interfaces_connections").length, 1);
  assert.equal(merged.filter((operation) => operation.stage === "testing_handover").length, 1);
});

test("одинаковый одиночный пакет приёмки проёмов объединяется даже при разных packageId", () => {
  const groups = [
    sanitizeScopeInventory([{ id: "closures-test", packageId: "external-openings-closure-testing", packageTitle: "Приёмка закрытых проёмов", stage: "testing_handover", title: "Проверка креплений, отделки и водонепроницаемости новых закрытий", reason: "Нужна приёмка", dekelQuerySeeds: ["בדיקת אטימות סגירת פתחים", "בדיקת עיגון מילוי פתח"] }]),
    sanitizeScopeInventory([{ id: "envelope-test", packageId: "openings-closure-testing", packageTitle: "Испытания закрытых проёмов", stage: "testing_handover", title: "Контроль крепления и водонепроницаемости новых закрытий проёмов", reason: "Нужна проверка", dekelQuerySeeds: ["בדיקת אטימות פתחים במעטפת", "בדיקת עיגון מילוי פתח"] }]),
  ];

  const merged = mergeScopeCriticCandidates(groups);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].includedRequirements.includes("Проверка креплений, отделки и водонепроницаемости новых закрытий"), false);
});

test("порядок критиков не меняет смысловой результат сведения", () => {
  const first = sanitizeScopeInventory([{ id: "roof-a", packageId: "roof", packageTitle: "Кровля", stage: "primary_work", title: "Поставка и монтаж нового металлического покрытия кровли", reason: "Замена", dekelQuerySeeds: ["אספקה והתקנת גג פח חדש"] }]);
  const second = sanitizeScopeInventory([{ id: "roof-b", packageId: "roof", packageTitle: "Кровля", stage: "primary_work", title: "Монтаж нового металлического кровельного покрытия", reason: "Полная замена", dekelQuerySeeds: ["אספקה והתקנת גג פח חדש", "גג מפח פרופילי"] }]);

  const normalize = (operations: ReturnType<typeof mergeScopeCriticCandidates>) => operations.map((operation) => ({
    packageId: operation.packageId,
    stage: operation.stage,
    title: operation.title,
    seeds: [...operation.dekelQuerySeeds].sort(),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  assert.deepEqual(normalize(mergeScopeCriticCandidates([first, second])), normalize(mergeScopeCriticCandidates([second, first])));
});

test("консервативный fallback не объединяет одинаковый ID у разных операций", () => {
  const inventory = sanitizeScopeInventory([{ id: "shared", packageId: "doors", packageTitle: "Двери", stage: "demolition_enabling", title: "Демонтаж существующей двери", reason: "Нужен демонтаж", dekelQuerySeeds: ["פירוק דלת קיימת"] }]);
  const gaps = sanitizeScopeInventory([{ id: "shared", packageId: "doors", packageTitle: "Двери", stage: "primary_work", title: "Поставка и монтаж новой двери", reason: "Нужна новая дверь", dekelQuerySeeds: ["אספקה והתקנת דלת חדשה"] }]);

  const merged = mergeScopeCandidatesConservatively(inventory, gaps);

  assert.equal(merged.length, 2);
  assert.equal(new Set(merged.map((operation) => operation.id)).size, 2);
  assert.deepEqual(new Set(merged.map((operation) => operation.stage)), new Set(["demolition_enabling", "primary_work"]));
});

test("полная замена под другим packageId целиком вытесняет альтернативный пакет ремонта того же результата", () => {
  const inventory = sanitizeScopeInventory([
    { id: "roof-repair-prep", packageId: "metal-roof-restoration", packageTitle: "Восстановление металлической кровли", stage: "preparation", title: "Очистка повреждённых участков", reason: "Сценарий ремонта", dekelQuerySeeds: ["ניקוי חלודה מגג מתכת"] },
    { id: "roof-repair", packageId: "metal-roof-restoration", packageTitle: "Восстановление металлической кровли", stage: "primary_work", title: "Локальный ремонт существующей металлической кровли", reason: "Сценарий ремонта", dekelQuerySeeds: ["תיקון גג מתכת קיים"] },
    { id: "roof-repair-test", packageId: "metal-roof-restoration", packageTitle: "Восстановление металлической кровли", stage: "testing_handover", title: "Проверка кровли после ремонта", reason: "Приёмка ремонта", dekelQuerySeeds: ["בדיקת אטימות גג מתכת"] },
  ]);
  const gaps = sanitizeScopeInventory([
    { id: "roof-replace-demo", packageId: "metal-roof-replacement", packageTitle: "Полная замена металлической кровли", stage: "demolition_enabling", title: "Полный демонтаж существующей кровли", reason: "Сценарий полной замены", dekelQuerySeeds: ["פירוק מלא של גג פח"] },
    { id: "roof-replace", packageId: "metal-roof-replacement", packageTitle: "Полная замена металлической кровли", stage: "primary_work", title: "Поставка и монтаж новой металлической кровли", reason: "Сценарий полной замены", dekelQuerySeeds: ["אספקה והתקנת גג פח חדש"] },
    { id: "roof-replace-interface", packageId: "metal-roof-replacement", packageTitle: "Полная замена металлической кровли", stage: "interfaces_connections", title: "Новые конёк, края, крепления и примыкания", reason: "Нужен законченный результат", dekelQuerySeeds: ["רוכב והבזקי פח לגג חדש"] },
    { id: "roof-replace-test", packageId: "metal-roof-replacement", packageTitle: "Полная замена металлической кровли", stage: "testing_handover", title: "Проверка новой кровли", reason: "Приёмка замены", dekelQuerySeeds: ["בדיקת אטימות גג פח חדש"] },
  ]);

  const merged = mergeScopeCandidatesConservatively(inventory, gaps);

  assert.equal(merged.some((operation) => operation.packageId === "metal-roof-restoration"), false);
  assert.deepEqual(new Set(merged.map((operation) => operation.id)), new Set(gaps.map((operation) => operation.id)));
});

test("конкретное покрытие заменяет общие строки результата, но сохраняет уникальные демонтаж и подготовку", () => {
  const groups = [
    sanitizeScopeInventory([
      { id: "floor-demo", packageId: "finished-floor-replacement", packageTitle: "Замена покрытия пола", stage: "demolition_enabling", title: "Демонтаж существующего покрытия", reason: "Нужно освободить основание", dekelQuerySeeds: ["פירוק ריצוף קיים"] },
      { id: "floor-check", packageId: "finished-floor-replacement", packageTitle: "Замена покрытия пола", stage: "preparation", title: "Проверка и ремонт основания", reason: "Нужно прочное основание", dekelQuerySeeds: ["בדיקת לחות תשתית רצפה", "תיקון תשתית לפני ריצוף"] },
      { id: "floor-generic", packageId: "finished-floor-replacement", packageTitle: "Замена покрытия пола", stage: "primary_work", title: "Новое сплошное финишное покрытие пола", reason: "Нужен новый пол", dekelQuerySeeds: ["מערכת ריצוף גמר חדשה"] },
      { id: "floor-edge-generic", packageId: "finished-floor-replacement", packageTitle: "Замена покрытия пола", stage: "interfaces_connections", title: "Плинтусы и края нового покрытия", reason: "Нужно завершение", dekelQuerySeeds: ["פנל לריצוף", "פרופיל מעבר לרצפה"] },
      { id: "floor-test-generic", packageId: "finished-floor-replacement", packageTitle: "Замена покрытия пола", stage: "testing_handover", title: "Приёмка нового покрытия", reason: "Нужна проверка", dekelQuerySeeds: ["בדיקת קבלת ריצוף חדש"] },
    ]),
    sanitizeScopeInventory([
      { id: "rubber-prep", packageId: "sports-rubber-flooring", packageTitle: "Спортивное резиновое покрытие", stage: "preparation", title: "Грунтование под приклеиваемое резиновое покрытие", reason: "Нужна подготовка материала", dekelQuerySeeds: ["פריימר לריצוף גומי"] },
      { id: "rubber-floor", packageId: "sports-rubber-flooring", packageTitle: "Спортивное резиновое покрытие", stage: "primary_work", title: "Поставка и приклеивание спортивного резинового покрытия", reason: "Материал определён", dekelQuerySeeds: ["ריצוף גומי ספורטיבי"] },
      { id: "rubber-edge", packageId: "sports-rubber-flooring", packageTitle: "Спортивное резиновое покрытие", stage: "interfaces_connections", title: "Резиновые плинтусы и переходные профили", reason: "Нужно завершение", dekelQuerySeeds: ["פנל גומי", "פרופיל מעבר לריצוף גומי"] },
      { id: "rubber-test", packageId: "sports-rubber-flooring", packageTitle: "Спортивное резиновое покрытие", stage: "testing_handover", title: "Приёмка приклейки и стыков резинового покрытия", reason: "Нужна проверка", dekelQuerySeeds: ["בדיקת קבלת ריצוף גומי"] },
    ]),
  ];

  const merged = mergeScopeCriticCandidates(groups);

  assert.equal(merged.some((operation) => operation.id === "floor-generic"), false);
  assert.equal(merged.some((operation) => operation.id === "floor-edge-generic"), false);
  assert.equal(merged.some((operation) => operation.id === "floor-test-generic"), false);
  assert.equal(merged.some((operation) => operation.id === "floor-demo"), true);
  assert.equal(merged.some((operation) => operation.id === "floor-check"), true);
  assert.equal(merged.some((operation) => operation.id === "rubber-prep"), true);
  assert.equal(new Set(merged.map((operation) => operation.packageId)).size, 1);
});

test("арбитр полноты отклоняет решение, которое не классифицировало каждый пробел", () => {
  const inventory = sanitizeScopeInventory([{ id: "pipe-primary", packageId: "pipe", packageTitle: "צנרת", stage: "primary_work", title: "הנחת צינור", reason: "נדרש קו חדש", dekelQuerySeeds: ["הנחת צינור"] }]);
  const gaps = sanitizeScopeInventory([
    { id: "pipe-test", packageId: "pipe", packageTitle: "צנרת", stage: "testing_handover", title: "בדיקת לחץ", reason: "נדרש לפני מסירה", dekelQuerySeeds: ["בדיקת לחץ"] },
    { id: "pipe-reinstatement", packageId: "pipe", packageTitle: "צנרת", stage: "reinstatement", title: "השבת ריצוף", reason: "נדרש לאחר החפירה", dekelQuerySeeds: ["השבת ריצוף"] },
  ]);
  const result = applyScopeInventoryAdjudication(inventory, gaps, {
    accepted: true,
    newOperations: [],
    coveredGaps: [{ gapId: "pipe-test", disposition: "covered_by_existing_operation", operationId: "pipe-primary", reason: "נכלל בבדיקת הקו" }],
  });
  assert.equal(result, null);
});

test("консервативное сведение не теряет пробелы и заменяет единственный противоположный сценарий вмешательства", () => {
  const inventory = sanitizeScopeInventory([
    { id: "item-repair", packageId: "item", packageTitle: "פריט", stage: "primary_work", title: "תיקון וחיזוק הפריט הקיים", reason: "תרחיש ראשון", dekelQuerySeeds: ["תיקון פריט קיים"] },
    { id: "item-finish", packageId: "item", packageTitle: "פריט", stage: "reinstatement", title: "תיקוני גמר לאחר העבודה", reason: "נדרש בכל תרחיש", dekelQuerySeeds: ["תיקוני גמר"] },
  ]);
  const gaps = sanitizeScopeInventory([
    { id: "item-replacement", packageId: "item", packageTitle: "פריט", stage: "primary_work", title: "החלפת הפריט הקיים בפריט חדש", reason: "המצב מחייב החלפה", dekelQuerySeeds: ["אספקה והתקנת פריט חדש"] },
    { id: "item-test", packageId: "item", packageTitle: "פריט", stage: "testing_handover", title: "בדיקת תפקוד לאחר ההתקנה", reason: "נדרשת מסירה תקינה", dekelQuerySeeds: ["בדיקת תפקוד"] },
  ]);

  const merged = mergeScopeCandidatesConservatively(inventory, gaps);

  assert.equal(merged.some((operation) => operation.id === "item-repair"), false);
  assert.equal(merged.some((operation) => operation.id === "item-replacement"), true);
  assert.equal(merged.some((operation) => operation.id === "item-finish"), true);
  assert.equal(merged.some((operation) => operation.id === "item-test"), true);
});

test("полнота подтверждается только существующей и оценённой строкой DEKEL", () => {
  const inventory = sanitizeScopeInventory([{ id: "pipe-test", packageId: "pipe", packageTitle: "צנרת", stage: "testing_handover", title: "בדיקת לחץ", reason: "נדרש לפני מסירה", dekelQuerySeeds: ["בדיקת לחץ לצנרת"] }]);
  const resolutions = [{ operationId: "pipe-test", disposition: "separate_boq_row" as const, boqRowIds: ["row-test"], allowedDekelCodes: ["95.01"], reason: "משולם בנפרד" }];
  const blocked = auditScopeIntegrity({ inventory, resolutions, boqRows: [{ id: "row-test" }], selectedDekelByRowId: new Map(), sourceFingerprint: "source", boqFingerprint: "boq" });
  assert.equal(blocked.status, "needs_review");
  const complete = auditScopeIntegrity({ inventory, resolutions, boqRows: [{ id: "row-test" }], selectedDekelByRowId: new Map([["row-test", "95.01"]]), sourceFingerprint: "source", boqFingerprint: "boq" });
  assert.equal(complete.status, "complete");
});

test("чужой код DEKEL и повторное использование одной строки не закрывают разные операции", () => {
  const inventory = sanitizeScopeInventory([
    { id: "prepare", packageId: "pkg", packageTitle: "עבודה", stage: "preparation", title: "הכנה", reason: "נדרש", dekelQuerySeeds: ["הכנת שטח"] },
    { id: "primary", packageId: "pkg", packageTitle: "עבודה", stage: "primary_work", title: "ביצוע", reason: "נדרש", dekelQuerySeeds: ["ביצוע עבודה"] },
  ]);
  const resolutions = inventory.map((operation) => ({ operationId: operation.id, disposition: "separate_boq_row" as const, boqRowIds: ["same-row"], allowedDekelCodes: [operation.id === "prepare" ? "95.prepare" : "95.primary"], reason: "שורה נפרדת" }));
  const result = auditScopeIntegrity({ inventory, resolutions, boqRows: [{ id: "same-row" }], selectedDekelByRowId: new Map([["same-row", "95.foreign"]]), sourceFingerprint: "source", boqFingerprint: "boq" });
  assert.equal(result.status, "needs_review");
  assert.ok(result.blockers.some((blocker) => blocker.startsWith("scope_row_reused:") || blocker.startsWith("scope_row_wrong_dekel:")));
});

test("комплексная строка DEKEL имеет одного оплачиваемого владельца, а остальные операции входят в её цену", () => {
  const inventory = sanitizeScopeInventory([
    { id: "door-supply", packageId: "doors", packageTitle: "דלתות", stage: "primary_work", title: "אספקת דלת", reason: "נדרש", dekelQuerySeeds: ["דלת פלדה חדשה"] },
    { id: "door-install", packageId: "doors", packageTitle: "דלתות", stage: "interfaces_connections", title: "התקנת דלת", reason: "נדרש", dekelQuerySeeds: ["התקנת דלת פלדה"] },
  ]);
  const resolutions = [
    { operationId: "door-supply", disposition: "separate_boq_row" as const, boqRowIds: ["door-complete"], allowedDekelCodes: ["95.door.complete"], reason: "התוצאה הראשית משולמת בשורת קומפלט" },
    { operationId: "door-install", disposition: "included_in_dekel_price" as const, boqRowIds: ["door-complete"], dekelCode: "95.door.complete", coveredByOperationId: "door-supply", includedExcerpt: "אספקה והתקנה", inclusionVerified: true, allowedDekelCodes: ["95.door.complete"], reason: "ההתקנה כלולה במפורש במחיר הקומפלט" },
  ];
  const result = auditScopeIntegrity({
    inventory,
    resolutions,
    boqRows: [{ id: "door-complete" }],
    selectedDekelByRowId: new Map([["door-complete", "95.door.complete"]]),
    sourceFingerprint: "source",
    boqFingerprint: "boq",
  });
  assert.equal(result.status, "complete");
});

test("проверяемое включение по Синей книге сохраняет точный источник и страницу", () => {
  const inventory = sanitizeScopeInventory([
    { id: "hvac-system", packageId: "hvac", packageTitle: "מיזוג", stage: "primary_work", title: "מערכת מיזוג", reason: "נדרש", dekelQuerySeeds: ["מערכת מיזוג מושלמת"] },
    { id: "hvac-commissioning", packageId: "hvac", packageTitle: "מיזוג", stage: "testing_handover", title: "הפעלה ומסירה", reason: "נדרש", dekelQuerySeeds: ["הפעלת מערכת מיזוג"] },
  ]);
  const [resolution] = sanitizeScopeResolutions([{
    operationId: "hvac-commissioning",
    disposition: "included_in_dekel_price",
    boqRowIds: ["hvac-complete"],
    dekelCode: "95.15.80.0001",
    coveredByOperationId: "hvac-system",
    includedExcerpt: "כל פריט יימדד כשהוא מושלם, קבוע במקומו ומוכן להפעלה",
    inclusionBasis: "blue_book",
    inclusionSourceFileName: "פרק 15 מתקני מיזוג אוויר.pdf",
    inclusionSourcePage: 61,
    reason: "ההפעלה היא חלק מתוצאה מושלמת ומוכנה להפעלה",
  }], inventory);
  assert.equal(resolution.inclusionBasis, "blue_book");
  assert.equal(resolution.inclusionSourceFileName, "פרק 15 מתקני מיזוג אוויר.pdf");
  assert.equal(resolution.inclusionSourcePage, 61);
  assert.equal(resolution.inclusionVerified, false);
});

test("Синяя книга подтверждает включение только формулировкой состава цены или законченного результата", () => {
  assert.equal(blueBookExcerptSupportsInclusion("המחיר כולל חומרים, חפיפות, פרטים ובדיקות כנדרש"), true);
  assert.equal(blueBookExcerptSupportsInclusion("כל פריט יימדד כשהוא מושלם, קבוע במקומו ומוכן להפעלה"), true);
  assert.equal(blueBookExcerptSupportsInclusion("עבודות איטום יבוצעו לאחר הכנת התשתית"), false);
  assert.equal(blueBookExcerptSupportsInclusion("בדיקת הצפה תימדד בנפרד"), false);
});

test("поиск Синей книги для DEKEL-пакета не размывается работами других глав документа", () => {
  const query = buildScopeClosureKnowledgeQuery([{
    key: "door-install",
    packageId: "doors",
    packageTitle: "דלתות",
    stage: "primary_work",
    requiredWork: "אספקה והתקנת דלת פלדה חדשה",
    reason: "החלפת דלתות",
    catalogQueries: ["דלת פלדה קומפלט"],
    includedRequirements: ["פרזול", "משקוף", "גמר"],
    candidates: [{ code: "95.06.30.0001", description: "דלת פלדה קומפלט כולל משקוף ופרזול", unit: "יחידה", chapter: "06", sourceRow: "1" }],
  }]);
  assert.match(query, /95\.06\.30\.0001/);
  assert.match(query, /דלת פלדה קומפלט/);
  assert.match(query, /תכולת המחירים ואופני המדידה/);
  assert.doesNotMatch(query, /95\.15|מיזוג|פרק 15/);
});

test("scope closure получает уже выбранную предметную строку DEKEL и не подменяет её новым пустым дублем", () => {
  const coverage = [{
    key: "door-new",
    packageId: "doors",
    packageTitle: "דלתות",
    stage: "primary_work" as const,
    requiredWork: "אספקה והתקנת דלת פלדה חיצונית דו כנפית חדשה",
    reason: "החלפת דלתות",
    catalogQueries: ["דלת פלדה דו כנפית"],
    includedRequirements: ["משקוף", "עיגון", "כיוון"],
    candidates: [{ code: "95.06.30.0016", description: "דלת דו כנפית מפח מגולוון ומשקוף פח מגולוון", unit: "unit", chapter: "06", sourceRow: "3016" }],
  }];
  const rows = [
    { id: "door-selected", code: "95.06.30.0016", description: "אספקה והתקנה של דלת פלדה דו כנפית חדשה", unit: "יח׳", quantity: 2, unitPrice: 6060, category: "דלתות" },
    { id: "foreign-selected", code: "95.15.25.0089", description: "מזגן מיני מרכזי", unit: "יח׳", quantity: 1, unitPrice: 9400, category: "מיזוג" },
  ];
  assert.deepEqual(buildPreselectedScopeRows(coverage, rows), [{
    operationId: "door-new",
    rows: [{ rowId: "door-selected", dekelCode: "95.06.30.0016", description: "אספקה והתקנה של דלת פלדה דו כנפית חדשה", unit: "יח׳", quantity: 2 }],
  }]);
});


test("включение по Синей книге без файла и страницы отклоняется до расчёта", () => {
  const inventory = sanitizeScopeInventory([
    { id: "owner", packageId: "pkg", packageTitle: "מערכת", stage: "primary_work", title: "מערכת מושלמת", reason: "נדרש", dekelQuerySeeds: ["מערכת מושלמת"] },
    { id: "test", packageId: "pkg", packageTitle: "מערכת", stage: "testing_handover", title: "בדיקה", reason: "נדרש", dekelQuerySeeds: ["בדיקת מערכת"] },
  ]);
  const resolutions = sanitizeScopeResolutions([
    { operationId: "owner", disposition: "separate_boq_row", boqRowIds: ["row"], reason: "תוצאה ראשית" },
    { operationId: "test", disposition: "included_in_dekel_price", boqRowIds: ["row"], dekelCode: "95.15.00.0001", coveredByOperationId: "owner", includedExcerpt: "פריט מושלם ומוכן להפעלה", inclusionBasis: "blue_book", reason: "כלול" },
  ], inventory);
  assert.ok(validateScopeResolutionStructure(resolutions, inventory).includes("scope_inclusion_source_invalid:test"));
});

test("несколько самостоятельных операций не становятся отдельными строками через один и тот же BOQ id", () => {
  const inventory = sanitizeScopeInventory([
    { id: "door-supply", packageId: "doors", packageTitle: "דלתות", stage: "primary_work", title: "אספקת דלת", reason: "נדרש", dekelQuerySeeds: ["דלת פלדה חדשה"] },
    { id: "door-install", packageId: "doors", packageTitle: "דלתות", stage: "interfaces_connections", title: "התקנת דלת", reason: "נדרש", dekelQuerySeeds: ["התקנת דלת פלדה"] },
  ]);
  const resolutions = inventory.map((operation) => ({ operationId: operation.id, disposition: "separate_boq_row" as const, boqRowIds: ["door-complete"], allowedDekelCodes: ["95.door.complete"], reason: "שורה נפרדת" }));
  const result = auditScopeIntegrity({ inventory, resolutions, boqRows: [{ id: "door-complete" }], selectedDekelByRowId: new Map([["door-complete", "95.door.complete"]]), sourceFingerprint: "source", boqFingerprint: "boq" });
  assert.equal(result.status, "needs_review");
  assert.ok(result.blockers.some((blocker) => blocker.startsWith("scope_row_reused:")));
});

test("дублирующая ссылка single+multi остаётся явным блокером без эвристического удаления", () => {
  const inventory = sanitizeScopeInventory([
    { id: "door-supply", packageId: "doors", packageTitle: "דלתות", stage: "primary_work", title: "אספקת דלת", reason: "נדרש", dekelQuerySeeds: ["דלת פלדה חדשה"] },
    { id: "door-hardware", packageId: "doors", packageTitle: "דלתות", stage: "interfaces_connections", title: "פרזול לדלת", reason: "נדרש", dekelQuerySeeds: ["פרזול לדלת"] },
    { id: "door-test", packageId: "doors", packageTitle: "דלתות", stage: "testing_handover", title: "בדיקת דלת", reason: "נדרש", dekelQuerySeeds: ["בדיקת דלת"] },
  ]);
  const resolutions = [
    { operationId: "door-supply", disposition: "separate_boq_row" as const, boqRowIds: ["door-complete"], allowedDekelCodes: [], reason: "תוצאה ראשית" },
    { operationId: "door-hardware", disposition: "separate_boq_row" as const, boqRowIds: ["door-complete", "door-lock", "door-panic"], allowedDekelCodes: [], reason: "פרזול נפרד" },
    { operationId: "door-test", disposition: "separate_boq_row" as const, boqRowIds: ["door-complete"], allowedDekelCodes: [], reason: "בדיקה" },
  ];

  const result = auditScopeIntegrity({ inventory, resolutions, boqRows: [
    { id: "door-complete" }, { id: "door-lock" }, { id: "door-panic" },
  ], sourceFingerprint: "source", boqFingerprint: "boq" });

  assert.equal(result.status, "needs_review");
  assert.ok(result.blockers.includes("scope_row_reused:door-supply"));
  assert.ok(result.blockers.includes("scope_row_reused:door-hardware"));
  assert.ok(result.blockers.includes("scope_row_reused:door-test"));
});

test("неоднозначное и межпакетное владение строками блокируется до смыслового repair", () => {
  const inventory = sanitizeScopeInventory([
    { id: "multi-a", packageId: "doors", packageTitle: "דלתות", stage: "primary_work", title: "מכלול א", reason: "נדרש", dekelQuerySeeds: ["מכלול א"] },
    { id: "multi-b", packageId: "doors", packageTitle: "דלתות", stage: "interfaces_connections", title: "מכלול ב", reason: "נדרש", dekelQuerySeeds: ["מכלול ב"] },
    { id: "foreign", packageId: "windows", packageTitle: "חלונות", stage: "interfaces_connections", title: "עבודה זרה", reason: "נדרש", dekelQuerySeeds: ["עבודה זרה"] },
  ]);
  const resolutions = [
    { operationId: "multi-a", disposition: "separate_boq_row" as const, boqRowIds: ["shared-a", "shared-b"], allowedDekelCodes: [], reason: "א" },
    { operationId: "multi-b", disposition: "separate_boq_row" as const, boqRowIds: ["shared-a", "shared-b"], allowedDekelCodes: [], reason: "ב" },
    { operationId: "foreign", disposition: "separate_boq_row" as const, boqRowIds: ["shared-a", "foreign-own"], allowedDekelCodes: [], reason: "זר" },
  ];

  const result = auditScopeIntegrity({ inventory, resolutions, boqRows: [
    { id: "shared-a" }, { id: "shared-b" }, { id: "foreign-own" },
  ], sourceFingerprint: "source", boqFingerprint: "boq" });

  assert.equal(result.status, "needs_review");
  assert.ok(result.blockers.includes("scope_row_reused:multi-a"));
  assert.ok(result.blockers.includes("scope_row_reused:multi-b"));
  assert.ok(result.blockers.includes("scope_row_reused:foreign"));
});

test("включение в комплексную цену между разными рабочими пакетами запрещено", () => {
  const inventory = sanitizeScopeInventory([
    { id: "door", packageId: "doors", packageTitle: "דלתות", stage: "primary_work", title: "דלת חדשה", reason: "נדרש", dekelQuerySeeds: ["דלת חדשה"] },
    { id: "window-test", packageId: "windows", packageTitle: "חלונות", stage: "testing_handover", title: "בדיקת חלון", reason: "נדרש", dekelQuerySeeds: ["בדיקת חלון"] },
  ]);
  const resolutions = [
    { operationId: "door", disposition: "separate_boq_row" as const, boqRowIds: ["door-row"], allowedDekelCodes: ["95.door"], reason: "שורה ראשית" },
    { operationId: "window-test", disposition: "included_in_dekel_price" as const, boqRowIds: ["door-row"], dekelCode: "95.door", coveredByOperationId: "door", includedExcerpt: "בדיקה", inclusionVerified: true, allowedDekelCodes: ["95.door"], reason: "נטען ככלול" },
  ];
  const result = auditScopeIntegrity({ inventory, resolutions, boqRows: [{ id: "door-row" }], selectedDekelByRowId: new Map([["door-row", "95.door"]]), sourceFingerprint: "source", boqFingerprint: "boq" });
  assert.equal(result.status, "needs_review");
  assert.ok(result.blockers.includes("scope_inclusion_wrong_package:window-test"));
});

test("включение без проверенного фрагмента состава цены не закрывает операцию", () => {
  const inventory = sanitizeScopeInventory([
    { id: "door", packageId: "doors", packageTitle: "דלתות", stage: "primary_work", title: "דלת חדשה", reason: "נדרש", dekelQuerySeeds: ["דלת חדשה"] },
    { id: "door-test", packageId: "doors", packageTitle: "דלתות", stage: "testing_handover", title: "בדיקת דלת", reason: "נדרש", dekelQuerySeeds: ["בדיקת דלת"] },
  ]);
  const resolutions = [
    { operationId: "door", disposition: "separate_boq_row" as const, boqRowIds: ["door-row"], allowedDekelCodes: ["95.door"], reason: "שורה ראשית" },
    { operationId: "door-test", disposition: "included_in_dekel_price" as const, boqRowIds: ["door-row"], dekelCode: "95.door", coveredByOperationId: "door", includedExcerpt: "", inclusionVerified: false, allowedDekelCodes: ["95.door"], reason: "נטען ככלול" },
  ];
  const result = auditScopeIntegrity({ inventory, resolutions, boqRows: [{ id: "door-row" }], selectedDekelByRowId: new Map([["door-row", "95.door"]]), sourceFingerprint: "source", boqFingerprint: "boq" });
  assert.equal(result.status, "needs_review");
  assert.ok(result.blockers.includes("scope_inclusion_not_verified:door-test"));
});

test("строка DEKEL не может закрывать операции разных рабочих пакетов", () => {
  const inventory = sanitizeScopeInventory([
    { id: "door-install", packageId: "doors", packageTitle: "דלתות", stage: "primary_work", title: "התקנת דלת", reason: "נדרש", dekelQuerySeeds: ["התקנת דלת"] },
    { id: "window-install", packageId: "windows", packageTitle: "חלונות", stage: "primary_work", title: "התקנת חלון", reason: "נדרש", dekelQuerySeeds: ["התקנת חלון"] },
  ]);
  const resolutions = inventory.map((operation) => ({
    operationId: operation.id,
    disposition: "separate_boq_row" as const,
    boqRowIds: ["foreign-complete"],
    allowedDekelCodes: ["95.shared"],
    reason: "שורה משותפת",
  }));
  const result = auditScopeIntegrity({
    inventory,
    resolutions,
    boqRows: [{ id: "foreign-complete" }],
    selectedDekelByRowId: new Map([["foreign-complete", "95.shared"]]),
    sourceFingerprint: "source",
    boqFingerprint: "boq",
  });
  assert.equal(result.status, "needs_review");
  assert.ok(result.blockers.some((blocker) => blocker.startsWith("scope_row_reused:")));
});

test("пакетное замыкание полноты принимает только точное множество operation id", () => {
  const expected = ["prepare", "primary", "test"];
  assert.deepEqual(validateExactScopeResolutionIds([
    { operationId: "prepare" }, { operationId: "primary" }, { operationId: "test" },
  ], expected), []);
  assert.ok(validateExactScopeResolutionIds([
    { operationId: "prepare" }, { operationId: "primary" },
  ], expected).includes("scope_resolution_missing:test"));
  assert.ok(validateExactScopeResolutionIds([
    { operationId: "prepare" }, { operationId: "primary" }, { operationId: "primary" }, { operationId: "test" },
  ], expected).includes("scope_resolution_duplicate:primary"));
  assert.ok(validateExactScopeResolutionIds([
    { operationId: "prepare" }, { operationId: "primary" }, { operationId: "test" }, { operationId: "foreign" },
  ], expected).includes("scope_resolution_unknown:foreign"));
});

test("покрытие DEKEL сохраняет структуру рабочего пакета и обязательные включения", () => {
  const inventory = sanitizeScopeInventory([{
    id: "door-install", packageId: "doors", packageTitle: "דלתות", stage: "interfaces_connections",
    title: "התקנת דלת", reason: "נדרש", dekelQuerySeeds: ["התקנת דלת"], includedRequirements: ["כיוון", "בדיקת פעולה"],
  }]);
  const [gap] = inventoryAsScopeGaps(inventory);
  assert.equal(gap?.packageId, "doors");
  assert.equal(gap?.stage, "interfaces_connections");
  assert.deepEqual(gap?.includedRequirements, ["כיוון", "בדיקת פעולה"]);
});

test("пакетное замыкание не разрывает рабочий пакет и имеет стабильный порядок", () => {
  const coverage = [
    { key: "a1", packageId: "a" }, { key: "a2", packageId: "a" },
    { key: "b1", packageId: "b" }, { key: "c1", packageId: "c" },
  ] as never;
  const batches = groupFullDekelScopeCoverageByPackage(coverage, 2);
  assert.deepEqual(batches.map((batch) => batch.map((entry) => entry.key)), [["a1", "a2"], ["b1", "c1"]]);
});

test("слишком большой рабочий пакет заранее делится на ограниченные профессиональные части", () => {
  const coverage = [
    ...Array.from({ length: 7 }, (_, index) => ({ key: `roof-${index + 1}`, packageId: "renovation", packageTitle: "שיפוץ" })),
    ...Array.from({ length: 6 }, (_, index) => ({ key: `steel-${index + 1}`, packageId: "renovation", packageTitle: "שיפוץ" })),
    ...Array.from({ length: 5 }, (_, index) => ({ key: `floor-${index + 1}`, packageId: "renovation", packageTitle: "שיפוץ" })),
  ];
  const batches = groupFullDekelScopeCoverageByPackage(coverage as never, 8);
  assert.equal(batches.flat().length, coverage.length);
  assert.ok(batches.every((batch) => batch.length <= 8));
  assert.deepEqual(batches.map((batch) => batch[0]?.key.split("-")[0]), ["roof", "steel", "floor"]);
});

test("repair слишком большого ответа делится по профессиональным семействам даже при ошибочно общем packageId", () => {
  const coverage = [
    { key: "roof-replacement-01", packageId: "renovation", packageTitle: "שיפוץ", stage: "demolition_enabling" as const, requiredWork: "roof 1" },
    { key: "roof-replacement-02", packageId: "renovation", packageTitle: "שיפוץ", stage: "primary_work" as const, requiredWork: "roof 2" },
    { key: "floor-replacement-01", packageId: "renovation", packageTitle: "שיפוץ", stage: "demolition_enabling" as const, requiredWork: "floor 1" },
    { key: "floor-replacement-02", packageId: "renovation", packageTitle: "שיפוץ", stage: "primary_work" as const, requiredWork: "floor 2" },
    { key: "ventilation-01", packageId: "renovation", packageTitle: "שיפוץ", stage: "primary_work" as const, requiredWork: "vent 1" },
    { key: "ventilation-02", packageId: "renovation", packageTitle: "שיפוץ", stage: "testing_handover" as const, requiredWork: "vent 2" },
  ].map((entry) => ({ ...entry, reason: "required", catalogQueries: [], includedRequirements: [], candidates: [] }));

  const groups = groupScopeClosureRepairCoverage(coverage, 5);

  assert.deepEqual(groups.map((group) => group.map((entry) => entry.key)), [
    ["roof-replacement-01", "roof-replacement-02"],
    ["floor-replacement-01", "floor-replacement-02"],
    ["ventilation-01", "ventilation-02"],
  ]);
});

test("аудит полноты не скрывает две resolution одной операции", () => {
  const inventory = sanitizeScopeInventory([
    { id: "primary", packageId: "pkg", packageTitle: "עבודה", stage: "primary_work", title: "ביצוע", reason: "נדרש", dekelQuerySeeds: ["ביצוע עבודה"] },
  ]);
  const resolutions = [
    { operationId: "primary", disposition: "separate_boq_row" as const, boqRowIds: ["row-a"], allowedDekelCodes: ["95.a"], reason: "ראשון" },
    { operationId: "primary", disposition: "separate_boq_row" as const, boqRowIds: ["row-b"], allowedDekelCodes: ["95.b"], reason: "שני" },
  ];
  const result = auditScopeIntegrity({ inventory, resolutions, boqRows: [{ id: "row-a" }, { id: "row-b" }], sourceFingerprint: "source", boqFingerprint: "boq" });
  assert.equal(result.status, "needs_review");
  assert.ok(result.blockers.includes("scope_resolution_duplicate:primary"));
});

test("перенос ID строк не делает уже выбранный чужой код разрешённым", () => {
  const resolutions = [{
    operationId: "primary", disposition: "separate_boq_row" as const, boqRowIds: ["old-row"],
    allowedDekelCodes: ["95.allowed"], reason: "נדרש",
  }];
  const remapped = remapScopeResolutionsForDocument(resolutions, new Map([["old-row", ["new-row"]]]));
  assert.deepEqual(remapped[0]?.boqRowIds, ["new-row"]);
  assert.deepEqual(remapped[0]?.allowedDekelCodes, ["95.allowed"]);
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
    ],
  };

  const expanded = expandCompositeBoqRowsForDekel(document);
  const rows = expanded.boqRows as Array<Record<string, unknown>>;

  assert.deepEqual(rows.filter((row) => String(row.id).startsWith("boq-electrical-demolition-")).map((row) => row.unit), ["יח׳", "יח׳", "מ׳", "מ׳"]);
  assert.ok(rows.every((row) => row.code === "" && row.unitPrice === 0));
});

test("механическое разложение не подменяет выбор вмешательства ремонтом дверей, окон или щита", () => {
  const sourceRows = [
    { id: "door", description: "שיקום דלת דו־כנפית קיימת כולל יישור, פרזול, קורוזיה ואטימה", unit: "יח׳", quantity: 2, category: "פתחים" },
    { id: "window", description: "שיקום חלונות קיימים כולל פרזול, מנגנוני פתיחה ואיטום", unit: "יח׳", quantity: 4, category: "פתחים" },
    { id: "panel", description: "שיקום או החלפת לוח חשמל ראשי כולל סימון מעגלים, איזון והגנת פחת", unit: "יח׳", quantity: 1, category: "חשמל" },
  ].map((row) => ({ ...row, code: "", unitPrice: 0 }));
  const document = {
    subject: "בדיקה", background: "", objective: "", scope: [], estimateNotes: [], scheduleRows: [], scheduleNotes: "", riskRows: [], additionalNotes: "", evidenceNotes: [],
    boqRows: sourceRows,
  };

  const expanded = expandCompositeBoqRowsForDekel(document);
  const rows = expanded.boqRows as Array<Record<string, unknown>>;

  assert.deepEqual(rows, sourceRows);
  assert.ok(rows.every((row) => !/ריתוך מקומי|כברירת מחדל מקצועית/u.test(String(row.description))));
});

test("механическое разложение создаёт стабильные ID не длиннее схемы", () => {
  const sourceId = `boq-${"long-source-".repeat(9)}`;
  const document = {
    subject: "בדיקה", background: "", objective: "", scope: [], estimateNotes: [], scheduleRows: [], scheduleNotes: "", riskRows: [], additionalNotes: "", evidenceNotes: [],
    boqRows: [{ id: sourceId, code: "", description: "ניתוק בטוח ופירוק של נקודות, כבלים, קופסאות ותעלות חשמל ישנות; כמות אומדנית", unit: "יח׳", quantity: 20, unitPrice: 0, category: "פירוק" }],
  };

  const first = expandCompositeBoqRowsForDekel(normalizeGeneratedDocument(document));
  const normalized = normalizeGeneratedDocument(first);

  assert.ok((first.boqRows as Array<Record<string, unknown>>).every((row) => String(row.id).length <= 120));
  assert.deepEqual(normalized.boqRows, first.boqRows);
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

test("готовность после перезапуска сохраняется только вместе с валидным аудитом полноты", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-scope-restart-"));
  try {
    const first = new LocalProjectStore(root);
    await first.initialize();
    const project = await first.create("Проверка scope", "Перезапуск");
    const row = { id: "boq-primary", code: "95.01", description: "עבודה", unit: "יח׳", quantity: 1, unitPrice: 100, category: "כללי" };
    project.document.boqRows = [row];
    const boqFingerprint = createHash("sha256").update(JSON.stringify([row])).digest("hex");
    const inventory = sanitizeScopeInventory([{ id: "primary", packageId: "pkg", packageTitle: "עבודה", stage: "primary_work", title: "עבודה", reason: "נדרש", dekelQuerySeeds: ["עבודה"] }]);
    const resolutions = [{ operationId: "primary", disposition: "separate_boq_row" as const, boqRowIds: [row.id], dekelCode: undefined, allowedDekelCodes: [row.code], reason: "שורה נפרדת" }];
    project.scopeCompleteness = auditScopeIntegrity({ inventory, resolutions, boqRows: [row], selectedDekelByRowId: new Map([[row.id, row.code]]), sourceFingerprint: "source", boqFingerprint });
    project.processing = { ...project.processing, status: "ready", stage: "complete", readyForExport: true, validatedDocumentFingerprint: "document", progressPercent: 100 };
    await first.save(project);
    const restored = await new LocalProjectStore(root).get(project.id);
    assert.equal(restored.scopeCompleteness?.status, "complete");
    assert.equal(restored.processing.status, "ready");
    assert.equal(restored.processing.readyForExport, true);

    restored.scopeCompleteness = undefined;
    await first.save(restored);
    const rejected = await new LocalProjectStore(root).get(project.id);
    assert.notEqual(rejected.processing.status, "ready");
    assert.equal(rejected.processing.readyForExport, false);
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
    const checkpoint = createProcessingCheckpoint(project.id, {
      sourceInputFingerprint: "source-input",
      processedSourceFingerprint: "processed-source",
      baseDocumentFingerprint: "base-document",
      projectContextFingerprint: "project-context",
      globalRulesFingerprint: "global-rules",
      dekelFingerprint: "dekel",
      professionalKnowledgeFingerprint: "knowledge",
      executionConfigFingerprint: "config",
      pipelineRevision: "test-revision",
    });
    await first.replaceProcessingCheckpoint(project.id, checkpoint);

    const reopened = new LocalProjectStore(root);
    await reopened.initialize();
    const restored = await reopened.get(project.id);
    assert.equal(restored.processing.status, "failed");
    assert.equal(restored.processing.readyForExport, false);
    assert.equal(restored.processing.runId, null);
    assert.equal(restored.processing.error?.code, "processing_interrupted");
    assert.equal(restored.processing.error?.retryable, true);
    assert.match(restored.processing.error?.message ?? "", /этапы сохранены/);
    assert.equal((await reopened.readProcessingCheckpoint(project.id))?.identityFingerprint, checkpoint.identityFingerprint);
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

test("второстепенная проверка поставляемого изделия не превращает его в испытание существующего", () => {
  const examples = [
    ["גוף תאורת חירום LED עצמאי עם סוללה, מטען ובדיקת תפקוד, כולל התקנה וחיבור לנקודת חשמל", "גוף תאורת חירום LED להתקנה גלויה בתקרה"],
    ["גלאי עשן עם בסיס ובדיקת תפקוד, כולל התקנה וחיבור", "גלאי עשן אופטי כולל בסיס"],
    ["מפוח אוורור חדש עם מנוע, בדיקת תפקוד ומדידת ספיקה, כולל התקנה", "מפוח אוורור צירי חדש כולל מנוע"],
  ];
  for (const [work, item] of examples) {
    assert.equal(paidResultSignature(work).action, "supply_install", work);
    assert.notEqual(paidResultSignature(work).scenario, "test_existing", work);
    assert.ok(["direct_price", "professional_analogue"].includes(paidResultRelation(work, item)), work);
    assert.ok(buildLocalDekelCandidates(work, "", "יח׳", [testDekelItem("95.88.01.0001", item, "unit", 100)], 1).length > 0, work);
  }
});

test("самостоятельное испытание изделия остаётся испытанием, а не поставкой", () => {
  const work = "בדיקת תפקוד גוף תאורת חירום קיים עם סוללה ומטען";
  assert.equal(paidResultSignature(work).action, "test");
  assert.equal(paidResultSignature(work).scenario, "test_existing");
  assert.equal(paidResultRelation(work, "גוף תאורת חירום LED כולל סוללה ומטען"), "incompatible");
});

test("материал дверного полотна не требуется в расценке отдельного доводчика", () => {
  const work = "מחזיר הידראולי מתאים לכנף דלת פלדה חיצונית, כולל זרוע, קיבוע, כיוון מהירות ובדיקת סגירה";
  const item = testDekelItem("95.88.02.0001", "מחזיר שמן עליון הדראולי לדלת חיצונית ברוחב עד 107 ס״מ, דירוג כח סגירה ברמה 4", "unit", 400);
  const candidates = buildLocalDekelCandidates(work, "", "יח׳", [item], 4);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].code, item.code);
});

test("материал самой двери остаётся обязательным при подборе полного дверного блока", () => {
  const work = "אספקה והתקנה של דלת פלדה חדשה כולל משקוף ופרזול";
  const steel = testDekelItem("95.88.03.0001", "דלת פלדה חד כנפית חדשה כולל משקוף ופרזול", "unit", 3000);
  const wood = testDekelItem("95.88.03.0002", "דלת עץ חד כנפית חדשה כולל משקוף ופרזול", "unit", 1000);
  const candidates = buildLocalDekelCandidates(work, "", "יח׳", [steel, wood], 1);
  assert.ok(candidates.some((item) => item.code === steel.code));
  assert.equal(candidates.some((item) => item.code === wood.code), false);
});

test("аварийное назначение светильника сохраняется до ограничения списка кандидатов", () => {
  const work = "גוף תאורת חירום LED עצמאי עם סוללה, מטען ובדיקת תפקוד, כולל התקנה וחיבור לנקודת חשמל";
  const ordinary = Array.from({ length: 20 }, (_, index) => testDekelItem(`95.88.04.${index}`, "גוף תאורה LED עצמאי עם מטען ובדיקת תפקוד, כולל התקנה וחיבור לנקודת חשמל", "unit", 100));
  const emergency = testDekelItem("95.emergency", "גוף תאורת חירום לפי תקן ישראלי, חד תכליתי, תאורת מולטי לד 27 LED להתקנה גלויה לתקרה, קיבולת 2 שעות", "unit", 500);
  const candidates = buildLocalDekelCandidates(work, "", "יח׳", [...ordinary, emergency], 1);
  assert.equal(candidates.length, 1, "совпадение общих слов не допускает обычный светильник вместо аварийного");
  assert.equal(candidates[0].code, emergency.code, "нужный аварийный светильник не отрезается более высокими generic scores");
});

test("автономный аварийный светильник не подменяется устройством только центрального питания", () => {
  const work = "גוף תאורת חירום עצמאי עם סוללה ומטען";
  const central = testDekelItem("95.central", "גוף תאורת חירום בהזנה ממערכת גיבוי מרכזית בלבד ללא סוללה עצמאית", "unit", 100);
  const autonomous = testDekelItem("95.autonomous", "גוף תאורת חירום עצמאי עם סוללה ומטען", "unit", 300);
  const candidates = buildLocalDekelCandidates(work, "", "יח׳", [central, autonomous], 1);
  assert.ok(candidates.some((item) => item.code === autonomous.code));
  assert.equal(candidates.some((item) => item.code === central.code), false);
});
