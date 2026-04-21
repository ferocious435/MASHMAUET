import type { SelectedDekelLine } from "../../cases/domain/case-schemas.ts";
import type { DekelCandidateMatch } from "./dekel-matching-service.ts";

export interface CaseDekelEstimatePreviewLine {
  serialNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  score: number;
  sourceCode: string;
  sourceActivityNumber: string | null;
}

export interface CaseDekelEstimatePreview {
  lines: CaseDekelEstimatePreviewLine[];
  executionSubtotal: number;
  managementFeePercent: number;
  managementFeeAmount: number;
  totalProjectCost: number;
}

export function buildCaseEstimatePreviewFromDekelCandidates(
  candidates: DekelCandidateMatch[],
  options?: {
    managementFeePercent?: number;
    maxLines?: number;
    queryText?: string;
    dimensions?: {
      length?: number;
      width?: number;
      areaSquareMeters?: number;
      units?: number;
      lineLengthMeters?: number;
      lengthWidthInterpretation?:
        | "unknown"
        | "area_basis"
        | "geometry_only"
        | "linear_basis"
        | "volume_basis";
    };
  },
): CaseDekelEstimatePreview {
  const managementFeePercent = options?.managementFeePercent ?? 14;
  const previewCandidates = selectPreviewCandidatesForEstimatePreview(candidates, {
    maxLines: options?.maxLines,
    queryText: options?.queryText,
  });

  return buildCaseEstimatePreview(
    previewCandidates.map((candidate) => ({
      description: candidate.description,
      quantity: inferPreviewQuantityFromQuery(
        candidate.unit,
        options?.queryText,
        options?.dimensions,
      ),
      unit: candidate.unit,
      unitPrice: candidate.unitPrice,
      score: candidate.score,
      sourceCode: candidate.code,
      sourceActivityNumber:
        candidate.metadataJson.dekel_activity_number?.trim() || null,
    })),
    managementFeePercent,
  );
}

export function buildCaseEstimatePreviewFromSelectedDekelLines(
  selections: SelectedDekelLine[],
  options?: {
    managementFeePercent?: number;
  },
): CaseDekelEstimatePreview {
  const managementFeePercent = options?.managementFeePercent ?? 14;

  return buildCaseEstimatePreview(
    selections.map((selection) => ({
      description: selection.description,
      quantity: selection.quantity,
      unit: selection.unit,
      unitPrice: selection.unitPrice,
      score: 1,
      sourceCode: selection.code,
      sourceActivityNumber: selection.sourceActivityNumber,
    })),
    managementFeePercent,
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function inferPreviewQuantityFromQuery(
  unit: string,
  queryText: string | undefined,
  dimensions:
      | {
          length?: number;
          width?: number;
          areaSquareMeters?: number;
          units?: number;
          lineLengthMeters?: number;
          lengthWidthInterpretation?:
            | "unknown"
            | "area_basis"
            | "geometry_only"
            | "linear_basis"
            | "volume_basis";
        }
    | undefined,
): number {
  if (isAreaUnit(unit)) {
    const explicitArea = extractExplicitAreaQuantity(queryText);
    if (explicitArea !== null) {
      return explicitArea;
    }
    if (dimensions?.areaSquareMeters !== undefined) {
      return roundMoney(dimensions.areaSquareMeters);
    }
    if (dimensions?.length && dimensions?.width) {
      if (dimensions.lengthWidthInterpretation !== "area_basis") {
        return 1;
      }
      return roundMoney(dimensions.length * dimensions.width);
    }
    return 1;
  }

  if (isLinearUnit(unit)) {
    const explicitLength = extractExplicitLinearQuantity(queryText);
    if (explicitLength !== null) {
      return explicitLength;
    }
    return dimensions?.lineLengthMeters ?? 1;
  }

  if (isDiscreteUnit(unit)) {
    const explicitUnits = extractExplicitDiscreteQuantity(queryText);
    if (explicitUnits !== null) {
      return explicitUnits;
    }
    return dimensions?.units ?? 1;
  }

  return 1;
}

function buildCaseEstimatePreview(
  sourceLines: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    score: number;
    sourceCode: string;
    sourceActivityNumber: string | null;
  }>,
  managementFeePercent: number,
): CaseDekelEstimatePreview {
  const lines = sourceLines.map((sourceLine, index) => ({
    serialNumber: index + 1,
    description: sourceLine.description,
    quantity: sourceLine.quantity,
    unit: sourceLine.unit,
    unitPrice: sourceLine.unitPrice,
    amount: roundMoney(sourceLine.quantity * sourceLine.unitPrice),
    score: sourceLine.score,
    sourceCode: sourceLine.sourceCode,
    sourceActivityNumber: sourceLine.sourceActivityNumber,
  }));

  const executionSubtotal = roundMoney(
    lines.reduce((sum, line) => sum + line.amount, 0),
  );
  const managementFeeAmount = roundMoney(
    executionSubtotal * (managementFeePercent / 100),
  );
  const totalProjectCost = roundMoney(executionSubtotal + managementFeeAmount);

  return {
    lines,
    executionSubtotal,
    managementFeePercent,
    managementFeeAmount,
    totalProjectCost,
  };
}

function selectPreviewCandidatesForEstimatePreview(
  candidates: DekelCandidateMatch[],
  options?: {
    maxLines?: number;
    queryText?: string;
  },
): DekelCandidateMatch[] {
  const maxLines = Math.max(1, options?.maxLines ?? candidates.length);
  if (!isSewerPreviewContext(candidates, options?.queryText)) {
    return candidates.slice(0, maxLines);
  }

  return selectBalancedSewerPreviewCandidates(
    candidates,
    maxLines,
    options?.queryText,
  );
}

function selectBalancedSewerPreviewCandidates(
  candidates: DekelCandidateMatch[],
  maxLines: number,
  queryText: string | undefined,
): DekelCandidateMatch[] {
  const sortedCandidates = [...candidates].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.code.localeCompare(right.code);
  });
  const selectedCandidates: DekelCandidateMatch[] = [];
  const selectedCodes = new Set<string>();
  const packageSignals = inferSewerPackageSignals(queryText);
  const preferredFamilies = buildPreferredSewerFamilies(packageSignals);

  for (const family of preferredFamilies) {
    if (selectedCandidates.length >= maxLines) {
      break;
    }

    const familyCandidate = sortedCandidates.find(
      (candidate) =>
        !selectedCodes.has(candidate.code) &&
        classifySewerPreviewFamily(candidate) === family,
    );
    if (!familyCandidate) {
      continue;
    }

    selectedCandidates.push(familyCandidate);
    selectedCodes.add(familyCandidate.code);
  }

  for (const candidate of sortedCandidates) {
    if (selectedCandidates.length >= maxLines) {
      break;
    }

    if (selectedCodes.has(candidate.code)) {
      continue;
    }

    if (isRedundantSewerPreviewCandidate(candidate, selectedCandidates)) {
      continue;
    }

    if (!shouldIncludeAdditionalSewerCandidate(candidate, packageSignals)) {
      continue;
    }

    selectedCandidates.push(candidate);
    selectedCodes.add(candidate.code);
  }

  return selectedCandidates;
}

function isSewerPreviewContext(
  candidates: DekelCandidateMatch[],
  queryText: string | undefined,
): boolean {
  const contextText = [
    queryText ?? "",
    ...candidates.map((candidate) => `${candidate.description} ${candidate.matchReason}`),
  ].join(" ");

  return /(ביוב|sewer|drain(?:age)?|צנרת|pipe|manhole|שוחה|תא\s+ביקורת)/iu.test(
    contextText,
  );
}

type SewerPreviewFamily =
  | "pipe_installation"
  | "connection"
  | "demolition"
  | "excavation"
  | "restoration"
  | "material_only"
  | "other";

interface SewerPackageSignals {
  demolitionRequested: boolean;
  connectionRequested: boolean;
  excavationRequested: boolean;
  restorationRequested: boolean;
}

function classifySewerPreviewFamily(
  candidate: DekelCandidateMatch,
): SewerPreviewFamily {
  const normalizedText = normalizePreviewText(
    `${candidate.description} ${candidate.matchReason}`,
  );

  if (
    /(תא ביקורת|שוחה|חיבור|connection|manhole|junction|inspection chamber)/iu.test(
      normalizedText,
    )
  ) {
    return "connection";
  }

  if (/(פירוק|demolition|removal|cutting|חיתוך|ניתוק)/iu.test(normalizedText)) {
    return "demolition";
  }

  if (
    /(צינור|צינורות|pipe|pvc|hdpe|pe-?100|מריפלקס|מונח|מונחים|קו ביוב)/iu.test(
      normalizedText,
    )
  ) {
    return "pipe_installation";
  }

  if (/(חפירה|excavat|trench|גילוי|חשיפת)/iu.test(normalizedText)) {
    return "excavation";
  }

  if (
    /(מילוי חוזר|עטיפת חול|backfill|sand wrapping|reinstatement|restoration)/iu.test(
      normalizedText,
    )
  ) {
    return "restoration";
  }

  if (/(חומר בלבד|מסופק באורך|material only|supply only)/iu.test(normalizedText)) {
    return "material_only";
  }

  return "other";
}

function isRedundantSewerPreviewCandidate(
  candidate: DekelCandidateMatch,
  selectedCandidates: DekelCandidateMatch[],
): boolean {
  const candidateFamily = classifySewerPreviewFamily(candidate);

  return selectedCandidates.some((selectedCandidate) => {
    if (classifySewerPreviewFamily(selectedCandidate) !== candidateFamily) {
      return false;
    }

    if (candidateFamily === "pipe_installation") {
      return true;
    }

    return buildPreviewCandidateFingerprint(selectedCandidate) ===
      buildPreviewCandidateFingerprint(candidate);
  });
}

function buildPreviewCandidateFingerprint(candidate: DekelCandidateMatch): string {
  return normalizePreviewText(candidate.description)
    .replace(/\d+(?:[.,]\d+)?/g, "#")
    .trim();
}

function normalizePreviewText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function inferSewerPackageSignals(
  queryText: string | undefined,
): SewerPackageSignals {
  const contextText = normalizePreviewText(queryText ?? "");

  return {
    demolitionRequested:
      /(פירוק|demolition|removal|cutting|חיתוך|ניתוק|existing line|old line|קו קיים|ישן)/iu.test(
        contextText,
      ),
    connectionRequested:
      /(connection|חיבור|manhole|junction|inspection chamber|תא ביקורת|שוחה)/iu.test(
        contextText,
      ),
    excavationRequested:
      /(excavat|trench|חפירה|גילוי|חשיפת|open cut)/iu.test(contextText),
    restorationRequested:
      /(restore|restoration|reinstatement|asphalt|pavement|sidewalk|road|backfill|sand wrapping|מילוי חוזר|עטיפת חול|מדרכה|כביש|ריצוף)/iu.test(
        contextText,
      ),
  };
}

function buildPreferredSewerFamilies(
  signals: SewerPackageSignals,
): SewerPreviewFamily[] {
  const families: SewerPreviewFamily[] = ["pipe_installation"];

  if (signals.demolitionRequested) {
    families.push("demolition");
  }
  if (signals.connectionRequested) {
    families.push("connection");
  }
  if (signals.excavationRequested) {
    families.push("excavation");
  }
  if (signals.restorationRequested) {
    families.push("restoration");
  }

  families.push("other");
  return families;
}

function shouldIncludeAdditionalSewerCandidate(
  candidate: DekelCandidateMatch,
  signals: SewerPackageSignals,
): boolean {
  switch (classifySewerPreviewFamily(candidate)) {
    case "demolition":
      return signals.demolitionRequested;
    case "connection":
      return signals.connectionRequested;
    case "excavation":
      return signals.excavationRequested;
    case "restoration":
      return signals.restorationRequested;
    case "other":
      return true;
    default:
      return false;
  }
}

function isAreaUnit(unit: string): boolean {
  return /^(m2|sqm|sq\s*m|מ["׳´]?ר)$/iu.test(unit.trim());
}

function isLinearUnit(unit: string): boolean {
  return /^(m|meter|meters|מטר|מ(?:׳³|'|")?)$/iu.test(unit.trim());
}

function isDiscreteUnit(unit: string): boolean {
  return /^(unit|ea|pcs?|יח(?:׳³|ידה|ידות)?)$/iu.test(unit.trim());
}

function extractExplicitAreaQuantity(queryText: string | undefined): number | null {
  if (!queryText) {
    return null;
  }

  const match = queryText.match(
    /(\d+(?:[.,]\d+)?)\s*(?:square\s*meters?|sqm|sq\s*m|m2|מ["׳´]?ר|מטר(?:ים)?\s+מרוב(?:עים)?)/iu,
  );
  if (!match) {
    return null;
  }

  return Number(match[1].replace(",", "."));
}

function extractExplicitLinearQuantity(queryText: string | undefined): number | null {
  if (!queryText) {
    return null;
  }

  const contextualMatch = queryText.match(
    /(?:קו(?:\s+ביוב)?|sewer\s+line|drain(?:age)?\s+line|pipe)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*(?:m|meters?|מטר(?:ים)?)/iu,
  );
  if (contextualMatch) {
    return Number(contextualMatch[1].replace(",", "."));
  }

  const genericMatches = [
    ...queryText.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:m|meters?|מטר(?:ים)?)/giu),
  ]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (genericMatches.length === 0) {
    return null;
  }

  return Math.max(...genericMatches);
}

function extractExplicitDiscreteQuantity(queryText: string | undefined): number | null {
  if (!queryText) {
    return null;
  }

  const patterns = [
    /\b(\d+(?:[.,]\d+)?)\s+(?:interior\s+)?doors?\b/iu,
    /(\d+(?:[.,]\d+)?)\s*דלת(?:ות)?/u,
    /\b(\d+(?:[.,]\d+)?)\s+(?:fire\s+)?cabinet(?:s)?\b/iu,
    /(\d+(?:[.,]\d+)?)\s*ארו(?:ן|נות)\s+כיבוי\s+אש/u,
  ];

  for (const pattern of patterns) {
    const match = queryText.match(pattern);
    if (match) {
      return Number(match[1].replace(",", "."));
    }
  }

  return null;
}
