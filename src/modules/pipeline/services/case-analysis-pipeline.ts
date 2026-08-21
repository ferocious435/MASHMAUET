import {
  type AggregatedTemplateLine,
  type CandidateMatch,
  type CaseRecord,
  type ClarificationQuestion,
  type DetectedGeometry,
  type DetailedCostLine,
  type DimensionInput,
  type MatchType,
  type PipelineStage,
  type PipelineStageState,
  type PipelineTraceEvent,
  type SupportingEvidenceRecord,
  type WorkItem,
  createEmptyAnalysisSnapshot,
} from "../../cases/domain/case-schemas.ts";
import type {
  PricebookItem,
  TemplateMappingRule,
} from "../../references/domain/reference-schemas.ts";
import {
  type SkillRouteDecision,
  SkillOrchestratorService,
} from "../../skills/services/skill-orchestrator-service.ts";
import {
  InMemoryMappingRuleRepository,
  InMemoryPricebookRepository,
  InMemoryTemplateRepository,
} from "../../references/repositories/in-memory-reference-repositories.ts";
import type { DekelCandidateMatch } from "../../references/services/dekel-matching-service.ts";

type DekelMatchingGateway = {
  findCandidatesByDescription(
    description: string,
    limit?: number,
    options?: { workItems?: WorkItem[] },
  ): Promise<DekelCandidateMatch[]>;
  findPricebookItemsByCodes(codes: string[]): Promise<PricebookItem[]>;
};

const quantityUnits = new Set(["m2", "m", "unit", "komplet"]);

const stageTaskTypeMap: Record<PipelineStage, string> = {
  intake: "internal.pipeline.intake",
  preprocessing: "internal.pipeline.preprocessing",
  work_understanding: "internal.pipeline.work_understanding",
  clarification: "internal.pipeline.clarification",
  matching: "internal.pipeline.matching",
  scoring: "internal.pipeline.scoring",
  calculation: "internal.pipeline.calculation",
  aggregation: "internal.pipeline.aggregation",
  review: "internal.pipeline.review",
  output: "internal.pipeline.output",
};

const fallbackStageSkillMap: Record<PipelineStage, string> = {
  intake: "backend-development-feature-development",
  preprocessing: "backend-dev-guidelines",
  work_understanding: "product-manager",
  clarification: "ask-questions-if-underspecified",
  matching: "rag-engineer",
  scoring: "advanced-evaluation",
  calculation: "backend-dev-guidelines",
  aggregation: "backend-architect",
  review: "testing-qa",
  output: "documentation-generation-doc-generate",
};

export class CaseAnalysisPipeline {
  private readonly templateRepository: InMemoryTemplateRepository;
  private readonly pricebookRepository: InMemoryPricebookRepository;
  private readonly mappingRepository: InMemoryMappingRuleRepository;
  private readonly skillOrchestratorService?: SkillOrchestratorService;
  private readonly dekelMatchingService?: DekelMatchingGateway;

  public constructor(
    templateRepository: InMemoryTemplateRepository,
    pricebookRepository: InMemoryPricebookRepository,
    mappingRepository: InMemoryMappingRuleRepository,
    skillOrchestratorService?: SkillOrchestratorService,
    dekelMatchingService?: DekelMatchingGateway,
  ) {
    this.templateRepository = templateRepository;
    this.pricebookRepository = pricebookRepository;
    this.mappingRepository = mappingRepository;
    this.skillOrchestratorService = skillOrchestratorService;
    this.dekelMatchingService = dekelMatchingService;
  }

  public async run(input: CaseRecord): Promise<CaseRecord> {
    const template = this.templateRepository.findById(input.templateId);
    const pricebookItems = this.pricebookRepository.listByPricebookId(
      input.pricebookId,
    );
    const mappingRules = this.mappingRepository.listByTemplateId(input.templateId);
    const analysis = createEmptyAnalysisSnapshot();
    analysis.selectedDekelLines = [...input.analysis.selectedDekelLines];
    analysis.reviewDecisions = [...input.analysis.reviewDecisions];

    let record: CaseRecord = {
      ...input,
      status: "analyzing",
      normalizedDescription: input.rawDescription,
      analysis,
    };

    const intakeStage = await executeTaskWithRoute(
      this.skillOrchestratorService,
      {
        caseId: record.caseId,
        stage: "intake",
        inputSummary: "Initialize controlled case analysis pipeline.",
      },
      async () => ({
        caseId: record.caseId,
        status: "analyzing",
      }),
    );
    record = appendTrace(
      record,
      intakeStage.decision,
      "intake",
      "completed",
      "Case entered the controlled analysis pipeline.",
    );

    const preprocessingStage = await executeTaskWithRoute(
      this.skillOrchestratorService,
      {
        caseId: record.caseId,
        stage: "preprocessing",
        inputSummary: record.rawDescription,
      },
      async () => preprocessCaseIntake(record),
    );
    record.normalizedDescription = preprocessingStage.payload.normalizedDescription;
    record.analysis.assumptions.push(...preprocessingStage.payload.assumptions);
    record.analysis.warnings.push(...preprocessingStage.payload.warnings);
    const detectedGeometry = detectInlineGeometry(
      record.caseId,
      record.normalizedDescription,
      record.dimensions,
    );
    record.analysis.detectedGeometry = detectedGeometry;
    if (
      detectedGeometry.length > 0 &&
      record.dimensions.length === undefined &&
      record.dimensions.width === undefined
    ) {
      record.dimensions.length = detectedGeometry[0].length;
      record.dimensions.width = detectedGeometry[0].width;
      record.dimensions.lengthWidthInterpretation ??=
        detectedGeometry[0].interpretation;
    }
    record = appendTrace(
      record,
      preprocessingStage.decision,
      "preprocessing",
      "completed",
      preprocessingStage.payload.summary,
    );

    const workUnderstandingStage = await executeTaskWithRoute(
      this.skillOrchestratorService,
      {
        caseId: record.caseId,
        stage: "work_understanding",
        inputSummary: record.normalizedDescription,
      },
      async () => detectWorkItems(record.caseId, record.normalizedDescription),
    );
    const professionalQuantityResolution = applyProfessionalQuantityAssumptions(
      workUnderstandingStage.payload,
      record.dimensions,
    );
    const workItems = professionalQuantityResolution.workItems;
    record.analysis.assumptions.push(...professionalQuantityResolution.assumptions);
    record.analysis.workItems = workItems;
    record = appendTrace(
      record,
      workUnderstandingStage.decision,
      "work_understanding",
      "completed",
      `Derived ${workItems.length} structured work item(s) from the case description.`,
    );

    const missingInputs = detectMissingInputs(
      record.dimensions,
      record.analysis.detectedGeometry,
      workItems,
      template,
      pricebookItems,
      mappingRules,
    );
    const clarificationStage = await executeTaskWithRoute(
      this.skillOrchestratorService,
      {
        caseId: record.caseId,
        stage: "clarification",
        inputSummary: `Missing-input evaluation for ${workItems.length} work item(s).`,
      },
      async () => ({
        missingInputs,
        clarificationQuestions: buildClarificationQuestions(
          record.caseId,
          missingInputs,
        ),
      }),
    );
    record.analysis.missingInputs = clarificationStage.payload.missingInputs;
    record.analysis.clarificationQuestions =
      clarificationStage.payload.clarificationQuestions;

    if (missingInputs.length > 0) {
      const userClarificationKeys = new Set(
        clarificationStage.payload.clarificationQuestions.map(
          (question) => question.fieldKey,
        ),
      );
      const internalBlockingInputs = clarificationStage.payload.missingInputs.filter(
        (fieldKey) => !userClarificationKeys.has(fieldKey),
      );

      record.status =
        clarificationStage.payload.clarificationQuestions.length > 0
          ? "needs_clarification"
          : "review_pending";
      record.reviewStatus = "required";
      record.finalStatus = "preliminary";
      if (clarificationStage.payload.clarificationQuestions.length > 0) {
        record.analysis.warnings.push(
          "Pipeline paused at clarification because user-provided input is still needed.",
        );
      }

      if (internalBlockingInputs.length > 0) {
        record.analysis.warnings.push(
          `Pipeline requires manual review because internal reference data is unavailable: ${internalBlockingInputs.join(", ")}.`,
        );
      }

      record = appendTrace(
        record,
        clarificationStage.decision,
        "clarification",
        "blocked",
        clarificationStage.payload.clarificationQuestions.length > 0
          ? `Clarification required for: ${clarificationStage.payload.clarificationQuestions
              .map((question) => question.fieldKey)
              .join(", ")}${
              internalBlockingInputs.length > 0
                ? `; internal blockers: ${internalBlockingInputs.join(", ")}`
                : ""
            }.`
          : `Clarification stage escalated to manual review because only internal blockers remain: ${internalBlockingInputs.join(", ")}.`,
      );

      return record;
    }

    record = appendTrace(
      record,
      clarificationStage.decision,
      "clarification",
      "completed",
      "No critical clarification gap remained after validation.",
    );

    const liveDekelSupplement = await resolveLiveDekelPricebookItems(
      this.dekelMatchingService,
      record.rawDescription,
      workItems,
    );
    const effectivePricebookItems = mergePricebookItems(
      pricebookItems,
      liveDekelSupplement.items,
    );

    if (liveDekelSupplement.warning) {
      record.analysis.warnings.push(liveDekelSupplement.warning);
    }

    const matchingStage = await executeTaskWithRoute(
      this.skillOrchestratorService,
      {
        caseId: record.caseId,
        stage: "matching",
        inputSummary: `Match ${workItems.length} work item(s) against ${effectivePricebookItems.length} pricebook item(s).`,
      },
      async () =>
        buildCandidateMatches(
          record.caseId,
          workItems,
          effectivePricebookItems,
          mappingRules,
        ),
    );
    const candidateMatches = matchingStage.payload;
    record.analysis.candidateMatches = candidateMatches;
    if (workItems.length > 0 && candidateMatches.length === 0) {
      record.analysis.warnings.push(
        "No pricebook candidate matches were found for the detected work items.",
      );
    }
    record = appendTrace(
      record,
      matchingStage.decision,
      "matching",
      "completed",
      `Built ${candidateMatches.length} candidate match(es).`,
    );

    const scoringStage = await executeTaskWithRoute(
      this.skillOrchestratorService,
      {
        caseId: record.caseId,
        stage: "scoring",
        inputSummary: `Score ${candidateMatches.length} candidate match(es).`,
      },
      async () => ({
        candidatesCount: candidateMatches.length,
        exactMatches: candidateMatches.filter((item) => item.matchType === "exact")
          .length,
        reviewSensitiveMatches: candidateMatches.filter(
          (item) => item.matchType !== "exact",
        ).length,
      }),
    );
    record = appendTrace(
      record,
      scoringStage.decision,
      "scoring",
      "completed",
      "Evaluated confidence and review sensitivity across the candidate set.",
    );

    const calculationStage = await executeTaskWithRoute(
      this.skillOrchestratorService,
      {
        caseId: record.caseId,
        stage: "calculation",
        inputSummary: `Calculate detailed costs from ${candidateMatches.length} selected candidate(s).`,
      },
      async () =>
        buildDetailedCostLines(
          record.caseId,
          candidateMatches,
          workItems,
          effectivePricebookItems,
          record.dimensions,
          record.analysis,
        ),
    );
    const costLines = calculationStage.payload;
    record.analysis.detailedCostLines = costLines;
    record = appendTrace(
      record,
      calculationStage.decision,
      "calculation",
      "completed",
      `Calculated ${costLines.length} detailed cost line(s).`,
    );

    const aggregationStage = await executeTaskWithRoute(
      this.skillOrchestratorService,
      {
        caseId: record.caseId,
        stage: "aggregation",
        inputSummary: `Aggregate ${costLines.length} cost line(s) into template lines.`,
      },
      async () =>
        aggregateTemplateLines(
          record.caseId,
          costLines,
          effectivePricebookItems,
          mappingRules,
        ),
    );
    const aggregatedLines = aggregationStage.payload;
    record.analysis.aggregatedTemplateLines = aggregatedLines;
    record = appendTrace(
      record,
      aggregationStage.decision,
      "aggregation",
      "completed",
      `Aggregated ${aggregatedLines.length} template line(s).`,
    );

    const requiresReview =
      candidateMatches.length === 0 ||
      candidateMatches.some((item) => item.matchType !== "exact") ||
      costLines.some((item) => item.estimationFlag);

    record.status = "review_pending";
    record.reviewStatus = "required";
    record.finalStatus = requiresReview ? "preliminary" : "draft";

    if (requiresReview) {
      const reviewWarning =
        candidateMatches.length === 0
          ? "Human review is required because no candidate matches were found for at least one detected work item."
          : "Human review is required because at least one match is uncertain or one quantity is estimated.";
      record.analysis.warnings.push(reviewWarning);
    }

    const reviewStage = await executeTaskWithRoute(
      this.skillOrchestratorService,
      {
        caseId: record.caseId,
        stage: "review",
        inputSummary: `Review ${candidateMatches.length} candidate match(es) and ${costLines.length} cost line(s).`,
      },
      async () => ({
        requiresReview,
        warningCount: record.analysis.warnings.length,
      }),
    );
    record = appendTrace(
      record,
      reviewStage.decision,
      "review",
      "completed",
      requiresReview
        ? "Review gate requires human confirmation before final output."
        : "Review gate passed without additional manual intervention.",
    );

    const outputStage = await executeTaskWithRoute(
      this.skillOrchestratorService,
      {
        caseId: record.caseId,
        stage: "output",
        inputSummary: `Prepare output handoff for ${aggregatedLines.length} aggregated line(s).`,
      },
      async () => ({
        outputReady: false,
        nextStep: "final_generation",
      }),
    );
    record = appendTrace(
      record,
      outputStage.decision,
      "output",
      "pending",
      "Output package is prepared for the final generation step.",
    );

    return record;
  }
}

async function resolveLiveDekelPricebookItems(
  dekelMatchingService: DekelMatchingGateway | undefined,
  description: string,
  workItems: WorkItem[],
): Promise<{ items: PricebookItem[]; warning: string | null }> {
  if (!dekelMatchingService || description.trim().length === 0 || workItems.length === 0) {
    return {
      items: [],
      warning: null,
    };
  }

  try {
    const liveCandidates = await dekelMatchingService.findCandidatesByDescription(
      description,
      Math.max(6, workItems.length * 4),
      {
        workItems,
      },
    );
    if (liveCandidates.length === 0) {
      return {
        items: [],
        warning: null,
      };
    }

    const liveItems = await dekelMatchingService.findPricebookItemsByCodes(
      liveCandidates.map((candidate) => candidate.code),
    );
    return {
      items: liveItems,
      warning: null,
    };
  } catch (error) {
    return {
      items: [],
      warning:
        error instanceof Error
          ? `Live DEKEL fallback could not be loaded: ${error.message}`
          : "Live DEKEL fallback could not be loaded.",
    };
  }
}

function mergePricebookItems(
  baseItems: PricebookItem[],
  supplementalItems: PricebookItem[],
): PricebookItem[] {
  if (supplementalItems.length === 0) {
    return baseItems;
  }

  const mergedItems = new Map<string, PricebookItem>(
    baseItems.map((item) => [buildPricebookMergeKey(item), item]),
  );

  for (const item of supplementalItems) {
    mergedItems.set(buildPricebookMergeKey(item), item);
  }

  return [...mergedItems.values()];
}

function buildPricebookMergeKey(item: PricebookItem): string {
  return item.code.trim().toLowerCase();
}

function appendTrace(
  record: CaseRecord,
  decision: SkillRouteDecision,
  stage: PipelineStage,
  status: PipelineStageState,
  summary: string,
): CaseRecord {
  const event: PipelineTraceEvent = {
    stage,
    status,
    responsibleSkill: decision.primarySkill,
    responsibleSkillSource: decision.primarySkillSource.source,
    supportingSkills: [...decision.supportingSkills],
    supportingSkillSources: decision.supportingSkillSources.map((source) => ({
      name: source.name,
      source: source.source,
    })),
    routeCategory: decision.routeCategory,
    summary,
    occurredAt: new Date().toISOString(),
  };

  return {
    ...record,
    analysis: {
      ...record.analysis,
      pipelineTrace: [...record.analysis.pipelineTrace, event],
    },
  };
}

async function executeTaskWithRoute<T>(
  skillOrchestratorService: SkillOrchestratorService | undefined,
  context: {
    caseId: string;
    stage: PipelineStage;
    inputSummary: string;
  },
  handler: () => Promise<T>,
): Promise<{ decision: SkillRouteDecision; payload: T }> {
  if (!skillOrchestratorService) {
    return {
      decision: buildFallbackDecision(context.stage),
      payload: await handler(),
    };
  }

  const routedResult = await skillOrchestratorService.runTask(
    {
      taskType: stageTaskTypeMap[context.stage],
      invokedBy: `pipeline:${context.stage}`,
      caseId: context.caseId,
      inputSummary: context.inputSummary,
    },
    async () => ({
      statusCode: 200,
      body: {
        payload: await handler(),
      },
    }),
  );

  return {
    decision: routedResult.decision,
    payload: routedResult.responseBody.payload as T,
  };
}

function buildFallbackDecision(stage: PipelineStage): SkillRouteDecision {
  return {
    taskId: `fallback-${stage}`,
    taskType: stageTaskTypeMap[stage],
    routeCategory: "Pipeline fallback",
    primarySkill: fallbackStageSkillMap[stage],
    secondarySkill: null,
    supportingSkills: [],
    validationSkill: null,
    fallbackSkill: null,
    reviewRequired: false,
    reason: "Fallback stage routing without orchestrator service.",
    invokedBy: `pipeline:${stage}`,
    handoffFrom: null,
    handoffTo: null,
    primarySkillSource: {
      name: fallbackStageSkillMap[stage],
      source: "pipeline-fallback",
      skillFile: null,
      usage: "primary-or-support",
    },
    secondarySkillSource: null,
    supportingSkillSources: [],
    validationSkillSource: null,
    fallbackSkillSource: null,
  };
}

function normalizeText(input: string): string {
  return input
    .replace(/[+]/g, " + ")
    .replace(/[;,]/g, ", ")
    .replace(/[(){}\[\]]/g, " ")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function preprocessCaseIntake(input: CaseRecord): {
  normalizedDescription: string;
  assumptions: string[];
  warnings: string[];
  summary: string;
} {
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const includedEvidence = input.supportingEvidence.filter(
    (item) => item.usedInAnalysisFlag,
  );
  const typedEvidence = includedEvidence.filter((item) => item.sourceType === "typed");
  const documentEvidence = includedEvidence.filter(
    (item) => item.sourceType === "document",
  );
  const acceptedHandwrittenEvidence = includedEvidence.filter(
    (item) => item.sourceType === "handwritten",
  );
  const pendingPhotoEvidence = input.supportingEvidence.filter(
    (item) => item.sourceType === "photo" && item.reviewStatus === "needs_review",
  );
  const pendingHandwrittenEvidence = input.supportingEvidence.filter(
    (item) =>
      item.sourceType === "handwritten" && item.reviewStatus === "needs_review",
  );

  if (typedEvidence.length > 0) {
    assumptions.push(
      `Included ${typedEvidence.length} typed supporting evidence item(s) in work understanding.`,
    );
  }

  if (documentEvidence.length > 0) {
    assumptions.push(
      `Included ${documentEvidence.length} document-derived evidence item(s) in work understanding.`,
    );
  }

  if (acceptedHandwrittenEvidence.length > 0) {
    assumptions.push(
      `Included ${acceptedHandwrittenEvidence.length} high-confidence handwritten supporting evidence item(s) as supplemental context.`,
    );
  }

  if (pendingHandwrittenEvidence.length > 0) {
    warnings.push(
      `Handwritten supporting evidence is pending review and was not treated as source of truth (${pendingHandwrittenEvidence.length} item(s)).`,
    );
  }

  if (pendingPhotoEvidence.length > 0) {
    warnings.push(
      `Photo evidence remains review-only and must be cross-checked against text/document context (${pendingPhotoEvidence.length} item(s)).`,
    );
  }

  const normalizedDescription = normalizeText(
    [
      input.rawDescription,
      ...includedEvidence
        .map((item) => item.extractedText ?? item.content ?? "")
        .filter((item) => item.length > 0),
    ].join(" "),
  );

  return {
    normalizedDescription,
    assumptions,
    warnings,
    summary:
      `Normalized intake and merged ${includedEvidence.length} accepted ` +
      `supporting evidence item(s); ` +
      `${pendingHandwrittenEvidence.length + pendingPhotoEvidence.length} ` +
      `non-trusted visual/handwritten item(s) remain review-only.`,
  };
}

function detectWorkItems(caseId: string, description: string): WorkItem[] {
  const workItems: WorkItem[] = [];
  const explicitAreaQuantity = extractExplicitAreaQuantity(description);
  const explicitLinearQuantity = extractExplicitLinearQuantity(description);
  const explicitDepthMeters = extractExplicitDepthMeters(description);
  const explicitDiameterMm = extractExplicitDiameterMm(description);
  const explicitDoorUnits = extractExplicitUnitQuantity(description, [
    /\b(\d+(?:[.,]\d+)?)\s+(?:interior\s+)?doors?\b/iu,
    /(\d+(?:[.,]\d+)?)\s*דלת(?:ות)?/u,
  ]);
  const explicitCabinetUnits = extractExplicitUnitQuantity(description, [
    /\b(\d+(?:[.,]\d+)?)\s+(?:fire\s+)?cabinet(?:s)?\b/iu,
    /(\d+(?:[.,]\d+)?)\s*ארו(?:ן|נות)\s+כיבוי\s+אש/u,
  ]);
  const mentionsDoorThreshold = /(סף\s+דלת|door\s+threshold)/u.test(description);
  const mentionsDoorReplacement =
    /((replace|replacement)[^.]{0,30}\bdoor\b)|\bdoors\b|החלפת\s+דלת(?:ות)?|דלת(?:ות)?\s+פנים/u.test(
      description,
    ) || (/(דלת|door)/u.test(description) && !mentionsDoorThreshold);

  const pushWorkItem = (
    workType: string,
    itemDescription: string,
    unit: string,
    hiddenWorkFlag: boolean,
    confidence: number,
    quantity: number | null = null,
  ): void => {
    workItems.push({
      workItemId: `${caseId}-${workType}-${workItems.length + 1}`,
      caseId,
      workType,
      description: itemDescription,
      quantity,
      unit,
      derivedFrom: hiddenWorkFlag ? "hidden-work-rule" : "user-description",
      confidence,
      hiddenWorkFlag,
      requiresClarification: quantity === null && !hiddenWorkFlag && unit !== "komplet",
    });
  };

  if (/(פירוק|ריצוף|רצפה|floor|covering|tile)/u.test(description)) {
    pushWorkItem(
      "floor_replacement",
      "Floor replacement",
      "m2",
      false,
      0.94,
      explicitAreaQuantity,
    );
    pushWorkItem(
      "surface_preparation",
      "Surface preparation",
      "m2",
      true,
      0.78,
      explicitAreaQuantity,
    );
    pushWorkItem("debris_removal", "Debris removal", "komplet", true, 0.74);
  }

  if (mentionsDoorReplacement) {
    pushWorkItem(
      "door_replacement",
      "Door replacement",
      "unit",
      false,
      0.93,
      explicitDoorUnits,
    );
    pushWorkItem(
      "perimeter_wall_repair",
      "Perimeter wall repair around the door opening",
      "m2",
      true,
      0.71,
      explicitAreaQuantity,
    );
  }

  if (/(ארון\s+כיבוי|fire\s+cabinet|cabinet)/u.test(description)) {
    pushWorkItem(
      "cabinet_replacement",
      "Cabinet replacement",
      "unit",
      false,
      0.9,
      explicitCabinetUnits,
    );
  }

  if (/(קיר|טיח|תיקון|wall|repair)/u.test(description)) {
    pushWorkItem(
      "wall_repair",
      "Local wall repair",
      "m2",
      false,
      0.88,
      explicitAreaQuantity,
    );
  }

  if (/(ביוב|sewer|drain(?:age)?|pipe|צינור)/iu.test(description)) {
    const sewerDescriptor = buildSewerDescriptorSuffix({
      depthMeters: explicitDepthMeters,
      diameterMm: explicitDiameterMm,
    });

    pushWorkItem(
      "sewer_line_replacement",
      `Sewer line replacement${sewerDescriptor}`,
      "m",
      false,
      0.96,
      explicitLinearQuantity,
    );
    pushWorkItem(
      "trench_excavation",
      `Trench excavation for sewer line${sewerDescriptor}`,
      "m",
      true,
      0.82,
      explicitLinearQuantity,
    );
    pushWorkItem(
      "backfill_restoration",
      "Backfill and local surface restoration",
      "m",
      true,
      0.77,
      explicitLinearQuantity,
    );
  }

  if (workItems.length === 0) {
    pushWorkItem("general_scope", "General scope", "komplet", false, 0.55);
    pushWorkItem("generic_measurement", "Generic measurement and verification", "unit", true, 0.48);
    pushWorkItem("generic_cleanup", "Generic cleanup and disposal", "komplet", true, 0.46);
  }

  return workItems;
}

function detectMissingInputs(
  dimensions: DimensionInput,
  detectedGeometry: DetectedGeometry[],
  workItems: WorkItem[],
  template: object | null,
  pricebookItems: PricebookItem[],
  mappingRules: TemplateMappingRule[],
): string[] {
  const missing = new Set<string>();
  const areaRequired = workItems.some(
    (item) => item.unit === "m2" && !item.hiddenWorkFlag && item.quantity === null,
  );
  const linearRequired = workItems.some(
    (item) => item.unit === "m" && !item.hiddenWorkFlag && item.quantity === null,
  );
  const unitCountRequired = workItems.some(
    (item) => item.unit === "unit" && !item.hiddenWorkFlag && item.quantity === null,
  );

  if (areaRequired && dimensions.areaSquareMeters === undefined) {
    if (!(dimensions.length && dimensions.width)) {
      missing.add("dimensions.length_width");
    } else if (dimensions.lengthWidthInterpretation !== "area_basis") {
      const hasUnresolvedGeometry = detectedGeometry.some(
        (geometry) => geometry.semanticStatus === "unresolved",
      );
      if (hasUnresolvedGeometry) {
        missing.add("scope.geometry_quantity_relation");
      } else {
        missing.add("dimensions.area_quantity_square_meters");
      }
    }
  }

  if (unitCountRequired && !dimensions.units) {
    missing.add("dimensions.units");
  }

  if (linearRequired && !dimensions.lineLengthMeters) {
    missing.add("dimensions.line_length_meters");
  }

  if (requiresPrimaryScopeClarification(workItems)) {
    missing.add("scope.primary_work_description");
  }

  if (!template) {
    missing.add("template_definition");
  }

  if (pricebookItems.length === 0) {
    missing.add("pricebook_items");
  }

  if (mappingRules.length === 0) {
    missing.add("mapping_rules");
  }

  return [...missing];
}

function applyProfessionalQuantityAssumptions(
  workItems: WorkItem[],
  dimensions: DimensionInput,
): { workItems: WorkItem[]; assumptions: string[] } {
  const sewerLine = workItems.find(
    (item) =>
      item.workType === "sewer_line_replacement" &&
      item.unit === "m" &&
      !item.hiddenWorkFlag,
  );
  const lineLengthMeters = sewerLine?.quantity ?? dimensions.lineLengthMeters;

  if (!lineLengthMeters) {
    return { workItems, assumptions: [] };
  }

  const averageRestorationWidthMeters = 1;
  const estimatedAreaSquareMeters = roundQuantity(
    lineLengthMeters * averageRestorationWidthMeters,
  );
  const inferredWorkTypes = new Set(["floor_replacement", "surface_preparation"]);
  let resolvedItemsCount = 0;

  const resolvedWorkItems = workItems.map((item) => {
    if (
      item.unit !== "m2" ||
      item.quantity !== null ||
      !inferredWorkTypes.has(item.workType)
    ) {
      return item;
    }

    resolvedItemsCount += 1;
    return {
      ...item,
      quantity: estimatedAreaSquareMeters,
      derivedFrom: "professional-linear-area-assumption",
      confidence: Math.min(item.confidence, 0.7),
      requiresClarification: false,
    };
  });

  if (resolvedItemsCount === 0) {
    return { workItems, assumptions: [] };
  }

  return {
    workItems: resolvedWorkItems,
    assumptions: [
      `Assumed ${averageRestorationWidthMeters} m average restoration width along the ${lineLengthMeters} m sewer route; estimated associated area-based work at ${estimatedAreaSquareMeters} m2 for preliminary review.`,
    ],
  };
}

function buildClarificationQuestions(
  caseId: string,
  missingInputs: string[],
): ClarificationQuestion[] {
  return missingInputs
    .filter((fieldKey) => isUserClarificationField(fieldKey))
    .map((fieldKey, index) => ({
    questionId: `${caseId}-question-${index + 1}`,
    caseId,
    fieldKey,
    questionText:
      fieldKey === "dimensions.length_width"
        ? "Please provide length and width so the pipeline can compute area-based work."
        : fieldKey === "scope.geometry_quantity_relation"
          ? "You provided dimensions like 3x6. Should the system use them as the full work area, as structure geometry only, as a length basis, or as a volume basis?"
          : fieldKey === "dimensions.area_quantity_square_meters"
            ? "Please provide the actual area in square meters that should be used for the priced work."
        : fieldKey === "dimensions.units"
          ? "Please provide the number of units/items so the pipeline can price the unit-based work."
          : fieldKey === "dimensions.line_length_meters"
            ? "Please provide the line length in meters so the pipeline can price the linear work."
            : fieldKey === "scope.primary_work_description"
              ? "Please describe the main work more concretely, for example: replace 2 interior doors, repair 12 square meters of wall, or replace 200 meters of sewer line."
              : `Please provide the missing input: ${fieldKey}.`,
    priority: "high",
    answerValue: null,
    answerStatus: "open",
  }));
}

function isUserClarificationField(fieldKey: string): boolean {
  return (
    fieldKey === "dimensions.length_width" ||
    fieldKey === "scope.geometry_quantity_relation" ||
    fieldKey === "dimensions.area_quantity_square_meters" ||
    fieldKey === "dimensions.units" ||
    fieldKey === "dimensions.line_length_meters" ||
    fieldKey === "scope.primary_work_description"
  );
}

function requiresPrimaryScopeClarification(workItems: WorkItem[]): boolean {
  const visiblePrimaryWorkItems = workItems.filter((item) => !item.hiddenWorkFlag);

  return (
    visiblePrimaryWorkItems.length > 0 &&
    visiblePrimaryWorkItems.every((item) => item.workType === "general_scope")
  );
}

function buildCandidateMatches(
  caseId: string,
  workItems: WorkItem[],
  pricebookItems: PricebookItem[],
  mappingRules: TemplateMappingRule[],
): CandidateMatch[] {
  const matches: CandidateMatch[] = [];

  for (const workItem of workItems) {
    const candidatePool = pricebookItems
      .map((pricebookItem) => {
        const lexicalScore = scoreLexicalMatch(workItem, pricebookItem);
        const unitStatus: CandidateMatch["unitStatus"] =
          workItem.unit === pricebookItem.unit
            ? "valid"
            : quantityUnits.has(workItem.unit) && quantityUnits.has(pricebookItem.unit)
              ? "warning"
              : "invalid";

        let score = lexicalScore;
        if (unitStatus === "warning") {
          score -= 0.15;
        }

        if (unitStatus === "invalid") {
          score -= 0.35;
        }

        const mappingStatus: CandidateMatch["mappingStatus"] = mappingRules.some((rule) =>
          rule.pricebookFilterJson.sections.includes(pricebookItem.section),
        )
          ? "mapped"
          : "unmapped";

        if (mappingStatus === "mapped") {
          score += 0.05;
        }

        return {
          pricebookItem,
          confidenceScore: clamp(score),
          unitStatus,
          mappingStatus,
        };
      })
      .filter((candidate) => candidate.confidenceScore >= 0.45)
      .sort((left, right) => right.confidenceScore - left.confidenceScore)
      .slice(0, 3);

    candidatePool.forEach((candidate, index) => {
      const matchType = toMatchType(candidate.confidenceScore);
      matches.push({
        candidateId: `${caseId}-${workItem.workItemId}-${candidate.pricebookItem.itemId}`,
        caseId,
        workItemId: workItem.workItemId,
        pricebookItemId: candidate.pricebookItem.itemId,
        confidenceScore: candidate.confidenceScore,
        matchType,
        matchReason: `Keyword/semantic seed match for ${workItem.workType}.`,
        unitStatus: candidate.unitStatus,
        mappingStatus: candidate.mappingStatus,
        selectedFlag: index === 0 && candidate.mappingStatus === "mapped",
        reviewerOverrideFlag: false,
      });
    });
  }

  return matches;
}

function buildDetailedCostLines(
  caseId: string,
  candidateMatches: CandidateMatch[],
  workItems: WorkItem[],
  pricebookItems: PricebookItem[],
  dimensions: DimensionInput,
  analysis: CaseRecord["analysis"],
): DetailedCostLine[] {
  return candidateMatches
    .filter((candidate) => candidate.selectedFlag && candidate.unitStatus !== "invalid")
    .map((candidate, index) => {
      const workItem = workItems.find((item) => item.workItemId === candidate.workItemId);
      const pricebookItem = pricebookItems.find(
        (item) => item.itemId === candidate.pricebookItemId,
      );

      if (!workItem || !pricebookItem) {
        throw new Error("Broken candidate selection state.");
      }

      const quantityResult = deriveQuantity(
        pricebookItem.unit,
        dimensions,
        workItem.quantity,
      );
      if (quantityResult.estimationFlag) {
        analysis.assumptions.push(
          `Quantity for ${pricebookItem.description} was estimated automatically.`,
        );
      }

      return {
        costLineId: `${caseId}-cost-line-${index + 1}`,
        caseId,
        pricebookItemId: pricebookItem.itemId,
        quantity: quantityResult.quantity,
        unit: pricebookItem.unit,
        unitPrice: pricebookItem.unitPrice,
        total: roundMoney(quantityResult.quantity * pricebookItem.unitPrice),
        sourceConfidence: candidate.confidenceScore,
        estimationFlag: quantityResult.estimationFlag,
        includedInOutputFlag: candidate.matchType !== "doubtful",
      };
    });
}

function aggregateTemplateLines(
  caseId: string,
  detailedCostLines: DetailedCostLine[],
  pricebookItems: PricebookItem[],
  mappingRules: TemplateMappingRule[],
): AggregatedTemplateLine[] {
  const totals = new Map<
    string,
    {
      amount: number;
      sourceCostLineIds: string[];
      warningFlag: boolean;
    }
  >();

  for (const line of detailedCostLines) {
    const pricebookItem = pricebookItems.find((item) => item.itemId === line.pricebookItemId);
    const mappingRule = mappingRules.find((rule) =>
      rule.pricebookFilterJson.sections.includes(pricebookItem?.section ?? ""),
    );

    if (!mappingRule) {
      continue;
    }

    const bucket = totals.get(mappingRule.targetLineKey) ?? {
      amount: 0,
      sourceCostLineIds: [],
      warningFlag: false,
    };

    bucket.amount += line.total;
    bucket.sourceCostLineIds.push(line.costLineId);
    bucket.warningFlag ||= line.estimationFlag;
    totals.set(mappingRule.targetLineKey, bucket);
  }

  return [...totals.entries()].map(([templateLineKey, bucket], index) => ({
    aggregatedLineId: `${caseId}-aggregated-${index + 1}`,
    caseId,
    templateLineKey,
    amount: roundMoney(bucket.amount),
    sourceCostLineIds: bucket.sourceCostLineIds,
    status: bucket.warningFlag ? "warning" : "ready",
    warningFlag: bucket.warningFlag,
  }));
}

function scoreLexicalMatch(workItem: WorkItem, pricebookItem: PricebookItem): number {
  const workTokens = tokenize(`${workItem.workType} ${workItem.description}`);
  const pricebookTokens = tokenize(
    `${pricebookItem.description} ${pricebookItem.tagsJson.join(" ")} ${pricebookItem.synonymsJson.join(" ")}`,
  );
  const overlap = workTokens.filter((token) => pricebookTokens.includes(token)).length;
  const ratio = overlap / Math.max(workTokens.length, 1);

  return 0.45 + ratio * 0.55;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-zא-ת0-9]+/iu)
    .filter((token) => token.length > 1);
}

function toMatchType(score: number): MatchType {
  if (score >= 0.85) {
    return "exact";
  }

  if (score >= 0.6) {
    return "probable";
  }

  return "doubtful";
}

function deriveQuantity(
  unit: string,
  dimensions: DimensionInput,
  explicitQuantity: number | null,
): { quantity: number; estimationFlag: boolean } {
  if (explicitQuantity !== null) {
    return {
      quantity: roundQuantity(explicitQuantity),
      estimationFlag: false,
    };
  }

  if (unit === "m2") {
    if (dimensions.areaSquareMeters !== undefined) {
      return {
        quantity: roundQuantity(dimensions.areaSquareMeters),
        estimationFlag: false,
      };
    }

    if (dimensions.length && dimensions.width) {
      if (dimensions.lengthWidthInterpretation !== "area_basis") {
        return { quantity: 1, estimationFlag: true };
      }
      return {
        quantity: roundQuantity(dimensions.length * dimensions.width),
        estimationFlag: false,
      };
    }

    return { quantity: 1, estimationFlag: true };
  }

  if (unit === "unit") {
    return {
      quantity: dimensions.units ?? 1,
      estimationFlag: dimensions.units === undefined,
    };
  }

  if (unit === "m") {
    return {
      quantity: dimensions.lineLengthMeters ?? 1,
      estimationFlag: dimensions.lineLengthMeters === undefined,
    };
  }

  return { quantity: 1, estimationFlag: false };
}

function extractExplicitAreaQuantity(description: string): number | null {
  const match = description.match(
    /(\d+(?:[.,]\d+)?)\s*(?:square\s*meters?|sqm|sq\s*m|m2|מ["״]ר|מטר(?:ים)?\s+מרובע(?:ים)?)/iu,
  );

  if (!match) {
    return null;
  }

  return parsePositiveQuantity(match[1]);
}

function extractExplicitLinearQuantity(description: string): number | null {
  const contextualMatch = description.match(
    /(?:קו(?:\s+ביוב)?|sewer\s+line|drain(?:age)?\s+line|pipe|צינור)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*(?:m|meters?|מטר(?:ים)?)/iu,
  );
  if (contextualMatch?.[1]) {
    return parsePositiveQuantity(contextualMatch[1]);
  }

  const genericMatches = [...description.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:m|meters?|מטר(?:ים)?)/giu)]
    .map((match) => parsePositiveQuantity(match[1]))
    .filter((value): value is number => value !== null);

  if (genericMatches.length === 0) {
    return null;
  }

  return Math.max(...genericMatches);
}

function extractExplicitDepthMeters(description: string): number | null {
  const match = description.match(
    /(?:depth|עומק)[^0-9]{0,10}(\d+(?:[.,]\d+)?)\s*(?:m|meters?|מטר(?:ים)?)/iu,
  );
  return match?.[1] ? parsePositiveQuantity(match[1]) : null;
}

function extractExplicitDiameterMm(description: string): number | null {
  const match = description.match(/(?:diameter|dia\.?|קוטר)[^0-9]{0,10}(\d+(?:[.,]\d+)?)/iu);
  return match?.[1] ? parsePositiveQuantity(match[1]) : null;
}

function extractInlineDimensionPair(description: string): {
  length: number;
  width: number;
} | null {
  const match = description.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/u);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const length = parsePositiveQuantity(match[1]);
  const width = parsePositiveQuantity(match[2]);
  if (length === null || width === null) {
    return null;
  }

  return { length, width };
}

function detectInlineGeometry(
  caseId: string,
  description: string,
  dimensions: DimensionInput,
): DetectedGeometry[] {
  const inlineDimensions = extractInlineDimensionPair(description);
  if (!inlineDimensions) {
    return [];
  }

  return [
    {
      geometryId: `${caseId}-geometry-1`,
      rawText: `${inlineDimensions.length}x${inlineDimensions.width}`,
      length: inlineDimensions.length,
      width: inlineDimensions.width,
      height: dimensions.height,
      semanticStatus:
        dimensions.lengthWidthInterpretation &&
        dimensions.lengthWidthInterpretation !== "unknown"
          ? "resolved"
          : "unresolved",
      interpretation: dimensions.lengthWidthInterpretation ?? "unknown",
      extractedFrom: "inline_pair",
    },
  ];
}

function buildSewerDescriptorSuffix(input: {
  depthMeters: number | null;
  diameterMm: number | null;
}): string {
  const descriptors: string[] = [];
  if (input.depthMeters !== null) {
    descriptors.push(`depth ${input.depthMeters}m`);
  }
  if (input.diameterMm !== null) {
    descriptors.push(`diameter ${input.diameterMm}mm`);
  }

  return descriptors.length > 0 ? ` (${descriptors.join(", ")})` : "";
}

function extractExplicitUnitQuantity(
  description: string,
  patterns: RegExp[],
): number | null {
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match?.[1]) {
      return parsePositiveQuantity(match[1]);
    }
  }

  return null;
}

function parsePositiveQuantity(rawValue: string): number | null {
  const parsedValue = Number(rawValue.replace(",", "."));
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return roundQuantity(parsedValue);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
