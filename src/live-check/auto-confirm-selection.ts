export interface AutoConfirmSelectionLine {
  code: string;
  quantity: number;
}

export function buildAutoConfirmSelectionLines(input: {
  estimatePreviewBody: unknown;
  candidatesBody: unknown;
  autoConfirmTop: number;
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
  description?: string;
}): AutoConfirmSelectionLine[] {
  const autoConfirmTop = Math.max(0, input.autoConfirmTop);
  if (autoConfirmTop === 0) {
    return [];
  }

  const previewLines = asArray(asObject(input.estimatePreviewBody).lines)
    .map((line) => asObject(line))
    .map((line) => ({
      code: String(line.sourceCode ?? "").trim(),
      quantity: Number(line.quantity ?? 0),
    }))
    .filter(
      (line) =>
        line.code.length > 0 &&
        Number.isFinite(line.quantity) &&
        line.quantity > 0,
    );
  if (previewLines.length > 0) {
    return previewLines.slice(0, autoConfirmTop);
  }

  return asArray(asObject(input.candidatesBody).candidates)
    .slice(0, autoConfirmTop)
    .map((candidate) => {
      const candidateObject = asObject(candidate);
      return {
        code: String(candidateObject.code ?? ""),
        quantity: inferPreviewQuantity(
          candidateObject,
          input.dimensions,
          input.description,
        ),
      };
    })
    .filter((line) => line.code.trim().length > 0);
}

function inferPreviewQuantity(
  candidate: Record<string, unknown>,
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
  description: string | undefined,
): number {
  const unit = String(candidate.unit ?? "");
  if (unit === "unit" && dimensions?.units) {
    return dimensions.units;
  }
  if (unit === "m2" && dimensions?.areaSquareMeters !== undefined) {
    return roundQuantity(dimensions.areaSquareMeters);
  }
  if (
    unit === "m2" &&
    dimensions?.length &&
    dimensions?.width &&
    dimensions.lengthWidthInterpretation === "area_basis"
  ) {
    return roundQuantity(dimensions.length * dimensions.width);
  }
  if (/^(m|meter|meters|מטר|מ(?:׳³|'|")?)$/iu.test(unit)) {
    const explicitLength = extractExplicitLinearQuantity(description);
    if (explicitLength !== null) {
      return explicitLength;
    }
    if (dimensions?.lineLengthMeters) {
      return dimensions.lineLengthMeters;
    }
  }

  return 1;
}

function extractExplicitLinearQuantity(description: string | undefined): number | null {
  if (!description) {
    return null;
  }

  const contextualMatch = description.match(
    /(?:קו(?:\s+ביוב)?|sewer\s+line|drain(?:age)?\s+line|pipe|צינור)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*(?:m|meters?|מטר(?:ים)?)/iu,
  );
  if (contextualMatch?.[1]) {
    return roundQuantity(Number(contextualMatch[1].replace(",", ".")));
  }

  const genericMatches = [...description.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:m|meters?|מטר(?:ים)?)/giu)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (genericMatches.length === 0) {
    return null;
  }

  return roundQuantity(Math.max(...genericMatches));
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function roundQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}
