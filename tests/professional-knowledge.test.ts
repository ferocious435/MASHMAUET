import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProfessionalKnowledgeService, professionalKnowledgeInternals } from "../src/modules/references/services/professional-knowledge-service.ts";

test("классификация справочных источников не срабатывает на нерелевантный разговор", () => {
  assert.equal(professionalKnowledgeInternals.isKnowledgeRelevant("Привет, как дела?"), false);
  assert.equal(professionalKnowledgeInternals.isKnowledgeRelevant("Что входит в цену гидроизоляции и что измеряется отдельно?"), true);
  assert.equal(professionalKnowledgeInternals.inferChapterCode("פרק 05 - עבודות איטום.pdf"), "05");
  assert.equal(professionalKnowledgeInternals.inferChapterCode("דף תיקון מס 1 לפרק 55.pdf"), "55");
});

test("3210 и Синяя книга извлекаются раздельно и только по контексту", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-knowledge-"));
  const contractDirectoryPath = join(root, "3210");
  const blueBookDirectoryPath = join(root, "BLUE BOOK");
  const cacheDirectoryPath = join(root, "cache");
  await Promise.all([mkdir(contractDirectoryPath), mkdir(blueBookDirectoryPath), mkdir(cacheDirectoryPath)]);
  try {
    await seedCachedPdf(contractDirectoryPath, cacheDirectoryPath, "חוזה מדף 3210 2019.pdf", [
      "סתירות במסמכים ועדיפות בין מסמכים. לעניין התשלום כתב כמויות קודם לאופני מדידה מיוחדים.",
      "פקודת שינויים תינתן בכתב. מדידת כמויות ותשלומי ביניים יבוצעו בהתאם לתנאי החוזה.",
    ]);
    await seedCachedPdf(blueBookDirectoryPath, cacheDirectoryPath, "פרק 00 דצמבר 2009.pdf", [
      "תכולת המחירים ואופני המדידה. עבודה שלא נקבע לגביה תשלום נפרד תיחשב ככלולה במחיר היחידה.",
    ]);
    await seedCachedPdf(blueBookDirectoryPath, cacheDirectoryPath, "פרק 05 עבודות איטום דצמבר 2019.pdf", [
      "עבודות איטום יבוצעו לאחר הכנת התשתית. המחיר כולל חומרים, חפיפות, פרטים ובדיקות כנדרש.",
    ]);
    await seedCachedPdf(blueBookDirectoryPath, cacheDirectoryPath, "פרק 05 דף תיקון מס 1.pdf", [
      "דף תיקון לפרק 05: בדיקת הצפה תימדד בנפרד רק אם קיים סעיף מפורש בכתב הכמויות.",
    ]);

    const service = new ProfessionalKnowledgeService({ contractDirectoryPath, blueBookDirectoryPath, cacheDirectoryPath });
    const technical = await service.search("עבודות איטום 95.05.10.0045: מה כלול במחיר ומה נמדד בנפרד?", { limit: 6 });
    assert.equal(technical.used, true);
    assert.ok(technical.results.some((result) => result.chapterCode === "05"));
    assert.ok(technical.results.some((result) => result.chapterCode === "00"));
    assert.ok(technical.results.every((result) => result.sourceKind === "blue_book"));
    assert.match(technical.alerts.join(" "), /лист.*исправлений/i);

    const contractual = await service.search("מה סדר העדיפות בין מסמכי החוזה ואיך מטפלים בפקודת שינויים ותשלומים?", { limit: 6 });
    assert.equal(contractual.used, true);
    assert.ok(contractual.results.length >= 1);
    assert.ok(contractual.results.every((result) => result.sourceKind === "contract_3210"));
    assert.ok(contractual.results.every((result) => result.fileName.includes("3210")));

    assert.deepEqual(await service.search("שלום, מה נשמע?"), { used: false, policy: "reference_only", results: [], alerts: [] });
    assert.deepEqual(
      await service.search("שלום, מה נשמע?\n95.05.10.0045 עבודות איטום", { routingQuery: "שלום, מה נשמע?" }),
      { used: false, policy: "reference_only", results: [], alerts: [] },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function seedCachedPdf(directoryPath: string, cacheDirectoryPath: string, fileName: string, pages: string[]): Promise<void> {
  const filePath = join(directoryPath, fileName);
  await writeFile(filePath, "test-pdf-placeholder", "utf8");
  const metadata = await stat(filePath);
  const fingerprint = `${metadata.size}:${Math.floor(metadata.mtimeMs)}`;
  const key = createHash("sha256").update(filePath.toLowerCase()).digest("hex").slice(0, 24);
  await writeFile(join(cacheDirectoryPath, `${key}.json`), JSON.stringify({ fingerprint, fileName, pages }), "utf8");
}
