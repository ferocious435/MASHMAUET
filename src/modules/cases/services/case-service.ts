import { randomUUID } from "node:crypto";

import { ApplicationError } from "../../../shared/errors/application-error.ts";
import type {
  SkillRouteDecision,
  SkillTaskContext,
} from "../../skills/services/skill-orchestrator-service.ts";
import { SkillOrchestratorService } from "../../skills/services/skill-orchestrator-service.ts";
import {
  buildCaseEstimatePreviewFromDekelCandidates,
  buildCaseEstimatePreviewFromSelectedDekelLines,
  type CaseDekelEstimatePreview,
} from "../../references/services/dekel-case-estimate-service.ts";
import {
  buildCaseOutputDraft,
  type CaseOutputDraft,
} from "../../output/services/case-output-draft-service.ts";
import {
  buildCaseOutputPackage,
  type CaseOutputPackage,
} from "../../output/services/case-output-package-service.ts";
import {
  CaseOutputExportService,
  type CaseOutputExportManifest,
} from "../../output/services/case-output-export-service.ts";
import { DekelMatchingService } from "../../references/services/dekel-matching-service.ts";
import {
  buildMavnadimAncillaryRecommendations,
  MavnadimMatchingService,
} from "../../references/services/mavnadim-matching-service.ts";
import {
  buildMavnadimDekelPackagePreview,
  type MavnadimDekelPackagePreview,
} from "../../references/services/mavnadim-dekel-package-service.ts";
import { InMemoryTemplateRepository } from "../../references/repositories/in-memory-reference-repositories.ts";
import {
  type ClarificationQuestion,
  createEmptyAnalysisSnapshot,
  type CaseAnalysisSnapshot,
  type CaseRecord,
  type PipelineTraceEvent,
  type SelectedDekelLine,
  type SelectedMavnadimItem,
  type SupportingEvidenceRecord,
  validateCaseClarificationSubmissionInput,
  validateCaseDekelSelectionInput,
  validateCaseMavnadimAncillarySelectionInput,
  validateCaseMavnadimSelectionInput,
  validateCaseCreateInput,
} from "../domain/case-schemas.ts";
import type { CaseRepository } from "../repositories/case-repository.ts";
import { CaseAnalysisPipeline } from "../../pipeline/services/case-analysis-pipeline.ts";

export class CaseService {
  private readonly caseRepository: CaseRepository;
  private readonly caseAnalysisPipeline: CaseAnalysisPipeline;
  private readonly dekelMatchingService: DekelMatchingService;
  private readonly mavnadimMatchingService: MavnadimMatchingService;
  private readonly templateRepository: InMemoryTemplateRepository;
  private readonly skillOrchestratorService: SkillOrchestratorService;
  private readonly outputExportService: CaseOutputExportService;

  public constructor(
    caseRepository: CaseRepository,
    caseAnalysisPipeline: CaseAnalysisPipeline,
    dekelMatchingService: DekelMatchingService,
    mavnadimMatchingService: MavnadimMatchingService,
    templateRepository: InMemoryTemplateRepository,
    skillOrchestratorService: SkillOrchestratorService,
    outputExportService: CaseOutputExportService,
  ) {
    this.caseRepository = caseRepository;
    this.caseAnalysisPipeline = caseAnalysisPipeline;
    this.dekelMatchingService = dekelMatchingService;
    this.mavnadimMatchingService = mavnadimMatchingService;
    this.templateRepository = templateRepository;
    this.skillOrchestratorService = skillOrchestratorService;
    this.outputExportService = outputExportService;
  }

  public async createCase(input: unknown): Promise<CaseRecord> {
    const parsedInput = validateCaseCreateInput(input);
    const record: CaseRecord = {
      caseId: randomUUID(),
      title: parsedInput.title,
      createdBy: parsedInput.createdBy,
      createdAt: new Date().toISOString(),
      status: "draft",
      templateId: parsedInput.templateId,
      pricebookId: parsedInput.pricebookId,
      rawDescription: parsedInput.description,
      normalizedDescription: parsedInput.description,
      dimensions: parsedInput.dimensions ?? {},
      notes: parsedInput.notes,
      supportingEvidence: parsedInput.supportingEvidence.map((evidence) =>
        buildSupportingEvidenceRecord(evidence),
      ),
      reviewStatus: "not_started",
      finalStatus: "draft",
      analysis: createEmptyAnalysisSnapshot(),
    };

    return this.runInternalTask(
      {
        taskType: "internal.case.create",
        invokedBy: "CaseService.createCase",
        inputSummary: parsedInput.description,
      },
      async () => ({
        statusCode: 201,
        body: await this.caseRepository.create(record),
      }),
    );
  }

  public async getCase(caseId: string): Promise<CaseRecord> {
    return this.runInternalTask(
      {
        taskType: "internal.case.get",
        invokedBy: "CaseService.getCase",
        caseId,
        inputSummary: `Load case ${caseId}.`,
      },
      async () => ({
        statusCode: 200,
        body: await this.requireCase(caseId),
      }),
    );
  }

  public async analyzeCase(caseId: string): Promise<CaseRecord> {
    return this.runInternalTask(
      {
        taskType: "internal.case.analyze",
        invokedBy: "CaseService.analyzeCase",
        caseId,
        inputSummary: `Analyze case ${caseId} through the controlled pipeline.`,
      },
      async () => {
        const record = await this.requireCase(caseId);
        const analyzed = await this.caseAnalysisPipeline.run(record);

        return {
          statusCode: 200,
          body: await this.caseRepository.update(analyzed),
        };
      },
    );
  }

  public async getCaseStatus(caseId: string): Promise<{
    caseId: string;
    status: CaseRecord["status"];
    reviewStatus: CaseRecord["reviewStatus"];
    finalStatus: CaseRecord["finalStatus"];
    trace: CaseRecord["analysis"]["pipelineTrace"];
  }> {
    return this.runInternalTask(
      {
        taskType: "internal.case.status",
        invokedBy: "CaseService.getCaseStatus",
        caseId,
        inputSummary: `Read case status for ${caseId}.`,
      },
      async () => {
        const record = await this.requireCase(caseId);

        return {
          statusCode: 200,
          body: {
            caseId: record.caseId,
            status: record.status,
            reviewStatus: record.reviewStatus,
            finalStatus: record.finalStatus,
            trace: record.analysis.pipelineTrace,
          },
        };
      },
    );
  }

  public async getClarificationQuestions(caseId: string): Promise<{
    caseId: string;
    status: CaseRecord["status"];
    missingInputs: string[];
    questions: ClarificationQuestion[];
  }> {
    return this.runInternalTask(
      {
        taskType: "internal.case.clarifications.get",
        invokedBy: "CaseService.getClarificationQuestions",
        caseId,
        inputSummary: `Read clarification questions for case ${caseId}.`,
      },
      async () => {
        const record = await this.requireCase(caseId);

        return {
          statusCode: 200,
          body: {
            caseId: record.caseId,
            status: record.status,
            missingInputs: [...record.analysis.missingInputs],
            questions: [...record.analysis.clarificationQuestions],
          },
        };
      },
    );
  }

  public async submitClarificationAnswers(
    caseId: string,
    input: unknown,
  ): Promise<CaseRecord> {
    const parsedInput = validateCaseClarificationSubmissionInput(input);
    const context = {
      taskType: "internal.case.clarifications.submit",
      invokedBy: "CaseService.submitClarificationAnswers",
      caseId,
      inputSummary: `Submit ${parsedInput.answers.length} clarification answer(s) for case ${caseId}.`,
    } satisfies SkillTaskContext;
    const decision = await this.skillOrchestratorService.planTask(context);

    return this.runPlannedInternalTask(context, decision, async () => {
      const record = await this.requireCase(caseId);
      const questions = [...record.analysis.clarificationQuestions];

      if (questions.length === 0) {
        throw new ApplicationError(
          "No clarification questions are open for this case.",
          409,
        );
      }

      const updatedDimensions = { ...record.dimensions };
      let updatedRawDescription = record.rawDescription;
      const updatedQuestions = questions.map((question) => ({ ...question }));
      const answeredAt = new Date().toISOString();
      const answerComments: string[] = [];

      for (const answer of parsedInput.answers) {
        const targetQuestion = updatedQuestions.find((question) => {
          if (answer.questionId) {
            return question.questionId === answer.questionId;
          }

          return question.fieldKey === answer.fieldKey;
        });

        if (!targetQuestion) {
          throw new ApplicationError(
            `Clarification question not found for ${answer.questionId ?? answer.fieldKey}.`,
            400,
          );
        }

        const clarificationUpdate = applyClarificationAnswer(
          targetQuestion.fieldKey,
          answer.answerValue,
          updatedDimensions,
          updatedRawDescription,
        );
        updatedRawDescription = clarificationUpdate.rawDescription;
        targetQuestion.answerValue = answer.answerValue;
        targetQuestion.answerStatus = "answered";
        answerComments.push(`${targetQuestion.fieldKey}=${answer.answerValue}`);
      }

      const preparedRecord: CaseRecord = {
        ...record,
        status: "draft",
        rawDescription: updatedRawDescription,
        dimensions: updatedDimensions,
        analysis: {
          ...record.analysis,
          clarificationQuestions: updatedQuestions,
          reviewDecisions: [
            ...record.analysis.reviewDecisions,
            {
              decisionId: randomUUID(),
              caseId: record.caseId,
              reviewerId: parsedInput.answeredBy,
              decisionType: "clarification_answer",
              targetEntityType: "clarification_question_set",
              targetEntityId: record.caseId,
              comment: `Answered clarification inputs: ${answerComments.join("; ")}.`,
              createdAt: answeredAt,
            },
          ],
        },
      };
      const analyzedRecord = await this.caseAnalysisPipeline.run(preparedRecord);

      return {
        statusCode: 200,
        body: await this.caseRepository.update(analyzedRecord),
      };
    });
  }

  public async getDekelCandidates(
    caseId: string,
    limit = 5,
  ): Promise<{
    caseId: string;
    query: string;
    candidates: Awaited<
      ReturnType<DekelMatchingService["findCandidatesByDescription"]>
    >;
  }> {
    return this.runInternalTask(
      {
        taskType: "internal.case.dekel_candidates",
        invokedBy: "CaseService.getDekelCandidates",
        caseId,
        inputSummary: `Find up to ${limit} DEKEL candidates for case ${caseId}.`,
      },
      async () => {
        const record = await this.requireCase(caseId);
        const candidates = await this.dekelMatchingService.findCandidatesByDescription(
          record.rawDescription,
          limit,
          {
            workItems: record.analysis.workItems,
          },
        );

        return {
          statusCode: 200,
          body: {
            caseId: record.caseId,
            query: record.rawDescription,
            candidates,
          },
        };
      },
    );
  }

  public async getMavnadimCandidates(
    caseId: string,
    limit = 3,
  ): Promise<{
    caseId: string;
    query: string;
    candidates: Awaited<
      ReturnType<MavnadimMatchingService["findCandidatesByDescription"]>
    >;
  }> {
    return this.runInternalTask(
      {
        taskType: "internal.case.mavnadim_candidates",
        invokedBy: "CaseService.getMavnadimCandidates",
        caseId,
        inputSummary: `Find up to ${limit} MAVNADIM candidates for case ${caseId}.`,
      },
      async () => {
        const record = await this.requireCase(caseId);
        const candidates =
          await this.mavnadimMatchingService.findCandidatesByDescription(
            record.rawDescription,
            limit,
            {
              dimensions: record.dimensions,
            },
          );

        return {
          statusCode: 200,
          body: {
            caseId: record.caseId,
            query: record.rawDescription,
            candidates,
          },
        };
      },
      );
    }

  public async saveMavnadimSelection(
    caseId: string,
    input: unknown,
  ): Promise<{
    caseId: string;
    selection: SelectedMavnadimItem;
    caseStatus: {
      status: CaseRecord["status"];
      reviewStatus: CaseRecord["reviewStatus"];
      finalStatus: CaseRecord["finalStatus"];
    };
  }> {
    const parsedInput = validateCaseMavnadimSelectionInput(input);
    const context = {
      taskType: "internal.case.mavnadim_selection.save",
      invokedBy: "CaseService.saveMavnadimSelection",
      caseId,
      inputSummary: `Persist selected MAVNADIM item ${parsedInput.catalogItemId}.`,
    } satisfies SkillTaskContext;
    const decision = await this.skillOrchestratorService.planTask(context);

    return this.runPlannedInternalTask(context, decision, async () => {
      const record = await this.requireCase(caseId);
      const catalogItem = await this.mavnadimMatchingService.findCatalogItemById(
        parsedInput.catalogItemId,
      );

      if (!catalogItem) {
        throw new ApplicationError(
          `Mavnadim catalog item ${parsedInput.catalogItemId} not found.`,
          400,
        );
      }

      const selectedAt = new Date().toISOString();
      const ancillaryRecommendations = buildMavnadimAncillaryRecommendations(
        record.rawDescription,
        {
          displayName: catalogItem.displayName,
          category: catalogItem.category,
          tags: catalogItem.tags,
        },
      );
      const selection: SelectedMavnadimItem = {
        selectionId: randomUUID(),
        catalogItemId: catalogItem.catalogItemId,
        displayName: catalogItem.displayName,
        shortLabel: catalogItem.shortLabel,
        category: catalogItem.category,
        dimensionsLabel: catalogItem.dimensionsLabel,
        basePrice: catalogItem.basePrice,
        sourceImageName: catalogItem.sourceImageName,
        includedFeatures: [...catalogItem.includedFeatures],
        ancillaryRecommendations,
        selectedAt,
        selectedBy: parsedInput.selectedBy,
        responsibleSkill: decision.primarySkill,
      };

      const updatedRecord: CaseRecord = {
        ...record,
        analysis: {
          ...record.analysis,
          selectedMavnadimItem: selection,
          reviewDecisions: [
            ...record.analysis.reviewDecisions,
            {
              decisionId: randomUUID(),
              caseId: record.caseId,
              reviewerId: parsedInput.selectedBy,
              decisionType: "confirm_mavnadim_selection",
              targetEntityType: "mavnadim_selection",
              targetEntityId: selection.catalogItemId,
              comment: `Selected MAVNADIM item ${selection.catalogItemId}.`,
              createdAt: selectedAt,
            },
          ],
          pipelineTrace: appendManualTrace(record.analysis, {
            stage: "review",
            status: "completed",
            responsibleSkill: decision.primarySkill,
            responsibleSkillSource: decision.primarySkillSource.source,
            supportingSkills: [...decision.supportingSkills],
            supportingSkillSources: decision.supportingSkillSources.map((source) => ({
              name: source.name,
              source: source.source,
            })),
            routeCategory: decision.routeCategory,
            summary: `Confirmed MAVNADIM item ${selection.displayName}.`,
            occurredAt: selectedAt,
          }),
        },
      };

      await this.caseRepository.update(updatedRecord);

      return {
        statusCode: 200,
        body: {
          caseId: record.caseId,
          selection,
          caseStatus: {
            status: updatedRecord.status,
            reviewStatus: updatedRecord.reviewStatus,
            finalStatus: updatedRecord.finalStatus,
          },
        },
      };
    });
  }

  public async getMavnadimSelection(caseId: string): Promise<{
    caseId: string;
    selection: SelectedMavnadimItem | null;
  }> {
    return this.runInternalTask(
      {
        taskType: "internal.case.mavnadim_selection.get",
        invokedBy: "CaseService.getMavnadimSelection",
        caseId,
        inputSummary: `Read persisted MAVNADIM selection for case ${caseId}.`,
      },
      async () => {
        const record = await this.requireCase(caseId);

        return {
          statusCode: 200,
          body: {
            caseId: record.caseId,
            selection: record.analysis.selectedMavnadimItem,
          },
        };
      },
    );
  }

  public async getMavnadimDekelPackagePreview(
    caseId: string,
    candidatesPerRecommendation = 2,
  ): Promise<{
    caseId: string;
  } & MavnadimDekelPackagePreview> {
    return this.runInternalTask(
      {
        taskType: "internal.case.mavnadim_ancillary_preview",
        invokedBy: "CaseService.getMavnadimDekelPackagePreview",
        caseId,
        inputSummary: `Preview ancillary DEKEL package for selected MAVNADIM with up to ${candidatesPerRecommendation} candidates per recommendation.`,
      },
      async () => {
        const record = await this.requireCase(caseId);
        const selectedMavnadim = record.analysis.selectedMavnadimItem;

        if (!selectedMavnadim) {
          throw new ApplicationError(
            "MAVNADIM selection is required before previewing ancillary DEKEL work.",
            409,
          );
        }

        const preview = await buildMavnadimDekelPackagePreview({
          selectedMavnadim,
          candidatesPerRecommendation,
          dekelMatcher: this.dekelMatchingService,
        });

        return {
          statusCode: 200,
          body: {
            caseId: record.caseId,
            ...preview,
          },
        };
      },
    );
  }

  public async getDekelEstimatePreview(
    caseId: string,
    limit = 5,
    managementFeePercent = 14,
  ): Promise<{
    caseId: string;
  } & CaseDekelEstimatePreview> {
    return this.runInternalTask(
      {
        taskType: "internal.case.dekel_estimate_preview",
        invokedBy: "CaseService.getDekelEstimatePreview",
        caseId,
        inputSummary: `Build DEKEL estimate preview for case ${caseId}.`,
      },
      async () => {
        const record = await this.requireCase(caseId);
        const rawCandidateLimit = Math.max(limit * 4, 12);
        const estimatePreview =
          record.analysis.selectedDekelLines.length > 0
            ? buildCaseEstimatePreviewFromSelectedDekelLines(
                record.analysis.selectedDekelLines,
                { managementFeePercent },
              )
            : buildCaseEstimatePreviewFromDekelCandidates(
                await this.dekelMatchingService.findCandidatesByDescription(
                  record.rawDescription,
                  rawCandidateLimit,
                  {
                    workItems: record.analysis.workItems,
                  },
                ),
                {
                  managementFeePercent,
                  maxLines: limit,
                  queryText: record.rawDescription,
                  dimensions: record.dimensions,
                },
              );

        return {
          statusCode: 200,
          body: {
            caseId: record.caseId,
            ...estimatePreview,
          },
        };
      },
    );
  }

  public async saveDekelSelection(
    caseId: string,
    input: unknown,
    managementFeePercent = 14,
  ): Promise<{
    caseId: string;
    selections: SelectedDekelLine[];
    caseStatus: {
      status: CaseRecord["status"];
      reviewStatus: CaseRecord["reviewStatus"];
      finalStatus: CaseRecord["finalStatus"];
    };
    estimatePreview: CaseDekelEstimatePreview;
  }> {
    const parsedInput = validateCaseDekelSelectionInput(input);
    const context = {
      taskType: "internal.case.dekel_selection.save",
      invokedBy: "CaseService.saveDekelSelection",
      caseId,
      inputSummary: `Persist ${parsedInput.lines.length} confirmed DEKEL line(s).`,
    } satisfies SkillTaskContext;
    const decision = await this.skillOrchestratorService.planTask(context);

    return this.runPlannedInternalTask(context, decision, async () => {
      const record = await this.requireCase(caseId);
      const resolvedItems = await this.dekelMatchingService.findPricebookItemsByCodes(
        parsedInput.lines.map((line) => line.code),
      );
      const itemsByCode = new Map(resolvedItems.map((item) => [item.code, item]));
      const missingCodes = parsedInput.lines
        .map((line) => line.code)
        .filter((code) => !itemsByCode.has(code));

      if (missingCodes.length > 0) {
        throw new ApplicationError(
          `Dekel codes not found: ${missingCodes.join(", ")}.`,
          400,
        );
      }

      const selectedAt = new Date().toISOString();
      const selections = parsedInput.lines.map((line) => {
        const item = itemsByCode.get(line.code);

        if (!item) {
          throw new ApplicationError(`Dekel code ${line.code} not found.`, 400);
        }

        return {
          selectionId: randomUUID(),
          code: item.code,
          description: item.description,
          quantity: line.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          sourceActivityNumber:
            item.metadataJson.dekel_activity_number?.trim() || null,
          sourceChapterCode:
            item.metadataJson.dekel_chapter_code?.trim() || null,
          selectionContext: "manual",
          recommendationKey: null,
          selectedAt,
          selectedBy: parsedInput.selectedBy,
          responsibleSkill: decision.primarySkill,
        } satisfies SelectedDekelLine;
      });

      const updatedRecord: CaseRecord = {
        ...record,
        status: "approved",
        reviewStatus: "approved",
        finalStatus: "approved",
        analysis: {
          ...record.analysis,
          selectedDekelLines: selections,
          reviewDecisions: [
            ...record.analysis.reviewDecisions,
            {
              decisionId: randomUUID(),
              caseId: record.caseId,
              reviewerId: parsedInput.selectedBy,
              decisionType: "confirm_dekel_selection",
              targetEntityType: "dekel_selection_set",
              targetEntityId: record.caseId,
              comment: `Selected ${selections.length} DEKEL line(s): ${selections
                .map((selection) => selection.code)
                .join(", ")}.`,
              createdAt: selectedAt,
            },
          ],
          pipelineTrace: appendManualTrace(record.analysis, {
            stage: "review",
            status: "completed",
            responsibleSkill: decision.primarySkill,
            responsibleSkillSource: decision.primarySkillSource.source,
            supportingSkills: [...decision.supportingSkills],
            supportingSkillSources: decision.supportingSkillSources.map((source) => ({
              name: source.name,
              source: source.source,
            })),
            routeCategory: decision.routeCategory,
            summary: `Confirmed ${selections.length} DEKEL line(s) for output generation.`,
            occurredAt: selectedAt,
          }),
        },
      };

      await this.caseRepository.update(updatedRecord);

      return {
        statusCode: 200,
        body: {
          caseId: record.caseId,
          selections,
          caseStatus: {
            status: updatedRecord.status,
            reviewStatus: updatedRecord.reviewStatus,
            finalStatus: updatedRecord.finalStatus,
          },
          estimatePreview: buildCaseEstimatePreviewFromSelectedDekelLines(
            selections,
            { managementFeePercent },
          ),
        },
      };
    });
  }

  public async saveMavnadimAncillaryDekelSelection(
    caseId: string,
    input: unknown,
    managementFeePercent = 14,
  ): Promise<{
    caseId: string;
    appliedRecommendationKeys: string[];
    appliedSelections: SelectedDekelLine[];
    selections: SelectedDekelLine[];
    caseStatus: {
      status: CaseRecord["status"];
      reviewStatus: CaseRecord["reviewStatus"];
      finalStatus: CaseRecord["finalStatus"];
    };
    estimatePreview: CaseDekelEstimatePreview;
  }> {
    const parsedInput = validateCaseMavnadimAncillarySelectionInput(input);
    const context = {
      taskType: "internal.case.mavnadim_ancillary_selection.save",
      invokedBy: "CaseService.saveMavnadimAncillaryDekelSelection",
      caseId,
      inputSummary: `Persist ${parsedInput.lines.length} ancillary DEKEL line(s) for selected MAVNADIM.`,
    } satisfies SkillTaskContext;
    const decision = await this.skillOrchestratorService.planTask(context);

    return this.runPlannedInternalTask(context, decision, async () => {
      const record = await this.requireCase(caseId);
      const selectedMavnadim = record.analysis.selectedMavnadimItem;

      if (!selectedMavnadim) {
        throw new ApplicationError(
          "MAVNADIM selection is required before saving ancillary DEKEL work.",
          409,
        );
      }

      const recommendationMap = new Map(
        selectedMavnadim.ancillaryRecommendations.map((recommendation) => [
          recommendation.key,
          recommendation,
        ]),
      );
      const invalidKeys = parsedInput.lines
        .map((line) => line.recommendationKey)
        .filter((key) => !recommendationMap.has(key));

      if (invalidKeys.length > 0) {
        throw new ApplicationError(
          `Ancillary recommendation keys not found on selected MAVNADIM: ${invalidKeys.join(", ")}.`,
          400,
        );
      }

      const resolvedItems = await this.dekelMatchingService.findPricebookItemsByCodes(
        parsedInput.lines.map((line) => line.code),
      );
      const itemsByCode = new Map(resolvedItems.map((item) => [item.code, item]));
      const missingCodes = parsedInput.lines
        .map((line) => line.code)
        .filter((code) => !itemsByCode.has(code));

      if (missingCodes.length > 0) {
        throw new ApplicationError(
          `Dekel codes not found: ${missingCodes.join(", ")}.`,
          400,
        );
      }

      const selectedAt = new Date().toISOString();
      const appliedSelections = parsedInput.lines.map((line) => {
        const item = itemsByCode.get(line.code);

        if (!item) {
          throw new ApplicationError(`Dekel code ${line.code} not found.`, 400);
        }

        return {
          selectionId: randomUUID(),
          code: item.code,
          description: item.description,
          quantity: line.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          sourceActivityNumber:
            item.metadataJson.dekel_activity_number?.trim() || null,
          sourceChapterCode:
            item.metadataJson.dekel_chapter_code?.trim() || null,
          selectionContext: "mavnadim_ancillary",
          recommendationKey: line.recommendationKey,
          selectedAt,
          selectedBy: parsedInput.selectedBy,
          responsibleSkill: decision.primarySkill,
        } satisfies SelectedDekelLine;
      });

      const appliedCodes = new Set(
        appliedSelections.map((selection) => selection.code),
      );
      const selections = parsedInput.appendToExisting
        ? [
            ...record.analysis.selectedDekelLines.filter(
              (selection) => !appliedCodes.has(selection.code),
            ),
            ...appliedSelections,
          ]
        : appliedSelections;
      const appliedRecommendationKeys = [
        ...new Set(
          appliedSelections
            .map((selection) => selection.recommendationKey)
            .filter(
              (key): key is string =>
                typeof key === "string" && key.trim().length > 0,
            ),
        ),
      ];

      const updatedRecord: CaseRecord = {
        ...record,
        status: "approved",
        reviewStatus: "approved",
        finalStatus: "approved",
        analysis: {
          ...record.analysis,
          selectedDekelLines: selections,
          reviewDecisions: [
            ...record.analysis.reviewDecisions,
            {
              decisionId: randomUUID(),
              caseId: record.caseId,
              reviewerId: parsedInput.selectedBy,
              decisionType: "confirm_dekel_selection",
              targetEntityType: "mavnadim_ancillary_selection_set",
              targetEntityId: record.caseId,
              comment: `Confirmed ancillary DEKEL lines for MAVNADIM: ${appliedSelections
                .map(
                  (selection) =>
                    `${selection.code}(${selection.recommendationKey ?? "n/a"})`,
                )
                .join(", ")}.`,
              createdAt: selectedAt,
            },
          ],
          pipelineTrace: appendManualTrace(record.analysis, {
            stage: "review",
            status: "completed",
            responsibleSkill: decision.primarySkill,
            responsibleSkillSource: decision.primarySkillSource.source,
            supportingSkills: [...decision.supportingSkills],
            supportingSkillSources: decision.supportingSkillSources.map((source) => ({
              name: source.name,
              source: source.source,
            })),
            routeCategory: decision.routeCategory,
            summary: `Confirmed ${appliedSelections.length} ancillary DEKEL line(s) for selected MAVNADIM.`,
            occurredAt: selectedAt,
          }),
        },
      };

      await this.caseRepository.update(updatedRecord);

      return {
        statusCode: 200,
        body: {
          caseId: record.caseId,
          appliedRecommendationKeys,
          appliedSelections,
          selections,
          caseStatus: {
            status: updatedRecord.status,
            reviewStatus: updatedRecord.reviewStatus,
            finalStatus: updatedRecord.finalStatus,
          },
          estimatePreview: buildCaseEstimatePreviewFromSelectedDekelLines(
            selections,
            { managementFeePercent },
          ),
        },
      };
    });
  }

  public async getDekelSelection(
    caseId: string,
    managementFeePercent = 14,
  ): Promise<{
    caseId: string;
    selections: SelectedDekelLine[];
    estimatePreview: CaseDekelEstimatePreview;
  }> {
    return this.runInternalTask(
      {
        taskType: "internal.case.dekel_selection.get",
        invokedBy: "CaseService.getDekelSelection",
        caseId,
        inputSummary: `Read persisted DEKEL selection for case ${caseId}.`,
      },
      async () => {
        const record = await this.requireCase(caseId);
        const selections = record.analysis.selectedDekelLines;

        return {
          statusCode: 200,
          body: {
            caseId: record.caseId,
            selections,
            estimatePreview: buildCaseEstimatePreviewFromSelectedDekelLines(
              selections,
              { managementFeePercent },
            ),
          },
        };
      },
    );
  }

  public async getOutputDraft(
    caseId: string,
    managementFeePercent = 14,
  ): Promise<CaseOutputDraft> {
    return this.runInternalTask(
      {
        taskType: "internal.case.output_draft",
        invokedBy: "CaseService.getOutputDraft",
        caseId,
        inputSummary: `Build output draft for case ${caseId}.`,
      },
      async () => {
        const record = await this.requireCase(caseId);

        if (record.analysis.selectedDekelLines.length === 0) {
          throw new ApplicationError(
            "Cannot build output draft without confirmed DEKEL selection.",
            409,
          );
        }

        const template = this.templateRepository.findById(record.templateId);
        if (!template) {
          throw new ApplicationError(
            `Template ${record.templateId} not found.`,
            404,
          );
        }

        return {
          statusCode: 200,
          body: buildCaseOutputDraft({
            case: record,
            template,
            managementFeePercent,
          }),
        };
      },
    );
  }

  public async getOutputPackage(
    caseId: string,
    managementFeePercent = 14,
  ): Promise<CaseOutputPackage> {
    return this.runInternalTask(
      {
        taskType: "internal.case.outputs",
        invokedBy: "CaseService.getOutputPackage",
        caseId,
        inputSummary: `Build output package for case ${caseId}.`,
      },
      async () => {
        const record = await this.requireCase(caseId);
        const outputDraft = await this.getOutputDraft(caseId, managementFeePercent);

        return {
          statusCode: 200,
          body: buildCaseOutputPackage({
            case: record,
            outputDraft,
          }),
        };
      },
    );
  }

  public async generateCaseOutputs(
    caseId: string,
    managementFeePercent = 14,
  ): Promise<CaseOutputPackage & {
    exportManifest: CaseOutputExportManifest;
    caseStatus: {
      status: CaseRecord["status"];
      reviewStatus: CaseRecord["reviewStatus"];
      finalStatus: CaseRecord["finalStatus"];
    };
  }> {
    const context = {
      taskType: "internal.case.generate",
      invokedBy: "CaseService.generateCaseOutputs",
      caseId,
      inputSummary: `Generate final outputs for case ${caseId}.`,
    } satisfies SkillTaskContext;
    const decision = await this.skillOrchestratorService.planTask(context);

    return this.runPlannedInternalTask(context, decision, async () => {
      const record = await this.requireCase(caseId);
      const outputPackage = await this.getOutputPackage(caseId, managementFeePercent);
      const exportManifest = await this.outputExportService.exportCaseOutputPackage({
        case: record,
        outputPackage,
        responsibleSkill: decision.primarySkill,
      });
      const generatedAt = new Date().toISOString();
      const updatedRecord: CaseRecord = {
        ...record,
        status: "output_ready",
        reviewStatus: "approved",
        finalStatus: "generated",
        analysis: {
          ...record.analysis,
          generatedArtifacts: exportManifest.artifacts,
          reviewDecisions: [
            ...record.analysis.reviewDecisions,
            {
              decisionId: randomUUID(),
              caseId: record.caseId,
              reviewerId: "system",
              decisionType: "generate_output_package",
              targetEntityType: "output_package",
              targetEntityId: record.caseId,
              comment: "Generated final output package.",
              createdAt: generatedAt,
            },
          ],
          pipelineTrace: appendManualTrace(record.analysis, {
            stage: "output",
            status: "completed",
            responsibleSkill: decision.primarySkill,
            responsibleSkillSource: decision.primarySkillSource.source,
            supportingSkills: [...decision.supportingSkills],
            supportingSkillSources: decision.supportingSkillSources.map((source) => ({
              name: source.name,
              source: source.source,
            })),
            routeCategory: decision.routeCategory,
            summary: "Generated final output package.",
            occurredAt: generatedAt,
          }),
        },
      };

      await this.caseRepository.update(updatedRecord);

      return {
        statusCode: 200,
        body: {
          ...outputPackage,
          exportManifest,
          caseStatus: {
            status: updatedRecord.status,
            reviewStatus: updatedRecord.reviewStatus,
            finalStatus: updatedRecord.finalStatus,
          },
        },
      };
    });
  }

  private async requireCase(caseId: string): Promise<CaseRecord> {
    const record = await this.caseRepository.findById(caseId);

    if (!record) {
      throw new ApplicationError(`Case ${caseId} not found.`, 404);
    }

    return record;
  }

  private async runInternalTask<T>(
    context: SkillTaskContext,
    handler: () => Promise<{ statusCode: number; body: T }>,
  ): Promise<T & Record<string, unknown>> {
    const result = await this.skillOrchestratorService.runTask(context, handler);

    return result.responseBody as T & Record<string, unknown>;
  }

  private async runPlannedInternalTask<T>(
    context: SkillTaskContext,
    decision: SkillRouteDecision,
    handler: () => Promise<{ statusCode: number; body: T }>,
  ): Promise<T & Record<string, unknown>> {
    const result = await this.skillOrchestratorService.runPlannedTask(
      decision,
      context,
      handler,
    );

    return result.responseBody as T & Record<string, unknown>;
  }
}

function appendManualTrace(
  analysis: CaseAnalysisSnapshot,
  event: PipelineTraceEvent,
): PipelineTraceEvent[] {
  return [...analysis.pipelineTrace, event];
}

function buildSupportingEvidenceRecord(input: {
  sourceType: "typed" | "handwritten" | "document" | "photo";
  format?: "inline_text" | "text_file" | "pdf" | "image";
  role?: "primary" | "supporting" | "visual_reference";
  content?: string;
  extractedText?: string;
  fileName?: string;
  label?: string;
  confidence?: number;
}): SupportingEvidenceRecord {
  const content = input.content?.trim() || null;
  const extractedText = input.extractedText?.trim() || null;
  const effectiveText = extractedText ?? content ?? "";
  const confidence =
    input.confidence ??
    inferSupportingEvidenceConfidence(input.sourceType, extractedText !== null);
  const format = input.format ?? inferSupportingEvidenceFormat(input.sourceType);
  const role = input.role ?? inferSupportingEvidenceRole(input.sourceType);
  const accepted = shouldUseEvidenceInAnalysis({
    sourceType: input.sourceType,
    role,
    effectiveText,
    confidence,
  });

  return {
    evidenceId: randomUUID(),
    sourceType: input.sourceType,
    format,
    role,
    content,
    extractedText,
    fileName: input.fileName,
    normalizedContent: effectiveText.toLowerCase(),
    label: input.label,
    confidence,
    reviewStatus: accepted ? "accepted" : "needs_review",
    usedInAnalysisFlag: accepted,
  };
}

function applyClarificationAnswer(
  fieldKey: string,
  answerValue: string,
  dimensions: CaseRecord["dimensions"],
  rawDescription: string,
): { rawDescription: string } {
  if (fieldKey === "dimensions.length_width") {
    const parsed = parseLengthWidthAnswer(answerValue);
    dimensions.length = parsed.length;
    dimensions.width = parsed.width;
    dimensions.lengthWidthInterpretation = "area_basis";
    return { rawDescription };
  }

  if (fieldKey === "scope.geometry_quantity_relation") {
    dimensions.lengthWidthInterpretation =
      parseGeometryQuantityInterpretation(answerValue);
    return { rawDescription };
  }

  if (fieldKey === "dimensions.area_quantity_square_meters") {
    dimensions.areaSquareMeters = parseUnitsAnswer(answerValue);
    return { rawDescription };
  }

  if (fieldKey === "dimensions.units") {
    dimensions.units = parseUnitsAnswer(answerValue);
    return { rawDescription };
  }

  if (fieldKey === "dimensions.line_length_meters") {
    dimensions.lineLengthMeters = parseUnitsAnswer(answerValue);
    return { rawDescription };
  }

  if (fieldKey === "scope.primary_work_description") {
    return {
      rawDescription: mergeClarifiedDescription(rawDescription, answerValue),
    };
  }

  throw new ApplicationError(
    `Clarification field ${fieldKey} is not supported yet.`,
    400,
  );
}

function parseLengthWidthAnswer(answerValue: string): {
  length: number;
  width: number;
} {
  const matches = answerValue.match(/\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length < 2) {
    throw new ApplicationError(
      "Could not parse length and width from clarification answer.",
      400,
    );
  }

  const [lengthRaw, widthRaw] = matches;
  const length = Number(lengthRaw.replace(",", "."));
  const width = Number(widthRaw.replace(",", "."));
  if (!Number.isFinite(length) || !Number.isFinite(width) || length <= 0 || width <= 0) {
    throw new ApplicationError(
      "Clarification answer must include two positive numeric values for length and width.",
      400,
    );
  }

  return {
    length,
    width,
  };
}

function parseUnitsAnswer(answerValue: string): number {
  const match = answerValue.match(/\d+(?:[.,]\d+)?/);
  if (!match) {
    throw new ApplicationError(
      "Could not parse unit count from clarification answer.",
      400,
    );
  }

  const units = Number(match[0].replace(",", "."));
  if (!Number.isFinite(units) || units <= 0) {
    throw new ApplicationError(
      "Clarification answer for units must include a positive numeric value.",
      400,
    );
  }

  return units;
}

function parseGeometryQuantityInterpretation(
  answerValue: string,
): NonNullable<CaseRecord["dimensions"]["lengthWidthInterpretation"]> {
  const normalized = answerValue.trim().toLowerCase();

  if (
    /(שטח|מ"ר|מטר מרובע|sqm|square meter|full area|entire area|floor area)/u.test(
      normalized,
    )
  ) {
    return "area_basis";
  }

  if (/(נפח|volume|cub|מ"ק)/u.test(normalized)) {
    return "volume_basis";
  }

  if (/(אורך|length|linear|running meter|lm)/u.test(normalized)) {
    return "linear_basis";
  }

  if (
    /(מידות המבנה|geometry|structure size|footprint|רק מידות|מבנה בלבד|classification)/u.test(
      normalized,
    )
  ) {
    return "geometry_only";
  }

  throw new ApplicationError(
    "Clarification answer must explain whether the dimensions should be used as area, geometry only, length basis, or volume basis.",
    400,
  );
}

function mergeClarifiedDescription(
  currentDescription: string,
  clarificationAnswer: string,
): string {
  const normalizedAnswer = clarificationAnswer.trim();

  if (normalizedAnswer.length < 3) {
    throw new ApplicationError(
      "Clarification answer for the main work description must contain a concrete text description.",
      400,
    );
  }

  if (
    currentDescription
      .toLocaleLowerCase()
      .includes(normalizedAnswer.toLocaleLowerCase())
  ) {
    return currentDescription;
  }

  return `${currentDescription.trim()}\nClarified main work: ${normalizedAnswer}`;
}

function inferSupportingEvidenceConfidence(
  sourceType: "typed" | "handwritten" | "document" | "photo",
  hasExtractedText: boolean,
): number {
  if (sourceType === "typed") {
    return 1;
  }

  if (sourceType === "document") {
    return hasExtractedText ? 0.9 : 0.7;
  }

  if (sourceType === "handwritten") {
    return hasExtractedText ? 0.75 : 0.55;
  }

  return hasExtractedText ? 0.7 : 0.35;
}

function inferSupportingEvidenceFormat(
  sourceType: "typed" | "handwritten" | "document" | "photo",
): "inline_text" | "text_file" | "pdf" | "image" {
  if (sourceType === "typed") {
    return "inline_text";
  }

  if (sourceType === "document") {
    return "pdf";
  }

  return "image";
}

function inferSupportingEvidenceRole(
  sourceType: "typed" | "handwritten" | "document" | "photo",
): "primary" | "supporting" | "visual_reference" {
  if (sourceType === "photo") {
    return "visual_reference";
  }

  return "supporting";
}

function shouldUseEvidenceInAnalysis(input: {
  sourceType: "typed" | "handwritten" | "document" | "photo";
  role: "primary" | "supporting" | "visual_reference";
  effectiveText: string;
  confidence: number;
}): boolean {
  if (input.effectiveText.length === 0) {
    return false;
  }

  if (input.sourceType === "typed") {
    return true;
  }

  if (input.sourceType === "document") {
    return input.confidence >= 0.6;
  }

  if (input.sourceType === "handwritten") {
    return input.confidence >= 0.8;
  }

  if (input.role === "visual_reference") {
    return false;
  }

  return input.confidence >= 0.9;
}
