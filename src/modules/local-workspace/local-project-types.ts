import type { ScopeCompletenessAudit } from "./boq-scope-completeness.ts";

export type LocalMaterial = {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt: string;
  status: "processing" | "ready" | "unsupported" | "error";
  details?: string;
  sourcePath?: string;
  extractedTextPath?: string;
  analysisTextPath?: string;
  correctedTextPath?: string;
  visionImagePaths?: string[];
  pageCount?: number;
  sheetCount?: number;
  videoDurationSeconds?: number;
  videoFrameCount?: number;
  audioStatus?: "pending" | "transcribing" | "completed" | "no_audio" | "unavailable" | "failed";
  audioTranscriptPath?: string;
  audioProvenancePath?: string;
  audioTranscriptLanguage?: string;
  audioTranscriptSegmentCount?: number;
  audioErrorCode?: string;
  analyzedAt?: string;
  correctedAt?: string;
  correctionNeedsReview?: boolean;
};

export type ChatProposal = {
  id: string;
  target: "document" | "projectRule";
  path?: string;
  value?: unknown;
  changes?: Array<{ path: string; value: unknown }>;
  baseDocumentFingerprint?: string;
  rule?: string;
  reason: string;
  status: "pending" | "applied" | "rejected";
  createdAt: string;
};

export type ProjectChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  proposalIds?: string[];
  status?: "complete" | "failed";
  replyToMessageId?: string;
  retryOfMessageId?: string;
};

export type LocalDekelCandidate = {
  code: string;
  description: string;
  unit: string;
  unitPrice: number;
  score: number;
  matchReason: string;
  sourceRow: string | null;
  sourceActivityNumber: string | null;
  sourceChapterCode: string | null;
  priceIncludesVat: false;
  unitCompatibility: "exact" | "compatible" | "corrected_by_code" | "mismatch" | "unknown";
};

export type LocalDekelReviewLine = {
  id: string;
  sourceBoqRowId: string;
  workDescription: string;
  category: string;
  originalCode: string;
  originalUnit: string;
  quantity: number;
  quantitySource: "document" | "material" | "estimated";
  quantitySourceReason: string;
  hourlyBasis?: "source_explicit" | "decomposed_residual" | "unverified";
  included: boolean;
  ownerExcluded?: boolean;
  ownerConfirmed?: boolean;
  selectionMethod?: "lexical_exact" | "codex_constrained";
  semanticConfidence?: "high" | "medium" | "low";
  selectionReason?: string;
  selectedCode: string | null;
  candidates: LocalDekelCandidate[];
};

export type LocalFinancialAudit = {
  valid: boolean;
  subtotalNet: number;
  vatRate: 0.18;
  vat: number;
  totalWithVat: number;
  estimateRows: number;
  fees: Array<{ key: string; rate: number; amount: number }>;
  feesTotal: number;
  grandTotal: number;
  checks: Record<string, boolean>;
  failedChecks: string[];
};

export type LocalDekelReview = {
  id: string;
  status: "ready" | "applied";
  analyzedAt: string;
  appliedAt?: string;
  workbookFileName: string;
  workbookRowsCount: number;
  billableRowsCount: number;
  sourceBoqFingerprint: string;
  lines: LocalDekelReviewLine[];
  warnings: string[];
  financialAudit: LocalFinancialAudit;
};

export type LocalProjectProcessingStatus = "idle" | "queued" | "running" | "needs_review" | "ready" | "failed" | "stale";

export type LocalProjectProcessingStage =
  | "awaiting_materials"
  | "extracting"
  | "awaiting_video_frames"
  | "transcribing_audio"
  | "analyzing_materials"
  | "consolidating_evidence"
  | "understanding_work"
  | "quantifying"
  | "matching_dekel"
  | "building_document"
  | "validating"
  | "complete";

export type LocalProjectProcessing = {
  runId: string | null;
  status: LocalProjectProcessingStatus;
  stage: LocalProjectProcessingStage;
  readyForExport: boolean;
  progressPercent: number;
  sourceFingerprint: string | null;
  baseDocumentFingerprint: string | null;
  validatedDocumentFingerprint: string | null;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  warningCodes: string[];
  error?: { code: string; message: string; retryable: boolean };
};

export type LocalProject = {
  schemaVersion: 1;
  revision: number;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  materials: LocalMaterial[];
  versions: Array<{ id: string; label: string; createdAt: string; document: unknown }>;
  chat: ProjectChatMessage[];
  proposals: ChatProposal[];
  rules: string[];
  codexThreadId?: string;
  dekelReview?: LocalDekelReview;
  scopeCompleteness?: ScopeCompletenessAudit;
  processing: LocalProjectProcessing;
  document: Record<string, unknown>;
};

export type LocalBackupManifest = {
  id: string;
  label: string;
  kind: "manual" | "automatic" | "safety";
  createdAt: string;
  projectCount: number;
};

export type PublicLocalMaterial = Omit<LocalMaterial, "sourcePath" | "extractedTextPath" | "analysisTextPath" | "correctedTextPath" | "visionImagePaths" | "audioTranscriptPath" | "audioProvenancePath"> & {
  visionImageCount: number;
  hasTextContent: boolean;
  hasAiAnalysis: boolean;
  hasCorrection: boolean;
};

export type PublicLocalProject = Omit<LocalProject, "codexThreadId" | "materials"> & {
  materials: PublicLocalMaterial[];
};

export function toPublicProject(project: LocalProject): PublicLocalProject {
  const { codexThreadId: _codexThreadId, materials, ...publicProject } = project;
  return {
    ...publicProject,
    document: publicDocument(project.document),
    materials: materials.map(({ sourcePath: _sourcePath, extractedTextPath, analysisTextPath, correctedTextPath, visionImagePaths, audioTranscriptPath: _audioTranscriptPath, audioProvenancePath: _audioProvenancePath, ...material }) => ({
      ...material,
      visionImageCount: visionImagePaths?.length ?? 0,
      hasTextContent: Boolean(extractedTextPath || analysisTextPath || correctedTextPath),
      hasAiAnalysis: Boolean(analysisTextPath),
      hasCorrection: Boolean(correctedTextPath),
    })),
  };
}

function publicDocument(document: Record<string, unknown>): Record<string, unknown> {
  const output = structuredClone(document);
  if (Array.isArray(output.boqRows)) output.boqRows = (output.boqRows as Array<Record<string, unknown>>).map(({ pricingBasis: _pricingBasis, ...row }) => row);
  return output;
}
