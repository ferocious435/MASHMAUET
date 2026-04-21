import type {
  MavnadimAncillaryRecommendation,
  MavnadimCandidateMatch,
  MavnadimCatalogItem,
} from "../domain/mavnadim-schemas.ts";
import { MavnadimCatalogService } from "./mavnadim-catalog-service.ts";

interface MavnadimMatchingOptions {
  dimensions?: {
    length?: number;
    width?: number;
    areaSquareMeters?: number;
    lengthWidthInterpretation?: string;
  };
}

interface DimensionSignature {
  kind: "pair" | "area";
  normalizedValue: string;
  sourceText: string;
}

export class MavnadimMatchingService {
  private readonly mavnadimCatalogService: MavnadimCatalogService;

  public constructor(mavnadimCatalogService: MavnadimCatalogService) {
    this.mavnadimCatalogService = mavnadimCatalogService;
  }

  public async findCandidatesByDescription(
    description: string,
    limit = 3,
    options?: MavnadimMatchingOptions,
  ): Promise<Array<MavnadimCandidateMatch & {
    ancillaryRecommendations: MavnadimAncillaryRecommendation[];
  }>> {
    const items = await this.mavnadimCatalogService.getAllCatalogItems();
    const candidates = buildMavnadimCandidateMatches(
      description,
      items,
      limit,
      options,
    );

    return candidates.map((candidate) => ({
      ...candidate,
      ancillaryRecommendations: buildMavnadimAncillaryRecommendations(
        description,
        candidate,
      ),
    }));
  }

  public async findCatalogItemById(catalogItemId: string): Promise<MavnadimCatalogItem | null> {
    return this.mavnadimCatalogService.findById(catalogItemId);
  }
}

export function buildMavnadimCandidateMatches(
  description: string,
  items: MavnadimCatalogItem[],
  limit = 3,
  options?: MavnadimMatchingOptions,
): MavnadimCandidateMatch[] {
  const queryTokens = tokenize(description);
  const queryDimensions = inferQueryDimensionSignatures(description, options);

  if (queryTokens.length === 0 && queryDimensions.length === 0) {
    return [];
  }

  return items
    .map((item) => {
      const itemTokens = tokenize(
        [
          item.displayName,
          item.shortLabel,
          item.dimensionsLabel,
          item.category,
          item.tags.join(" "),
          item.possibleUses.join(" "),
          item.includedFeatures.join(" "),
        ].join(" "),
      );
      const sharedTokens = [...new Set(queryTokens.filter((token) => itemTokens.includes(token)))];
      const baseScore =
        queryTokens.length === 0 ? 0 : sharedTokens.length / queryTokens.length;
      const categoryBoost = inferCategoryBoost(queryTokens, item);
      const dimensionBoost = inferDimensionBoost(queryDimensions, item.dimensionsLabel);
      const score = roundScore(baseScore + categoryBoost + dimensionBoost.scoreBoost);
      const reasons =
        sharedTokens.length > 0
          ? [`Shared tokens: ${sharedTokens.join(", ")}`]
          : ["No shared tokens."];

      if (categoryBoost > 0) {
        reasons.push(`category boost: ${item.category}`);
      }

      if (dimensionBoost.reason !== null) {
        reasons.push(dimensionBoost.reason);
      }

      return {
        catalogItemId: item.catalogItemId,
        displayName: item.displayName,
        shortLabel: item.shortLabel,
        category: item.category,
        dimensionsLabel: item.dimensionsLabel,
        basePrice: item.basePrice,
        sourceImageName: item.sourceImageName,
        score,
        matchReason: reasons.join("; "),
        tags: [...item.tags],
      } satisfies MavnadimCandidateMatch;
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.catalogItemId.localeCompare(right.catalogItemId);
    })
    .slice(0, limit);
}

export function buildMavnadimAncillaryRecommendations(
  description: string,
  candidate: Pick<MavnadimCandidateMatch, "displayName" | "category" | "tags">,
): MavnadimAncillaryRecommendation[] {
  const queryTokens = tokenize(description);
  const wetUse = isWetUse(candidate);
  const recommendations: MavnadimAncillaryRecommendation[] = [
    buildRecommendation({
      key: "electricity_connection",
      title: "חיבור חשמל חיצוני",
      explicitTerms: ["חשמל", "הזנה", "חיבור"],
      conditional: true,
      reasonWhenConditional:
        "במפרט קיימות עבודות חשמל פנימיות, אבל חיבור חיצוני תלוי באתר ובמרחק להזנה.",
      suggestedDekelSearchTerms: ["חיבור חשמל", "לוח חשמל", "הזנת חשמל"],
      queryTokens,
    }),
    buildRecommendation({
      key: "water_connection",
      title: "חיבור מים חיצוני",
      explicitTerms: ["מים", "צנרת", "חיבור"],
      conditional: wetUse,
      reasonWhenConditional:
        "למבנה יש שימוש רטוב או שירותי הסעדה, ולכן צריך לבדוק האם נדרש קו מים חיצוני.",
      suggestedDekelSearchTerms: ["חיבור מים", "קו מים", "צנרת מים"],
      queryTokens,
    }),
    buildRecommendation({
      key: "sewer_connection",
      title: "חיבור ביוב",
      explicitTerms: ["ביוב", "שוחות", "ניקוז"],
      conditional: wetUse,
      reasonWhenConditional:
        "למבנה יש שימוש רטוב, ולכן צריך לבדוק אם נדרש חיבור ביוב או פתרון פינוי אחר.",
      suggestedDekelSearchTerms: ["חיבור ביוב", "קו ביוב", "שוחת ביוב"],
      queryTokens,
    }),
    buildRecommendation({
      key: "foundation",
      title: "יסודות / בסיס הצבה",
      explicitTerms: ["יסוד", "יסודות", "ביסוס", "בסיס"],
      conditional: true,
      reasonWhenConditional:
        "הצבת מבנה מוכן בדרך כלל דורשת בדיקה של בסיס או יסודות, אבל לא נכון להוסיף זאת אוטומטית.",
      suggestedDekelSearchTerms: ["יסודות", "משטח בטון", "רצפת בטון"],
      queryTokens,
    }),
    buildRecommendation({
      key: "placement_infrastructure",
      title: "תשתית להצבה",
      explicitTerms: ["תשתית", "הצבה", "משטח", "הכשרה"],
      conditional: true,
      reasonWhenConditional:
        "לעתים צריך הכשרת שטח או תשתית להצבה, אך זה תלוי בתנאי האתר ובסוג המבנה.",
      suggestedDekelSearchTerms: ["תשתית להצבה", "הכשרת שטח", "משטח הצבה"],
      queryTokens,
    }),
  ];

  return recommendations.sort(compareRecommendationPriority);
}

function buildRecommendation(input: {
  key: MavnadimAncillaryRecommendation["key"];
  title: string;
  explicitTerms: string[];
  conditional: boolean;
  reasonWhenConditional: string;
  suggestedDekelSearchTerms: string[];
  queryTokens: string[];
}): MavnadimAncillaryRecommendation {
  const matchedTerms = input.explicitTerms.filter((term) =>
    input.queryTokens.includes(term),
  );

  if (matchedTerms.length > 0) {
    return {
      key: input.key,
      title: input.title,
      status: "explicitly_requested",
      reason: `Запрос явно содержит: ${matchedTerms.join(", ")}.`,
      suggestedDekelSearchTerms: input.suggestedDekelSearchTerms,
      responsibleSkill: "architecture",
    };
  }

  if (input.conditional) {
    return {
      key: input.key,
      title: input.title,
      status: "conditional_review",
      reason: input.reasonWhenConditional,
      suggestedDekelSearchTerms: input.suggestedDekelSearchTerms,
      responsibleSkill: "architecture",
    };
  }

  return {
    key: input.key,
    title: input.title,
    status: "usually_not_required",
    reason: "В текущем описании нет прямого сигнала, что этот слой обязателен.",
    suggestedDekelSearchTerms: input.suggestedDekelSearchTerms,
    responsibleSkill: "architecture",
  };
}

function isWetUse(candidate: Pick<MavnadimCandidateMatch, "category" | "tags">): boolean {
  return (
    candidate.category === "sanitation" ||
    candidate.category === "hotel" ||
    candidate.category === "commercial" ||
    candidate.tags.some((tag) =>
      ["מים", "ביוב", "שירותים", "מקלחת", "רטוב", "מזנון"].includes(tag),
    )
  );
}

function inferCategoryBoost(
  queryTokens: string[],
  item: Pick<MavnadimCatalogItem, "category" | "tags">,
): number {
  if (
    queryTokens.some((token) => ["שירותים", "מקלחת", "תאים", "סניטרי"].includes(token)) &&
    item.category === "sanitation"
  ) {
    return 0.3;
  }

  if (
    queryTokens.some((token) => ["מגורים", "חדר", "אירוח"].includes(token)) &&
    (item.category === "residential" || item.category === "hotel")
  ) {
    return 0.25;
  }

  if (
    queryTokens.some((token) => ["משרד", "משרדים", "שירות"].includes(token)) &&
    item.category === "service"
  ) {
    return 0.25;
  }

  if (
    queryTokens.some((token) => ["קפה", "קיוסק", "מזנון", "מכולת"].includes(token)) &&
    item.category === "commercial"
  ) {
    return 0.35;
  }

  if (
    queryTokens.some((token) => ["מועדון", "קהילה", "פעילות"].includes(token)) &&
    item.category === "club"
  ) {
    return 0.3;
  }

  if (
    queryTokens.some((token) => ["מודולרי", '6/6', "חלל"].includes(token)) &&
    item.category === "modular"
  ) {
    return 0.2;
  }

  return 0;
}

function inferQueryDimensionSignatures(
  description: string,
  options?: MavnadimMatchingOptions,
): DimensionSignature[] {
  const signatures: DimensionSignature[] = [];
  const inlinePair = extractDimensionPair(description);
  const inlineArea = extractAreaSignature(description);

  if (inlinePair !== null) {
    signatures.push(inlinePair);
  }

  if (inlineArea !== null) {
    signatures.push(inlineArea);
  }

  if (
    inlinePair === null &&
    options?.dimensions?.length !== undefined &&
    options.dimensions.width !== undefined
  ) {
    signatures.push(
      createPairSignature(
        options.dimensions.length,
        options.dimensions.width,
        `${options.dimensions.length}x${options.dimensions.width}`,
      ),
    );
  }

  if (inlineArea === null && options?.dimensions?.areaSquareMeters !== undefined) {
    signatures.push(
      createAreaSignature(
        options.dimensions.areaSquareMeters,
        `${options.dimensions.areaSquareMeters} sqm`,
      ),
    );
  }

  return deduplicateSignatures(signatures);
}

function inferDimensionBoost(
  queryDimensions: DimensionSignature[],
  dimensionsLabel: string,
): { scoreBoost: number; reason: string | null } {
  const itemSignature = parseCatalogDimensionSignature(dimensionsLabel);

  if (itemSignature === null) {
    return { scoreBoost: 0, reason: null };
  }

  const matchedQuerySignature = queryDimensions.find(
    (signature) =>
      signature.kind === itemSignature.kind &&
      signature.normalizedValue === itemSignature.normalizedValue,
  );

  if (matchedQuerySignature === undefined) {
    return { scoreBoost: 0, reason: null };
  }

  const scoreBoost = itemSignature.kind === "pair" ? 0.55 : 0.45;
  return {
    scoreBoost,
    reason: `dimension boost: ${matchedQuerySignature.sourceText} -> ${itemSignature.sourceText}`,
  };
}

function parseCatalogDimensionSignature(dimensionsLabel: string): DimensionSignature | null {
  const pairSignature = extractDimensionPair(dimensionsLabel);

  if (pairSignature !== null) {
    return pairSignature;
  }

  return extractAreaSignature(dimensionsLabel);
}

function extractDimensionPair(value: string): DimensionSignature | null {
  const match = value.match(/(\d+(?:\.\d+)?)\s*(?:x|X|\/|\\)\s*(\d+(?:\.\d+)?)/u);

  if (match === null) {
    return null;
  }

  return createPairSignature(Number(match[1]), Number(match[2]), match[0]);
}

function createPairSignature(
  length: number,
  width: number,
  sourceText: string,
): DimensionSignature {
  const orderedValues = [length, width].sort((left, right) => left - right);
  return {
    kind: "pair",
    normalizedValue: `${formatDimensionNumber(orderedValues[0])}x${formatDimensionNumber(orderedValues[1])}`,
    sourceText: normalizeText(sourceText),
  };
}

function extractAreaSignature(value: string): DimensionSignature | null {
  const match = value.match(
    /(\d+(?:\.\d+)?)\s*(?:sqm|square\s*meters?|m2|m²|["'׳״]?[a-z\u0590-\u05ff]{0,2}["'׳״]?)/iu,
  );

  if (match === null) {
    return null;
  }

  const rawNumber = Number(match[1]);

  if (!Number.isFinite(rawNumber)) {
    return null;
  }

  if (!looksLikeAreaLabel(match[0], value)) {
    return null;
  }

  return createAreaSignature(rawNumber, match[0]);
}

function createAreaSignature(areaSquareMeters: number, sourceText: string): DimensionSignature {
  return {
    kind: "area",
    normalizedValue: formatDimensionNumber(areaSquareMeters),
    sourceText: normalizeText(sourceText),
  };
}

function looksLikeAreaLabel(candidate: string, fullText: string): boolean {
  return /sqm|square\s*meters?|m2|m²/iu.test(candidate) || /["'׳״]/u.test(fullText);
}

function deduplicateSignatures(signatures: DimensionSignature[]): DimensionSignature[] {
  const seen = new Set<string>();
  const unique: DimensionSignature[] = [];

  for (const signature of signatures) {
    const dedupeKey = `${signature.kind}:${signature.normalizedValue}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    unique.push(signature);
  }

  return unique;
}

function tokenize(value: string): string[] {
  return [...new Set(
    normalizeText(value)
    .split(/[^\p{L}\p{N}"/]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !hebrewStopWords.has(token))
    .flatMap(expandHebrewTokenVariants),
  )];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}

function formatDimensionNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(3).replace(/\.?0+$/u, "");
}

function expandHebrewTokenVariants(token: string): string[] {
  const variants = [token];

  if (token.startsWith("ו") && token.length >= 3) {
    variants.push(token.slice(1));
  }

  return variants;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function compareRecommendationPriority(
  left: MavnadimAncillaryRecommendation,
  right: MavnadimAncillaryRecommendation,
): number {
  const order = {
    explicitly_requested: 0,
    conditional_review: 1,
    usually_not_required: 2,
  } as const;

  if (order[left.status] !== order[right.status]) {
    return order[left.status] - order[right.status];
  }

  return left.title.localeCompare(right.title);
}

const hebrewStopWords = new Set([
  "של",
  "עם",
  "את",
  "על",
  "בלי",
  "או",
  "גם",
  "צריך",
  "מבנה",
]);
