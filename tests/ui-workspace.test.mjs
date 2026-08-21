import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, script, styles] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
]);

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
