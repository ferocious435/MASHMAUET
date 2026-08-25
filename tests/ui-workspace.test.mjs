import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, script, styles] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
]);

let documentLayout;
try {
  documentLayout = await import(new URL("../public/document-layout.js", import.meta.url));
} catch {
  documentLayout = null;
}

test("все операции локального backend доступны из интерфейса", () => {
  for (const id of [
    "system-center-button", "project-settings-button", "archive-project-button",
    "create-backup-button", "backups-list", "archived-projects-list",
    "reprocess-material-button", "delete-material-button", "confirm-dialog",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));

  for (const route of [
    "/local/health", "/local/backups", "/local/archived-projects",
    "/archive", "/reprocess", "/restore",
  ]) assert.ok(script.includes(route), `Не подключён маршрут ${route}`);
});

test("опасные действия используют единый диалог подтверждения", () => {
  assert.ok(script.includes("requestConfirmation"));
  assert.doesNotMatch(script, /window\.confirm\s*\(/);
  assert.match(script, /confirm:\s*true/);
  assert.match(html, /id="confirm-action-button"/);
});

test("интерфейс содержит loading, empty, success и error состояния", () => {
  assert.match(html, /document-skeleton/);
  assert.match(styles, /management-skeleton/);
  assert.match(script, /empty-state/);
  assert.match(script, /showToast\([^)]*"error"/s);
  assert.match(styles, /toast\[data-tone="error"\]/);
  assert.match(script, /data-retry-system/);
});

test("интерфейс честно показывает готовность и этапы обработки проекта", () => {
  for (const id of [
    "project-processing", "workflow-progress", "workflow-error",
    "retry-workflow-button", "document-readiness",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));

  assert.match(html, /data-workflow-state=/);
  assert.match(html, /data-workflow-stage=/);
  assert.match(html, /role="progressbar"/);
  assert.match(script, /renderProjectProcessing/);
  assert.match(script, /progressPercent/);
  assert.match(script, /processing\.error\?\.message/);
  assert.match(script, /retry-workflow-button/);
  assert.match(script, /processing-runs/);
  assert.match(script, /pollProjectProcessing/);
  assert.match(script, /await startProjectProcessing\(activeProjectId\)/);
  assert.match(styles, /\.project-processing/);
  assert.match(styles, /\.workflow-progress/);
  assert.match(styles, /\[data-workflow-state="failed"\]/);
});

test("DEKEL доступен для проверки построенной сметы, а печать и экспорт — только после готовности", () => {
  assert.match(script, /processing\?\.readyForExport\s*===\s*true/);
  assert.match(script, /function syncProjectReadiness/);
  assert.match(script, /const dekelAvailable\s*=\s*Boolean\(project\?\.document\?\.boqRows\?\.length\)/);
  assert.match(script, /elements\.dekelReviewButton\.disabled\s*=\s*!dekelAvailable/);
  assert.match(script, /elements\.exportButton\.disabled\s*=\s*!ready/);
  assert.match(script, /elements\.printButton\.disabled\s*=\s*!ready/);
  assert.match(script, /ensureProjectReadyForExport/);
  assert.match(script, /readyForExport:\s*false/);
});

test("опрос обработки ведётся отдельно для каждого проекта и возобновляется после загрузки или переключения", () => {
  assert.match(script, /const processingPolls\s*=\s*new Map\(\)/);
  assert.doesNotMatch(script, /processingPollToken/);
  assert.match(script, /function resumeProjectProcessing/);
  assert.match(script, /processingPolls\.(?:get|has)\(projectId\)/);
  assert.match(script, /processingPolls\.delete\(projectId\)/);
  assert.match(script, /resumeProjectProcessing\(getActiveProject\(\)\)/);
});

test("проектный чат работает в границах проекта и позволяет безопасно повторить ошибку", () => {
  for (const id of ["codex-status", "chat-state-message", "chat-messages", "chat-form", "chat-input", "connect-codex-button"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /אין לו אפשרות לשנות את המערכת או כללים כלליים/);
  assert.match(script, /sendProjectChat/);
  assert.match(script, /retryOfMessageId/);
  assert.match(script, /data-retry-chat/);
  assert.match(script, /syncChatAvailability/);
  assert.match(script, /שינוי מאוחד במסמך/);
  assert.match(script, /אישור הצעת הצ׳אט/);
  assert.match(script, /function replaceProject\(project\) \{\s*expandLegacyBoqDescriptions\(project\.document\?\.boqRows\);\s*ensureDocumentEvidence\(project\.document\);/s);
  assert.doesNotMatch(script, /data-global-proposal/);
  assert.doesNotMatch(script, /אישור לכל הפרויקטים/);
  assert.match(styles, /\.chat-message\.failed/);
  assert.match(styles, /\.chat-retry-button/);
});

test("материалы можно просматривать, исправлять, повторно анализировать и обсуждать", () => {
  for (const id of [
    "material-preview", "material-content-editor", "material-content-status",
    "save-material-content-button", "reset-material-content-button",
    "analyze-material-button", "discuss-material-button",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  for (const route of ["/content", "/analyze", "/video-frames", "/preview"]) assert.ok(script.includes(route), `Не подключён маршрут материала ${route}`);
  assert.match(script, /prepareVideoFrames/);
  assert.match(script, /canvasToJpeg/);
  assert.match(script, /תיקון שנשמר/);
  assert.match(styles, /\.material-content-section/);
  assert.match(styles, /\.material-preview video/);
});

test("мобильный режим не складывает три длинные панели подряд", () => {
  assert.match(html, /class="mobile-nav"/);
  assert.match(styles, /body\[data-mobile-view="projects"\]/);
  assert.match(styles, /body\[data-mobile-view="document"\]/);
  assert.match(styles, /body\[data-mobile-view="chat"\]/);
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("документ остаётся RTL, а системные элементы доступны с клавиатуры", () => {
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(styles, /:focus-visible/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /onclick=/i);
});

test("כתב כמויות печатается как читаемый A4 с полными описаниями и денежным форматом", () => {
  assert.match(styles, /@page\s*\{\s*size:\s*A4 landscape/);
  assert.match(styles, /@page\s+boq-portrait\s*\{\s*size:\s*A4 portrait/);
  assert.match(styles, /\.narrative-page\s*\{[^}]*page:\s*auto/);
  assert.match(styles, /\.narrative-page \+ \.narrative-page, \.boq-page\s*\{[^}]*break-before:\s*page/);
  assert.match(styles, /\.boq-page\s*\{[^}]*page:\s*boq-portrait/);
  assert.match(script, /paginateBoqRows/);
  assert.match(script, /תיאור מלא/);
  assert.match(script, /LEGACY_BOQ_DESCRIPTIONS/);
  assert.match(script, /Intl\.NumberFormat\("en-US"/);
  assert.match(script, /₪ \$\{moneyFormatter\.format/);
  assert.match(styles, /\.boq-table \.boq-description[^}]*white-space:\s*normal/);
  assert.match(styles, /\.boq-table \.description-input[^}]*field-sizing:\s*content/);
  assert.match(styles, /\.boq-table \.description-input[^}]*overflow-y:\s*hidden/);
});

test("לוח הזמנים отображается как графический календарный план, а не обычная таблица", () => {
  assert.match(script, /function renderScheduleTimeline/);
  assert.match(script, /class="schedule-timeline"/);
  assert.match(script, /class="schedule-bar"/);
  assert.doesNotMatch(script, /<table class="official-table"><thead><tr><th>שלב<\/th><th>משך משוער<\/th><th>הערות<\/th>/);
  assert.match(styles, /\.schedule-timeline/);
  assert.match(styles, /\.schedule-bar/);
});

test("неоценённые работы отделены от денежного כתב כמויות и не маскируются под нулевую цену", () => {
  assert.match(script, /summary\.pricing\.pricedRows/);
  assert.match(script, /renderUnpricedWorksNotice/);
  assert.match(script, /data-unpriced-boq/);
  assert.match(styles, /\.unpriced-boq-notice/);
});

test("пагинация כתב כמויות сохраняет каждое полное описание и резервирует место для итогов", () => {
  assert.ok(documentLayout, "нет чистого модуля контроля A4");
  const rows = Array.from({ length: 48 }, (_, index) => ({
    id: `row-${index}`,
    description: `תיאור מלא ${index} ${"פרט ".repeat((index % 7) + 5)}`,
  }));
  const pages = documentLayout.paginateBoqRows(rows);
  assert.ok(pages.length > 1);
  assert.deepEqual(pages.flat().map((row) => row.description), rows.map((row) => row.description));
  assert.ok(documentLayout.boqPageWeight(pages.at(-1)) <= documentLayout.BOQ_PAGE_CAPACITY - documentLayout.BOQ_TOTALS_RESERVE);
});

test("очень длинная строка כתב כמויות не вытесняет итоги за границы A4", () => {
  assert.ok(documentLayout, "нет чистого модуля контроля A4");
  const row = { id: "long-row", description: "תיאור ".repeat(900) };
  const pages = documentLayout.paginateBoqRows([row]);
  assert.equal(pages[0][0].description, row.description);
  assert.deepEqual(pages.at(-1), [], "итоги должны перейти на отдельную страницу, если строка занимает всю A4");
});

test("аудит A4 требует ровно три narrative-страницы, כתב כמויות и единый блок итогов", () => {
  assert.ok(documentLayout, "нет чистого модуля контроля A4");
  assert.deepEqual(documentLayout.assessA4Document({
    narrativePages: [{ label: "1", contentHeight: 400, availableHeight: 500 }, { label: "2", contentHeight: 500.5, availableHeight: 500 }, { label: "3", contentHeight: 430, availableHeight: 500 }],
    boqPages: [{ label: "1", contentHeight: 690, availableHeight: 700 }],
    totalsBlockCount: 1,
  }), []);
  const issues = documentLayout.assessA4Document({
    narrativePages: [{ label: "1", contentHeight: 520, availableHeight: 500 }, { label: "2", contentHeight: 400, availableHeight: 500 }],
    boqPages: [],
    totalsBlockCount: 0,
  });
  assert.ok(issues.some((issue) => issue.code === "narrative-page-count"));
  assert.ok(issues.some((issue) => issue.code === "missing-boq-page"));
  assert.ok(issues.some((issue) => issue.code === "totals-block-count"));
  assert.ok(issues.some((issue) => issue.code === "page-overflow" && issue.label === "1"));
});

test("переполнение A4 видимо в интерфейсе и блокирует печать и экспорт", () => {
  assert.match(html, /id="a4-layout-warning"[^>]*role="alert"/);
  assert.match(script, /refreshA4LayoutStatus/);
  assert.match(script, /ensureA4LayoutReady/);
  assert.match(script, /if \(!ensureA4LayoutReady\(\)\) return/);
  assert.match(styles, /\.a4-layout-warning/);
  assert.match(styles, /\.document-page\.layout-overflow/);
  assert.match(styles, /@media print[\s\S]*\.a4-layout-warning[^{]*\{[^}]*display:\s*none/);
});

test("основной документ повторяет трёхстраничную структуру образцов и имеет полноразмерный просмотр", () => {
  for (const className of ["narrative-page-one", "narrative-page-two", "narrative-page-three"]) assert.match(script, new RegExp(className));
  for (const footer of ["עמוד 1 מתוך 3", "עמוד 2 מתוך 3", "עמוד 3 מתוך 3"]) assert.ok(script.includes(footer));
  assert.match(script, /כתב כמויות · עמוד \$\{pageIndex \+ 1\} מתוך \$\{pages\.length\}/);
  assert.match(html, /id="document-focus-button"/);
  assert.match(script, /fitDocumentPreview/);
  assert.match(script, /document-focus/);
  assert.match(styles, /body\.document-focus \.projects-panel/);
  assert.match(script, /class="exported-document"/);
  assert.match(styles, /@media print[\s\S]*\.estimate-source-details[^{]*\{[^}]*display:\s*none/);
});

test("доказательная сноска объясняет допущение и передаёт контекст в чат", () => {
  for (const id of ["evidence-dialog", "evidence-dialog-title", "evidence-discuss-button", "evidence-source-button"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(script, /data-evidence-note/);
  assert.match(script, /role="tooltip"/);
  assert.match(script, /buildEvidenceChatContext/);
  assert.match(script, /evidence-note:/);
  assert.match(script, /openEvidenceDialog/);
  assert.match(script, /data-evidence-jump/);
  assert.match(styles, /\.evidence-overview/);
  assert.match(styles, /\.evidence-marker:hover/);
  assert.match(styles, /\.evidence-marker:focus-visible/);
  assert.match(styles, /@media print[\s\S]*\.evidence-marker-wrap[^{]*\{[^}]*display:\s*none/);
});

test("DEKEL доступен как полный проектный процесс проверки и применения", () => {
  for (const id of ["dekel-review-button", "dekel-dialog", "dekel-lines", "dekel-analyze-button", "dekel-apply-button", "dekel-catalog-status", "dekel-financial-audit"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const route of ["/dekel/analyze", "/dekel/lines/", "/dekel/apply"]) assert.ok(script.includes(route), `Не подключён маршрут ${route}`);
  assert.match(script, /renderDekelReview/);
  assert.match(script, /\["needs_review", "ready"\]\.includes\(processing\.status\)/);
  assert.match(script, /selectedCode/);
  assert.match(script, /data-dekel-code/);
  assert.match(script, /quantitySource/);
  assert.match(script, /renderDekelFinancialAudit/);
  assert.match(script, /7\.4%/);
  assert.match(script, /5\.4%/);
  assert.match(script, /2\.7%/);
  assert.match(styles, /\.dekel-review-line/);
  assert.match(styles, /\.dekel-financial-audit/);
  assert.match(html, /מחירון ברירת המחדל הקבוע של המערכת/);
  assert.match(html, /כל מחירון אחר יישאר מחוץ לחישוב גם אם הוא שמור בתיקייה גלובלית או בתיקיית פרויקט/);
});

test("экран DEKEL отличает неподобранную работу от исключённой владельцем", () => {
  assert.match(script, /const unresolvedLines = review\.lines\.filter/);
  assert.match(script, /!line\.included && !line\.ownerExcluded/);
  assert.match(script, /unresolvedLines\.length > 0/);
  assert.match(script, /ממתינות להתאמה/);
  assert.match(script, /line\.semanticConfidence/);
});
