export const LIFECYCLE_STAGES = [
  "demolition_enabling",
  "preparation",
  "primary_work",
  "interfaces_connections",
  "reinstatement",
  "testing_handover",
] as const;

export type LifecycleStage = typeof LIFECYCLE_STAGES[number];

export type ScopeInventoryOperation = {
  id: string;
  packageId: string;
  packageTitle: string;
  stage: LifecycleStage;
  title: string;
  reason: string;
  dekelQuerySeeds: string[];
};

export type ScopeResolution = {
  operationId: string;
  disposition: "separate_boq_row" | "included_in_dekel_price";
  boqRowIds: string[];
  dekelCode?: string;
  allowedDekelCodes: string[];
  reason: string;
};

export type ScopeCompletenessAudit = {
  version: 1;
  status: "complete" | "needs_review" | "stale";
  sourceFingerprint: string | null;
  boqFingerprint: string;
  inventory: ScopeInventoryOperation[];
  resolutions: ScopeResolution[];
  unresolvedOperationIds: string[];
  blockers: string[];
};

export type BoqScopeGap = {
  key: string;
  label: string;
  searchQueries: string[];
  reason: string;
};

export function sanitizeScopeInventory(value: unknown): ScopeInventoryOperation[] {
  if (!Array.isArray(value)) return [];
  const output: ScopeInventoryOperation[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const packageId = String(row.packageId ?? "").trim();
    const packageTitle = String(row.packageTitle ?? "").trim();
    const stage = String(row.stage ?? "") as LifecycleStage;
    const title = String(row.title ?? "").trim();
    const reason = String(row.reason ?? "").trim();
    const dekelQuerySeeds = Array.isArray(row.dekelQuerySeeds)
      ? [...new Set(row.dekelQuerySeeds.map(String).map((entry) => entry.trim()).filter(Boolean))].slice(0, 8)
      : [];
    if (!id || ids.has(id) || !packageId || !packageTitle || !LIFECYCLE_STAGES.includes(stage) || !title || !reason || dekelQuerySeeds.length === 0) continue;
    ids.add(id);
    output.push({ id, packageId, packageTitle, stage, title, reason, dekelQuerySeeds });
  }
  return output;
}

export function inventoryAsScopeGaps(inventory: ScopeInventoryOperation[]): BoqScopeGap[] {
  return inventory.map((operation) => ({ key: operation.id, label: operation.title, searchQueries: operation.dekelQuerySeeds, reason: `${operation.packageTitle}: ${operation.reason}` }));
}

export function sanitizeScopeResolutions(value: unknown, inventory: ScopeInventoryOperation[]): ScopeResolution[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(inventory.map((operation) => operation.id));
  const output: ScopeResolution[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const operationId = String(row.operationId ?? "").trim();
    const disposition = String(row.disposition ?? "") as ScopeResolution["disposition"];
    const boqRowIds = Array.isArray(row.boqRowIds) ? [...new Set(row.boqRowIds.map(String).map((entry) => entry.trim()).filter(Boolean))] : [];
    const dekelCode = String(row.dekelCode ?? "").trim() || undefined;
    const allowedDekelCodes = Array.isArray(row.allowedDekelCodes) ? [...new Set(row.allowedDekelCodes.map(String).map((entry) => entry.trim()).filter(Boolean))] : [];
    const reason = String(row.reason ?? "").trim();
    if (!allowed.has(operationId) || ids.has(operationId) || !["separate_boq_row", "included_in_dekel_price"].includes(disposition) || boqRowIds.length === 0 || !reason) continue;
    if (disposition === "included_in_dekel_price" && !dekelCode) continue;
    ids.add(operationId);
    output.push({ operationId, disposition, boqRowIds, dekelCode, allowedDekelCodes, reason });
  }
  return output;
}

export function auditScopeIntegrity(input: {
  inventory: ScopeInventoryOperation[];
  resolutions: ScopeResolution[];
  boqRows: Array<Record<string, unknown>>;
  selectedDekelByRowId?: Map<string, string>;
  sourceFingerprint: string | null;
  boqFingerprint: string;
}): ScopeCompletenessAudit {
  const blockers: string[] = [];
  const rowIds = new Set(input.boqRows.map((row) => String(row.id ?? "")).filter(Boolean));
  const resolutionByOperation = new Map(input.resolutions.map((resolution) => [resolution.operationId, resolution]));
  const separateRowUse = new Map<string, string[]>();
  for (const resolution of input.resolutions.filter((item) => item.disposition === "separate_boq_row")) {
    for (const rowId of resolution.boqRowIds) separateRowUse.set(rowId, [...(separateRowUse.get(rowId) ?? []), resolution.operationId]);
  }
  for (const operation of input.inventory) {
    const resolution = resolutionByOperation.get(operation.id);
    if (!resolution) {
      blockers.push(`scope_operation_unresolved:${operation.id}`);
      continue;
    }
    if (resolution.boqRowIds.some((rowId) => !rowIds.has(rowId))) {
      blockers.push(`scope_row_missing:${operation.id}`);
      continue;
    }
    if (input.selectedDekelByRowId) {
      if (resolution.disposition === "separate_boq_row") {
        if (resolution.boqRowIds.some((rowId) => (separateRowUse.get(rowId)?.length ?? 0) > 1)) blockers.push(`scope_row_reused:${operation.id}`);
        else if (resolution.boqRowIds.some((rowId) => !input.selectedDekelByRowId?.get(rowId))) blockers.push(`scope_row_unpriced:${operation.id}`);
        else if (resolution.boqRowIds.some((rowId) => !resolution.allowedDekelCodes.includes(input.selectedDekelByRowId?.get(rowId) ?? ""))) blockers.push(`scope_row_wrong_dekel:${operation.id}`);
      }
      if (resolution.disposition === "included_in_dekel_price" && (!resolution.allowedDekelCodes.includes(resolution.dekelCode ?? "") || !resolution.boqRowIds.some((rowId) => input.selectedDekelByRowId?.get(rowId) === resolution.dekelCode))) blockers.push(`scope_inclusion_not_verified:${operation.id}`);
    }
  }
  const unresolvedOperationIds = input.inventory.filter((operation) => blockers.some((blocker) => blocker.endsWith(`:${operation.id}`))).map((operation) => operation.id);
  return {
    version: 1,
    status: blockers.length === 0 ? "complete" : "needs_review",
    sourceFingerprint: input.sourceFingerprint,
    boqFingerprint: input.boqFingerprint,
    inventory: input.inventory,
    resolutions: input.resolutions,
    unresolvedOperationIds,
    blockers,
  };
}

export function documentScopeContext(document: Record<string, unknown>, projectName = "", projectDescription = ""): string {
  const fields = [projectName, projectDescription, document.subject, document.background, document.objective];
  if (Array.isArray(document.scope)) fields.push(...document.scope);
  return fields.map((value) => String(value ?? "")).join("\n");
}
