import type { CaseRecord } from "../../cases/domain/case-schemas.ts";
import type { TemplateDefinition } from "../../references/domain/reference-schemas.ts";
import { buildCaseEstimatePreviewFromSelectedDekelLines } from "../../references/services/dekel-case-estimate-service.ts";
import {
  buildMasmachTemplateDocument,
  type MasmachDocumentTemplate,
  type MasmachOmdanLine,
} from "./masmach-template-engine.ts";

export interface CaseOutputDraft {
  caseId: string;
  skill: string;
  generatedAt: string;
  template: {
    templateId: string;
    templateName: string;
    templateVersion: string;
    outputFormat: TemplateDefinition["outputFormat"];
  };
  selectedMavnadim: null | {
    catalogItemId: string;
    displayName: string;
    shortLabel: string;
    category: string;
    dimensionsLabel: string;
    basePrice: number;
    sourceImageName: string;
    includedFeatures: string[];
    ancillaryRecommendations: Array<{
      key: string;
      title: string;
      status: string;
      reason: string;
      suggestedDekelSearchTerms: string[];
      responsibleSkill: string;
    }>;
    selectedAt: string;
    selectedBy: string;
    responsibleSkill: string;
  };
  document: MasmachDocumentTemplate;
  templateBindings: Record<string, string | number | null>;
  reviewSummary: {
    selectedLinesCount: number;
    reviewDecisionsCount: number;
    warnings: string[];
    assumptions: string[];
  };
}

export function buildCaseOutputDraft(input: {
  case: CaseRecord;
  template: TemplateDefinition;
  managementFeePercent?: number;
}): CaseOutputDraft {
  const managementFeePercent = input.managementFeePercent ?? 14;
  const estimatePreview = buildCaseEstimatePreviewFromSelectedDekelLines(
    input.case.analysis.selectedDekelLines,
    { managementFeePercent },
  );
  const generatedAt = new Date().toISOString();
  const omdanLines: MasmachOmdanLine[] = input.case.analysis.selectedDekelLines.map(
    (selection, index) => ({
      serialNumber: index + 1,
      code: selection.code,
      description: selection.description,
      quantity: selection.quantity,
      unit: selection.unit,
      unitPrice: selection.unitPrice,
      amount: roundMoney(selection.quantity * selection.unitPrice),
      sourceActivityNumber: selection.sourceActivityNumber,
      sourceChapterCode: selection.sourceChapterCode,
    }),
  );
  const document = buildMasmachTemplateDocument({
    case: input.case,
    template: input.template,
    generatedAt,
    estimatePreview,
    omdanLines,
  });
  const templateBindingsSource: Record<string, string | number | null> = {
    projectDescription: input.case.rawDescription,
    totalAmount: estimatePreview.totalProjectCost,
    documentTitle: document.title,
    caseId: input.case.caseId,
    budgetBreakdownTotal: document.budgetBreakdownSection.totalProjectCost,
    scheduleDurationMonths: document.scheduleSection.months.length,
    riskItemsCount: document.riskManagementSection.rows.length,
    selectedLinesCount: input.case.analysis.selectedDekelLines.length,
    selectedMavnadimName:
      input.case.analysis.selectedMavnadimItem?.displayName ?? null,
    selectedMavnadimDimensions:
      input.case.analysis.selectedMavnadimItem?.dimensionsLabel ?? null,
    selectedMavnadimBasePrice:
      input.case.analysis.selectedMavnadimItem?.basePrice ?? null,
    mavnadimAncillaryCount:
      input.case.analysis.selectedMavnadimItem?.ancillaryRecommendations.length ?? 0,
  };
  const templateBindings = Object.fromEntries(
    Object.keys(input.template.fieldsSchemaJson).map((fieldKey) => [
      fieldKey,
      templateBindingsSource[fieldKey] ?? null,
    ]),
  );

  return {
    caseId: input.case.caseId,
    skill: "architecture",
    generatedAt,
    template: {
      templateId: input.template.templateId,
      templateName: input.template.templateName,
      templateVersion: input.template.templateVersion,
      outputFormat: input.template.outputFormat,
    },
    selectedMavnadim:
      input.case.analysis.selectedMavnadimItem === null
        ? null
        : {
            catalogItemId: input.case.analysis.selectedMavnadimItem.catalogItemId,
            displayName: input.case.analysis.selectedMavnadimItem.displayName,
            shortLabel: input.case.analysis.selectedMavnadimItem.shortLabel,
            category: input.case.analysis.selectedMavnadimItem.category,
            dimensionsLabel: input.case.analysis.selectedMavnadimItem.dimensionsLabel,
            basePrice: input.case.analysis.selectedMavnadimItem.basePrice,
            sourceImageName: input.case.analysis.selectedMavnadimItem.sourceImageName,
            includedFeatures: [
              ...input.case.analysis.selectedMavnadimItem.includedFeatures,
            ],
            ancillaryRecommendations:
              input.case.analysis.selectedMavnadimItem.ancillaryRecommendations.map(
                (recommendation) => ({
                  ...recommendation,
                  suggestedDekelSearchTerms: [
                    ...recommendation.suggestedDekelSearchTerms,
                  ],
                }),
              ),
            selectedAt: input.case.analysis.selectedMavnadimItem.selectedAt,
            selectedBy: input.case.analysis.selectedMavnadimItem.selectedBy,
            responsibleSkill:
              input.case.analysis.selectedMavnadimItem.responsibleSkill,
          },
    document,
    templateBindings,
    reviewSummary: {
      selectedLinesCount: input.case.analysis.selectedDekelLines.length,
      reviewDecisionsCount: input.case.analysis.reviewDecisions.length,
      warnings: [...input.case.analysis.warnings],
      assumptions: [...input.case.analysis.assumptions],
    },
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
