import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ProfessionalKnowledgeSourceKind = "contract_3210" | "blue_book";
export type ProfessionalKnowledgeIntent = "contract" | "technical" | "measurement" | "price_scope" | "sequence";

export type ProfessionalKnowledgeSource = {
  id: string;
  kind: ProfessionalKnowledgeSourceKind;
  fileName: string;
  filePath: string;
  chapterCode: string | null;
  isCorrection: boolean;
};

export type ProfessionalKnowledgeResult = {
  sourceId: string;
  sourceKind: ProfessionalKnowledgeSourceKind;
  fileName: string;
  chapterCode: string | null;
  isCorrection: boolean;
  page: number;
  excerpt: string;
  score: number;
  intents: ProfessionalKnowledgeIntent[];
};

export type ProfessionalKnowledgeContext = {
  used: boolean;
  policy: "reference_only";
  results: ProfessionalKnowledgeResult[];
  alerts: string[];
};

export interface ProfessionalKnowledgeGateway {
  search(query: string, options?: { limit?: number; routingQuery?: string }): Promise<ProfessionalKnowledgeContext>;
}

type CachedPdf = { fingerprint: string; fileName: string; pages: string[] };
type RankedChunk = ProfessionalKnowledgeResult & { source: ProfessionalKnowledgeSource };

const EMPTY_CONTEXT: ProfessionalKnowledgeContext = { used: false, policy: "reference_only", results: [], alerts: [] };
const MAX_QUERY_LENGTH = 120_000;
const MAX_EXCERPT_LENGTH = 1_800;

const INTENT_TERMS: Record<ProfessionalKnowledgeIntent, string[]> = {
  contract: [
    "חוזה", "חוזי", "מסמכי החוזה", "סתירה", "עדיפות בין מסמכים", "פקודת שינויים", "שינוי", "תביעה", "תשלום", "לוח זמנים", "מסירה", "בדק", "אחריות",
    "договор", "контракт", "противореч", "приоритет документов", "изменени", "оплат", "срок", "сдач", "гарант", "ответствен",
  ],
  technical: [
    "עבודה", "עבודות", "ביצוע", "חומרים", "בדיקות", "מפרט", "שיטת ביצוע", "תקן", "תשתית", "התקנה",
    "כתב כמויות", "מסמך", "לנתח", "להכין", "ליצור",
    "работ", "выполн", "материал", "испытан", "техничес", "спецификац", "монтаж", "основани", "смет", "документ", "проанализир", "подготов", "созда",
  ],
  measurement: ["אופני מדידה", "מדידה", "מדידות", "יחידת מידה", "כמות", "נמדד", "מדידה בנפרד", "измерен", "единиц", "объём", "количеств"],
  price_scope: ["תכולת המחירים", "כלול במחיר", "כלול", "בנפרד", "לא ישולם", "תשלום נפרד", "מחיר היחידה", "включено в цену", "оплачивается отдельно", "отдельная оплата", "состав цены", "не оплачивается"],
  sequence: ["סדר ביצוע", "שלבי ביצוע", "רצף", "לפני", "לאחר", "הכנה", "порядок работ", "последовательност", "этап", "до выполнения", "после выполнения"],
};

const CHAPTER_TERMS: Record<string, string[]> = {
  "00": ["מוקדמות", "כללי", "התארגנות", "общие работы", "подготовительные работы", "организация площадки"],
  "01": ["עבודות עפר", "חפירה", "מילוי", "грунт", "земляные", "котлован", "засыпк"],
  "02": ["בטון יצוק", "יציקת בטון", "бетон", "монолит"],
  "03": ["בטון טרומי", "מוצרי בטון", "сборный бетон", "железобетонные изделия"],
  "04": ["עבודות בנייה", "בלוקים", "קירות בלוקים", "кладк", "блоки", "перегородк"],
  "05": ["איטום", "יריעות", "רולקות", "гидроизоляц", "герметизац", "мембран"],
  "06": ["נגרות", "מסגרות", "דלת", "חלון", "столяр", "слесар", "двер", "окн"],
  "07": ["תברואה", "אינסטלציה", "ביוב", "מים", "ניקוז", "сантех", "канализац", "водоснаб", "дренаж"],
  "08": ["חשמל", "תאורה", "כבל", "לוח חשמל", "электр", "освещ", "кабел", "щит"],
  "09": ["טיח", "штукатур"],
  "10": ["ריצוף", "חיפוי", "אריח", "плитк", "облицов", "настил"],
  "11": ["צביעה", "צבע", "окраск", "маляр"],
  "12": ["אלומיניום", "алюмини"],
  "14": ["אבן", "חיפוי אבן", "камень", "каменная облицовка"],
  "15": ["מיזוג", "אוורור", "מזגן", "вентиляц", "кондицион"],
  "17": ["מעלית", "מעליות", "лифт"],
  "18": ["תקשורת", "תשתיות תקשורת", "связь", "телеком"],
  "19": ["פלדה", "מסגרות חרש", "металлоконструкц", "сталь"],
  "20": ["נגרות חרש", "деревянн", "плотниц"],
  "22": ["אלמנטים מתועשים", "תקרה", "מחיצה", "подвесн", "потолок", "перегородк"],
  "23": ["כלונסאות", "דיפון", "сваи", "шпунт", "ограждение котлована"],
  "34": ["גילוי אש", "כיבוי אש", "пожар", "пожаротуш", "сигнализац"],
  "35": ["בקרת מערכות", "בקרה", "автоматизац", "диспетчеризац"],
  "39": ["גנרטור", "דיזל גנרטור", "генератор", "дизель"],
  "40": ["פיתוח", "עבודות פיתוח", "благоустрой", "наружные работы"],
  "41": ["גינון", "השקיה", "озеленен", "полив"],
  "50": ["משטחי בטון", "бетонные покрытия", "бетонная площадка"],
  "51": ["סלילה", "כביש", "אספלט", "дорожн", "асфальт"],
  "54": ["מנהור", "מנהרה", "туннел"],
  "57": ["קווי מים", "צנרת מים", "водопровод"],
  "58-59": ["מקלט", "מיגון", "מרחב מוגן", "убежищ", "защитн"],
  "62": ["שכבות מגן", "ביצורים", "фортификац", "защитные слои"],
  "81": ["ניהול", "תיאום", "פיקוח", "управление строительством", "координац", "надзор"],
  "97": ["בטיחות", "גידור", "ציוד מגן", "безопасност", "охрана труда", "огражден"],
};

export class ProfessionalKnowledgeService implements ProfessionalKnowledgeGateway {
  private sources?: Promise<ProfessionalKnowledgeSource[]>;
  private readonly memoryCache = new Map<string, Promise<string[]>>();
  private readonly options: { contractDirectoryPath: string; blueBookDirectoryPath: string; cacheDirectoryPath: string };

  constructor(options: { contractDirectoryPath: string; blueBookDirectoryPath: string; cacheDirectoryPath: string }) { this.options = options; }

  async search(rawQuery: string, options?: { limit?: number; routingQuery?: string }): Promise<ProfessionalKnowledgeContext> {
    const query = rawQuery.slice(0, MAX_QUERY_LENGTH).trim();
    const routingQuery = (options?.routingQuery ?? query).slice(0, 20_000).trim();
    if (!isKnowledgeRelevant(routingQuery)) return EMPTY_CONTEXT;

    const intents = detectIntents(routingQuery);
    const chapterCodes = detectChapterCodes(query, intents);
    const sources = selectSources(await this.discoverSources(), intents, chapterCodes);
    if (sources.length === 0) return EMPTY_CONTEXT;

    const expandedTerms = buildExpandedTerms(query, intents, chapterCodes);
    const ranked = (await Promise.all(sources.map(async (source) => this.rankSource(source, query, expandedTerms, intents)))).flat();
    ranked.sort((a, b) => b.score - a.score || Number(b.isCorrection) - Number(a.isCorrection) || a.page - b.page);

    const limit = Math.max(1, Math.min(options?.limit ?? 6, 10));
    const results = deduplicateResults(ranked.filter((item) => item.score >= 1.25), limit).map(({ source: _source, ...result }) => result);
    if (results.length === 0) return EMPTY_CONTEXT;

    const selectedChapters = new Set(results.map((item) => item.chapterCode).filter((value): value is string => Boolean(value)));
    const correctionChapters = new Set(sources.filter((source) => source.isCorrection && source.chapterCode && selectedChapters.has(source.chapterCode)).map((source) => source.chapterCode as string));
    const alerts = correctionChapters.size
      ? [`Для глав ${[...correctionChapters].join(", ")} существуют отдельные листы исправлений. Нельзя произвольно выбирать редакцию: учитывай дату и документы конкретного проекта.`]
      : [];

    return { used: true, policy: "reference_only", results, alerts };
  }

  private async discoverSources(): Promise<ProfessionalKnowledgeSource[]> {
    return await (this.sources ??= (async () => {
      const [contractNames, blueBookNames] = await Promise.all([
        listPdfNames(this.options.contractDirectoryPath),
        listPdfNames(this.options.blueBookDirectoryPath),
      ]);
      return [
        ...contractNames.map((fileName) => buildSource(this.options.contractDirectoryPath, fileName, "contract_3210")),
        ...blueBookNames.map((fileName) => buildSource(this.options.blueBookDirectoryPath, fileName, "blue_book")),
      ];
    })());
  }

  private async rankSource(source: ProfessionalKnowledgeSource, query: string, expandedTerms: string[], intents: ProfessionalKnowledgeIntent[]): Promise<RankedChunk[]> {
    const pages = await this.getPages(source);
    const queryTokens = new Set(tokenize(`${query} ${expandedTerms.join(" ")}`));
    const titleTokens = new Set(tokenize(source.fileName));
    const ranked: RankedChunk[] = [];
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      for (const excerpt of chunkPage(pages[pageIndex])) {
        const normalized = normalize(excerpt);
        if (!normalized) continue;
        const textTokens = new Set(tokenize(normalized));
        let overlap = 0;
        for (const token of queryTokens) if (textTokens.has(token)) overlap += token.length >= 6 ? 0.8 : 0.45;
        let phraseScore = 0;
        for (const term of expandedTerms) if (term.length >= 3 && includesTerm(normalized, textTokens, term)) phraseScore += term.includes(" ") ? 1.8 : 0.75;
        let titleScore = 0;
        for (const token of titleTokens) if (queryTokens.has(token)) titleScore += 0.35;
        const score = overlap + phraseScore + titleScore + (source.isCorrection ? 0.15 : 0);
        if (score <= 0) continue;
        ranked.push({
          source,
          sourceId: source.id,
          sourceKind: source.kind,
          fileName: source.fileName,
          chapterCode: source.chapterCode,
          isCorrection: source.isCorrection,
          page: pageIndex + 1,
          excerpt: excerpt.slice(0, MAX_EXCERPT_LENGTH).trim(),
          score: Math.round(score * 100) / 100,
          intents,
        });
      }
    }
    return ranked.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  private async getPages(source: ProfessionalKnowledgeSource): Promise<string[]> {
    const cached = this.memoryCache.get(source.filePath);
    if (cached) return await cached;
    const promise = this.loadOrExtractPages(source);
    this.memoryCache.set(source.filePath, promise);
    try { return await promise; } catch (error) { this.memoryCache.delete(source.filePath); throw error; }
  }

  private async loadOrExtractPages(source: ProfessionalKnowledgeSource): Promise<string[]> {
    const metadata = await stat(source.filePath);
    const fingerprint = `${metadata.size}:${Math.floor(metadata.mtimeMs)}`;
    const key = createHash("sha256").update(source.filePath.toLowerCase()).digest("hex").slice(0, 24);
    const cachePath = join(this.options.cacheDirectoryPath, `${key}.json`);
    try {
      const cached = JSON.parse(await readFile(cachePath, "utf8")) as CachedPdf;
      if (cached.fingerprint === fingerprint && cached.fileName === source.fileName && Array.isArray(cached.pages)) return cached.pages;
    } catch { /* cache miss or stale cache */ }

    const pages = await extractPdfPages(source.filePath);
    await mkdir(this.options.cacheDirectoryPath, { recursive: true });
    await writeFile(cachePath, JSON.stringify({ fingerprint, fileName: source.fileName, pages } satisfies CachedPdf), "utf8");
    return pages;
  }
}

function isKnowledgeRelevant(query: string): boolean {
  const normalized = normalize(query);
  if (normalized.length < 3) return false;
  const directTerms = [...Object.values(INTENT_TERMS).flat(), ...Object.values(CHAPTER_TERMS).flat()];
  const tokens = new Set(tokenize(normalized));
  if (directTerms.some((term) => includesTerm(normalized, tokens, term))) return true;
  return /(?:^|\D)95[.\-]\d{2}(?:[.\-]\d+)+/.test(query) || /(?:^|\D)(?:פרק|chapter|глава)\s*\d{2}/iu.test(query);
}

function detectIntents(query: string): ProfessionalKnowledgeIntent[] {
  const normalized = normalize(query);
  const tokens = new Set(tokenize(normalized));
  const intents = (Object.entries(INTENT_TERMS) as Array<[ProfessionalKnowledgeIntent, string[]]>)
    .filter(([, terms]) => terms.some((term) => includesTerm(normalized, tokens, term)))
    .map(([intent]) => intent);
  return intents.length ? intents : ["technical"];
}

function detectChapterCodes(query: string, intents: ProfessionalKnowledgeIntent[]): Set<string> {
  const normalized = normalize(query);
  const tokens = new Set(tokenize(normalized));
  const codes = new Set<string>();
  for (const match of query.matchAll(/(?:^|\D)95[.\-](\d{2})(?:[.\-]\d+)+/g)) codes.add(match[1]);
  for (const match of query.matchAll(/(?:פרק|chapter|глава)\s*(\d{2}(?:\.\d+)?(?:-\d{2})?)/giu)) codes.add(match[1]);
  for (const [code, terms] of Object.entries(CHAPTER_TERMS)) if (terms.some((term) => includesTerm(normalized, tokens, term))) codes.add(code);
  if (intents.includes("measurement") || intents.includes("price_scope")) codes.add("00");
  return codes;
}

function buildExpandedTerms(query: string, intents: ProfessionalKnowledgeIntent[], chapterCodes: Set<string>): string[] {
  const terms = new Set<string>(tokenize(query).filter((token) => token.length >= 3));
  for (const intent of intents) for (const term of INTENT_TERMS[intent]) terms.add(term);
  for (const code of chapterCodes) for (const term of CHAPTER_TERMS[code] ?? []) terms.add(term);
  return [...terms].slice(0, 180);
}

function selectSources(sources: ProfessionalKnowledgeSource[], intents: ProfessionalKnowledgeIntent[], chapterCodes: Set<string>): ProfessionalKnowledgeSource[] {
  return sources.filter((source) => {
    if (source.kind === "contract_3210") return intents.includes("contract");
    if (!source.chapterCode) return false;
    return chapterCodes.has(source.chapterCode);
  });
}

function buildSource(directoryPath: string, fileName: string, kind: ProfessionalKnowledgeSourceKind): ProfessionalKnowledgeSource {
  const chapterCode = kind === "blue_book" ? inferChapterCode(fileName) : null;
  const correction = /דף\s+תיקון/u.test(fileName);
  const suffix = kind === "contract_3210" ? "3210" : `BLUE-${chapterCode ?? "GENERAL"}-${correction ? "CORR" : "BASE"}`;
  const digest = createHash("sha1").update(fileName).digest("hex").slice(0, 8).toUpperCase();
  return { id: `REF-${suffix}-${digest}`, kind, fileName, filePath: join(directoryPath, fileName), chapterCode, isCorrection: correction };
}

function inferChapterCode(fileName: string): string | null {
  const match = fileName.match(/(?:פרק|מפרט)\s*(\d{2}(?:\.\d+)?(?:-\d{2})?)/u) ?? fileName.match(/לפרק\s*(\d{2}(?:\.\d+)?)/u);
  return match?.[1] ?? null;
}

async function listPdfNames(directoryPath: string): Promise<string[]> {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")).map((entry) => entry.name).sort((a, b) => a.localeCompare(b, "he"));
  } catch { return []; }
}

async function extractPdfPages(filePath: string): Promise<string[]> {
  const canvas = await import("@napi-rs/canvas");
  Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, ImageData: canvas.ImageData, Path2D: canvas.Path2D });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const bytes = new Uint8Array(await readFile(filePath));
  const pdf = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim());
  }
  return pages;
}

function chunkPage(text: string): string[] {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return [];
  if (compact.length <= MAX_EXCERPT_LENGTH) return [compact];
  const chunks: string[] = [];
  let start = 0;
  while (start < compact.length) {
    let end = Math.min(start + MAX_EXCERPT_LENGTH, compact.length);
    if (end < compact.length) {
      const boundary = Math.max(compact.lastIndexOf(". ", end), compact.lastIndexOf("; ", end), compact.lastIndexOf(" ", end));
      if (boundary > start + 900) end = boundary + 1;
    }
    chunks.push(compact.slice(start, end));
    if (end >= compact.length) break;
    start = Math.max(end - 180, start + 1);
  }
  return chunks;
}

function deduplicateResults(results: RankedChunk[], limit: number): RankedChunk[] {
  const selected: RankedChunk[] = [];
  const perSource = new Map<string, number>();
  for (const result of results) {
    const sourceLimit = result.sourceKind === "contract_3210" ? 4 : 2;
    if ((perSource.get(result.sourceId) ?? 0) >= sourceLimit) continue;
    if (selected.some((item) => item.sourceId === result.sourceId && Math.abs(item.page - result.page) <= 1)) continue;
    selected.push(result);
    perSource.set(result.sourceId, (perSource.get(result.sourceId) ?? 0) + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function tokenize(value: string): string[] {
  return normalize(value).match(/[\p{L}\p{N}]+/gu)?.filter((token) => token.length >= 2) ?? [];
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("he").replace(/[־–—]/g, "-").replace(/\s+/g, " ").trim();
}

function includesTerm(normalizedText: string, textTokens: Set<string>, rawTerm: string): boolean {
  const term = normalize(rawTerm);
  if (!term) return false;
  if (term.includes(" ")) return normalizedText.includes(term);
  if (/\p{Script=Cyrillic}/u.test(term) && term.length >= 4) return [...textTokens].some((token) => token.startsWith(term));
  return textTokens.has(term);
}

export const professionalKnowledgeInternals = { detectChapterCodes, detectIntents, inferChapterCode, isKnowledgeRelevant };
