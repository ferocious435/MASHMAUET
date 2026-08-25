export const VAT_RATE: 0.18;
export const FEE_ROWS: ReadonlyArray<{ key: "planning" | "management" | "supervision"; label: string; rate: number }>;

export type FinancialRow = {
  id?: string;
  code?: string;
  description?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  category?: string;
  [key: string]: unknown;
};

export type FinancialSummary = {
  boq: { rows: Array<FinancialRow & { amount: number }>; subtotalNet: number; vat: number; totalWithVat: number };
  groups: Array<{ category: string; net: number; vat: number; totalWithVat: number; serialNumber: number; sourceRows: Array<FinancialRow & { amount: number }> }>;
  fees: Array<{ key: string; label: string; rate: number; amount: number }>;
  feesTotal: number;
  grandTotal: number;
  pricing: {
    status: "complete" | "partial" | "unpriced";
    pricedRowCount: number;
    unpricedRowCount: number;
    pricedRows: Array<FinancialRow & { amount: number }>;
    unpricedRows: Array<FinancialRow & { amount: number }>;
  };
  audit: { valid: boolean; checks: Record<string, boolean>; failedChecks: string[]; difference: number };
};

export function roundMoney(value: number): number;
export function calculateBoq(rows: FinancialRow[]): FinancialSummary["boq"];
export function groupEstimate(rows: FinancialRow[]): FinancialSummary["groups"];
export function calculateProjectSummary(rows: FinancialRow[]): FinancialSummary;
