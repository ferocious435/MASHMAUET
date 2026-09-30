import { createHash } from "node:crypto";
import { paidResultRelation, paidResultSignature } from "./dekel-paid-result-semantics.ts";

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
  includedRequirements: string[];
};

export type ScopeGapDisposition = "covered_by_existing_operation" | "execution_detail" | "unsupported_assumption";

export type ScopeResolution = {
  operationId: string;
  disposition: "separate_boq_row" | "included_in_dekel_price";
  boqRowIds: string[];
  dekelCode?: string;
  coveredByOperationId?: string;
  includedExcerpt?: string;
  inclusionBasis?: "dekel_description" | "blue_book";
  inclusionSourceFileName?: string;
  inclusionSourcePage?: number;
  inclusionVerified?: boolean;
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
  packageId: string;
  packageTitle: string;
  stage: LifecycleStage;
  label: string;
  searchQueries: string[];
  includedRequirements: string[];
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
    const includedRequirements = Array.isArray(row.includedRequirements)
      ? [...new Set(row.includedRequirements.map(String).map((entry) => entry.trim()).filter(Boolean))].slice(0, 24)
      : [];
    if (!id || ids.has(id) || !packageId || !packageTitle || !LIFECYCLE_STAGES.includes(stage) || !title || !reason || dekelQuerySeeds.length === 0) continue;
    ids.add(id);
    output.push({ id, packageId, packageTitle, stage, title, reason, dekelQuerySeeds, includedRequirements });
  }
  return output;
}

export function inventoryAsScopeGaps(inventory: ScopeInventoryOperation[]): BoqScopeGap[] {
  return inventory.map((operation) => ({
    key: operation.id,
    packageId: operation.packageId,
    packageTitle: operation.packageTitle,
    stage: operation.stage,
    label: operation.title,
    searchQueries: operation.dekelQuerySeeds,
    includedRequirements: [...operation.includedRequirements],
    reason: `${operation.packageTitle}: ${operation.reason}${operation.includedRequirements.length > 0 ? ` Обязательные включения в эту операцию: ${operation.includedRequirements.join("; ")}` : ""}`,
  }));
}

export function mergeScopeCriticCandidates(candidateGroups: ScopeInventoryOperation[][]): ScopeInventoryOperation[] {
  const result: ScopeInventoryOperation[] = [];
  const usedIds = new Set<string>();
  for (const group of candidateGroups) {
    for (const candidate of group) {
      const identity = JSON.stringify([candidate.packageId, candidate.stage, candidate.title]);
      const existing = result.find((operation) => criticOperationsEquivalent(operation, candidate));
      if (existing) {
        mergeOperationEvidence(existing, candidate);
        continue;
      }
      let id = candidate.id;
      if (usedIds.has(id)) {
        const suffix = createHash("sha256").update(identity).digest("hex").slice(0, 10);
        id = `${candidate.id.slice(0, 96)}-critic-${suffix}`;
        for (let counter = 2; usedIds.has(id); counter += 1) id = `${candidate.id.slice(0, 88)}-critic-${suffix}-${counter}`;
      }
      const copy = {
        ...candidate,
        id,
        dekelQuerySeeds: [...candidate.dekelQuerySeeds],
        includedRequirements: [...candidate.includedRequirements],
      };
      usedIds.add(id);
      result.push(copy);
    }
  }
  return reconcileCriticPackageAlternatives(result);
}

function mergeOperationEvidence(target: ScopeInventoryOperation, source: ScopeInventoryOperation): void {
  target.dekelQuerySeeds = [...new Set([...target.dekelQuerySeeds, ...source.dekelQuerySeeds])].sort().slice(0, 8);
  target.includedRequirements = [...new Set([...target.includedRequirements, ...source.includedRequirements])].sort().slice(0, 24);
  const preferText = (left: string, right: string) => right.length > left.length || (right.length === left.length && right.localeCompare(left) < 0) ? right : left;
  target.title = preferText(target.title, source.title);
  target.reason = preferText(target.reason, source.reason);
  if (source.id.localeCompare(target.id) < 0) target.id = source.id;
}

function operationSemanticAtoms(operation: ScopeInventoryOperation): Set<string> {
  const atoms = new Set<string>();
  for (const seed of operation.dekelQuerySeeds) {
    const signature = paidResultSignature(seed);
    if (!signature.object || signature.action === "unknown") continue;
    atoms.add(`${signature.object}|${signature.action}|${signature.scenario}`);
  }
  return atoms;
}

function atomObjects(atoms: Set<string>): Set<string> {
  return new Set([...atoms].map((atom) => atom.split("|", 1)[0] ?? "").filter(Boolean));
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function hardQualifiers(operation: ScopeInventoryOperation): Set<string> {
  const text = normalizeSubjectText(`${operation.packageTitle} ${operation.title} ${operation.dekelQuerySeeds.join(" ")}`);
  const rules: Array<[string, RegExp]> = [
    ["material:rubber", /(?:^|[\s,.;])גומי(?:$|[\s,.;])|rubber|резин/iu],
    ["material:metal", /מתכת|פלדה|פח|metal|steel|металл|сталь/iu],
    ["material:aluminium", /אלומינ|alumin|алюмин/iu],
    ["material:pvc", /p\.?v\.?c|פי\s*וי\s*סי/iu],
    ["material:wood", /עץ|wood|дерев/iu],
    ["material:concrete", /בטונ|concrete|бетон/iu],
    ["material:glass", /זכוכ|glass|стекл/iu],
    ["material:gypsum", /גבס|gypsum|гипс/iu],
  ];
  return new Set(rules.filter(([, pattern]) => pattern.test(text)).map(([key]) => key));
}

function qualifierConflict(left: ScopeInventoryOperation, right: ScopeInventoryOperation): boolean {
  const leftQualifiers = hardQualifiers(left);
  const rightQualifiers = hardQualifiers(right);
  if (leftQualifiers.size === 0 && rightQualifiers.size === 0) return false;
  return !setsEqual(leftQualifiers, rightQualifiers);
}

function packagePrimaryObjects(operations: ScopeInventoryOperation[]): Set<string> {
  return atomObjects(new Set(operations
    .filter((operation) => operation.stage === "primary_work")
    .flatMap((operation) => [...operationSemanticAtoms(operation)])));
}

function packagePrimaryQualifiers(operations: ScopeInventoryOperation[]): Set<string> {
  return new Set(operations.filter((operation) => operation.stage === "primary_work").flatMap((operation) => [...hardQualifiers(operation)]));
}

function packageBuildsNewResult(operations: ScopeInventoryOperation[]): boolean {
  return operations.filter((operation) => operation.stage === "primary_work").some((operation) => {
    if (classifyInterventionOperation(operation) === "replace") return true;
    return operation.dekelQuerySeeds.some((seed) => ["new_install", "replace_existing"].includes(paidResultSignature(seed).scenario));
  });
}

export function classifyInterventionPackage(operations: ScopeInventoryOperation[]): "repair" | "replace" | null {
  const packageText = normalizeSubjectText(operations.map((operation) => operation.packageTitle).join(" "));
  if (/החלפה מלאה|החלפת כל|full replacement|complete replacement|полная замена|полностью заменить/iu.test(packageText)) return "replace";
  if (/שיקומ|תיקונ|חידוש|restoration|repair|восстанов|ремонт/iu.test(packageText)) return "repair";
  if (packageBuildsNewResult(operations)) return "replace";
  const classes = new Set(operations.map(classifyInterventionOperation).filter((value): value is "repair" | "replace" => Boolean(value)));
  return classes.size === 1 ? [...classes][0] : null;
}

function packageTargetTokens(packageId: string): Set<string> {
  const ignored = /^(?:repair|replacement|restoration|renewal|existing|new|full|complete|system|work|works|package|שיקום|תיקון|חידוש|החלפה|קיים|חדש|ремонт|замена|восстановление|новый)$/iu;
  return new Set(normalizeSubjectText(packageId).match(/[\p{L}\p{N}]+/gu)?.filter((token) => token.length >= 2 && !ignored.test(token)) ?? []);
}

export function packageTargetsCompatible(leftId: string, left: ScopeInventoryOperation[], rightId: string, right: ScopeInventoryOperation[]): boolean {
  const leftObjects = packagePrimaryObjects(left);
  const rightObjects = packagePrimaryObjects(right);
  if (leftObjects.size === 0 || rightObjects.size === 0 || ![...leftObjects].some((object) => rightObjects.has(object))) return false;
  const leftQualifiers = packagePrimaryQualifiers(left);
  const rightQualifiers = packagePrimaryQualifiers(right);
  if ((leftQualifiers.size > 0 || rightQualifiers.size > 0) && !setsEqual(leftQualifiers, rightQualifiers)) return false;
  const leftTokens = packageTargetTokens(leftId);
  const rightTokens = packageTargetTokens(rightId);
  const generic = /^(?:roof|floor|door|doors|window|windows|opening|openings|system|גג|רצפה|דלת|חלון|פתח|кровля|пол|дверь|окно)$/iu;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token));
  return shared.some((token) => !generic.test(token)) || (setsEqual(leftTokens, rightTokens) && leftTokens.size > 0);
}

function exactSeedOverlap(left: ScopeInventoryOperation, right: ScopeInventoryOperation): boolean {
  const normalizeSeed = (value: string) => normalizeSubjectText(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const leftSeeds = new Set(left.dekelQuerySeeds.map(normalizeSeed).filter(Boolean));
  return right.dekelQuerySeeds.some((seed) => leftSeeds.has(normalizeSeed(seed)));
}

function operationsStronglyEquivalent(left: ScopeInventoryOperation, right: ScopeInventoryOperation, requireSamePackage: boolean): boolean {
  if ((requireSamePackage && left.packageId !== right.packageId) || left.stage !== right.stage || qualifierConflict(left, right)) return false;
  const leftClass = classifyInterventionOperation(left);
  const rightClass = classifyInterventionOperation(right);
  if (leftClass && rightClass && leftClass !== rightClass) return false;
  const leftAtoms = operationSemanticAtoms(left);
  const rightAtoms = operationSemanticAtoms(right);
  if (leftAtoms.size > 0 && rightAtoms.size > 0) {
    if (setsEqual(leftAtoms, rightAtoms)) return true;
    const sharedAtoms = [...leftAtoms].filter((atom) => rightAtoms.has(atom));
    if (sharedAtoms.length === 0) return false;
    if (left.stage === "primary_work" && !setsEqual(atomObjects(leftAtoms), atomObjects(rightAtoms))) return false;
  }
  if (exactSeedOverlap(left, right)) return true;
  const leftMeaning = `${left.title} ${left.dekelQuerySeeds.join(" ")}`;
  const rightMeaning = `${right.title} ${right.dekelQuerySeeds.join(" ")}`;
  if (paidResultRelation(leftMeaning, rightMeaning) === "direct_price") return true;
  const leftTokens = subjectTokens(leftMeaning);
  const rightTokens = subjectTokens(rightMeaning);
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const smaller = Math.min(leftTokens.size, rightTokens.size);
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return smaller >= 3 && shared >= Math.max(3, Math.ceil(smaller * 0.55)) && shared / Math.max(1, union) >= 0.35;
}

function reconcileCriticPackageAlternatives(operations: ScopeInventoryOperation[]): ScopeInventoryOperation[] {
  const byPackage = new Map<string, ScopeInventoryOperation[]>();
  for (const operation of operations) byPackage.set(operation.packageId, [...(byPackage.get(operation.packageId) ?? []), operation]);
  const packageIds = [...byPackage.keys()].sort();
  const parent = new Map(packageIds.map((id) => [id, id]));
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string, preferred?: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const preferredRoot = preferred ? find(preferred) : null;
    const root = preferredRoot === leftRoot || preferredRoot === rightRoot
      ? preferredRoot
      : leftRoot.localeCompare(rightRoot) <= 0 ? leftRoot : rightRoot;
    parent.set(leftRoot, root);
    parent.set(rightRoot, root);
  };

  const genericRefinements: Array<{ genericId: string; specificId: string }> = [];

  for (let leftIndex = 0; leftIndex < packageIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < packageIds.length; rightIndex += 1) {
      const leftId = packageIds[leftIndex];
      const rightId = packageIds[rightIndex];
      const leftOperations = byPackage.get(leftId) ?? [];
      const rightOperations = byPackage.get(rightId) ?? [];
      const equivalentPairs = leftOperations.flatMap((left) => rightOperations
        .filter((right) => operationsStronglyEquivalent(left, right, false))
        .map((right) => [left, right] as const));
      const matchedStages = new Set(equivalentPairs.map(([left]) => left.stage));
      const leftPrimaryObjects = packagePrimaryObjects(leftOperations);
      const rightPrimaryObjects = packagePrimaryObjects(rightOperations);
      const primaryCompatible = leftPrimaryObjects.size > 0 && rightPrimaryObjects.size > 0
        && [...leftPrimaryObjects].some((object) => rightPrimaryObjects.has(object))
        && !leftOperations.filter((operation) => operation.stage === "primary_work").some((left) => rightOperations.filter((operation) => operation.stage === "primary_work").some((right) => qualifierConflict(left, right)));
      const isolatedEquivalent = leftOperations.length === 1 && rightOperations.length === 1 && equivalentPairs.length === 1;
      const leftQualifiers = packagePrimaryQualifiers(leftOperations);
      const rightQualifiers = packagePrimaryQualifiers(rightOperations);
      const leftIsSpecific = leftQualifiers.size > 0 && rightQualifiers.size === 0;
      const rightIsSpecific = rightQualifiers.size > 0 && leftQualifiers.size === 0;
      const specificRefinement = setsEqual(leftPrimaryObjects, rightPrimaryObjects)
        && leftPrimaryObjects.size > 0
        && (leftIsSpecific || rightIsSpecific)
        && packageBuildsNewResult(leftOperations)
        && packageBuildsNewResult(rightOperations);
      if (specificRefinement) {
        const specificId = leftIsSpecific ? leftId : rightId;
        const genericId = leftIsSpecific ? rightId : leftId;
        genericRefinements.push({ genericId, specificId });
        union(leftId, rightId, specificId);
      } else if (isolatedEquivalent || (matchedStages.size >= 2 && primaryCompatible)) union(leftId, rightId);
    }
  }

  const redundantGenericOperations = new Set<ScopeInventoryOperation>();
  for (const { genericId, specificId } of genericRefinements) {
    const genericOperations = byPackage.get(genericId) ?? [];
    const specificOperations = byPackage.get(specificId) ?? [];
    for (const genericOperation of genericOperations) {
      if (!["primary_work", "interfaces_connections", "testing_handover"].includes(genericOperation.stage)) continue;
      const genericObjects = atomObjects(operationSemanticAtoms(genericOperation));
      const replacement = specificOperations.find((specificOperation) => {
        if (specificOperation.stage !== genericOperation.stage) return false;
        const specificObjects = atomObjects(operationSemanticAtoms(specificOperation));
        if (genericObjects.size > 0 && specificObjects.size > 0 && [...genericObjects].some((object) => specificObjects.has(object))) return true;
        const genericTokens = subjectTokens(`${genericOperation.title} ${genericOperation.dekelQuerySeeds.join(" ")}`);
        const specificTokens = subjectTokens(`${specificOperation.title} ${specificOperation.dekelQuerySeeds.join(" ")}`);
        return [...genericTokens].filter((token) => specificTokens.has(token)).length >= 2;
      });
      if (!replacement) continue;
      replacement.includedRequirements = [...new Set([...replacement.includedRequirements, genericOperation.title, ...genericOperation.includedRequirements])].sort().slice(0, 24);
      redundantGenericOperations.add(genericOperation);
    }
  }

  const titlesByRoot = new Map<string, string[]>();
  for (const operation of operations.filter((candidate) => !redundantGenericOperations.has(candidate))) {
    const root = find(operation.packageId);
    titlesByRoot.set(root, [...(titlesByRoot.get(root) ?? []), operation.packageTitle]);
  }
  const canonicalTitle = (root: string) => [...new Set(titlesByRoot.get(root) ?? [])]
    .sort((left, right) => right.length - left.length || left.localeCompare(right))[0] ?? root;
  const canonicalized = operations.filter((operation) => !redundantGenericOperations.has(operation)).map((operation) => ({
    ...operation,
    packageId: find(operation.packageId),
    packageTitle: canonicalTitle(find(operation.packageId)),
    dekelQuerySeeds: [...operation.dekelQuerySeeds],
    includedRequirements: [...operation.includedRequirements],
  }));

  const merged: ScopeInventoryOperation[] = [];
  for (const operation of canonicalized) {
    const existing = merged.find((candidate) => operationsStronglyEquivalent(candidate, operation, true));
    if (existing) mergeOperationEvidence(existing, operation);
    else merged.push(operation);
  }

  const removed = new Set<ScopeInventoryOperation>();
  for (const operation of merged) {
    const compositeAtoms = operationSemanticAtoms(operation);
    if (compositeAtoms.size < 2) continue;
    const requiredCompositeAtoms = new Set([...compositeAtoms].filter((atom) => !/^(?:hvac_system|fire_safety)\|/u.test(atom)));
    const refinements = merged.filter((candidate) => candidate !== operation
      && candidate.packageId === operation.packageId
      && candidate.stage === operation.stage
      && operationSemanticAtoms(candidate).size > 0
      && [...operationSemanticAtoms(candidate)].every((atom) => requiredCompositeAtoms.has(atom)));
    const coveredAtoms = new Set(refinements.flatMap((candidate) => [...operationSemanticAtoms(candidate)]));
    if (refinements.length < 2 || requiredCompositeAtoms.size < 2 || !setsEqual(requiredCompositeAtoms, coveredAtoms)) continue;
    for (const refinement of refinements) {
      const refinementAtoms = operationSemanticAtoms(refinement);
      const matchingSeeds = operation.dekelQuerySeeds.filter((seed) => {
        const signature = paidResultSignature(seed);
        return signature.object && refinementAtoms.has(`${signature.object}|${signature.action}|${signature.scenario}`);
      });
      refinement.dekelQuerySeeds = [...new Set([...refinement.dekelQuerySeeds, ...matchingSeeds])].sort().slice(0, 8);
      refinement.includedRequirements = [...new Set([...refinement.includedRequirements, operation.title, ...operation.includedRequirements])].sort().slice(0, 24);
    }
    removed.add(operation);
  }

  const uniqueIds = new Set<string>();
  return merged.filter((operation) => !removed.has(operation)).map((operation) => {
    let id = operation.id;
    if (uniqueIds.has(id)) {
      const identity = JSON.stringify([operation.packageId, operation.stage, operation.title, operation.dekelQuerySeeds]);
      id = `${operation.id.slice(0, 96)}-critic-${createHash("sha256").update(identity).digest("hex").slice(0, 10)}`;
    }
    uniqueIds.add(id);
    return { ...operation, id };
  });
}

function criticOperationsEquivalent(left: ScopeInventoryOperation, right: ScopeInventoryOperation): boolean {
  return operationsStronglyEquivalent(left, right, true);
}

function replacementOperationSupersedes(
  existing: ScopeInventoryOperation,
  replacement: ScopeInventoryOperation,
): boolean {
  if (existing.packageId !== replacement.packageId || existing.stage !== replacement.stage) return false;
  const existingClass = classifyInterventionOperation(existing);
  const replacementClass = classifyInterventionOperation(replacement);
  if (existingClass && replacementClass && existingClass !== replacementClass) return true;
  const existingObjects = atomObjects(operationSemanticAtoms(existing));
  const replacementObjects = atomObjects(operationSemanticAtoms(replacement));
  if (existingObjects.size === 0 || replacementObjects.size === 0 || ![...existingObjects].some((object) => replacementObjects.has(object))) return false;

  const existingText = normalizeSubjectText(`${existing.title} ${existing.dekelQuerySeeds.join(" ")}`);
  const replacementText = normalizeSubjectText(`${replacement.title} ${replacement.dekelQuerySeeds.join(" ")}`);
  const existingIsLimited = /מקומי|מקומית|מוקד|מוקדים|אזור פגוע|אזורים פגועים|חלקי|חלקית|local|partial|damaged area|локальн|частичн/iu.test(existingText);
  const replacementIsComplete = /מלא|מלאה|בכל|מלוא|כלל ה|כל השטח|שלמ|complete|full|entire|all |полностью|полная|вс[её]й/iu.test(replacementText);
  if (existingIsLimited && replacementIsComplete) return true;

  const existingScenarios = new Set(existing.dekelQuerySeeds.map((seed) => paidResultSignature(seed).scenario));
  const replacementScenarios = new Set(replacement.dekelQuerySeeds.map((seed) => paidResultSignature(seed).scenario));
  return [...replacementScenarios].some((scenario) => scenario === "new_install" || scenario === "replace_existing")
    && [...existingScenarios].some((scenario) => scenario === "repair_existing" || scenario === "replace_existing");
}

export function applyScopeInventoryAdjudication(
  inventory: ScopeInventoryOperation[],
  candidateGaps: ScopeInventoryOperation[],
  value: unknown,
): ScopeInventoryOperation[] | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.accepted !== true) return null;
  const gapById = new Map(candidateGaps.map((gap) => [gap.id, gap]));
  if (gapById.size === 0) return null;

  const result = inventory.map((operation) => ({ ...operation, dekelQuerySeeds: [...operation.dekelQuerySeeds], includedRequirements: [...operation.includedRequirements] }));
  const originalById = new Map(result.map((operation) => [operation.id, operation]));
  const existingById = new Map(result.map((operation) => [operation.id, operation]));
  const coveredGapIds = new Set<string>();
  const rawSupersessions = Array.isArray(raw.supersededOperations) ? raw.supersededOperations : [];
  const rawNewOperations = Array.isArray(raw.newOperations) ? raw.newOperations : [];
  const sanitizedNewOperations = sanitizeScopeInventory(rawNewOperations);
  const sanitizedNewById = new Map(sanitizedNewOperations.map((operation) => [operation.id, operation]));

  for (const item of rawNewOperations) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const operation = sanitizedNewById.get(String(row.id ?? "").trim());
    const sourceGapIds = Array.isArray(row.sourceGapIds)
      ? [...new Set(row.sourceGapIds.map(String).map((entry) => entry.trim()).filter(Boolean))]
      : [];
    if (!operation || existingById.has(operation.id) || sourceGapIds.length === 0) return null;
    for (const gapId of sourceGapIds) {
      if (!gapById.has(gapId) || coveredGapIds.has(gapId)) return null;
      coveredGapIds.add(gapId);
    }
    result.push(operation);
    existingById.set(operation.id, operation);
  }

  const supersededOperationIds: string[] = [];
  let ignoredUnsupportedSupersessions = 0;
  for (const item of rawSupersessions) {
    if (!item || typeof item !== "object") return null;
    const value = item as Record<string, unknown>;
    const operationId = String(value.operationId ?? "").trim();
    const replacementOperationIds = Array.isArray(value.replacementOperationIds)
      ? [...new Set(value.replacementOperationIds.map(String).map((entry) => entry.trim()).filter(Boolean))]
      : [];
    const reason = String(value.reason ?? "").trim();
    const superseded = originalById.get(operationId);
    const replacements = replacementOperationIds.map((id) => sanitizedNewById.get(id));
    if (!superseded || !reason || replacementOperationIds.length === 0 || replacements.some((operation) => !operation)) return null;
    if (replacements.some((replacement) => replacement!.packageId !== superseded.packageId)) return null;
    if (!replacements.some((replacement) => replacementOperationSupersedes(superseded, replacement!))) {
      ignoredUnsupportedSupersessions += 1;
      continue;
    }
    supersededOperationIds.push(operationId);
  }
  if (ignoredUnsupportedSupersessions > 0 && supersededOperationIds.length === 0) return null;
  if (new Set(supersededOperationIds).size !== supersededOperationIds.length) return null;

  const coveredGaps = Array.isArray(raw.coveredGaps) ? raw.coveredGaps : [];
  for (const item of coveredGaps) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const gapId = String(row.gapId ?? "").trim();
    const disposition = String(row.disposition ?? "") as ScopeGapDisposition;
    const operationId = String(row.operationId ?? "").trim();
    const reason = String(row.reason ?? "").trim();
    if (!gapById.has(gapId) || coveredGapIds.has(gapId) || !["covered_by_existing_operation", "execution_detail", "unsupported_assumption"].includes(disposition) || !reason) return null;
    if (disposition !== "unsupported_assumption") {
      if (supersededOperationIds.includes(operationId)) return null;
      const owner = existingById.get(operationId);
      if (!owner) return null;
      owner.includedRequirements = [...new Set([...owner.includedRequirements, gapById.get(gapId)?.title ?? ""])].filter(Boolean).slice(0, 24);
    }
    coveredGapIds.add(gapId);
  }

  if (coveredGapIds.size !== gapById.size) return null;
  const superseded = new Set(supersededOperationIds);
  const finalResult = result.filter((operation) => !superseded.has(operation.id));
  return hasInterventionConflict(finalResult) ? null : finalResult;
}

export function classifyInterventionText(text: string): "repair" | "replace" | null {
  if (/החלפ|פריט חדש|אספקה והתקנ|replace|replacement|new item|замен|нов(?:ый|ая|ое)/iu.test(text)) return "replace";
  if (/תיקון|שיקום|חיזוק|ריתוך|שיפוץ|repair|restore|strengthen|weld|ремонт|восстанов|усилен|свар/iu.test(text)) return "repair";
  return null;
}

function classifyInterventionOperation(operation: ScopeInventoryOperation): "repair" | "replace" | null {
  if (operation.stage !== "primary_work") return null;
  return classifyInterventionText(`${operation.title} ${operation.dekelQuerySeeds.join(" ")}`);
}

export function boqRowConflictsWithScopeIntervention(row: Record<string, unknown>, inventory: ScopeInventoryOperation[]): boolean {
  const rowText = `${String(row.category ?? "")} ${String(row.description ?? "")}`;
  const rowClass = classifyInterventionText(rowText);
  if (!rowClass) return false;
  const rowTokens = subjectTokens(rowText);
  const packageGroups = new Map<string, ScopeInventoryOperation[]>();
  for (const operation of inventory) packageGroups.set(operation.packageId, [...(packageGroups.get(operation.packageId) ?? []), operation]);
  const possiblePackages = [...packageGroups.values()].filter((operations) => {
    const packageText = `${operations[0]?.packageTitle ?? ""} ${operations.map((candidate) => candidate.title).join(" ")}`;
    const categoryMatches = normalizeSubjectText(String(row.category ?? "")) === normalizeSubjectText(operations[0]?.packageTitle ?? "");
    const overlap = [...rowTokens].filter((token) => subjectTokens(packageText).has(token));
    return categoryMatches || overlap.length >= 2;
  });
  for (const operation of possiblePackages.flat()) {
    const operationClass = classifyInterventionOperation(operation);
    if (!operationClass || operationClass === rowClass) continue;
    return true;
  }
  return false;
}

function subjectTokens(value: string): Set<string> {
  const ignored = /^(?:של|על|עם|את|אל|או|כל|לפי|עבור|כולל|לרבות|מלא|מלאה|מערכת|אספקה|התקנה|ביצוע|תיקון|שיקום|חיזוק|ריתוך|שיפוץ|החלפה|החלפת|חדש|חדשה|קיים|קיימת|עבודה|עבודות|repair|replace|replacement|new|existing|work|ремонт|замена|новый|новая|существующий|работа)$/iu;
  return new Set(normalizeSubjectText(value).match(/[\p{L}\p{N}]+/gu)?.filter((token) => token.length >= 2 && !ignored.test(token)) ?? []);
}

function normalizeSubjectText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("he").replace(/[ךםןףץ]/gu, (letter) => ({ "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" })[letter] ?? letter).replace(/[־–—]/g, "-").replace(/\s+/gu, " ").trim();
}

export function mergeScopeCandidatesConservatively(
  inventory: ScopeInventoryOperation[],
  candidateGaps: ScopeInventoryOperation[],
): ScopeInventoryOperation[] {
  const combinedPackages = new Map<string, ScopeInventoryOperation[]>();
  for (const operation of [...inventory, ...candidateGaps]) combinedPackages.set(operation.packageId, [...(combinedPackages.get(operation.packageId) ?? []), operation]);
  const supersededRepairPackages = new Set<string>();
  for (const [repairId, repairOperations] of combinedPackages) {
    if (classifyInterventionPackage(repairOperations) !== "repair") continue;
    for (const [replacementId, replacementOperations] of combinedPackages) {
      if (repairId === replacementId || classifyInterventionPackage(replacementOperations) !== "replace") continue;
      const replacementStages = new Set(replacementOperations.map((operation) => operation.stage));
      if (!replacementStages.has("primary_work") || replacementStages.size < 3) continue;
      if (packageTargetsCompatible(repairId, repairOperations, replacementId, replacementOperations)) {
        supersededRepairPackages.add(repairId);
        break;
      }
    }
  }
  const activeInventory = inventory.filter((operation) => !supersededRepairPackages.has(operation.packageId));
  const activeCandidateGaps = candidateGaps.filter((operation) => !supersededRepairPackages.has(operation.packageId));
  const preferredClassByPackage = new Map<string, "repair" | "replace">();
  for (const operation of [...activeInventory, ...activeCandidateGaps]) {
    const operationClass = classifyInterventionOperation(operation);
    if (!operationClass) continue;
    const current = preferredClassByPackage.get(operation.packageId);
    if (!current || operationClass === "replace") preferredClassByPackage.set(operation.packageId, operationClass);
  }
  const selectedOperations = activeInventory.filter((operation) => {
    const operationClass = classifyInterventionOperation(operation);
    return !operationClass || preferredClassByPackage.get(operation.packageId) === operationClass;
  });
  const selectedCandidates = activeCandidateGaps.filter((operation) => {
    const operationClass = classifyInterventionOperation(operation);
    return !operationClass || preferredClassByPackage.get(operation.packageId) === operationClass;
  });
  const result = selectedOperations.map((operation) => ({
    ...operation,
    dekelQuerySeeds: [...operation.dekelQuerySeeds],
    includedRequirements: [...operation.includedRequirements],
  }));
  const usedIds = new Set(result.map((operation) => operation.id));

  for (const candidate of selectedCandidates) {
    const equivalent = result.find((operation) => operationsStronglyEquivalent(operation, candidate, true));
    if (equivalent) {
      mergeOperationEvidence(equivalent, candidate);
      continue;
    }

    let id = candidate.id;
    if (usedIds.has(id)) {
      const identity = JSON.stringify([candidate.packageId, candidate.stage, candidate.title, candidate.dekelQuerySeeds]);
      id = `${candidate.id.slice(0, 96)}-critic-${createHash("sha256").update(identity).digest("hex").slice(0, 10)}`;
    }
    for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${candidate.id.slice(0, 88)}-critic-${suffix}`;
    usedIds.add(id);
    result.push({
      ...candidate,
      id,
      dekelQuerySeeds: [...candidate.dekelQuerySeeds],
      includedRequirements: [...candidate.includedRequirements],
    });
  }

  return result;
}

function hasInterventionConflict(operations: ScopeInventoryOperation[]): boolean {
  const classesByPackage = new Map<string, Set<"repair" | "replace">>();
  for (const operation of operations) {
    const operationClass = classifyInterventionOperation(operation);
    if (!operationClass) continue;
    const classes = classesByPackage.get(operation.packageId) ?? new Set<"repair" | "replace">();
    classes.add(operationClass);
    classesByPackage.set(operation.packageId, classes);
    if (classes.size > 1) return true;
  }
  return false;
}

export function validateExactScopeResolutionIds(value: unknown, expectedOperationIds: string[]): string[] {
  const expected = new Set(expectedOperationIds.map(String).map((entry) => entry.trim()).filter(Boolean));
  const counts = new Map<string, number>();
  const issues: string[] = [];
  if (!Array.isArray(value)) return [...expected].map((operationId) => `scope_resolution_missing:${operationId}`);
  for (const item of value) {
    const operationId = item && typeof item === "object" ? String((item as Record<string, unknown>).operationId ?? "").trim() : "";
    if (!operationId) {
      issues.push("scope_resolution_unknown:");
      continue;
    }
    counts.set(operationId, (counts.get(operationId) ?? 0) + 1);
    if (!expected.has(operationId)) issues.push(`scope_resolution_unknown:${operationId}`);
  }
  for (const operationId of expected) {
    const count = counts.get(operationId) ?? 0;
    if (count === 0) issues.push(`scope_resolution_missing:${operationId}`);
    if (count > 1) issues.push(`scope_resolution_duplicate:${operationId}`);
  }
  return [...new Set(issues)];
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
    const coveredByOperationId = String(row.coveredByOperationId ?? "").trim() || undefined;
    const includedExcerpt = String(row.includedExcerpt ?? "").trim() || undefined;
    const rawInclusionBasis = String(row.inclusionBasis ?? "").trim();
    const inclusionBasis = rawInclusionBasis === "dekel_description" || rawInclusionBasis === "blue_book" ? rawInclusionBasis : undefined;
    const inclusionSourceFileName = String(row.inclusionSourceFileName ?? "").trim() || undefined;
    const inclusionSourcePageValue = Number(row.inclusionSourcePage);
    const inclusionSourcePage = Number.isInteger(inclusionSourcePageValue) && inclusionSourcePageValue > 0 ? inclusionSourcePageValue : undefined;
    const inclusionVerified = row.inclusionVerified === true;
    const allowedDekelCodes = Array.isArray(row.allowedDekelCodes) ? [...new Set(row.allowedDekelCodes.map(String).map((entry) => entry.trim()).filter(Boolean))] : [];
    const reason = String(row.reason ?? "").trim();
    if (!allowed.has(operationId) || ids.has(operationId) || !["separate_boq_row", "included_in_dekel_price"].includes(disposition) || boqRowIds.length === 0 || !reason) continue;
    if (disposition === "included_in_dekel_price" && !dekelCode) continue;
    ids.add(operationId);
    output.push({ operationId, disposition, boqRowIds, dekelCode, coveredByOperationId, includedExcerpt, inclusionBasis, inclusionSourceFileName, inclusionSourcePage, inclusionVerified, allowedDekelCodes, reason });
  }
  return output;
}

export function validateScopeResolutionStructure(
  resolutions: ScopeResolution[],
  inventory: ScopeInventoryOperation[],
): string[] {
  const issues: string[] = [];
  const operationById = new Map(inventory.map((operation) => [operation.id, operation]));
  const resolutionByOperation = new Map(resolutions.map((resolution) => [resolution.operationId, resolution]));
  const separateOwnersByRow = new Map<string, string[]>();
  for (const resolution of resolutions.filter((item) => item.disposition === "separate_boq_row")) {
    for (const rowId of resolution.boqRowIds) {
      separateOwnersByRow.set(rowId, [...(separateOwnersByRow.get(rowId) ?? []), resolution.operationId]);
    }
  }
  for (const [rowId, owners] of separateOwnersByRow) {
    if (owners.length > 1) issues.push(`scope_row_reused:${rowId}:${owners.join(",")}`);
  }
  for (const resolution of resolutions.filter((item) => item.disposition === "included_in_dekel_price")) {
    const operation = operationById.get(resolution.operationId);
    const ownerOperation = resolution.coveredByOperationId ? operationById.get(resolution.coveredByOperationId) : undefined;
    const ownerResolution = resolution.coveredByOperationId ? resolutionByOperation.get(resolution.coveredByOperationId) : undefined;
    if (operation && ownerOperation && ownerOperation.packageId !== operation.packageId) {
      issues.push(`scope_inclusion_wrong_package:${resolution.operationId}`);
      continue;
    }
    if (resolution.inclusionBasis === "blue_book"
      && (!resolution.inclusionSourceFileName || !resolution.inclusionSourcePage || !resolution.includedExcerpt)) {
      issues.push(`scope_inclusion_source_invalid:${resolution.operationId}`);
    }
    if (!ownerOperation
      || !ownerResolution
      || ownerResolution.disposition !== "separate_boq_row"
      || !resolution.boqRowIds.some((rowId) => ownerResolution.boqRowIds.includes(rowId))) {
      issues.push(`scope_inclusion_owner_invalid:${resolution.operationId}`);
    }
  }
  return issues;
}

export function auditScopeIntegrity(input: {
  inventory: ScopeInventoryOperation[];
  resolutions: ScopeResolution[];
  boqRows: Array<Record<string, unknown>>;
  selectedDekelByRowId?: Map<string, string>;
  sourceFingerprint: string | null;
  boqFingerprint: string;
}): ScopeCompletenessAudit {
  const blockers: string[] = [
    ...validateExactScopeResolutionIds(input.resolutions, input.inventory.map((operation) => operation.id)),
    ...validateScopeResolutionStructure(input.resolutions, input.inventory).flatMap((issue) => {
      if (!issue.startsWith("scope_row_reused:")) return [issue];
      return issue.split(":")[2]?.split(",").map((operationId) => `scope_row_reused:${operationId}`) ?? [issue];
    }),
  ];
  const rowIds = new Set(input.boqRows.map((row) => String(row.id ?? "")).filter(Boolean));
  const resolutionByOperation = new Map(input.resolutions.map((resolution) => [resolution.operationId, resolution]));
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
    if (blockers.includes(`scope_row_reused:${operation.id}`)) {
      continue;
    }
    if (input.selectedDekelByRowId) {
      if (resolution.disposition === "separate_boq_row") {
        if (resolution.boqRowIds.some((rowId) => !input.selectedDekelByRowId?.get(rowId))) blockers.push(`scope_row_unpriced:${operation.id}`);
        else if (resolution.boqRowIds.some((rowId) => !resolution.allowedDekelCodes.includes(input.selectedDekelByRowId?.get(rowId) ?? ""))) blockers.push(`scope_row_wrong_dekel:${operation.id}`);
      }
      if (resolution.disposition === "included_in_dekel_price") {
        const ownerOperation = resolution.coveredByOperationId ? input.inventory.find((item) => item.id === resolution.coveredByOperationId) : undefined;
        const ownerResolution = resolution.coveredByOperationId ? resolutionByOperation.get(resolution.coveredByOperationId) : undefined;
        const verifiedOwnerRow = ownerResolution && resolution.boqRowIds.find((rowId) =>
          ownerResolution.boqRowIds.includes(rowId)
          && input.selectedDekelByRowId?.get(rowId) === resolution.dekelCode
        );
        if (ownerOperation && ownerOperation.packageId !== operation.packageId) blockers.push(`scope_inclusion_wrong_package:${operation.id}`);
        else if (!ownerOperation || !ownerResolution || ownerResolution.disposition !== "separate_boq_row" || !verifiedOwnerRow) blockers.push(`scope_inclusion_owner_invalid:${operation.id}`);
        else if (!resolution.inclusionVerified
          || !resolution.includedExcerpt
          || !resolution.allowedDekelCodes.includes(resolution.dekelCode ?? "")) blockers.push(`scope_inclusion_not_verified:${operation.id}`);
      }
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
