import type { WorkItem } from "../../cases/domain/case-schemas.ts";
import type { PricebookItem } from "../domain/reference-schemas.ts";
import { DekelCatalogService } from "./dekel-catalog-service.ts";

export interface DekelCandidateMatch {
  code: string;
  description: string;
  unit: string;
  unitPrice: number;
  score: number;
  matchReason: string;
  metadataJson: Record<string, string>;
}

export interface DekelRoutingHints {
  mode: "global" | "chapter_preferred";
  chapterHints: string[];
  triggerTerms: string[];
}

export interface DekelSearchQueryPlanItem {
  label: string;
  query: string;
  weight: number;
  workType: string | null;
  hiddenWorkFlag: boolean;
  preferredChapterCodes: string[];
  preferredUnits: string[];
  semanticHints?: {
    diameterMm: number | null;
    depthMeters: number | null;
  };
}

export class DekelMatchingService {
  private readonly dekelCatalogService: DekelCatalogService;

  public constructor(dekelCatalogService: DekelCatalogService) {
    this.dekelCatalogService = dekelCatalogService;
  }

  public async findCandidatesByDescription(
    description: string,
    limit = 5,
    options?: {
      workItems?: WorkItem[];
    },
  ): Promise<DekelCandidateMatch[]> {
    const items = await this.dekelCatalogService.getAllPricebookItems();
    return buildDekelCandidateMatchesForCase(
      {
        description,
        workItems: options?.workItems,
      },
      items,
      limit,
    );
  }

  public async findPricebookItemsByCodes(
    codes: string[],
  ): Promise<PricebookItem[]> {
    const items = await this.dekelCatalogService.getAllPricebookItems();
    const codeSet = new Set(codes);

    return items.filter((item) => codeSet.has(item.code));
  }
}

export function buildDekelCandidateMatches(
  description: string,
  items: PricebookItem[],
  limit = 5,
): DekelCandidateMatch[] {
  const queryTokens = tokenize(description);
  const totalQueryWeight = queryTokens.reduce(
    (sum, token) => sum + getTokenWeight(token),
    0,
  );
  const routingHints = inferDekelRoutingHints(description);

  if (queryTokens.length === 0 || totalQueryWeight === 0) {
    return [];
  }

  return items
    .map((item) => {
      const itemTokens = tokenize(
        `${item.description} ${item.code} ${item.tagsJson.join(" ")}`,
      );
      const sharedTokens = queryTokens.filter((token) => itemTokens.includes(token));
      const uniqueSharedTokens = [...new Set(sharedTokens)];
      const baseScore =
        uniqueSharedTokens.reduce((sum, token) => sum + getTokenWeight(token), 0) /
        totalQueryWeight;
      const itemChapterCode = inferItemChapterCode(item);
      const chapterBoost =
        itemChapterCode && routingHints.chapterHints.includes(itemChapterCode)
          ? 0.15
          : 0;
      const reasons =
        uniqueSharedTokens.length > 0
          ? [`Shared tokens: ${uniqueSharedTokens.join(", ")}`]
          : ["No shared tokens."];

      if (chapterBoost > 0 && itemChapterCode) {
        reasons.push(`chapter boost: ${itemChapterCode}`);
      }

      return {
        code: item.code,
        description: item.description,
        unit: item.unit,
        unitPrice: item.unitPrice,
        score: roundScore(baseScore + chapterBoost),
        matchReason: reasons.join("; "),
        metadataJson: item.metadataJson,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.code.localeCompare(right.code);
    })
    .slice(0, limit);
}

export function buildDekelCandidateMatchesForCase(
  input: {
    description: string;
    workItems?: WorkItem[];
  },
  items: PricebookItem[],
  limit = 5,
): DekelCandidateMatch[] {
  const queryPlan = buildDekelSearchQueryPlan(input);
  if (queryPlan.length === 0) {
    return buildDekelCandidateMatches(input.description, items, limit);
  }

  const intermediateLimit = queryPlan.some((item) => item.workType !== null)
    ? Math.max(limit * 20, 250)
    : Math.max(limit * 3, 12);
  const candidatesByCode = new Map<
    string,
    {
      candidate: DekelCandidateMatch;
      bestWeightedScore: number;
      appearances: number;
      reasons: Set<string>;
    }
  >();

  for (const queryPlanItem of queryPlan) {
    const queryCandidates = buildRouteCandidates(
      queryPlanItem,
      items,
      intermediateLimit,
    );

    for (const queryCandidate of queryCandidates) {
      const routeAdjustment =
        calculateRouteAdjustment(queryCandidate, queryPlanItem) +
        (queryCandidate.metadataJson.route_source === "chapter_prefilter" ? 0.08 : 0);
      const weightedScore = roundScore(
        Math.max(0, queryCandidate.score * queryPlanItem.weight + routeAdjustment),
      );
      if (weightedScore <= 0) {
        continue;
      }

      const existingCandidate = candidatesByCode.get(queryCandidate.code);
      if (!existingCandidate) {
        const routeReason = buildRouteReason(
          queryCandidate.matchReason,
          queryPlanItem,
          routeAdjustment,
          queryCandidate.metadataJson.route_source ?? "global",
        );
        candidatesByCode.set(queryCandidate.code, {
          candidate: {
            ...queryCandidate,
            score: weightedScore,
            matchReason: routeReason,
          },
          bestWeightedScore: weightedScore,
          appearances: 1,
          reasons: new Set([routeReason]),
        });
        continue;
      }

      existingCandidate.bestWeightedScore = Math.max(
        existingCandidate.bestWeightedScore,
        weightedScore,
      );
      existingCandidate.appearances += 1;
      existingCandidate.reasons.add(
        buildRouteReason(
          queryCandidate.matchReason,
          queryPlanItem,
          routeAdjustment,
          queryCandidate.metadataJson.route_source ?? "global",
        ),
      );
    }
  }

  return [...candidatesByCode.values()]
    .map((entry) => {
      const consistencyBonus = Math.min(0.12, 0.04 * (entry.appearances - 1));
      return {
        ...entry.candidate,
        score: roundScore(Math.min(1, entry.bestWeightedScore + consistencyBonus)),
        matchReason: [...entry.reasons].join("; "),
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.code.localeCompare(right.code);
    })
    .slice(0, limit);
}

export function buildDekelSearchQueryPlan(input: {
  description: string;
  workItems?: WorkItem[];
}): DekelSearchQueryPlanItem[] {
  const queryPlan: DekelSearchQueryPlanItem[] = [];
  const primaryWorkItems = (input.workItems ?? []).filter(
    (workItem) => !workItem.hiddenWorkFlag,
  );
  const rawDescription = input.description.trim();

  if (rawDescription.length > 0) {
    queryPlan.push({
      label: "raw_description",
      query: rawDescription,
      weight: primaryWorkItems.length > 0 ? 0.45 : 0.72,
      workType: null,
      hiddenWorkFlag: false,
      preferredChapterCodes: [],
      preferredUnits: [],
    });
  }

  for (const workItem of input.workItems ?? []) {
    if (workItem.hiddenWorkFlag && primaryWorkItems.length > 0) {
      continue;
    }

    const query = buildWorkItemSearchQuery(workItem);
    if (query.length === 0) {
      continue;
    }

    queryPlan.push({
      label: `work_item:${workItem.workType}`,
      query,
      weight: workItem.hiddenWorkFlag ? 0.4 : 1,
      workType: workItem.workType,
      hiddenWorkFlag: workItem.hiddenWorkFlag,
      preferredChapterCodes: workTypePreferredChapters[workItem.workType] ?? [],
      preferredUnits: normalizePreferredUnits([workItem.unit]),
      semanticHints: {
        diameterMm: extractDiameterHint(workItem.description),
        depthMeters: extractDepthHint(workItem.description),
      },
    });
  }

  return dedupeDekelQueryPlan(queryPlan);
}

export function inferDekelRoutingHints(description: string): DekelRoutingHints {
  const queryTokens = tokenize(description);
  const matchedRules = chapterRoutingRules
    .map((rule) => ({
      chapterCode: rule.chapterCode,
      triggerTerms: rule.triggerTerms.filter((term) => queryTokens.includes(term)),
    }))
    .filter((rule) => rule.triggerTerms.length > 0);

  if (matchedRules.length === 0) {
    return {
      mode: "global",
      chapterHints: [],
      triggerTerms: [],
    };
  }

  return {
    mode: "chapter_preferred",
    chapterHints: [...new Set(matchedRules.map((rule) => rule.chapterCode))],
    triggerTerms: [...new Set(matchedRules.flatMap((rule) => rule.triggerTerms))],
  };
}

function tokenize(value: string): string[] {
  const tokens = normalizeText(value)
    .split(/[^\p{L}\p{N}]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .flatMap((token) => expandTokenVariants(token))
    .filter((token) => token.length >= 2)
    .filter((token) => !hebrewStopWords.has(token));

  return [...new Set(tokens)];
}

function normalizeText(value: string): string {
  return value
    .replace(/סף\s+דלת/gu, "סף")
    .replace(/door\s+threshold/giu, "threshold")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function expandTokenVariants(token: string): string[] {
  const variants = new Set([token]);
  const withoutPrefix = stripCommonHebrewPrefix(token);

  if (withoutPrefix) {
    variants.add(withoutPrefix);
  }

  const withoutPluralSuffix = stripCommonHebrewPluralSuffix(token);
  if (withoutPluralSuffix) {
    variants.add(withoutPluralSuffix);
  }

  if (withoutPrefix) {
    const withoutPrefixPluralSuffix =
      stripCommonHebrewPluralSuffix(withoutPrefix);
    if (withoutPrefixPluralSuffix) {
      variants.add(withoutPrefixPluralSuffix);
    }
  }

  return [...variants];
}

function stripCommonHebrewPrefix(token: string): string | null {
  if (!/^[ובלכהש]/u.test(token) || token.length < 4) {
    return null;
  }

  if (token.startsWith("ב") && token[1] === "י") {
    return null;
  }

  return token.slice(1);
}

function stripCommonHebrewPluralSuffix(token: string): string | null {
  if (token.length <= 4) {
    return null;
  }

  if (token.endsWith("ים") || token.endsWith("ות")) {
    return token.slice(0, -2);
  }

  return null;
}

function getTokenWeight(token: string): number {
  return lowSignalTokens.has(token) ? 0.35 : 1;
}

function buildWorkItemSearchQuery(workItem: WorkItem): string {
  const workTypeTerms = workTypeSearchTerms[workItem.workType] ?? [];
  const descriptionTerms = tokenize(workItem.description).filter(
    (token) => !queryNoiseTokens.has(token),
  );
  const unitTerms = unitSearchTerms[workItem.unit] ?? [];

  return [...new Set([...workTypeTerms, ...descriptionTerms, ...unitTerms])].join(" ");
}

function buildRouteCandidates(
  queryPlanItem: DekelSearchQueryPlanItem,
  items: PricebookItem[],
  intermediateLimit: number,
): DekelCandidateMatch[] {
  const globalCandidates = buildDekelCandidateMatches(
    queryPlanItem.query,
    items,
    intermediateLimit,
  ).map((candidate) => ({
    ...candidate,
    metadataJson: {
      ...candidate.metadataJson,
      route_source: "global",
    },
  }));

  if (queryPlanItem.preferredChapterCodes.length === 0) {
    return globalCandidates;
  }

  const preferredChapterItems = items.filter((item) => {
    const chapterCode = inferItemChapterCode(item);
    return (
      chapterCode !== null &&
      queryPlanItem.preferredChapterCodes.includes(chapterCode)
    );
  });

  if (preferredChapterItems.length === 0) {
    return globalCandidates;
  }

  const chapterCandidates = buildDekelCandidateMatches(
    queryPlanItem.query,
    preferredChapterItems,
    intermediateLimit,
  ).map((candidate) => ({
    ...candidate,
    metadataJson: {
      ...candidate.metadataJson,
      route_source: "chapter_prefilter",
    },
  }));

  return [...globalCandidates, ...chapterCandidates];
}

function buildRouteReason(
  baseReason: string,
  queryPlanItem: DekelSearchQueryPlanItem,
  routeAdjustment: number,
  routeSource: string,
): string {
  const reasons = [baseReason, `route: ${queryPlanItem.label}`];

  if (routeSource !== "global") {
    reasons.push(`route source: ${routeSource}`);
  }

  if (queryPlanItem.preferredChapterCodes.length > 0) {
    reasons.push(
      `preferred chapters: ${queryPlanItem.preferredChapterCodes.join(",")}`,
    );
  }

  if (queryPlanItem.preferredUnits.length > 0) {
    reasons.push(`preferred units: ${queryPlanItem.preferredUnits.join(",")}`);
  }

  if (routeAdjustment !== 0) {
    reasons.push(`route adjustment: ${routeAdjustment.toFixed(3)}`);
  }

  return reasons.join("; ");
}

function calculateRouteAdjustment(
  candidate: DekelCandidateMatch,
  queryPlanItem: DekelSearchQueryPlanItem,
): number {
  let adjustment = 0;
  const candidateChapterCode = normalizeChapterCode(
    candidate.metadataJson.dekel_chapter_code ?? "",
  );
  const candidateUnit = normalizeUnitForPreference(candidate.unit);

  if (
    candidateChapterCode &&
    queryPlanItem.preferredChapterCodes.includes(candidateChapterCode)
  ) {
    adjustment += queryPlanItem.hiddenWorkFlag ? 0.04 : 0.1;
  }

  if (
    candidateUnit &&
    queryPlanItem.preferredUnits.length > 0 &&
    queryPlanItem.preferredUnits.includes(candidateUnit)
  ) {
    adjustment += queryPlanItem.hiddenWorkFlag ? 0.02 : 0.06;
  }

  if (
    candidateUnit &&
    queryPlanItem.preferredUnits.length > 0 &&
    !queryPlanItem.preferredUnits.includes(candidateUnit)
  ) {
    adjustment -= 0.03;
  }

  adjustment += calculateWorkTypeSemanticAdjustment(candidate, queryPlanItem);

  return roundScore(adjustment);
}

function calculateWorkTypeSemanticAdjustment(
  candidate: DekelCandidateMatch,
  queryPlanItem: DekelSearchQueryPlanItem,
): number {
  if (!queryPlanItem.workType) {
    return 0;
  }

  const normalizedCandidateDescription = normalizeText(candidate.description);

  if (queryPlanItem.workType === "sewer_line_replacement") {
    let adjustment = 0;
    const sewerPipeInstallationTerms = [
      "צינורות",
      "מונחים בקרקע",
      "מונחים",
      "עטיפת חול",
      "מילוי חוזר",
      "p.v.c",
      "hdpe",
      "מריביב",
      "מריפלקס",
    ];
    const sewerExcavationOnlyTerms = [
      "חפירה בקרקע לגילוי",
      "גילוי צינור",
      "חשיפת הצינור",
      "לא כולל תיקון",
      "לא כולל פירוק",
    ];
    const sewerDemolitionOnlyTerms = [
      "פירוק קו ביוב",
      "חיתוך הצינור",
      "לא כולל ניתוק",
    ];
    const sewerSupplementaryTerms = [
      "קידוח אופקי",
      "תוספת לעבודות צנרת",
      "ניסור כביש",
      "פתיחה מדרכה",
    ];
    const sewerMaterialOnlyTerms = ["חומר בלבד", "מסופק באורך"];

    if (
      sewerPipeInstallationTerms.some((term) =>
        normalizedCandidateDescription.includes(term),
      )
    ) {
      adjustment += 0.18;
    }

    if (
      sewerExcavationOnlyTerms.some((term) =>
        normalizedCandidateDescription.includes(term),
      )
    ) {
      adjustment -= 0.18;
    }

    if (
      sewerDemolitionOnlyTerms.some((term) =>
        normalizedCandidateDescription.includes(term),
      )
    ) {
      adjustment -= 0.16;
    }

    if (
      sewerSupplementaryTerms.some((term) =>
        normalizedCandidateDescription.includes(term),
      )
    ) {
      adjustment -= 0.12;
    }

    if (
      sewerMaterialOnlyTerms.some((term) =>
        normalizedCandidateDescription.includes(term),
      )
    ) {
      adjustment -= 0.14;
    }

    const diameterHint = queryPlanItem.semanticHints?.diameterMm ?? null;
    if (
      diameterHint !== null &&
      new RegExp(`\\b${diameterHint}\\b`, "u").test(normalizedCandidateDescription)
    ) {
      adjustment += 0.08;
    }

    const depthHint = queryPlanItem.semanticHints?.depthMeters ?? null;
    const depthRange = extractCandidateDepthRange(normalizedCandidateDescription);
    if (
      depthHint !== null &&
      depthRange &&
      depthHint > depthRange.min &&
      depthHint <= depthRange.max
    ) {
      adjustment += 0.08;
    }

    return roundScore(adjustment);
  }

  return 0;
}

function dedupeDekelQueryPlan(
  queryPlan: DekelSearchQueryPlanItem[],
): DekelSearchQueryPlanItem[] {
  const dedupedByQuery = new Map<string, DekelSearchQueryPlanItem>();

  for (const queryPlanItem of queryPlan) {
    const normalizedQuery = queryPlanItem.query.trim();
    if (normalizedQuery.length === 0) {
      continue;
    }

    const existingQueryPlanItem = dedupedByQuery.get(normalizedQuery);
    if (!existingQueryPlanItem) {
      dedupedByQuery.set(normalizedQuery, {
        ...queryPlanItem,
        query: normalizedQuery,
        preferredChapterCodes: [...queryPlanItem.preferredChapterCodes],
        preferredUnits: [...queryPlanItem.preferredUnits],
        semanticHints: queryPlanItem.semanticHints
          ? { ...queryPlanItem.semanticHints }
          : undefined,
      });
      continue;
    }

    existingQueryPlanItem.weight = Math.max(
      existingQueryPlanItem.weight,
      queryPlanItem.weight,
    );
    if (!existingQueryPlanItem.label.includes(queryPlanItem.label)) {
      existingQueryPlanItem.label =
        `${existingQueryPlanItem.label}|${queryPlanItem.label}`;
    }
    existingQueryPlanItem.preferredChapterCodes = [
      ...new Set([
        ...existingQueryPlanItem.preferredChapterCodes,
        ...queryPlanItem.preferredChapterCodes,
      ]),
    ];
    existingQueryPlanItem.preferredUnits = [
      ...new Set([
        ...existingQueryPlanItem.preferredUnits,
        ...queryPlanItem.preferredUnits,
      ]),
    ];
    existingQueryPlanItem.semanticHints = mergeSemanticHints(
      existingQueryPlanItem.semanticHints,
      queryPlanItem.semanticHints,
    );
  }

  return [...dedupedByQuery.values()].sort((left, right) => right.weight - left.weight);
}

function normalizePreferredUnits(units: string[]): string[] {
  return [
    ...new Set(units.map((unit) => normalizeUnitForPreference(unit)).filter(Boolean)),
  ];
}

function mergeSemanticHints(
  left:
    | {
        diameterMm: number | null;
        depthMeters: number | null;
      }
    | undefined,
  right:
    | {
        diameterMm: number | null;
        depthMeters: number | null;
      }
    | undefined,
): {
  diameterMm: number | null;
  depthMeters: number | null;
} | undefined {
  if (!left) {
    return right ? { ...right } : undefined;
  }

  if (!right) {
    return left;
  }

  return {
    diameterMm: left.diameterMm ?? right.diameterMm,
    depthMeters: left.depthMeters ?? right.depthMeters,
  };
}

function extractDiameterHint(value: string): number | null {
  const match = value.match(/diameter[^0-9]{0,10}(\d+(?:[.,]\d+)?)/iu);
  return match?.[1] ? parsePositiveNumber(match[1]) : null;
}

function extractDepthHint(value: string): number | null {
  const match = value.match(/depth[^0-9]{0,10}(\d+(?:[.,]\d+)?)/iu);
  return match?.[1] ? parsePositiveNumber(match[1]) : null;
}

function extractCandidateDepthRange(value: string): { min: number; max: number } | null {
  const explicitRangeMatch = value.match(
    /(?:בעומק|depth)\s+מעל\s+(\d+(?:[.,]\d+)?)\s*(?:מ['"]?|m)?\s+ועד\s+(\d+(?:[.,]\d+)?)/iu,
  );
  if (explicitRangeMatch?.[1] && explicitRangeMatch?.[2]) {
    const min = parsePositiveNumber(explicitRangeMatch[1]);
    const max = parsePositiveNumber(explicitRangeMatch[2]);

    if (min !== null && max !== null) {
      return { min, max };
    }
  }

  const upperOnlyMatch = value.match(
    /(?:בעומק|depth)\s+עד\s+(\d+(?:[.,]\d+)?)/iu,
  );
  if (upperOnlyMatch?.[1]) {
    const max = parsePositiveNumber(upperOnlyMatch[1]);
    if (max !== null) {
      return { min: 0, max };
    }
  }

  return null;
}

function parsePositiveNumber(value: string): number | null {
  const normalizedValue = value.replace(/,/gu, ".").trim();
  const parsedValue = Number.parseFloat(normalizedValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

function normalizeUnitForPreference(unit: string): string {
  const normalizedUnit = unit.trim().toLowerCase();

  if (/^(m2|sqm|sq\s*m|מר|מ"ר|מ׳ר)$/iu.test(normalizedUnit)) {
    return "m2";
  }

  if (/^(m|meter|meters|מטר|מ)$/iu.test(normalizedUnit)) {
    return "m";
  }

  if (/^(unit|ea|pcs?|יח|יחידה)$/iu.test(normalizedUnit)) {
    return "unit";
  }

  return normalizedUnit;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function inferItemChapterCode(item: PricebookItem): string | null {
  const chapterFromMetadata = normalizeChapterCode(
    item.metadataJson.dekel_chapter_code ?? "",
  );

  if (chapterFromMetadata) {
    return chapterFromMetadata;
  }

  return (
    normalizeChapterCode(item.code) ??
    normalizeChapterCode(item.section) ??
    null
  );
}

function normalizeChapterCode(value: string): string | null {
  const match = value.match(/^(\d{2})/u);
  return match ? match[1] : null;
}

const chapterRoutingRules = [
  {
    chapterCode: "40",
    triggerTerms: ["סלילה", "אספלט", "כביש", "מדרכה", "ריבוד", "קרצוף"],
  },
] as const;

const hebrewStopWords = new Set(["של", "עם", "את", "על", "צריך", "ללא", "או"]);
const lowSignalTokens = new Set([
  "החלפת",
  "פירוק",
  "תיקון",
  "תיקוני",
  "ביצוע",
  "replace",
  "replacement",
  "repair",
  "execution",
  "need",
]);
const queryNoiseTokens = new Set([
  ...lowSignalTokens,
  "local",
  "general",
  "scope",
]);
const unitSearchTerms: Record<string, string[]> = {
  m2: ["מ\"ר", "m2", "sqm"],
  m: ["מטר", "m"],
  unit: ["יח", "unit"],
};
const workTypeSearchTerms: Record<string, string[]> = {
  floor_replacement: ["ריצוף", "רצפה", "flooring", "tile"],
  surface_preparation: ["הכנת", "תשתית", "ריצוף", "substrate"],
  debris_removal: ["פינוי", "פסולת", "debris"],
  door_replacement: ["דלת", "דלתות", "door", "interior"],
  perimeter_wall_repair: ["קיר", "טיח", "משקוף", "wall", "plaster"],
  cabinet_replacement: ["ארון", "כיבוי", "אש", "cabinet", "fire"],
  wall_repair: ["קיר", "טיח", "צבע", "wall", "plaster"],
  sewer_line_replacement: ["ביוב", "קו", "צינור", "sewer", "pipe"],
  trench_excavation: ["חפירה", "תעלה", "ביוב", "trench", "excavation"],
  backfill_restoration: ["מילוי", "שיקום", "ריצוף", "backfill", "restoration"],
};
const workTypePreferredChapters: Record<string, string[]> = {
  floor_replacement: ["10", "40"],
  surface_preparation: ["10", "40"],
  wall_repair: ["11"],
  perimeter_wall_repair: ["11", "06"],
  door_replacement: ["06"],
  cabinet_replacement: ["07", "06"],
  sewer_line_replacement: ["57"],
  trench_excavation: ["57"],
  backfill_restoration: ["57", "40"],
};
