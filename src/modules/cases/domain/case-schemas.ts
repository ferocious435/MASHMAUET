export type PipelineStage =
  | "intake"
  | "preprocessing"
  | "work_understanding"
  | "clarification"
  | "matching"
  | "scoring"
  | "calculation"
  | "aggregation"
  | "review"
  | "output";

export type PipelineStageState =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked";

export type MatchType = "exact" | "probable" | "doubtful";
export type ReviewStatus = "not_started" | "required" | "approved" | "rejected";
export type FinalStatus = "draft" | "preliminary" | "approved" | "generated";
export type SupportingEvidenceSourceType =
  | "typed"
  | "handwritten"
  | "document"
  | "photo";
export type SupportingEvidenceFormat =
  | "inline_text"
  | "text_file"
  | "pdf"
  | "image";
export type SupportingEvidenceRole = "primary" | "supporting" | "visual_reference";
export type SupportingEvidenceReviewStatus = "accepted" | "needs_review";
export type CaseStatus =
  | "draft"
  | "analyzing"
  | "needs_clarification"
  | "review_pending"
  | "approved"
  | "rejected"
  | "output_ready";

export interface DimensionInput {
  length?: number;
  width?: number;
  height?: number;
  areaSquareMeters?: number;
  units?: number;
  lineLengthMeters?: number;
  lengthWidthInterpretation?:
    | "unknown"
    | "area_basis"
    | "geometry_only"
    | "linear_basis"
    | "volume_basis";
}

export interface DetectedGeometry {
  geometryId: string;
  rawText: string;
  length: number;
  width: number;
  height?: number;
  semanticStatus: "unresolved" | "resolved";
  interpretation:
    | "unknown"
    | "area_basis"
    | "geometry_only"
    | "linear_basis"
    | "volume_basis";
  extractedFrom: "inline_pair" | "user_input";
}

export interface SupportingEvidenceInput {
  sourceType: SupportingEvidenceSourceType;
  content?: string;
  extractedText?: string;
  label?: string;
  format?: SupportingEvidenceFormat;
  role?: SupportingEvidenceRole;
  fileName?: string;
  confidence?: number;
}

export interface SupportingEvidenceRecord {
  evidenceId: string;
  sourceType: SupportingEvidenceSourceType;
  format: SupportingEvidenceFormat;
  role: SupportingEvidenceRole;
  content: string | null;
  extractedText: string | null;
  fileName?: string;
  normalizedContent: string;
  label?: string;
  confidence: number;
  reviewStatus: SupportingEvidenceReviewStatus;
  usedInAnalysisFlag: boolean;
}

export interface PipelineTraceEvent {
  stage: PipelineStage;
  status: PipelineStageState;
  responsibleSkill: string;
  responsibleSkillSource?: string;
  supportingSkills: string[];
  supportingSkillSources?: Array<{
    name: string;
    source: string;
  }>;
  routeCategory?: string;
  summary: string;
  occurredAt: string;
}

export interface ClarificationQuestion {
  questionId: string;
  caseId: string;
  fieldKey: string;
  questionText: string;
  priority: "low" | "medium" | "high";
  answerValue: string | null;
  answerStatus: "open" | "answered";
}

export interface WorkItem {
  workItemId: string;
  caseId: string;
  workType: string;
  description: string;
  quantity: number | null;
  unit: string;
  derivedFrom: string;
  confidence: number;
  hiddenWorkFlag: boolean;
  requiresClarification: boolean;
}

export interface CandidateMatch {
  candidateId: string;
  caseId: string;
  workItemId: string;
  pricebookItemId: string;
  confidenceScore: number;
  matchType: MatchType;
  matchReason: string;
  unitStatus: "valid" | "warning" | "invalid";
  mappingStatus: "mapped" | "unmapped";
  selectedFlag: boolean;
  reviewerOverrideFlag: boolean;
}

export interface DetailedCostLine {
  costLineId: string;
  caseId: string;
  pricebookItemId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  sourceConfidence: number;
  estimationFlag: boolean;
  includedInOutputFlag: boolean;
}

export interface AggregatedTemplateLine {
  aggregatedLineId: string;
  caseId: string;
  templateLineKey: string;
  amount: number;
  sourceCostLineIds: string[];
  status: "ready" | "warning" | "blocked";
  warningFlag: boolean;
}

export interface ReviewDecision {
  decisionId: string;
  caseId: string;
  reviewerId: string;
  decisionType: string;
  targetEntityType: string;
  targetEntityId: string;
  comment: string;
  createdAt: string;
}

export interface SelectedMavnadimAncillaryRecommendation {
  key:
    | "foundation"
    | "placement_infrastructure"
    | "electricity_connection"
    | "water_connection"
    | "sewer_connection";
  title: string;
  status:
    | "explicitly_requested"
    | "conditional_review"
    | "usually_not_required";
  reason: string;
  suggestedDekelSearchTerms: string[];
  responsibleSkill: string;
}

export interface SelectedMavnadimItem {
  selectionId: string;
  catalogItemId: string;
  displayName: string;
  shortLabel: string;
  category:
    | "residential"
    | "sanitation"
    | "service"
    | "commercial"
    | "club"
    | "hotel"
    | "modular";
  dimensionsLabel: string;
  basePrice: number;
  sourceImageName: string;
  includedFeatures: string[];
  ancillaryRecommendations: SelectedMavnadimAncillaryRecommendation[];
  selectedAt: string;
  selectedBy: string;
  responsibleSkill: string;
}

export interface SelectedDekelLine {
  selectionId: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  sourceActivityNumber: string | null;
  sourceChapterCode: string | null;
  selectionContext?: "manual" | "mavnadim_ancillary";
  recommendationKey?: SelectedMavnadimAncillaryRecommendation["key"] | null;
  selectedAt: string;
  selectedBy: string;
  responsibleSkill: string;
}

export interface GeneratedArtifact {
  artifactId: string;
  caseId: string;
  kind:
    | "main_document"
    | "detailed_cost_sheet"
    | "review_sheet"
    | "output_package";
  format: "md" | "csv" | "json";
  absolutePath: string;
  relativePath: string;
  generatedAt: string;
  responsibleSkill: string;
}

export interface CaseAnalysisSnapshot {
  missingInputs: string[];
  clarificationQuestions: ClarificationQuestion[];
  detectedGeometry: DetectedGeometry[];
  workItems: WorkItem[];
  candidateMatches: CandidateMatch[];
  detailedCostLines: DetailedCostLine[];
  aggregatedTemplateLines: AggregatedTemplateLine[];
  reviewDecisions: ReviewDecision[];
  selectedMavnadimItem: SelectedMavnadimItem | null;
  selectedDekelLines: SelectedDekelLine[];
  generatedArtifacts: GeneratedArtifact[];
  warnings: string[];
  assumptions: string[];
  pipelineTrace: PipelineTraceEvent[];
}

export interface CaseCreateInput {
  title: string;
  templateId: string;
  pricebookId: string;
  description: string;
  dimensions?: DimensionInput;
  notes?: string;
  createdBy: string;
  supportingEvidence: SupportingEvidenceInput[];
}

export interface CaseDekelSelectionInputLine {
  code: string;
  quantity: number;
}

export interface CaseDekelSelectionInput {
  selectedBy: string;
  lines: CaseDekelSelectionInputLine[];
}

export interface CaseMavnadimAncillarySelectionInputLine {
  recommendationKey: SelectedMavnadimAncillaryRecommendation["key"];
  code: string;
  quantity: number;
}

export interface CaseMavnadimAncillarySelectionInput {
  selectedBy: string;
  lines: CaseMavnadimAncillarySelectionInputLine[];
  appendToExisting: boolean;
}

export interface CaseMavnadimSelectionInput {
  selectedBy: string;
  catalogItemId: string;
}

export interface CaseClarificationAnswerInput {
  questionId?: string;
  fieldKey?: string;
  answerValue: string;
}

export interface CaseClarificationSubmissionInput {
  answeredBy: string;
  answers: CaseClarificationAnswerInput[];
}

export interface CaseRecord {
  caseId: string;
  title: string;
  createdBy: string;
  createdAt: string;
  status: CaseStatus;
  templateId: string;
  pricebookId: string;
  rawDescription: string;
  normalizedDescription: string;
  dimensions: DimensionInput;
  notes?: string;
  supportingEvidence: SupportingEvidenceRecord[];
  reviewStatus: ReviewStatus;
  finalStatus: FinalStatus;
  analysis: CaseAnalysisSnapshot;
}

export function createEmptyAnalysisSnapshot(): CaseAnalysisSnapshot {
  return {
    missingInputs: [],
    clarificationQuestions: [],
    detectedGeometry: [],
    workItems: [],
    candidateMatches: [],
    detailedCostLines: [],
    aggregatedTemplateLines: [],
    reviewDecisions: [],
    selectedMavnadimItem: null,
    selectedDekelLines: [],
    generatedArtifacts: [],
    warnings: [],
    assumptions: [],
    pipelineTrace: [],
  };
}

export function validateCaseCreateInput(input: unknown): CaseCreateInput {
  if (!isRecord(input)) {
    throw new Error("Case input must be an object.");
  }

  const title = requireString(input.title, "title", 3);
  const templateId = requireString(input.templateId, "templateId", 1);
  const pricebookId = requireString(input.pricebookId, "pricebookId", 1);
  const notes = optionalString(input.notes, "notes");
  const createdBy = optionalString(input.createdBy, "createdBy") ?? "operator";
  const dimensions = validateDimensionInput(input.dimensions);
  const supportingEvidence = validateSupportingEvidenceInput(input.supportingEvidence);
  const description =
    optionalString(input.description, "description") ??
    deriveDescriptionFromSupportingEvidence(supportingEvidence);

  if (!description || description.length < 3) {
    throw new Error(
      "Case input must include either description or text-bearing supportingEvidence.",
    );
  }

  return {
    title,
    templateId,
    pricebookId,
    description,
    dimensions,
    notes,
    createdBy,
    supportingEvidence,
  };
}

export function validateCaseDekelSelectionInput(
  input: unknown,
): CaseDekelSelectionInput {
  if (!isRecord(input)) {
    throw new Error("Dekel selection input must be an object.");
  }

  const selectedBy = optionalString(input.selectedBy, "selectedBy") ?? "reviewer";
  const lines = validateDekelSelectionLines(input.lines);

  return {
    selectedBy,
    lines,
  };
}

export function validateCaseMavnadimSelectionInput(
  input: unknown,
): CaseMavnadimSelectionInput {
  if (!isRecord(input)) {
    throw new Error("Mavnadim selection input must be an object.");
  }

  return {
    selectedBy: optionalString(input.selectedBy, "selectedBy") ?? "reviewer",
    catalogItemId: requireString(input.catalogItemId, "catalogItemId", 3),
  };
}

export function validateCaseMavnadimAncillarySelectionInput(
  input: unknown,
): CaseMavnadimAncillarySelectionInput {
  if (!isRecord(input)) {
    throw new Error("Mavnadim ancillary selection input must be an object.");
  }

  return {
    selectedBy: optionalString(input.selectedBy, "selectedBy") ?? "reviewer",
    lines: validateMavnadimAncillarySelectionLines(input.lines),
    appendToExisting:
      typeof input.appendToExisting === "boolean" ? input.appendToExisting : true,
  };
}

export function validateCaseClarificationSubmissionInput(
  input: unknown,
): CaseClarificationSubmissionInput {
  if (!isRecord(input)) {
    throw new Error("Clarification submission input must be an object.");
  }

  const answeredBy = optionalString(input.answeredBy, "answeredBy") ?? "operator";
  const answers = validateClarificationAnswers(input.answers);

  return {
    answeredBy,
    answers,
  };
}

function validateDimensionInput(input: unknown): DimensionInput {
  if (input === undefined || input === null) {
    return {};
  }

  if (!isRecord(input)) {
    throw new Error("dimensions must be an object.");
  }

  return {
    length: optionalPositiveNumber(input.length, "dimensions.length"),
    width: optionalPositiveNumber(input.width, "dimensions.width"),
    height: optionalPositiveNumber(input.height, "dimensions.height"),
    areaSquareMeters: optionalPositiveNumber(
      input.areaSquareMeters,
      "dimensions.areaSquareMeters",
    ),
    units: optionalPositiveNumber(input.units, "dimensions.units"),
    lineLengthMeters: optionalPositiveNumber(
      input.lineLengthMeters,
      "dimensions.lineLengthMeters",
    ),
    lengthWidthInterpretation:
      validateLengthWidthInterpretation(input.lengthWidthInterpretation) ??
      (input.length !== undefined && input.width !== undefined
        ? "area_basis"
        : undefined),
  };
}

function validateLengthWidthInterpretation(
  value: unknown,
): DimensionInput["lengthWidthInterpretation"] {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    value === "unknown" ||
    value === "area_basis" ||
    value === "geometry_only" ||
    value === "linear_basis" ||
    value === "volume_basis"
  ) {
    return value;
  }

  throw new Error(
    "dimensions.lengthWidthInterpretation must be one of: unknown, area_basis, geometry_only, linear_basis, volume_basis.",
  );
}

function validateDekelSelectionLines(
  input: unknown,
): CaseDekelSelectionInputLine[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("lines must be a non-empty array.");
  }

  return input.map((line, index) => {
    if (!isRecord(line)) {
      throw new Error(`lines[${index}] must be an object.`);
    }

    return {
      code: requireString(line.code, `lines[${index}].code`, 3),
      quantity: optionalPositiveNumber(line.quantity, `lines[${index}].quantity`) ?? 1,
    };
  });
}

function validateMavnadimAncillarySelectionLines(
  input: unknown,
): CaseMavnadimAncillarySelectionInputLine[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("lines must be a non-empty array.");
  }

  return input.map((line, index) => {
    if (!isRecord(line)) {
      throw new Error(`lines[${index}] must be an object.`);
    }

    return {
      recommendationKey: requireRecommendationKey(
        line.recommendationKey,
        `lines[${index}].recommendationKey`,
      ),
      code: requireString(line.code, `lines[${index}].code`, 3),
      quantity: optionalPositiveNumber(line.quantity, `lines[${index}].quantity`) ?? 1,
    };
  });
}

function validateSupportingEvidenceInput(
  input: unknown,
): SupportingEvidenceInput[] {
  if (input === undefined || input === null) {
    return [];
  }

  if (!Array.isArray(input)) {
    throw new Error("supportingEvidence must be an array.");
  }

  return input.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`supportingEvidence[${index}] must be an object.`);
    }

    const sourceType = validateSupportingEvidenceSourceType(
      item.sourceType,
      `supportingEvidence[${index}].sourceType`,
    );
    const content = optionalString(
      item.content,
      `supportingEvidence[${index}].content`,
    );
    const extractedText = optionalString(
      item.extractedText,
      `supportingEvidence[${index}].extractedText`,
    );
    if (!content && !extractedText) {
      throw new Error(
        `supportingEvidence[${index}] must include content or extractedText.`,
      );
    }
    const label = optionalString(item.label, `supportingEvidence[${index}].label`);
    const format = validateSupportingEvidenceFormat(
      item.format,
      `supportingEvidence[${index}].format`,
      sourceType,
    );
    const role =
      validateSupportingEvidenceRole(
        item.role,
        `supportingEvidence[${index}].role`,
      ) ?? inferSupportingEvidenceRole(sourceType);
    const fileName = optionalString(
      item.fileName,
      `supportingEvidence[${index}].fileName`,
    );
    const confidence = optionalConfidence(
      item.confidence,
      `supportingEvidence[${index}].confidence`,
    );

    return {
      sourceType,
      content,
      extractedText,
      label,
      format,
      role,
      fileName,
      confidence,
    };
  });
}

function validateClarificationAnswers(
  input: unknown,
): CaseClarificationAnswerInput[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("answers must be a non-empty array.");
  }

  return input.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`answers[${index}] must be an object.`);
    }

    const questionId = optionalString(item.questionId, `answers[${index}].questionId`);
    const fieldKey = optionalString(item.fieldKey, `answers[${index}].fieldKey`);
    if (!questionId && !fieldKey) {
      throw new Error(
        `answers[${index}] must include either questionId or fieldKey.`,
      );
    }

    return {
      questionId,
      fieldKey,
      answerValue: requireString(
        item.answerValue,
        `answers[${index}].answerValue`,
        1,
      ),
    };
  });
}

function validateSupportingEvidenceSourceType(
  value: unknown,
  field: string,
): SupportingEvidenceSourceType {
  if (
    value === "typed" ||
    value === "handwritten" ||
    value === "document" ||
    value === "photo"
  ) {
    return value;
  }

  throw new Error(
    `${field} must be one of "typed", "handwritten", "document", or "photo".`,
  );
}

function validateSupportingEvidenceFormat(
  value: unknown,
  field: string,
  sourceType: SupportingEvidenceSourceType,
): SupportingEvidenceFormat {
  if (
    value === "inline_text" ||
    value === "text_file" ||
    value === "pdf" ||
    value === "image"
  ) {
    return value;
  }

  if (value !== undefined && value !== null && value !== "") {
    throw new Error(
      `${field} must be one of "inline_text", "text_file", "pdf", or "image".`,
    );
  }

  return inferSupportingEvidenceFormat(sourceType);
}

function validateSupportingEvidenceRole(
  value: unknown,
  field: string,
): SupportingEvidenceRole | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (
    value === "primary" ||
    value === "supporting" ||
    value === "visual_reference"
  ) {
    return value;
  }

  throw new Error(
    `${field} must be one of "primary", "supporting", or "visual_reference".`,
  );
}

function inferSupportingEvidenceFormat(
  sourceType: SupportingEvidenceSourceType,
): SupportingEvidenceFormat {
  if (sourceType === "typed") {
    return "inline_text";
  }

  if (sourceType === "document") {
    return "pdf";
  }

  return "image";
}

function inferSupportingEvidenceRole(
  sourceType: SupportingEvidenceSourceType,
): SupportingEvidenceRole {
  if (sourceType === "photo") {
    return "visual_reference";
  }

  return "supporting";
}

function deriveDescriptionFromSupportingEvidence(
  evidenceItems: SupportingEvidenceInput[],
): string | undefined {
  const candidateTexts = evidenceItems
    .filter((item) => item.role === "primary" || item.sourceType === "typed")
    .map((item) => item.extractedText ?? item.content ?? "")
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);

  if (candidateTexts.length === 0) {
    return undefined;
  }

  return candidateTexts.join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, field: string, minLength: number): string {
  if (typeof value !== "string" || value.trim().length < minLength) {
    throw new Error(`${field} must be a string with length >= ${minLength}.`);
  }

  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  return value.trim();
}

function optionalPositiveNumber(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number.`);
  }

  return value;
}

function requireRecommendationKey(
  value: unknown,
  field: string,
): SelectedMavnadimAncillaryRecommendation["key"] {
  const parsed = requireString(value, field, 3);

  if (
    parsed !== "foundation" &&
    parsed !== "placement_infrastructure" &&
    parsed !== "electricity_connection" &&
    parsed !== "water_connection" &&
    parsed !== "sewer_connection"
  ) {
    throw new Error(
      `${field} must be one of foundation, placement_infrastructure, electricity_connection, water_connection, sewer_connection.`,
    );
  }

  return parsed;
}

function optionalConfidence(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be a number between 0 and 1.`);
  }

  return value;
}
