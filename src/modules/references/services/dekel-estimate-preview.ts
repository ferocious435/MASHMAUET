import type { DekelWorkbookRow } from "../domain/dekel-schemas.ts";
import { selectBillableDekelRows } from "./openxml-dekel-reader.ts";

export interface DekelEstimatePreviewLine {
  serialNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  sourceRowNumber: number;
  sourceActivityNumber: string | null;
  sourceSscItemCode: string | null;
}

export interface DekelEstimatePreview {
  lines: DekelEstimatePreviewLine[];
  executionSubtotal: number;
  managementFeePercent: number;
  managementFeeAmount: number;
  totalProjectCost: number;
}

export function buildDekelEstimatePreview(
  rows: DekelWorkbookRow[],
  options?: {
    limit?: number;
    managementFeePercent?: number;
  },
): DekelEstimatePreview {
  const selectedRows = selectBillableDekelRows(rows).slice(0, options?.limit ?? 10);
  const managementFeePercent = options?.managementFeePercent ?? 14;

  const lines = selectedRows.map((row, index) => {
    const quantity = row.quantity ?? 1;
    const unitPrice = row.rate ?? 0;
    const amount = roundMoney(quantity * unitPrice);

    return {
      serialNumber: index + 1,
      description: row.longText ?? "",
      quantity,
      unit: row.baseUnit ?? "",
      unitPrice,
      amount,
      sourceRowNumber: row.rowNumber,
      sourceActivityNumber: row.activityNumber,
      sourceSscItemCode: row.sscItemCode,
    };
  });

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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
