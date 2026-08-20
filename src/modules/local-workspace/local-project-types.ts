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
  visionImagePaths?: string[];
  pageCount?: number;
  sheetCount?: number;
};

export type ChatProposal = {
  id: string;
  target: "document" | "projectRule";
  path?: string;
  value?: unknown;
  rule?: string;
  reason: string;
  status: "pending" | "applied" | "rejected";
  createdAt: string;
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
};

export type LocalDekelReviewLine = {
  id: string;
  sourceBoqRowId: string;
  workDescription: string;
  category: string;
  originalCode: string;
  quantity: number;
  quantitySource: "document" | "material" | "estimated";
  included: boolean;
  selectedCode: string | null;
  candidates: LocalDekelCandidate[];
};

export type LocalDekelReview = {
  id: string;
  status: "ready" | "applied";
  analyzedAt: string;
  appliedAt?: string;
  workbookFileName: string;
  workbookRowsCount: number;
  billableRowsCount: number;
  lines: LocalDekelReviewLine[];
  warnings: string[];
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
  chat: Array<{ id: string; role: "user" | "assistant"; text: string; createdAt: string; proposalIds?: string[] }>;
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

export type PublicLocalMaterial = Omit<LocalMaterial, "sourcePath" | "extractedTextPath" | "visionImagePaths"> & {
  visionImageCount: number;
};

export type PublicLocalProject = Omit<LocalProject, "codexThreadId" | "materials"> & {
  materials: PublicLocalMaterial[];
};

export function toPublicProject(project: LocalProject): PublicLocalProject {
  const { codexThreadId: _codexThreadId, materials, ...publicProject } = project;
  return {
    ...publicProject,
    materials: materials.map(({ sourcePath: _sourcePath, extractedTextPath: _extractedTextPath, visionImagePaths, ...material }) => ({
      ...material,
      visionImageCount: visionImagePaths?.length ?? 0,
    })),
  };
}
