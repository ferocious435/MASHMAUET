export interface DekelWorkbookColumnMap {
  serviceType: string;
  sscItemCode: string;
  longText: string;
  activityNumber: string;
  quantity: string;
  baseUnit: string;
  rate: string;
}

export interface DekelWorkbookRow {
  rowNumber: number;
  serviceType: string | null;
  sscItemCode: string | null;
  longText: string | null;
  activityNumber: string | null;
  quantity: number | null;
  baseUnit: string | null;
  rate: number | null;
  rawCells: Record<string, string>;
}

export const dekelExpectedHeaders: DekelWorkbookColumnMap = {
  serviceType: "סוג שירות",
  sscItemCode: "פריט SSC",
  longText: "טקסט ארוך",
  activityNumber: "מספר פעילות",
  quantity: "כמות",
  baseUnit: "יחידת מידה בסיסית",
  rate: "תעריף",
};
