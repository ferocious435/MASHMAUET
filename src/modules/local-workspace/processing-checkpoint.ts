import { createHash } from "node:crypto";

export const FULL_PROCESSING_PIPELINE_REVISION = "2026-09-01-package-scope-closure-v7";

export type ProcessingCheckpointIdentity = {
  sourceInputFingerprint: string;
  processedSourceFingerprint: string;
  baseDocumentFingerprint: string;
  projectContextFingerprint: string;
  globalRulesFingerprint: string;
  dekelFingerprint: string;
  professionalKnowledgeFingerprint: string;
  executionConfigFingerprint: string;
  pipelineRevision: string;
};

export type ProcessingTurnCheckpoint = {
  stage: string;
  requestFingerprint: string;
  responseText: string;
  responseSha256: string;
  completedAt: string;
};

export type FullProcessingCheckpoint = {
  schemaVersion: 1;
  projectId: string;
  identity: ProcessingCheckpointIdentity;
  identityFingerprint: string;
  entries: Record<string, ProcessingTurnCheckpoint>;
  createdAt: string;
  updatedAt: string;
};

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function fingerprintCheckpointIdentity(identity: ProcessingCheckpointIdentity): string {
  return sha256Text(stableJson(identity));
}

export function fingerprintProcessingRequest(input: {
  identityFingerprint: string;
  stage: string;
  prompt: string;
  imageContentHashes: string[];
}): string {
  return sha256Text(stableJson({
    checkpointSchemaVersion: 1,
    identityFingerprint: input.identityFingerprint,
    stage: input.stage,
    prompt: input.prompt,
    imageContentHashes: input.imageContentHashes,
  }));
}

export function createProcessingCheckpoint(projectId: string, identity: ProcessingCheckpointIdentity): FullProcessingCheckpoint {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    projectId,
    identity: structuredClone(identity),
    identityFingerprint: fingerprintCheckpointIdentity(identity),
    entries: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function parseProcessingCheckpoint(value: unknown): FullProcessingCheckpoint | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1 || typeof raw.projectId !== "string" || !raw.identity || typeof raw.identity !== "object") return null;
  const identity = parseIdentity(raw.identity);
  if (!identity) return null;
  const identityFingerprint = fingerprintCheckpointIdentity(identity);
  if (raw.identityFingerprint !== identityFingerprint) return null;
  const entries: Record<string, ProcessingTurnCheckpoint> = {};
  if (!raw.entries || typeof raw.entries !== "object") return null;
  for (const [key, value] of Object.entries(raw.entries as Record<string, unknown>)) {
    if (!/^[a-f0-9]{64}$/.test(key) || !value || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    if (typeof entry.stage !== "string"
      || entry.requestFingerprint !== key
      || typeof entry.responseText !== "string"
      || typeof entry.responseSha256 !== "string"
      || entry.responseSha256 !== sha256Text(entry.responseText)
      || typeof entry.completedAt !== "string") return null;
    entries[key] = {
      stage: entry.stage,
      requestFingerprint: key,
      responseText: entry.responseText,
      responseSha256: entry.responseSha256,
      completedAt: entry.completedAt,
    };
  }
  return {
    schemaVersion: 1,
    projectId: raw.projectId,
    identity,
    identityFingerprint,
    entries,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

function parseIdentity(value: object): ProcessingCheckpointIdentity | null {
  const raw = value as Record<string, unknown>;
  const keys: Array<keyof ProcessingCheckpointIdentity> = [
    "sourceInputFingerprint",
    "processedSourceFingerprint",
    "baseDocumentFingerprint",
    "projectContextFingerprint",
    "globalRulesFingerprint",
    "dekelFingerprint",
    "professionalKnowledgeFingerprint",
    "executionConfigFingerprint",
    "pipelineRevision",
  ];
  if (keys.some((key) => typeof raw[key] !== "string" || !String(raw[key]).trim())) return null;
  return Object.fromEntries(keys.map((key) => [key, String(raw[key])])) as ProcessingCheckpointIdentity;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, sortJson(entry)]));
}
