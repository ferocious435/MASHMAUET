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
  included: boolean;
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
  document: Record<string, unknown>;
};

export type LocalBackupManifest = {
  id: string;
  label: string;
  kind: "manual" | "automatic" | "safety";
  createdAt: string;
  projectCount: number;
};

export type PublicLocalMaterial = Omit<LocalMaterial, "sourcePath" | "extractedTextPath" | "analysisTextPath" | "correctedTextPath" | "visionImagePaths"> & {
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
    materials: materials.map(({ sourcePath: _sourcePath, extractedTextPath, analysisTextPath, correctedTextPath, visionImagePaths, ...material }) => ({
      ...material,
      visionImageCount: visionImagePaths?.length ?? 0,
      hasTextContent: Boolean(extractedTextPath || analysisTextPath || correctedTextPath),
      hasAiAnalysis: Boolean(analysisTextPath),
      hasCorrection: Boolean(correctedTextPath),
    })),
  };
}
