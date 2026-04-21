import type { CaseRecord } from "../../cases/domain/case-schemas.ts";
import type { CaseOutputDraft } from "./case-output-draft-service.ts";

export interface CaseOutputPackage {
  caseId: string;
  skill: string;
  generatedAt: string;
  mainDocument: CaseOutputDraft;
  detailedCostSheet: {
    title: string;
    columns: string[];
    lines: Array<{
      serialNumber: number;
      code: string;
      description: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      amount: number;
      sourceActivityNumber: string | null;
      sourceChapterCode: string | null;
      selectedBy: string;
      selectedAt: string;
      responsibleSkill: string;
    }>;
    totals: {
      executionSubtotal: number;
      managementFeePercent: number;
      managementFeeAmount: number;
      totalProjectCost: number;
    };
  };
  reviewSheet: {
    title: string;
    selectedMavnadim: {
      catalogItemId: string;
      displayName: string;
      dimensionsLabel: string;
      basePrice: number;
      sourceImageName: string;
      selectedBy: string;
      selectedAt: string;
      ancillaryRecommendations: Array<{
        key: string;
        title: string;
        status: string;
      }>;
    } | null;
    selectedLines: Array<{
      code: string;
      description: string;
      quantity: number;
      sourceChapterCode: string | null;
      selectedBy: string;
      selectedAt: string;
    }>;
    reviewDecisions: Array<{
      decisionId: string;
      decisionType: string;
      reviewerId: string;
      comment: string;
      createdAt: string;
    }>;
    supportingEvidence: Array<{
      evidenceId: string;
      sourceType: string;
      format: string;
      role: string;
      fileName: string | null;
      label: string | null;
      content: string | null;
      extractedText: string | null;
      confidence: number;
      reviewStatus: string;
      usedInAnalysisFlag: boolean;
    }>;
    warnings: string[];
    assumptions: string[];
  };
}

export function buildCaseOutputPackage(input: {
  case: CaseRecord;
  outputDraft: CaseOutputDraft;
}): CaseOutputPackage {
  return {
    caseId: input.case.caseId,
    skill: "architecture",
    generatedAt: new Date().toISOString(),
    mainDocument: input.outputDraft,
    detailedCostSheet: {
      title: "Detailed Cost Sheet",
      columns: [
        "מס׳",
        "קוד",
        "תיאור",
        "כמות",
        "יחידה",
        "מחיר יחידה",
        "סה״כ",
        "פרק",
        "פעילות",
      ],
      lines: input.case.analysis.selectedDekelLines.map((selection, index) => ({
        serialNumber: index + 1,
        code: selection.code,
        description: selection.description,
        quantity: selection.quantity,
        unit: selection.unit,
        unitPrice: selection.unitPrice,
        amount: roundMoney(selection.quantity * selection.unitPrice),
        sourceActivityNumber: selection.sourceActivityNumber,
        sourceChapterCode: selection.sourceChapterCode,
        selectedBy: selection.selectedBy,
        selectedAt: selection.selectedAt,
        responsibleSkill: selection.responsibleSkill,
      })),
      totals: {
        executionSubtotal:
          input.outputDraft.document.omdanSection.executionSubtotal,
        managementFeePercent:
          input.outputDraft.document.omdanSection.managementFeePercent,
        managementFeeAmount:
          input.outputDraft.document.omdanSection.managementFeeAmount,
        totalProjectCost:
          input.outputDraft.document.omdanSection.totalProjectCost,
      },
    },
    reviewSheet: {
      title: "Review / Assumptions Sheet",
      selectedMavnadim:
        input.case.analysis.selectedMavnadimItem === null
          ? null
          : {
              catalogItemId: input.case.analysis.selectedMavnadimItem.catalogItemId,
              displayName: input.case.analysis.selectedMavnadimItem.displayName,
              dimensionsLabel:
                input.case.analysis.selectedMavnadimItem.dimensionsLabel,
              basePrice: input.case.analysis.selectedMavnadimItem.basePrice,
              sourceImageName:
                input.case.analysis.selectedMavnadimItem.sourceImageName,
              selectedBy: input.case.analysis.selectedMavnadimItem.selectedBy,
              selectedAt: input.case.analysis.selectedMavnadimItem.selectedAt,
              ancillaryRecommendations:
                input.case.analysis.selectedMavnadimItem.ancillaryRecommendations.map(
                  (recommendation) => ({
                    key: recommendation.key,
                    title: recommendation.title,
                    status: recommendation.status,
                  }),
                ),
            },
      selectedLines: input.case.analysis.selectedDekelLines.map((selection) => ({
        code: selection.code,
        description: selection.description,
        quantity: selection.quantity,
        sourceChapterCode: selection.sourceChapterCode,
        selectedBy: selection.selectedBy,
        selectedAt: selection.selectedAt,
      })),
      reviewDecisions: input.case.analysis.reviewDecisions.map((decision) => ({
        decisionId: decision.decisionId,
        decisionType: decision.decisionType,
        reviewerId: decision.reviewerId,
        comment: decision.comment,
        createdAt: decision.createdAt,
      })),
      supportingEvidence: input.case.supportingEvidence.map((evidence) => ({
        evidenceId: evidence.evidenceId,
        sourceType: evidence.sourceType,
        format: evidence.format,
        role: evidence.role,
        fileName: evidence.fileName ?? null,
        label: evidence.label ?? null,
        content: evidence.content,
        extractedText: evidence.extractedText,
        confidence: evidence.confidence,
        reviewStatus: evidence.reviewStatus,
        usedInAnalysisFlag: evidence.usedInAnalysisFlag,
      })),
      warnings: [...input.case.analysis.warnings],
      assumptions: [...input.case.analysis.assumptions],
    },
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
