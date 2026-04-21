import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  CaseRecord,
  GeneratedArtifact,
} from "../../cases/domain/case-schemas.ts";
import type { CaseOutputPackage } from "./case-output-package-service.ts";

export interface CaseOutputExportManifest {
  caseId: string;
  exportDirectory: string;
  generatedAt: string;
  artifacts: GeneratedArtifact[];
}

export class CaseOutputExportService {
  private readonly projectRoot: string;
  private readonly artifactsRootPath: string;

  public constructor(options?: {
    projectRoot?: string;
    artifactsRootPath?: string;
  }) {
    this.projectRoot = options?.projectRoot ?? process.cwd();
    this.artifactsRootPath =
      options?.artifactsRootPath ??
      path.join(this.projectRoot, "artifacts", "generated-cases");
  }

  public async exportCaseOutputPackage(input: {
    case: CaseRecord;
    outputPackage: CaseOutputPackage;
    responsibleSkill: string;
  }): Promise<CaseOutputExportManifest> {
    const generatedAt = new Date().toISOString();
    const exportDirectory = path.join(
      this.artifactsRootPath,
      sanitizePathSegment(input.case.caseId),
    );
    await mkdir(exportDirectory, { recursive: true });

    const artifacts: GeneratedArtifact[] = [];

    const mainDocumentRelativePath = path.join(
      "artifacts",
      "generated-cases",
      sanitizePathSegment(input.case.caseId),
      "main-document.md",
    );
    const mainDocumentAbsolutePath = path.join(exportDirectory, "main-document.md");
    await writeFile(
      mainDocumentAbsolutePath,
      buildMainDocumentMarkdown(input.outputPackage),
      "utf8",
    );
    artifacts.push(
      buildArtifact({
        caseId: input.case.caseId,
        kind: "main_document",
        format: "md",
        absolutePath: mainDocumentAbsolutePath,
        relativePath: mainDocumentRelativePath,
        generatedAt,
        responsibleSkill: input.responsibleSkill,
      }),
    );

    const detailedCostSheetRelativePath = path.join(
      "artifacts",
      "generated-cases",
      sanitizePathSegment(input.case.caseId),
      "detailed-cost-sheet.csv",
    );
    const detailedCostSheetAbsolutePath = path.join(
      exportDirectory,
      "detailed-cost-sheet.csv",
    );
    await writeFile(
      detailedCostSheetAbsolutePath,
      buildDetailedCostSheetCsv(input.outputPackage),
      "utf8",
    );
    artifacts.push(
      buildArtifact({
        caseId: input.case.caseId,
        kind: "detailed_cost_sheet",
        format: "csv",
        absolutePath: detailedCostSheetAbsolutePath,
        relativePath: detailedCostSheetRelativePath,
        generatedAt,
        responsibleSkill: input.responsibleSkill,
      }),
    );

    const reviewSheetRelativePath = path.join(
      "artifacts",
      "generated-cases",
      sanitizePathSegment(input.case.caseId),
      "review-sheet.md",
    );
    const reviewSheetAbsolutePath = path.join(exportDirectory, "review-sheet.md");
    await writeFile(
      reviewSheetAbsolutePath,
      buildReviewSheetMarkdown(input.outputPackage),
      "utf8",
    );
    artifacts.push(
      buildArtifact({
        caseId: input.case.caseId,
        kind: "review_sheet",
        format: "md",
        absolutePath: reviewSheetAbsolutePath,
        relativePath: reviewSheetRelativePath,
        generatedAt,
        responsibleSkill: input.responsibleSkill,
      }),
    );

    const outputPackageRelativePath = path.join(
      "artifacts",
      "generated-cases",
      sanitizePathSegment(input.case.caseId),
      "output-package.json",
    );
    const outputPackageAbsolutePath = path.join(exportDirectory, "output-package.json");
    await writeFile(
      outputPackageAbsolutePath,
      JSON.stringify(input.outputPackage, null, 2),
      "utf8",
    );
    artifacts.push(
      buildArtifact({
        caseId: input.case.caseId,
        kind: "output_package",
        format: "json",
        absolutePath: outputPackageAbsolutePath,
        relativePath: outputPackageRelativePath,
        generatedAt,
        responsibleSkill: input.responsibleSkill,
      }),
    );

    return {
      caseId: input.case.caseId,
      exportDirectory,
      generatedAt,
      artifacts,
    };
  }
}

function buildArtifact(input: {
  caseId: string;
  kind: GeneratedArtifact["kind"];
  format: GeneratedArtifact["format"];
  absolutePath: string;
  relativePath: string;
  generatedAt: string;
  responsibleSkill: string;
}): GeneratedArtifact {
  return {
    artifactId: randomUUID(),
    caseId: input.caseId,
    kind: input.kind,
    format: input.format,
    absolutePath: input.absolutePath,
    relativePath: input.relativePath,
    generatedAt: input.generatedAt,
    responsibleSkill: input.responsibleSkill,
  };
}

function buildMainDocumentMarkdown(outputPackage: CaseOutputPackage): string {
  const { document } = outputPackage.mainDocument;
  const omdanLines = document.omdanSection.lines.map((line) => [
    String(line.serialNumber),
    line.code,
    line.description,
    String(line.quantity),
    line.unit,
    String(line.unitPrice),
    String(line.amount),
  ]);
  const budgetBreakdownRows = document.budgetBreakdownSection.rows.map((row) => [
    String(row.serialNumber),
    row.subject,
    row.requestName,
    String(row.amount),
    row.planningComplexity,
    row.budgetingComplexity,
    row.wbsCode,
  ]);
  const scheduleRows = document.scheduleSection.rows.map((row) => [
    row.activity,
    ...document.scheduleSection.months.map((month) =>
      row.activeMonths.includes(month) ? "■" : "",
    ),
  ]);
  const riskRows = document.riskManagementSection.rows.map((row) => [
    String(row.serialNumber),
    row.riskDescription,
    row.projectStage,
    row.riskType,
    row.probability,
    row.budgetImpact,
    row.qualityImpact,
    row.scheduleImpact,
    row.severity,
    row.mitigation,
    row.notes,
  ]);

  return [
    `# ${document.title}`,
    "",
    `## ${document.summarySection.sectionTitle}`,
    "",
    `- ${document.summarySection.documentTypeLabel}: מסמך משמעויות`,
    `- ${document.summarySection.caseReferenceLabel}: ${document.summarySection.caseReferenceValue}`,
    `- ${document.summarySection.templateLabel}: ${document.summarySection.templateValue}`,
    `- ${document.summarySection.generatedAtLabel}: ${document.summarySection.generatedAtValue}`,
    `- ${document.summarySection.projectNameLabel}: ${document.summarySection.projectNameValue}`,
    "",
    `## ${document.backgroundSection.sectionTitle}`,
    "",
    ...document.backgroundSection.paragraphs,
    "",
    `## ${document.objectiveSection.sectionTitle}`,
    "",
    ...document.objectiveSection.paragraphs,
    "",
    `## ${document.scopeSection.sectionTitle}`,
    "",
    ...document.scopeSection.items.map((item) => `- ${item}`),
    "",
    "## תיאור הפרויקט",
    "",
    ...(outputPackage.mainDocument.selectedMavnadim === null
      ? []
      : [
          "## Selected Mavnadim",
          "",
          `- Item: ${outputPackage.mainDocument.selectedMavnadim.displayName}`,
          `- Dimensions: ${outputPackage.mainDocument.selectedMavnadim.dimensionsLabel}`,
          `- Base Catalog Price: ${outputPackage.mainDocument.selectedMavnadim.basePrice}`,
          `- Source Image: ${outputPackage.mainDocument.selectedMavnadim.sourceImageName}`,
          `- Selected By: ${outputPackage.mainDocument.selectedMavnadim.selectedBy}`,
          `- Selected At: ${outputPackage.mainDocument.selectedMavnadim.selectedAt}`,
          ...outputPackage.mainDocument.selectedMavnadim.includedFeatures.map(
            (feature) => `- Included Feature: ${feature}`,
          ),
          ...outputPackage.mainDocument.selectedMavnadim.ancillaryRecommendations.map(
            (recommendation) =>
              `- Ancillary [${recommendation.status}]: ${recommendation.title} :: ${recommendation.reason}`,
          ),
          "",
        ]),
    document.projectDescription,
    "",
    `## ${document.omdanSection.sectionTitle}`,
    "",
    renderMarkdownTable(document.omdanSection.columns, omdanLines),
    "",
    `- סה''כ ביצוע: ${document.omdanSection.executionSubtotal}`,
    `- תכנון/פיקוח (${document.omdanSection.managementFeePercent}%): ${document.omdanSection.managementFeeAmount}`,
    `- סה''כ עלות הפרויקט: ${document.omdanSection.totalProjectCost}`,
    "",
    `## ${document.remarksSection.sectionTitle}`,
    "",
    ...document.remarksSection.items.map((item) => `- ${item}`),
    "",
    `## ${document.budgetBreakdownSection.sectionTitle}`,
    "",
    renderMarkdownTable(
      ["מס''ד", ...document.budgetBreakdownSection.columns],
      budgetBreakdownRows,
    ),
    "",
    `- סה''כ ביצוע: ${document.budgetBreakdownSection.executionSubtotal}`,
    `- תכנון/פיקוח (${document.budgetBreakdownSection.managementFeePercent}%): ${document.budgetBreakdownSection.managementFeeAmount}`,
    `- סה''כ עלות הפרויקט: ${document.budgetBreakdownSection.totalProjectCost}`,
    "",
    `## ${document.scheduleSection.sectionTitle}`,
    "",
    renderMarkdownTable(
      ["פעילות", ...document.scheduleSection.months.map((month) => `חודש ${month}`)],
      scheduleRows,
    ),
    "",
    `## ${document.riskManagementSection.sectionTitle}`,
    "",
    renderMarkdownTable(document.riskManagementSection.columns, riskRows),
    "",
    `## ${document.appendicesSection.sectionTitle}`,
    "",
    ...document.appendicesSection.items.map((item) => `- ${item}`),
    "",
    "## Template Bindings",
    "",
    "```json",
    JSON.stringify(outputPackage.mainDocument.templateBindings, null, 2),
    "```",
    "",
  ].join("\n");
}

function buildDetailedCostSheetCsv(outputPackage: CaseOutputPackage): string {
  const header = [
    "serial_number",
    "code",
    "description",
    "quantity",
    "unit",
    "unit_price",
    "amount",
    "source_activity_number",
    "source_chapter_code",
    "selected_by",
    "selected_at",
    "responsible_skill",
  ];

  const rows = outputPackage.detailedCostSheet.lines.map((line) => [
    String(line.serialNumber),
    csvEscape(line.code),
    csvEscape(line.description),
    String(line.quantity),
    csvEscape(line.unit),
    String(line.unitPrice),
    String(line.amount),
    csvEscape(line.sourceActivityNumber ?? ""),
    csvEscape(line.sourceChapterCode ?? ""),
    csvEscape(line.selectedBy),
    csvEscape(line.selectedAt),
    csvEscape(line.responsibleSkill),
  ]);

  const totalsRows = [
    [
      "TOTALS",
      "",
      "",
      "",
      "",
      "",
      String(outputPackage.detailedCostSheet.totals.executionSubtotal),
      "",
      "",
      "",
      "",
      "",
    ],
    [
      "MANAGEMENT_FEE_PERCENT",
      "",
      "",
      "",
      "",
      "",
      String(outputPackage.detailedCostSheet.totals.managementFeePercent),
      "",
      "",
      "",
      "",
      "",
    ],
    [
      "MANAGEMENT_FEE_AMOUNT",
      "",
      "",
      "",
      "",
      "",
      String(outputPackage.detailedCostSheet.totals.managementFeeAmount),
      "",
      "",
      "",
      "",
      "",
    ],
    [
      "TOTAL_PROJECT_COST",
      "",
      "",
      "",
      "",
      "",
      String(outputPackage.detailedCostSheet.totals.totalProjectCost),
      "",
      "",
      "",
      "",
      "",
    ],
  ];

  return [header, ...rows, ...totalsRows]
    .map((row) => row.join(","))
    .join("\n");
}

function buildReviewSheetMarkdown(outputPackage: CaseOutputPackage): string {
  const selectedLines = outputPackage.reviewSheet.selectedLines
    .map(
      (line) =>
        `- ${line.code}: ${line.description} | qty=${line.quantity} | chapter=${line.sourceChapterCode ?? "n/a"} | by=${line.selectedBy} at ${line.selectedAt}`,
    )
    .join("\n");
  const reviewDecisions = outputPackage.reviewSheet.reviewDecisions
    .map(
      (decision) =>
        `- ${decision.decisionType} by ${decision.reviewerId} at ${decision.createdAt}: ${decision.comment}`,
    )
    .join("\n");
  const warnings =
    outputPackage.reviewSheet.warnings.length > 0
      ? outputPackage.reviewSheet.warnings.map((warning) => `- ${warning}`).join("\n")
      : "- none";
  const supportingEvidence =
    outputPackage.reviewSheet.supportingEvidence.length > 0
      ? outputPackage.reviewSheet.supportingEvidence
          .map(
            (evidence) =>
              `- [${evidence.sourceType}] ${evidence.label ?? "supporting-evidence"} | ` +
              `format=${evidence.format} | role=${evidence.role} | ` +
              `file=${evidence.fileName ?? "n/a"} | ` +
              `confidence=${evidence.confidence} | review=${evidence.reviewStatus} | ` +
              `used=${evidence.usedInAnalysisFlag} | ` +
              `${evidence.extractedText ?? evidence.content ?? "no text extracted"}`,
          )
          .join("\n")
      : "- none";
  const assumptions =
    outputPackage.reviewSheet.assumptions.length > 0
      ? outputPackage.reviewSheet.assumptions
          .map((assumption) => `- ${assumption}`)
          .join("\n")
      : "- none";
  const selectedMavnadim =
    outputPackage.reviewSheet.selectedMavnadim === null
      ? "- none"
      : [
          `- ${outputPackage.reviewSheet.selectedMavnadim.displayName} | dimensions=${outputPackage.reviewSheet.selectedMavnadim.dimensionsLabel} | base_price=${outputPackage.reviewSheet.selectedMavnadim.basePrice} | image=${outputPackage.reviewSheet.selectedMavnadim.sourceImageName} | by=${outputPackage.reviewSheet.selectedMavnadim.selectedBy} at ${outputPackage.reviewSheet.selectedMavnadim.selectedAt}`,
          ...outputPackage.reviewSheet.selectedMavnadim.ancillaryRecommendations.map(
            (recommendation) =>
              `- ancillary ${recommendation.key} => ${recommendation.status} (${recommendation.title})`,
          ),
        ].join("\n");

  return [
    `# ${outputPackage.reviewSheet.title}`,
    "",
    "## Selected Mavnadim",
    "",
    selectedMavnadim,
    "",
    "## Selected Lines",
    "",
    selectedLines || "- none",
    "",
    "## Review Decisions",
    "",
    reviewDecisions || "- none",
    "",
    "## Supporting Evidence",
    "",
    supportingEvidence,
    "",
    "## Warnings",
    "",
    warnings,
    "",
    "## Assumptions",
    "",
    assumptions,
    "",
  ].join("\n");
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_");
}

function csvEscape(value: string): string {
  const normalized = value.replace(/"/g, '""');

  return `"${normalized}"`;
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function renderMarkdownTable(headers: string[], rows: string[][]): string {
  const escapedHeaders = headers.map((header) => escapePipe(header));
  const headerLine = `| ${escapedHeaders.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyLines = rows.map(
    (row) => `| ${row.map((value) => escapePipe(value)).join(" | ")} |`,
  );

  return [headerLine, dividerLine, ...bodyLines].join("\n");
}
