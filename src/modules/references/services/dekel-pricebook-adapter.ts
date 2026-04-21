import type { DekelWorkbookRow } from "../domain/dekel-schemas.ts";
import type { PricebookItem } from "../domain/reference-schemas.ts";
import { selectBillableDekelRows } from "./openxml-dekel-reader.ts";

export function buildDekelPricebookItems(
  rows: DekelWorkbookRow[],
  options?: {
    pricebookId?: string;
    workbookLabel?: string;
  },
): PricebookItem[] {
  const pricebookId = options?.pricebookId ?? "dekel-live";
  const workbookLabel = options?.workbookLabel ?? "DEKEL.xlsx";

  return selectBillableDekelRows(rows).map((row) => {
    const normalizedDescription = normalizeText(row.longText ?? "");
    const code = row.sscItemCode ?? row.activityNumber ?? `row-${row.rowNumber}`;

    return {
      itemId: `${pricebookId}-${row.activityNumber ?? code}-${row.rowNumber}`,
      pricebookId,
      code,
      description: row.longText ?? "",
      normalizedDescription,
      unit: mapDekelUnit(row.baseUnit),
      unitPrice: row.rate ?? 0,
      section: extractSectionCode(row.sscItemCode),
      subsection: row.serviceType ?? "dekel",
      tagsJson: buildTags(row),
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        source_system: "dekel",
        source_workbook: workbookLabel,
        dekel_row_number: String(row.rowNumber),
        dekel_activity_number: row.activityNumber ?? "",
        dekel_chapter_code: extractChapterCode(row.sscItemCode, row.activityNumber),
        dekel_service_type: row.serviceType ?? "",
        dekel_unit_raw: row.baseUnit ?? "",
        dekel_quantity_raw: row.quantity === null ? "" : String(row.quantity),
      },
    };
  });
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}

function mapDekelUnit(value: string | null): string {
  const normalizedValue = normalizeText(value ?? "");

  if (normalizedValue === "יח") {
    return "unit";
  }

  if (normalizedValue === "מר" || normalizedValue === 'מ"ר' || normalizedValue === 'מ״ר') {
    return "m2";
  }

  if (
    normalizedValue === "מטר" ||
    normalizedValue === "מטרים" ||
    normalizedValue === "מ'" ||
    normalizedValue === "m" ||
    normalizedValue === "meter" ||
    normalizedValue === "meters"
  ) {
    return "m";
  }

  if (normalizedValue === 'מ"ק' || normalizedValue === 'מ״ק') {
    return "m3";
  }

  if (normalizedValue === "יום") {
    return "day";
  }

  return normalizedValue.length > 0 ? normalizedValue : "unknown";
}

function extractSectionCode(sscItemCode: string | null): string {
  if (!sscItemCode) {
    return "dekel";
  }

  const parts = sscItemCode.split(".");
  if (parts.length >= 3) {
    return parts.slice(0, 3).join(".");
  }

  return sscItemCode;
}

function extractChapterCode(
  sscItemCode: string | null,
  activityNumber: string | null,
): string {
  if (sscItemCode) {
    const sscParts = sscItemCode.split(".");
    if (sscParts.length >= 2 && /^\d{2}$/u.test(sscParts[1])) {
      return sscParts[1];
    }
  }

  if (!activityNumber) {
    return "";
  }

  const match = activityNumber.match(/^(\d{2})/u);
  return match ? match[1] : "";
}

function buildTags(row: DekelWorkbookRow): string[] {
  const values = [
    row.serviceType ?? "",
    row.sscItemCode ?? "",
    row.longText ?? "",
    row.baseUnit ?? "",
  ]
    .join(" ")
    .split(/[^\p{L}\p{N}]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  return [...new Set(values)].slice(0, 12);
}
