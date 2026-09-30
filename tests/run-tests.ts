import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { createApp } from "../src/app/create-app.ts";
import {
  createEmptyAnalysisSnapshot,
  type CaseRecord,
  type SelectedMavnadimItem,
  type WorkItem,
  validateCaseCreateInput,
} from "../src/modules/cases/domain/case-schemas.ts";
import { CaseAnalysisPipeline } from "../src/modules/pipeline/services/case-analysis-pipeline.ts";
import {
  buildCaseEstimatePreviewFromDekelCandidates,
  buildCaseEstimatePreviewFromSelectedDekelLines,
} from "../src/modules/references/services/dekel-case-estimate-service.ts";
import { buildCaseOutputDraft } from "../src/modules/output/services/case-output-draft-service.ts";
import { buildCaseOutputPackage } from "../src/modules/output/services/case-output-package-service.ts";
import { CaseOutputExportService } from "../src/modules/output/services/case-output-export-service.ts";
import {
  buildDekelCandidateMatchesForCase,
  buildDekelCandidateMatches,
  buildDekelSearchQueryPlan,
  inferDekelRoutingHints,
} from "../src/modules/references/services/dekel-matching-service.ts";
import { buildDekelEstimatePreview } from "../src/modules/references/services/dekel-estimate-preview.ts";
import { buildDekelPricebookItems } from "../src/modules/references/services/dekel-pricebook-adapter.ts";
import { buildAutoConfirmSelectionLines } from "../src/live-check/auto-confirm-selection.ts";
import { MavnadimCatalogService } from "../src/modules/references/services/mavnadim-catalog-service.ts";
import {
  buildMavnadimAncillaryRecommendations,
  buildMavnadimCandidateMatches,
} from "../src/modules/references/services/mavnadim-matching-service.ts";
import { buildMavnadimDekelPackagePreview } from "../src/modules/references/services/mavnadim-dekel-package-service.ts";
import { SkillOrchestratorService } from "../src/modules/skills/services/skill-orchestrator-service.ts";
import type {
  PricebookItem,
  TemplateMappingRule,
} from "../src/modules/references/domain/reference-schemas.ts";
import {
  readDekelRowsFromXlsx,
  readDekelRowsFromExtractedWorkbook,
  selectBillableDekelRows,
} from "../src/modules/references/services/openxml-dekel-reader.ts";
import {
  DEFAULT_PRICEBOOK_ID,
  DEFAULT_TEMPLATE_ID,
  InMemoryMappingRuleRepository,
  InMemoryPricebookRepository,
  InMemoryTemplateRepository,
} from "../src/modules/references/repositories/in-memory-reference-repositories.ts";

function buildCaseRecord(overrides?: Partial<CaseRecord>): CaseRecord {
  return {
    caseId: "case-test-1",
    title: "Замена покрытия в помещении",
    createdBy: "tester",
    createdAt: new Date().toISOString(),
    status: "draft",
    templateId: DEFAULT_TEMPLATE_ID,
    pricebookId: DEFAULT_PRICEBOOK_ID,
    rawDescription:
      "Need floor replacement and local wall repair in the damaged room.",
    normalizedDescription: "",
    dimensions: {
      length: 2,
      width: 3,
      lengthWidthInterpretation: "area_basis",
    },
    notes: "",
    supportingEvidence: [],
    reviewStatus: "not_started",
    finalStatus: "draft",
    analysis: createEmptyAnalysisSnapshot(),
    ...overrides,
  };
}

function buildSelectedMavnadimSelection(
  overrides?: Partial<NonNullable<CaseRecord["analysis"]["selectedMavnadimItem"]>>,
): NonNullable<CaseRecord["analysis"]["selectedMavnadimItem"]> {
  return {
    selectionId: "mavnadim-selection-1",
    catalogItemId: "mavnadim-cafe-container",
    displayName: "Cafe Container",
    shortLabel: "Cafe",
    category: "commercial",
    dimensionsLabel: "3x6",
    basePrice: 80000,
    sourceImageName: "cafe-container.png",
    includedFeatures: ["service counter", "electrical panel"],
    ancillaryRecommendations: [
      {
        key: "electricity_connection",
        title: "Electricity connection",
        status: "explicitly_requested",
        reason: "Electrical connection was explicitly requested in the case description.",
        suggestedDekelSearchTerms: ["electricity connection", "temporary power"],
        responsibleSkill: "rag-engineer",
      },
      {
        key: "water_connection",
        title: "Water connection",
        status: "explicitly_requested",
        reason: "Water connection was explicitly requested in the case description.",
        suggestedDekelSearchTerms: ["water connection"],
        responsibleSkill: "rag-engineer",
      },
    ],
    selectedAt: "2026-04-21T09:30:00.000Z",
    selectedBy: "reviewer-m",
    responsibleSkill: "backend-dev-guidelines",
    ...overrides,
  };
}

function buildPipeline(): CaseAnalysisPipeline {
  return new CaseAnalysisPipeline(
    new InMemoryTemplateRepository(),
    new InMemoryPricebookRepository(),
    new InMemoryMappingRuleRepository(),
    new SkillOrchestratorService({
      logsDirectoryPath: path.join(
        tmpdir(),
        "mashmauet-pipeline-unit-logs",
        String(Math.round(Math.random() * 1_000_000)),
      ),
    }),
  );
}

function buildPipelineWithLiveDekelFallback(): CaseAnalysisPipeline {
  const fakeDekelMatchingService = {
    async findCandidatesByDescription() {
      return [
        {
          code: "95.57.10.0001",
          description: "Sewer line replacement, diameter 160",
          unit: "m",
          unitPrice: 33.9,
          score: 0.91,
          matchReason: "Live DEKEL sewer fallback",
          metadataJson: {
            dekel_chapter_code: "57",
          },
        },
        {
          code: "95.57.10.0002",
          description: "Trench excavation for sewer line",
          unit: "m",
          unitPrice: 18.5,
          score: 0.82,
          matchReason: "Live DEKEL trench fallback",
          metadataJson: {
            dekel_chapter_code: "57",
          },
        },
      ];
    },
    async findPricebookItemsByCodes() {
      return [
        {
          itemId: "dekel-sewer-1",
          pricebookId: DEFAULT_PRICEBOOK_ID,
          code: "95.57.10.0001",
          description: "Sewer line replacement, diameter 160",
          normalizedDescription: "sewer line replacement diameter 160",
          unit: "m",
          unitPrice: 33.9,
          section: "95.57.10",
          subsection: "B57",
          tagsJson: ["sewer", "line", "pipe", "160"],
          synonymsJson: [],
          activeFlag: true,
          metadataJson: {
            dekel_chapter_code: "57",
          },
        },
        {
          itemId: "dekel-sewer-2",
          pricebookId: DEFAULT_PRICEBOOK_ID,
          code: "95.57.10.0002",
          description: "Trench excavation for sewer line",
          normalizedDescription: "trench excavation for sewer line",
          unit: "m",
          unitPrice: 18.5,
          section: "95.57.10",
          subsection: "B57",
          tagsJson: ["trench", "excavation", "sewer"],
          synonymsJson: [],
          activeFlag: true,
          metadataJson: {
            dekel_chapter_code: "57",
          },
        },
      ];
    },
  };

  return new CaseAnalysisPipeline(
    new InMemoryTemplateRepository(),
    new InMemoryPricebookRepository(),
    new InMemoryMappingRuleRepository(),
    new SkillOrchestratorService({
      logsDirectoryPath: path.join(
        tmpdir(),
        "mashmauet-pipeline-live-dekel-logs",
        String(Math.round(Math.random() * 1_000_000)),
      ),
    }),
    fakeDekelMatchingService,
  );
}

function buildPipelineWithMissingReferences(): CaseAnalysisPipeline {
  class EmptyTemplateRepository extends InMemoryTemplateRepository {
    public override findById(): null {
      return null;
    }
  }

  class EmptyPricebookRepository extends InMemoryPricebookRepository {
    public override listByPricebookId(): PricebookItem[] {
      return [];
    }

    public override listCatalog(): { pricebookId: string; itemsCount: number }[] {
      return [];
    }
  }

  class EmptyMappingRuleRepository extends InMemoryMappingRuleRepository {
    public override listByTemplateId(): TemplateMappingRule[] {
      return [];
    }
  }

  return new CaseAnalysisPipeline(
    new EmptyTemplateRepository(),
    new EmptyPricebookRepository(),
    new EmptyMappingRuleRepository(),
    new SkillOrchestratorService({
      logsDirectoryPath: path.join(
        tmpdir(),
        "mashmauet-pipeline-missing-references-logs",
        String(Math.round(Math.random() * 1_000_000)),
      ),
    }),
  );
}

async function testPipelineHappyPath(): Promise<void> {
  const pipeline = buildPipeline();
  const result = await pipeline.run(buildCaseRecord());

  assert.equal(result.status, "review_pending");
  assert.ok(result.analysis.workItems.length >= 3);
  assert.ok(result.analysis.candidateMatches.length >= 3);
  assert.ok(result.analysis.detailedCostLines.length >= 2);
  assert.ok(result.analysis.aggregatedTemplateLines.length >= 2);
  assert.equal(result.analysis.pipelineTrace.at(-1)?.stage, "output");
  assert.equal(
    result.analysis.pipelineTrace.find((event) => event.stage === "work_understanding")
      ?.responsibleSkill,
    "product-manager",
  );
  assert.ok(
    result.analysis.pipelineTrace
      .find((event) => event.stage === "work_understanding")
      ?.supportingSkills.includes("brainstorming"),
  );
  assert.equal(
    result.analysis.pipelineTrace.find((event) => event.stage === "matching")
      ?.responsibleSkill,
    "rag-engineer",
  );
  assert.equal(
    result.analysis.pipelineTrace.at(-1)?.routeCategory,
    "Document generation / template flow",
  );
}

async function testPipelineClarification(): Promise<void> {
  const pipeline = buildPipeline();
  const result = await pipeline.run(
    buildCaseRecord({
      rawDescription: "Need floor replacement and wall repair on the damaged area.",
      dimensions: {},
    }),
  );

  assert.equal(result.status, "needs_clarification");
  assert.ok(result.analysis.missingInputs.includes("dimensions.length_width"));
  assert.ok(result.analysis.clarificationQuestions.length >= 1);
  assert.equal(
    result.analysis.pipelineTrace.at(-1)?.responsibleSkill,
    "ask-questions-if-underspecified",
  );
  assert.equal(result.analysis.pipelineTrace.at(-1)?.status, "blocked");
}

async function testPipelineExtractsExplicitQuantities(): Promise<void> {
  const pipeline = buildPipeline();
  const result = await pipeline.run(
    buildCaseRecord({
      rawDescription:
        "Need to replace 2 interior doors and repair 12 square meters of wall.",
      dimensions: {},
    }),
  );

  assert.equal(result.status, "review_pending");
  assert.equal(result.analysis.missingInputs.length, 0);
  assert.equal(
    result.analysis.workItems.find((item) => item.workType === "door_replacement")?.quantity,
    2,
  );
  assert.equal(
    result.analysis.workItems.find((item) => item.workType === "wall_repair")?.quantity,
    12,
  );
  assert.equal(
    result.analysis.detailedCostLines.some((line) => line.quantity === 2),
    true,
  );
  assert.equal(
    result.analysis.detailedCostLines.some((line) => line.quantity === 12),
    true,
  );
}

async function testPipelineUnderstandsCompactAreaShorthand(): Promise<void> {
  const pipeline = buildPipeline();
  const result = await pipeline.run(
    buildCaseRecord({
      rawDescription: "החלפת ריצוף 6x3, תיקוני צבע + פירוק סף דלת",
      dimensions: {},
    }),
  );

  const floorReplacement = result.analysis.workItems.find(
    (item) => item.workType === "floor_replacement",
  );

  assert.equal(result.status, "needs_clarification");
  assert.equal(
    result.analysis.missingInputs.includes("scope.geometry_quantity_relation"),
    true,
  );
  assert.equal(result.dimensions.length, 6);
  assert.equal(result.dimensions.width, 3);
  assert.equal(result.dimensions.lengthWidthInterpretation, "unknown");
  assert.equal(result.analysis.detectedGeometry[0]?.length, 6);
  assert.equal(result.analysis.detectedGeometry[0]?.width, 3);
  assert.equal(floorReplacement?.quantity, null);
  assert.equal(floorReplacement?.unit, "m2");
  assert.equal(
    result.analysis.workItems.some((item) => item.workType === "door_replacement"),
    false,
  );
}

async function testPipelineClarificationForUnitCount(): Promise<void> {
  const pipeline = buildPipeline();
  const result = await pipeline.run(
    buildCaseRecord({
      rawDescription: "Need to replace an interior door at the entrance.",
      dimensions: {},
    }),
  );

  assert.equal(result.status, "needs_clarification");
  assert.ok(result.analysis.missingInputs.includes("dimensions.units"));
  assert.equal(
    result.analysis.missingInputs.includes("dimensions.length_width"),
    false,
  );
  assert.equal(
    result.analysis.clarificationQuestions[0]?.fieldKey,
    "dimensions.units",
  );
}

async function testPipelineClarificationForGenericScope(): Promise<void> {
  const pipeline = buildPipeline();
  const result = await pipeline.run(
    buildCaseRecord({
      rawDescription: "Need help with the issue in the room.",
      dimensions: {},
    }),
  );

  assert.equal(result.status, "needs_clarification");
  assert.ok(
    result.analysis.workItems.some((item) => item.workType === "general_scope"),
  );
  assert.ok(
    result.analysis.missingInputs.includes("scope.primary_work_description"),
  );
  assert.equal(
    result.analysis.clarificationQuestions[0]?.fieldKey,
    "scope.primary_work_description",
  );
}

async function testPipelineTechnicalBlockersDoNotBecomeUserClarifications(): Promise<void> {
  const pipeline = buildPipelineWithMissingReferences();
  const result = await pipeline.run(
    buildCaseRecord({
      rawDescription: "Need to replace 2 interior doors at the entrance.",
      dimensions: {},
    }),
  );

  assert.equal(result.status, "review_pending");
  assert.ok(result.analysis.missingInputs.includes("template_definition"));
  assert.ok(result.analysis.missingInputs.includes("pricebook_items"));
  assert.ok(result.analysis.missingInputs.includes("mapping_rules"));
  assert.equal(result.analysis.clarificationQuestions.length, 0);
  assert.ok(
    result.analysis.warnings.some((warning) =>
      warning.includes("internal reference data"),
    ),
  );
  assert.equal(result.analysis.pipelineTrace.at(-1)?.stage, "clarification");
  assert.equal(result.analysis.pipelineTrace.at(-1)?.status, "blocked");
}

async function testPipelineSupportingEvidencePolicy(): Promise<void> {
  const pipeline = buildPipeline();
  const result = await pipeline.run(
    buildCaseRecord({
      rawDescription: "General handling around the work area.",
      dimensions: { units: 1 },
      supportingEvidence: [
        {
          evidenceId: "evidence-typed-1",
          sourceType: "typed",
          format: "inline_text",
          role: "supporting",
          label: "operator-note",
          content: "Door replacement at the main entrance is confirmed.",
          extractedText: null,
          normalizedContent: "door replacement at the main entrance is confirmed.",
          confidence: 1,
          reviewStatus: "accepted",
          usedInAnalysisFlag: true,
        },
        {
          evidenceId: "evidence-handwritten-1",
          sourceType: "handwritten",
          format: "image",
          role: "supporting",
          label: "field-note",
          content: "Wall repair may be needed near the opening.",
          extractedText: null,
          normalizedContent: "wall repair may be needed near the opening.",
          confidence: 0.35,
          reviewStatus: "needs_review",
          usedInAnalysisFlag: false,
        },
      ],
    }),
  );

  assert.equal(
    result.normalizedDescription.includes("door replacement at the main entrance is confirmed"),
    true,
  );
  assert.equal(
    result.normalizedDescription.includes("wall repair may be needed near the opening"),
    false,
  );
  assert.equal(
    result.analysis.assumptions.some((item) => item.includes("typed supporting evidence")),
    true,
  );
  assert.equal(
    result.analysis.warnings.some((item) => item.includes("Handwritten supporting evidence")),
    true,
  );
  assert.equal(
    result.analysis.pipelineTrace.find((event) => event.stage === "preprocessing")?.summary.includes(
      "accepted supporting evidence",
    ),
    true,
  );
}

async function testPipelineAcceptsPrecomputedAnalysisInputs(): Promise<void> {
  const pipeline = buildPipeline();
  const precomputedWorkItem: WorkItem = {
    workItemId: "external-acoustic-ceiling-1",
    caseId: "case-test-1",
    workType: "acoustic_ceiling_replacement",
    description: "Replace damaged acoustic ceiling panels",
    quantity: 12,
    unit: "m2",
    derivedFrom: "codex-material-consolidation",
    confidence: 0.92,
    hiddenWorkFlag: false,
    requiresClarification: false,
  };

  const result = await pipeline.run(
    buildCaseRecord({
      rawDescription: "General renovation scope.",
      dimensions: { areaSquareMeters: 12 },
    }),
    {
      precomputedWorkItems: [precomputedWorkItem],
      evidence: [
        {
          evidenceId: "external-evidence-1",
          sourceType: "typed",
          format: "inline_text",
          role: "supporting",
          content: "The inspected material confirms acoustic ceiling replacement.",
          extractedText: null,
          normalizedContent:
            "the inspected material confirms acoustic ceiling replacement.",
          confidence: 0.95,
          reviewStatus: "accepted",
          usedInAnalysisFlag: true,
        },
      ],
      assumptions: [
        "The 12 m2 quantity was consolidated from the inspected project materials.",
      ],
    },
  );

  assert.deepEqual(result.analysis.workItems, [precomputedWorkItem]);
  assert.equal(
    result.normalizedDescription.includes(
      "the inspected material confirms acoustic ceiling replacement",
    ),
    true,
  );
  assert.equal(
    result.analysis.assumptions.includes(
      "The 12 m2 quantity was consolidated from the inspected project materials.",
    ),
    true,
  );
  assert.equal(
    result.supportingEvidence.some(
      (item) => item.evidenceId === "external-evidence-1",
    ),
    true,
  );
}

function testFlexibleIntakeDerivesDescriptionFromPrimaryDocument(): void {
  const parsed = validateCaseCreateInput({
    title: "Document-first case",
    createdBy: "tester",
    templateId: DEFAULT_TEMPLATE_ID,
    pricebookId: DEFAULT_PRICEBOOK_ID,
    supportingEvidence: [
      {
        sourceType: "document",
        format: "pdf",
        role: "primary",
        fileName: "scope.pdf",
        extractedText:
          "Need to replace 2 interior doors and paint 12 square meters of wall.",
        label: "presentation-text",
      },
      {
        sourceType: "photo",
        format: "image",
        role: "visual_reference",
        fileName: "site-photo-1.jpg",
        content: "Photo of the work area and current condition.",
        label: "site-photo",
      },
    ],
  });

  assert.equal(
    parsed.description,
    "Need to replace 2 interior doors and paint 12 square meters of wall.",
  );
  assert.equal(parsed.supportingEvidence[0].sourceType, "document");
  assert.equal(parsed.supportingEvidence[0].role, "primary");
  assert.equal(parsed.supportingEvidence[1].sourceType, "photo");
  assert.equal(parsed.supportingEvidence[1].role, "visual_reference");
}

async function testPipelineUnderstandsSewerLineDescription(): Promise<void> {
  const pipeline = buildPipeline();
  const result = await pipeline.run(
    buildCaseRecord({
      rawDescription: "ביצוע החלפת קו ביוב 200 מטר, עומק 2 מטר, קוטר 160.",
      dimensions: {},
    }),
  );

  const sewerReplacement = result.analysis.workItems.find(
    (item) => item.workType === "sewer_line_replacement",
  );

  assert.equal(result.status, "review_pending");
  assert.equal(sewerReplacement?.quantity, 200);
  assert.equal(sewerReplacement?.unit, "m");
  assert.equal(
    sewerReplacement?.description.includes("diameter 160mm"),
    true,
  );
  assert.equal(
    result.analysis.workItems.some((item) => item.workType === "general_scope"),
    false,
  );
  assert.equal(result.analysis.candidateMatches.length, 0);
  assert.equal(result.reviewStatus, "required");
  assert.equal(result.finalStatus, "preliminary");
  assert.equal(
    result.analysis.warnings.some((item) =>
      item.includes("No pricebook candidate matches"),
    ),
    true,
  );
}

async function testPipelineContinuesWithEstimatedAreaForLinearSewerRestoration(): Promise<void> {
  const pipeline = buildPipeline();
  const result = await pipeline.run(
    buildCaseRecord({
      rawDescription:
        "החלפת קו ביוב באורך 24 מטר, כולל פירוק והחזרת ריצוף מקומית לאורך התוואי.",
      dimensions: {},
    }),
  );

  const floorReplacement = result.analysis.workItems.find(
    (item) => item.workType === "floor_replacement",
  );

  assert.equal(result.status, "review_pending");
  assert.equal(
    result.analysis.missingInputs.includes("dimensions.length_width"),
    false,
  );
  assert.equal(floorReplacement?.quantity, 24);
  assert.equal(floorReplacement?.unit, "m2");
  assert.equal(
    floorReplacement?.derivedFrom,
    "professional-linear-area-assumption",
  );
  assert.equal(floorReplacement?.requiresClarification, false);
  assert.equal(
    result.analysis.assumptions.some(
      (assumption) =>
        assumption.includes("1 m average restoration width") &&
        assumption.includes("24 m2"),
    ),
    true,
  );
}

async function testPipelineUsesLiveDekelFallbackForSewerLine(): Promise<void> {
  const pipeline = buildPipelineWithLiveDekelFallback();
  const result = await pipeline.run(
    buildCaseRecord({
      rawDescription: "ביצוע החלפת קו ביוב 200 מטר, עומק 2 מטר, קוטר 160.",
      dimensions: {},
    }),
  );

  assert.equal(result.status, "review_pending");
  assert.equal(result.analysis.candidateMatches.length >= 1, true);
  assert.equal(
    result.analysis.candidateMatches.some((match) => match.pricebookItemId === "dekel-sewer-1"),
    true,
  );
  assert.equal(
    result.analysis.warnings.some((warning) =>
      warning.includes("No pricebook candidate matches"),
    ),
    false,
  );
}

async function testDekelOpenXmlReader(): Promise<void> {
  const currentFilePath = fileURLToPath(import.meta.url);
  const fixtureRoot = path.join(
    path.dirname(currentFilePath),
    "fixtures",
    "dekel-openxml",
  );

  const rows = await readDekelRowsFromExtractedWorkbook(fixtureRoot);
  const billableRows = selectBillableDekelRows(rows);

  assert.equal(rows.length, 3);
  assert.equal(rows[0].sscItemCode, "95...");
  assert.equal(rows[0].activityNumber, null);
  assert.equal(rows[1].activityNumber, "5102061");
  assert.equal(rows[1].rate, 320);
  assert.equal(rows[2].longText, "הרכבה בלבד של ארון כיבוי אש");
  assert.equal(rows[2].baseUnit, "יח");
  assert.equal(rows[2].quantity, 1);

  assert.equal(billableRows.length, 2);
  assert.equal(billableRows[1].sscItemCode, "95.07.68.0002");
  assert.equal(billableRows[1].rate, 435);
}

async function testDekelPricebookAdapter(): Promise<void> {
  const currentFilePath = fileURLToPath(import.meta.url);
  const fixtureRoot = path.join(
    path.dirname(currentFilePath),
    "fixtures",
    "dekel-openxml",
  );

  const rows = await readDekelRowsFromExtractedWorkbook(fixtureRoot);
  const items = buildDekelPricebookItems(rows, {
    pricebookId: "dekel-live",
    workbookLabel: "fixture.xlsx",
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].pricebookId, "dekel-live");
  assert.equal(items[0].code, "95.07.68.0001");
  assert.equal(items[0].description, "פירוק ארון כיבוי אש");
  assert.equal(items[0].unit, "unit");
  assert.equal(items[0].unitPrice, 320);
  assert.equal(items[0].section, "95.07.68");
  assert.equal(items[0].subsection, "B95");
  assert.equal(items[0].metadataJson.dekel_activity_number, "5102061");
  assert.equal(items[0].metadataJson.dekel_chapter_code, "07");
  assert.equal(items[0].metadataJson.source_workbook, "fixture.xlsx");
  assert.ok(items[0].tagsJson.includes("ארון"));
}

function testDekelPricebookAdapterMapsMeterUnit(): void {
  const items = buildDekelPricebookItems(
    [
      {
        rowNumber: 2,
        serviceType: "B57",
        sscItemCode: "95.57.10.0001",
        longText: "החלפת קו ביוב קוטר 160",
        activityNumber: "5701001",
        quantity: 1,
        baseUnit: "מטר",
        rate: 33.9,
        rawCells: {},
      },
    ],
    {
      pricebookId: "dekel-live",
      workbookLabel: "fixture.xlsx",
    },
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].unit, "m");
  assert.equal(items[0].metadataJson.dekel_chapter_code, "57");
}

function testDekelRoutingHints(): void {
  const hints = inferDekelRoutingHints("עבודות סלילה ואספלט בכביש");

  assert.equal(hints.chapterHints.includes("40"), true);
  assert.equal(hints.mode, "chapter_preferred");
  assert.equal(inferDekelRoutingHints("נקיון יסודי לאחר שיפוץ").chapterHints.includes("69"), true);
  assert.equal(inferDekelRoutingHints("הכנת קירות וצביעה פנימית").chapterHints.includes("11"), true);
  assert.equal(inferDekelRoutingHints("ניקוז מי עיבוי למזגן").chapterHints.includes("07"), true);
  assert.equal(inferDekelRoutingHints("גופי תאורת LED כללית").chapterHints.includes("08"), true);
}

async function testDekelMatchingService(): Promise<void> {
  const currentFilePath = fileURLToPath(import.meta.url);
  const fixtureRoot = path.join(
    path.dirname(currentFilePath),
    "fixtures",
    "dekel-openxml",
  );

  const rows = await readDekelRowsFromExtractedWorkbook(fixtureRoot);
  const items = buildDekelPricebookItems(rows, {
    pricebookId: "dekel-live",
    workbookLabel: "fixture.xlsx",
  });
  const candidates = buildDekelCandidateMatches("פירוק ארון כיבוי אש", items, 2);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].code, "95.07.68.0001");
  assert.equal(candidates[0].score, 1);
  assert.equal(candidates[1].code, "95.07.68.0002");
  assert.ok(candidates[0].matchReason.includes("פירוק"));
}

function testDekelMatchingChapterPreference(): void {
  const items: PricebookItem[] = [
    {
      itemId: "road-40",
      pricebookId: "dekel-live",
      code: "40.01.0001",
      description: "עבודות סלילה ואספלט בכביש",
      normalizedDescription: "עבודות סלילה ואספלט בכביש",
      unit: "m2",
      unitPrice: 100,
      section: "40.01",
      subsection: "roads",
      tagsJson: ["סלילה", "אספלט", "כביש"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "40",
      },
    },
    {
      itemId: "road-51",
      pricebookId: "dekel-live",
      code: "51.01.0001",
      description: "עבודות סלילה ואספלט בשטח",
      normalizedDescription: "עבודות סלילה ואספלט בשטח",
      unit: "m2",
      unitPrice: 90,
      section: "51.01",
      subsection: "general",
      tagsJson: ["סלילה", "אספלט"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "51",
      },
    },
  ];

  const candidates = buildDekelCandidateMatches("עבודות סלילה ואספלט בכביש", items, 2);

  assert.equal(candidates[0].code, "40.01.0001");
  assert.ok(candidates[0].score > candidates[1].score);
  assert.ok(candidates[0].matchReason.includes("chapter"));
}

function testDekelMatchingDownweightsThresholdNoise(): void {
  const items: PricebookItem[] = [
    {
      itemId: "floor-01",
      pricebookId: "dekel-live",
      code: "51.01.0001",
      description: "החלפת ריצוף גרניט",
      normalizedDescription: "החלפת ריצוף גרניט",
      unit: "m2",
      unitPrice: 120,
      section: "51.01",
      subsection: "flooring",
      tagsJson: ["ריצוף", "גרניט"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "51",
      },
    },
    {
      itemId: "door-01",
      pricebookId: "dekel-live",
      code: "95.06.60.0012",
      description: "פירוק דלת עץ קיימת",
      normalizedDescription: "פירוק דלת עץ קיימת",
      unit: "unit",
      unitPrice: 370,
      section: "95.06",
      subsection: "doors",
      tagsJson: ["דלת", "פירוק"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "95",
      },
    },
  ];

  const candidates = buildDekelCandidateMatches(
    "החלפת ריצוף 6x3, תיקוני צבע + פירוק סף דלת",
    items,
    2,
  );

  assert.equal(candidates[0].code, "51.01.0001");
  assert.ok(candidates[0].score > candidates[1].score);
}

function testDekelMatchingUsesWorkItemAwareQueries(): void {
  const items: PricebookItem[] = [
    {
      itemId: "floor-01",
      pricebookId: "dekel-live",
      code: "51.01.0001",
      description: "החלפת ריצוף גרניט",
      normalizedDescription: "החלפת ריצוף גרניט",
      unit: "m2",
      unitPrice: 120,
      section: "51.01",
      subsection: "flooring",
      tagsJson: ["ריצוף", "גרניט"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "51",
      },
    },
    {
      itemId: "paint-01",
      pricebookId: "dekel-live",
      code: "95.06.60.0016",
      description: "תיקוני צבע לקיר קיים",
      normalizedDescription: "תיקוני צבע לקיר קיים",
      unit: "m2",
      unitPrice: 470,
      section: "95.06",
      subsection: "paint",
      tagsJson: ["צבע", "קיר"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "95",
      },
    },
    {
      itemId: "door-01",
      pricebookId: "dekel-live",
      code: "95.06.60.0012",
      description: "פירוק דלת עץ קיימת",
      normalizedDescription: "פירוק דלת עץ קיימת",
      unit: "unit",
      unitPrice: 370,
      section: "95.06",
      subsection: "doors",
      tagsJson: ["דלת", "פירוק"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "95",
      },
    },
  ];
  const workItems: WorkItem[] = [
    {
      workItemId: "work-floor-1",
      caseId: "case-compact-1",
      workType: "floor_replacement",
      description: "Floor replacement",
      quantity: 18,
      unit: "m2",
      derivedFrom: "user-description",
      confidence: 0.94,
      hiddenWorkFlag: false,
      requiresClarification: false,
    },
    {
      workItemId: "work-wall-1",
      caseId: "case-compact-1",
      workType: "wall_repair",
      description: "Local wall repair",
      quantity: 18,
      unit: "m2",
      derivedFrom: "user-description",
      confidence: 0.88,
      hiddenWorkFlag: false,
      requiresClarification: false,
    },
  ];

  const candidates = buildDekelCandidateMatchesForCase(
    {
      description: "החלפת ריצוף 6x3, תיקוני צבע + פירוק סף דלת",
      workItems,
    },
    items,
    3,
  );

  const topCandidateCodes = candidates.map((candidate) => candidate.code);

  assert.equal(topCandidateCodes.includes("51.01.0001"), true);
  assert.equal(topCandidateCodes.includes("95.06.60.0016"), true);
  assert.equal(topCandidateCodes[0] === "95.06.60.0012", false);
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.code === "51.01.0001" &&
        candidate.matchReason.includes("work_item:floor_replacement"),
    ),
  );
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.code === "95.06.60.0016" &&
        candidate.matchReason.includes("work_item:wall_repair"),
    ),
  );
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.code === "51.01.0001" &&
        candidate.matchReason.includes("preferred chapters"),
    ),
  );
}

function testDekelMatchingChapterPrefilterBoostsPreferredChapter(): void {
  const items: PricebookItem[] = [
    {
      itemId: "floor-noisy-02",
      pricebookId: "dekel-live",
      code: "95.02.60.0030",
      description: "הריסת קיר לרבות תיקוני ריצוף וטיח",
      normalizedDescription: "הריסת קיר לרבות תיקוני ריצוף וטיח",
      unit: "m2",
      unitPrice: 250,
      section: "95.02",
      subsection: "demolition",
      tagsJson: ["ריצוף", "טיח"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "02",
      },
    },
    {
      itemId: "floor-good-10",
      pricebookId: "dekel-live",
      code: "95.10.10.0001",
      description: "ריצוף גרניט פורצלן חדש",
      normalizedDescription: "ריצוף גרניט פורצלן חדש",
      unit: "m2",
      unitPrice: 320,
      section: "95.10",
      subsection: "flooring",
      tagsJson: ["ריצוף", "גרניט"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "10",
      },
    },
  ];
  const workItems: WorkItem[] = [
    {
      workItemId: "work-floor-10",
      caseId: "case-floor-10",
      workType: "floor_replacement",
      description: "Floor replacement",
      quantity: 18,
      unit: "m2",
      derivedFrom: "user-description",
      confidence: 0.94,
      hiddenWorkFlag: false,
      requiresClarification: false,
    },
  ];

  const candidates = buildDekelCandidateMatchesForCase(
    {
      description: "החלפת ריצוף 6x3",
      workItems,
    },
    items,
    2,
  );

  assert.equal(candidates[0].code, "95.10.10.0001");
  assert.ok(candidates[0].matchReason.includes("route source: chapter_prefilter"));
}

function testDekelMatchingPrefersPipeInstallationOverExcavationForSewerReplacement(): void {
  const items: PricebookItem[] = [
    {
      itemId: "sewer-excavation-160",
      pricebookId: "dekel-live",
      code: "95.57.60.0011",
      description:
        "חפירה בקרקע לגילוי צינור קו מים או ביוב קיים קוטר 160 מ\"מ ובעומק מעל 1.75 מ' ועד 2.25 מ', לרבות חשיפת הצינור מכל צדדיו והחזרת האדמה החפורה לאחר תיקון או פירוק הקו, לא כולל תיקון ופירוק הקו",
      normalizedDescription:
        "חפירה בקרקע לגילוי צינור קו מים או ביוב קיים קוטר 160 מ\"מ ובעומק מעל 1.75 מ' ועד 2.25 מ', לרבות חשיפת הצינור מכל צדדיו והחזרת האדמה החפורה לאחר תיקון או פירוק הקו, לא כולל תיקון ופירוק הקו",
      unit: "m",
      unitPrice: 92,
      section: "95.57.60",
      subsection: "excavation",
      tagsJson: ["ביוב", "צינור", "חפירה", "קוטר", "160"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "57",
      },
    },
    {
      itemId: "sewer-pipe-160",
      pricebookId: "dekel-live",
      code: "95.57.30.0031",
      description:
        "צינורות P.V.C לביוב, קוטר 160 מ\"מ, מונחים בקרקע בעומק מעל 1.75 מ' ועד 2.25 מ', לרבות עבודות חפירה, עטיפת חול ומילוי חוזר",
      normalizedDescription:
        "צינורות p.v.c לביוב, קוטר 160 מ\"מ, מונחים בקרקע בעומק מעל 1.75 מ' ועד 2.25 מ', לרבות עבודות חפירה, עטיפת חול ומילוי חוזר",
      unit: "m",
      unitPrice: 202,
      section: "95.57.30",
      subsection: "pipes",
      tagsJson: ["ביוב", "צינורות", "קוטר", "160", "pvc"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "57",
      },
    },
    {
      itemId: "sewer-material-160",
      pricebookId: "dekel-live",
      code: "95.57.71.0182",
      description:
        "חומר בלבד: צינורות ביוב ותיעול P.V.C קוטר 160 מ\"מ (מסופק באורך 3 מ' ליחידה)",
      normalizedDescription:
        "חומר בלבד: צינורות ביוב ותיעול p.v.c קוטר 160 מ\"מ (מסופק באורך 3 מ' ליחידה)",
      unit: "m",
      unitPrice: 61.8,
      section: "95.57.71",
      subsection: "material",
      tagsJson: ["ביוב", "צינורות", "קוטר", "160", "pvc"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "57",
      },
    },
    {
      itemId: "sewer-demolition-160",
      pricebookId: "dekel-live",
      code: "95.57.64.0021",
      description:
        "פירוק קו ביוב קיים מצינורות פלסטיים קוטר 160-250 מ\"מ ובעומק עד 1.75 מ' לרבות חיתוך הצינור, לא כולל ניתוק קווי מים וחפירה",
      normalizedDescription:
        "פירוק קו ביוב קיים מצינורות פלסטיים קוטר 160-250 מ\"מ ובעומק עד 1.75 מ' לרבות חיתוך הצינור, לא כולל ניתוק קווי מים וחפירה",
      unit: "m",
      unitPrice: 115,
      section: "95.57.64",
      subsection: "demolition",
      tagsJson: ["ביוב", "פירוק", "קו", "קוטר", "160"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "57",
      },
    },
  ];
  const workItems: WorkItem[] = [
    {
      workItemId: "work-sewer-1",
      caseId: "case-sewer-1",
      workType: "sewer_line_replacement",
      description: "Sewer line replacement (depth 2m, diameter 160mm)",
      quantity: 200,
      unit: "m",
      derivedFrom: "user-description",
      confidence: 0.96,
      hiddenWorkFlag: false,
      requiresClarification: false,
    },
    {
      workItemId: "work-trench-1",
      caseId: "case-sewer-1",
      workType: "trench_excavation",
      description: "Trench excavation for sewer line (depth 2m, diameter 160mm)",
      quantity: 200,
      unit: "m",
      derivedFrom: "hidden-work-rule",
      confidence: 0.82,
      hiddenWorkFlag: true,
      requiresClarification: false,
    },
  ];

  const candidates = buildDekelCandidateMatchesForCase(
    {
      description: "ביצוע החלפת קו ביוב 200 מטר, עומק 2 מטר, קוטר 160.",
      workItems,
    },
    items,
    3,
  );

  assert.equal(candidates[0].code, "95.57.30.0031");
  assert.equal(candidates[0].score > candidates[1].score, true);
  assert.ok(candidates[0].matchReason.includes("work_item:sewer_line_replacement"));
}

function testDekelMatchingKeepsPipeCandidateInsideExpandedIntermediatePool(): void {
  const demolitionItems: PricebookItem[] = Array.from({ length: 40 }, (_, index) => ({
    itemId: `sewer-noise-${index + 1}`,
    pricebookId: "dekel-live",
    code: `95.57.64.${String(index + 1).padStart(4, "0")}`,
    description:
      `פירוק קו ביוב קיים מצינורות פלסטיים קוטר 160-250 מ\"מ ובעומק עד 1.75 מ' לרבות חיתוך הצינור, לא כולל ניתוק קווי מים וחפירה ${index + 1}`,
    normalizedDescription:
      `פירוק קו ביוב קיים מצינורות פלסטיים קוטר 160-250 מ\"מ ובעומק עד 1.75 מ' לרבות חיתוך הצינור, לא כולל ניתוק קווי מים וחפירה ${index + 1}`,
    unit: "m",
    unitPrice: 36 + index,
    section: "95.57.64",
    subsection: "demolition",
    tagsJson: ["ביוב", "פירוק", "קו", "צינורות", "160"],
    synonymsJson: [],
    activeFlag: true,
    metadataJson: {
      dekel_chapter_code: "57",
    },
  }));
  const items: PricebookItem[] = [
    ...demolitionItems,
    {
      itemId: "sewer-pipe-best",
      pricebookId: "dekel-live",
      code: "95.57.30.0043",
      description:
        "צינורות P.V.C לביוב מסוג \"מרים\" דרג 10 או ש\"ע, קוטר הצינור 160 מ\"מ, מונחים בקרקע בעומק מעל 1.75 מ' ועד 2.25 מ', לרבות עבודות חפירה, עטיפת חול ומילוי חוזר",
      normalizedDescription:
        "צינורות p.v.c לביוב מסוג \"מרים\" דרג 10 או ש\"ע, קוטר הצינור 160 מ\"מ, מונחים בקרקע בעומק מעל 1.75 מ' ועד 2.25 מ', לרבות עבודות חפירה, עטיפת חול ומילוי חוזר",
      unit: "m",
      unitPrice: 222,
      section: "95.57.30",
      subsection: "pipes",
      tagsJson: ["ביוב", "צינורות", "קוטר", "160", "pvc"],
      synonymsJson: [],
      activeFlag: true,
      metadataJson: {
        dekel_chapter_code: "57",
      },
    },
  ];
  const workItems: WorkItem[] = [
    {
      workItemId: "work-sewer-1",
      caseId: "case-sewer-pool-1",
      workType: "sewer_line_replacement",
      description: "Sewer line replacement (depth 2m, diameter 160mm)",
      quantity: 200,
      unit: "m",
      derivedFrom: "user-description",
      confidence: 0.96,
      hiddenWorkFlag: false,
      requiresClarification: false,
    },
  ];

  const candidates = buildDekelCandidateMatchesForCase(
    {
      description: "ביצוע החלפת קו ביוב 200 מטר, עומק 2 מטר, קוטר 160.",
      workItems,
    },
    items,
    3,
  );

  assert.equal(candidates[0].code, "95.57.30.0043");
  assert.equal(candidates.some((candidate) => candidate.code === "95.57.30.0043"), true);
}

function testDekelLargeCatalogIndexPreservesFullSearchResults(): void {
  const item = (index: number, description: string): PricebookItem => ({
    itemId: `index-item-${index}`,
    pricebookId: "dekel-live",
    code: index === 1 ? "95.1" : `99.${index}`,
    description,
    normalizedDescription: description,
    unit: "unit",
    unitPrice: index,
    section: "95",
    subsection: "test",
    tagsJson: [],
    synonymsJson: [],
    activeFlag: true,
    metadataJson: { dekel_chapter_code: "95" },
  });
  const target = item(1, "תיקון ניקוי");
  const noise = Array.from({ length: 499 }, (_, index) => item(index + 2, `עבודה זרה מספר ${index + 2}`));
  const belowThreshold = buildDekelCandidateMatches("תיקון ניקיון", [target, ...noise.slice(0, 498)], 5).map((candidate) => candidate.code);
  const indexed = buildDekelCandidateMatches("תיקון ניקיון", [target, ...noise], 5).map((candidate) => candidate.code);
  assert.deepEqual(indexed, belowThreshold);
  assert.ok(indexed.includes("95.1"));
}

function testDekelMatchingRejectsSemanticallyWrongConstructionItems(): void {
  const item = (
    code: string,
    description: string,
    unit: string,
    chapterCode: string,
  ): PricebookItem => ({
    itemId: code,
    pricebookId: "dekel-live",
    code,
    description,
    normalizedDescription: description,
    unit,
    unitPrice: 100,
    section: code.slice(0, 8),
    subsection: "acceptance",
    tagsJson: [],
    synonymsJson: [],
    activeFlag: true,
    metadataJson: { dekel_chapter_code: chapterCode },
  });
  const items = [
    item(
      "95.24.20.0025",
      "גידור ושילוט אתר לעבודות אסבסט על פי נוהלי המשרד להגנת הסביבה",
      "קומ",
      "24",
    ),
    item(
      "95.00.10.0001",
      "התארגנות באתר, גידור בטיחות זמני ושילוט אזהרה",
      "קומ",
      "00",
    ),
    item(
      "95.08.57.0057",
      "מבנה לוח מתח גבוה מודולארי 630A KV24 עם מפסק בגז SF6",
      "unit",
      "08",
    ),
    item(
      "95.08.60.0100",
      "בדיקה ושיקום לוח חשמל מתח נמוך קיים לרבות הגנות וסימון מעגלים",
      "קומ",
      "08",
    ),
    item(
      "95.08.42.0356",
      "התקנה וחיבור גוף תאורה על עמוד תאורה עירוני בגובה מעל 5 מטר",
      "unit",
      "08",
    ),
    item(
      "95.08.42.0100",
      "גוף תאורה מוגן לאולם ספורט להתקנה פנימית כולל חיבור",
      "unit",
      "08",
    ),
    item(
      "95.15.50.0021",
      "מנדף בישול למטבח הכולל גופי תאורה שקועים מוגנים מסוג לד",
      "קומ",
      "15",
    ),
    item(
      "95.69.12.0007",
      "שרות אחזקה שנתי למערכת מיזוג אוויר ללא חלקים",
      "קומ",
      "69",
    ),
    item(
      "95.15.10.0100",
      "אספקה והתקנת יחידת מיזוג אוויר מפוצלת לרבות הפעלה",
      "unit",
      "15",
    ),
    item(
      "95.69.06.0005",
      "איסוף פסולת מפוזרת באתר למכולה, לא כולל שכירות, הובלה ופינוי של המכולה",
      "unit",
      "69",
    ),
  ];

  const siteSafety = buildDekelCandidateMatches(
    "התארגנות באתר, אמצעי הגנה, שילוט וגידור נקודתי",
    items,
    5,
  );
  assert.equal(siteSafety[0]?.code, "95.00.10.0001");
  assert.equal(siteSafety.some((candidate) => candidate.code === "95.24.20.0025"), false);

  const electricalBoard = buildDekelCandidateMatches(
    "בדיקה, התאמה ושיקום של לוח החשמל הקיים, לרבות הגנות וסימון מעגלים",
    items,
    5,
  );
  assert.equal(electricalBoard[0]?.code, "95.08.60.0100");
  assert.equal(electricalBoard.some((candidate) => candidate.code === "95.08.57.0057"), false);

  const indoorLighting = buildDekelCandidateMatches(
    "גופי תאורה מוגנים המתאימים לשימוש באולם ספורט, כולל התקנה וחיבור",
    items,
    5,
  );
  assert.equal(indoorLighting[0]?.code, "95.08.42.0100");
  assert.equal(indoorLighting.some((candidate) => candidate.code === "95.08.42.0356"), false);
  assert.equal(indoorLighting.some((candidate) => candidate.code === "95.15.50.0021"), false);
  assert.equal(
    inferDekelRoutingHints("גופי תאורה מוגנים לאולם ספורט").chapterHints.includes("08"),
    true,
  );

  const airConditioning = buildDekelCandidateMatches(
    "אספקה והתקנת יחידות מיזוג אוויר מסחריות או מפוצלות",
    items,
    5,
  );
  assert.equal(airConditioning[0]?.code, "95.15.10.0100");
  assert.equal(airConditioning.some((candidate) => candidate.code === "95.69.12.0007"), false);

  const wasteHauling = buildDekelCandidateMatches(
    "העמסה, הובלה ופינוי פסולת לאתר מורשה",
    items,
    5,
  );
  assert.equal(wasteHauling.some((candidate) => candidate.code === "95.69.06.0005"), false);

  const noSemanticMatch = buildDekelCandidateMatches(
    "תיק מסירה הכולל תכניות עדות, תוצאות בדיקות והוראות הפעלה",
    [
      item(
        "95.15.60.0129",
        "החלפת מדחס במערכת מיזוג לרבות הפעלה והרצה",
        "unit",
        "15",
      ),
    ],
    5,
  );
  assert.deepEqual(noSemanticMatch, []);
}

function testDekelSearchQueryPlanPrefersPrimaryWorkItemsOverHiddenWork(): void {
  const queryPlan = buildDekelSearchQueryPlan({
    description: "החלפת ריצוף 6x3, תיקוני צבע + פירוק סף דלת",
    workItems: [
      {
        workItemId: "work-floor-1",
        caseId: "case-compact-1",
        workType: "floor_replacement",
        description: "Floor replacement",
        quantity: 18,
        unit: "m2",
        derivedFrom: "user-description",
        confidence: 0.94,
        hiddenWorkFlag: false,
        requiresClarification: false,
      },
      {
        workItemId: "work-surface-1",
        caseId: "case-compact-1",
        workType: "surface_preparation",
        description: "Surface preparation",
        quantity: 18,
        unit: "m2",
        derivedFrom: "hidden-work-rule",
        confidence: 0.78,
        hiddenWorkFlag: true,
        requiresClarification: false,
      },
    ],
  });

  assert.equal(queryPlan.some((item) => item.label === "work_item:floor_replacement"), true);
  assert.equal(queryPlan.some((item) => item.label === "work_item:surface_preparation"), false);
  assert.equal(queryPlan.find((item) => item.label === "raw_description")?.weight, 0.45);
  assert.equal(
    queryPlan.find((item) => item.label === "work_item:floor_replacement")
      ?.preferredChapterCodes.includes("10"),
    true,
  );
  assert.equal(
    queryPlan.find((item) => item.label === "work_item:floor_replacement")
      ?.preferredUnits.includes("m2"),
    true,
  );
}

async function testCaseEstimatePreviewFromDekelCandidates(): Promise<void> {
  const currentFilePath = fileURLToPath(import.meta.url);
  const fixtureRoot = path.join(
    path.dirname(currentFilePath),
    "fixtures",
    "dekel-openxml",
  );

  const rows = await readDekelRowsFromExtractedWorkbook(fixtureRoot);
  const items = buildDekelPricebookItems(rows, {
    pricebookId: "dekel-live",
    workbookLabel: "fixture.xlsx",
  });
  const candidates = buildDekelCandidateMatches("פירוק ארון כיבוי אש", items, 2);
  const estimatePreview = buildCaseEstimatePreviewFromDekelCandidates(candidates, {
    managementFeePercent: 14,
  });

  assert.equal(estimatePreview.lines.length, 2);
  assert.equal(estimatePreview.lines[0].description, "פירוק ארון כיבוי אש");
  assert.equal(estimatePreview.lines[0].amount, 320);
  assert.equal(estimatePreview.executionSubtotal, 755);
  assert.equal(estimatePreview.managementFeeAmount, 105.7);
  assert.equal(estimatePreview.totalProjectCost, 860.7);
}

function testCaseEstimatePreviewFromDekelCandidatesUsesLinearQuantity(): void {
  const estimatePreview = buildCaseEstimatePreviewFromDekelCandidates(
    [
      {
        code: "95.07.66.0004",
        description: "החלפת קו ביוב קוטר 160",
        unit: "מטר",
        unitPrice: 33.9,
        score: 0.4,
        matchReason: "Shared tokens: קו, ביוב, קוטר, 160",
        metadataJson: {},
      },
    ],
    {
      managementFeePercent: 14,
      queryText: "ביצוע החלפת קו ביוב 200 מטר, עומק 2 מטר, קוטר 160.",
    },
  );

  assert.equal(estimatePreview.lines.length, 1);
  assert.equal(estimatePreview.lines[0].quantity, 200);
  assert.equal(estimatePreview.lines[0].amount, 6780);
  assert.equal(estimatePreview.totalProjectCost, 7729.2);
}

function testCaseEstimatePreviewDoesNotConvertGeometryIntoAreaWithoutConfirmation(): void {
  const estimatePreview = buildCaseEstimatePreviewFromDekelCandidates(
    [
      {
        code: "95.10.10.0001",
        description: "Floor replacement",
        unit: "m2",
        unitPrice: 320,
        score: 0.42,
        matchReason: "floor candidate",
        metadataJson: {},
      },
    ],
    {
      managementFeePercent: 14,
      queryText: "החלפת ריצוף 6x3",
      dimensions: {
        length: 6,
        width: 3,
        lengthWidthInterpretation: "unknown",
      },
    },
  );

  assert.equal(estimatePreview.lines[0].quantity, 1);
}

function testCaseEstimatePreviewBalancesSewerFamilies(): void {
  const estimatePreview = buildCaseEstimatePreviewFromDekelCandidates(
    [
      {
        code: "95.57.30.0031",
        description: "Install sewer pipe diameter 160 at depth 2.0 with backfill and sand wrapping",
        unit: "m",
        unitPrice: 33.9,
        score: 0.95,
        matchReason: "pipe installation candidate",
        metadataJson: {},
      },
      {
        code: "95.57.30.0043",
        description: "Install sewer pipe diameter 160 at depth 2.2 with backfill and sand wrapping",
        unit: "m",
        unitPrice: 34.1,
        score: 0.94,
        matchReason: "pipe installation candidate",
        metadataJson: {},
      },
      {
        code: "95.57.40.0001",
        description: "Connection to existing sewer manhole",
        unit: "unit",
        unitPrice: 1200,
        score: 0.82,
        matchReason: "connection candidate",
        metadataJson: {},
      },
      {
        code: "95.57.20.0001",
        description: "Demolition of existing sewer line",
        unit: "m",
        unitPrice: 12.5,
        score: 0.79,
        matchReason: "demolition candidate",
        metadataJson: {},
      },
      {
        code: "95.57.10.0002",
        description: "Trench excavation for sewer line",
        unit: "m",
        unitPrice: 18.5,
        score: 0.77,
        matchReason: "excavation candidate",
        metadataJson: {},
      },
    ],
    {
      managementFeePercent: 14,
      maxLines: 3,
      queryText: "ביצוע החלפת קו ביוב 200 מטר, עומק 2 מטר, קוטר 160.",
    },
  );

  assert.deepEqual(
    estimatePreview.lines.map((line) => line.sourceCode),
    ["95.57.30.0031"],
  );
  assert.equal(estimatePreview.lines[0].quantity, 200);
  assert.equal(
    estimatePreview.lines.some((line) => line.sourceCode === "95.57.30.0043"),
    false,
  );
  assert.equal(
    estimatePreview.lines.some((line) => line.sourceCode === "95.57.40.0001"),
    false,
  );
}

function testCaseEstimatePreviewBalancesSewerFamiliesWhenCandidateCountEqualsLimit(): void {
  const estimatePreview = buildCaseEstimatePreviewFromDekelCandidates(
    [
      {
        code: "95.57.64.0021",
        description: "Demolition of existing sewer line",
        unit: "m",
        unitPrice: 36,
        score: 0.693,
        matchReason: "demolition candidate",
        metadataJson: {},
      },
      {
        code: "95.57.30.0031",
        description: "Install sewer pipe diameter 160 depth 2.0 with backfill and sand wrapping",
        unit: "m",
        unitPrice: 202,
        score: 0.842,
        matchReason: "pipe installation candidate",
        metadataJson: {},
      },
      {
        code: "95.57.30.0043",
        description: "Install sewer pipe diameter 160 depth 2.2 with backfill and sand wrapping",
        unit: "m",
        unitPrice: 222,
        score: 0.842,
        matchReason: "pipe installation candidate",
        metadataJson: {},
      },
      {
        code: "95.57.30.0029",
        description: "Install sewer pipe diameter 160 depth 1.2 with backfill and sand wrapping",
        unit: "m",
        unitPrice: 176,
        score: 0.762,
        matchReason: "pipe installation candidate",
        metadataJson: {},
      },
      {
        code: "95.57.30.0041",
        description: "Install sewer pipe diameter 160 depth 1.2 alternative with backfill and sand wrapping",
        unit: "m",
        unitPrice: 196,
        score: 0.762,
        matchReason: "pipe installation candidate",
        metadataJson: {},
      },
    ],
    {
      managementFeePercent: 14,
      maxLines: 5,
      queryText: "ביצוע החלפת קו ביוב 200 מטר, עומק 2 מטר, קוטר 160.",
    },
  );

  assert.deepEqual(
    estimatePreview.lines.map((line) => line.sourceCode),
    ["95.57.30.0031"],
  );
}

function testCaseEstimatePreviewIncludesConnectionOnlyWhenExplicitlyRequested(): void {
  const estimatePreview = buildCaseEstimatePreviewFromDekelCandidates(
    [
      {
        code: "95.57.30.0031",
        description: "Install sewer pipe diameter 160 at depth 2.0 with backfill and sand wrapping",
        unit: "m",
        unitPrice: 202,
        score: 0.95,
        matchReason: "pipe installation candidate",
        metadataJson: {},
      },
      {
        code: "95.57.40.0001",
        description: "Connection to existing sewer manhole",
        unit: "unit",
        unitPrice: 1200,
        score: 0.83,
        matchReason: "connection candidate",
        metadataJson: {},
      },
      {
        code: "95.57.20.0001",
        description: "Demolition of existing sewer line",
        unit: "m",
        unitPrice: 12.5,
        score: 0.79,
        matchReason: "demolition candidate",
        metadataJson: {},
      },
    ],
    {
      managementFeePercent: 14,
      maxLines: 3,
      queryText:
        "ביצוע החלפת קו ביוב 200 מטר, כולל חיבור לתא ביקורת קיים, עומק 2 מטר, קוטר 160.",
    },
  );

  assert.deepEqual(
    estimatePreview.lines.map((line) => line.sourceCode),
    ["95.57.30.0031", "95.57.40.0001"],
  );
}

function testCaseEstimatePreviewKeepsNonSewerOrderWithMaxLines(): void {
  const estimatePreview = buildCaseEstimatePreviewFromDekelCandidates(
    [
      {
        code: "10.01.01.0001",
        description: "Floor replacement in damaged room",
        unit: "m2",
        unitPrice: 110,
        score: 0.88,
        matchReason: "flooring candidate",
        metadataJson: {},
      },
      {
        code: "10.01.01.0002",
        description: "Wall paint touch-up",
        unit: "m2",
        unitPrice: 28,
        score: 0.71,
        matchReason: "paint candidate",
        metadataJson: {},
      },
      {
        code: "10.01.01.0003",
        description: "Threshold repair",
        unit: "unit",
        unitPrice: 65,
        score: 0.69,
        matchReason: "threshold candidate",
        metadataJson: {},
      },
    ],
    {
      managementFeePercent: 14,
      maxLines: 2,
      queryText: "Need floor replacement and wall paint touch-up in the damaged room.",
    },
  );

  assert.deepEqual(
    estimatePreview.lines.map((line) => line.sourceCode),
    ["10.01.01.0001", "10.01.01.0002"],
  );
}

function testAutoConfirmSelectionLinesPreferEstimatePreview(): void {
  const selectedLines = buildAutoConfirmSelectionLines({
    estimatePreviewBody: {
      lines: [
        {
          sourceCode: "95.57.30.0031",
          quantity: 200,
        },
        {
          sourceCode: "95.57.64.0021",
          quantity: 200,
        },
      ],
    },
    candidatesBody: {
      candidates: [
        {
          code: "95.57.30.0031",
          unit: "m",
        },
        {
          code: "95.57.30.0043",
          unit: "m",
        },
      ],
    },
    autoConfirmTop: 2,
    description: "ביצוע החלפת קו ביוב 200 מטר, עומק 2 מטר, קוטר 160.",
  });

  assert.deepEqual(selectedLines, [
    {
      code: "95.57.30.0031",
      quantity: 200,
    },
    {
      code: "95.57.64.0021",
      quantity: 200,
    },
  ]);
}

function testAutoConfirmSelectionLinesFallbackToCandidates(): void {
  const selectedLines = buildAutoConfirmSelectionLines({
    estimatePreviewBody: {},
    candidatesBody: {
      candidates: [
        {
          code: "95.07.66.0004",
          unit: "m",
        },
      ],
    },
    autoConfirmTop: 1,
    description: "ביצוע החלפת קו ביוב 200 מטר, עומק 2 מטר, קוטר 160.",
  });

  assert.deepEqual(selectedLines, [
    {
      code: "95.07.66.0004",
      quantity: 200,
    },
  ]);
}

function testCaseEstimatePreviewFromSelectedDekelLines(): void {
  const estimatePreview = buildCaseEstimatePreviewFromSelectedDekelLines(
    [
      {
        selectionId: "sel-1",
        code: "95.07.68.0002",
        description: "הרכבה בלבד של ארון כיבוי אש",
        quantity: 2,
        unit: "unit",
        unitPrice: 435,
        sourceActivityNumber: "5102062",
        sourceChapterCode: "07",
        selectedAt: "2026-04-13T10:00:00.000Z",
        selectedBy: "tester",
        responsibleSkill: "backend-dev-guidelines",
      },
      {
        selectionId: "sel-2",
        code: "95.07.68.0001",
        description: "פירוק ארון כיבוי אש",
        quantity: 1,
        unit: "unit",
        unitPrice: 320,
        sourceActivityNumber: "5102061",
        sourceChapterCode: "07",
        selectedAt: "2026-04-13T10:00:00.000Z",
        selectedBy: "tester",
        responsibleSkill: "backend-dev-guidelines",
      },
    ],
    {
      managementFeePercent: 14,
    },
  );

  assert.equal(estimatePreview.lines.length, 2);
  assert.equal(estimatePreview.lines[0].sourceCode, "95.07.68.0002");
  assert.equal(estimatePreview.lines[0].quantity, 2);
  assert.equal(estimatePreview.lines[0].amount, 870);
  assert.equal(estimatePreview.executionSubtotal, 1190);
  assert.equal(estimatePreview.managementFeeAmount, 166.6);
  assert.equal(estimatePreview.totalProjectCost, 1356.6);
}

async function testDekelEstimatePreview(): Promise<void> {
  const currentFilePath = fileURLToPath(import.meta.url);
  const fixtureRoot = path.join(
    path.dirname(currentFilePath),
    "fixtures",
    "dekel-openxml",
  );

  const rows = await readDekelRowsFromExtractedWorkbook(fixtureRoot);
  const preview = buildDekelEstimatePreview(rows, {
    limit: 2,
    managementFeePercent: 14,
  });

  assert.equal(preview.lines.length, 2);
  assert.equal(preview.lines[0].description, "פירוק ארון כיבוי אש");
  assert.equal(preview.lines[0].amount, 320);
  assert.equal(preview.lines[1].amount, 435);
  assert.equal(preview.executionSubtotal, 755);
  assert.equal(preview.managementFeeAmount, 105.7);
  assert.equal(preview.totalProjectCost, 860.7);
}

async function testMavnadimCatalogService(): Promise<void> {
  const service = new MavnadimCatalogService();
  const preview = await service.getCatalogPreview(3);
  const allItems = await service.getAllCatalogItems();
  const residentialMap = allItems.find(
    (item) => item.catalogItemId === "mavnadim-residential-map-3x6",
  );
  const sanitationDoubleCell = allItems.find(
    (item) => item.catalogItemId === "mavnadim-sanitation-double-cell-2x3",
  );

  assert.equal(preview.length, 3);
  assert.equal(preview[0].displayName, 'מבנ"ד 3/6 - מגורים חד חדר');
  assert.equal(preview[0].basePrice, 80000);
  assert.equal(preview[1].displayName, 'מבנ"ד 3/6 - מגורים דו חדר');
  assert.ok(preview[2].includedFeatures.length >= 2);
  assert.equal(residentialMap?.displayName, 'מבנד3\\6 - מגורים מ"פ');
  assert.equal(
    sanitationDoubleCell?.displayName,
    'מבנד2\\3 שו"מ דו תאי \\מקלחת דו תאי\\ שירותים דו תאי',
  );
}

async function testMavnadimMatching(): Promise<void> {
  const service = new MavnadimCatalogService();
  const items = await service.getAllCatalogItems();
  const candidates = buildMavnadimCandidateMatches(
    "צריך מבנה שירותים עם 6 תאים למחנה",
    items,
    3,
  );

  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].catalogItemId, "mavnadim-sanitation-six-cell-3x6");
  assert.equal(candidates[0].basePrice, 95000);
  assert.ok(candidates[0].matchReason.includes("Shared tokens"));
}

async function testMavnadimMatchingUsesDimensionBoostForPair(): Promise<void> {
  const service = new MavnadimCatalogService();
  const items = await service.getAllCatalogItems();
  const candidates = buildMavnadimCandidateMatches(
    "sanitation structure for site placement",
    items,
    3,
    {
      dimensions: {
        length: 2,
        width: 3,
        lengthWidthInterpretation: "unknown",
      },
    },
  );

  assert.equal(candidates[0].catalogItemId, "mavnadim-sanitation-double-cell-2x3");
  assert.ok(candidates[0].matchReason.includes("dimension boost"));
}

async function testMavnadimMatchingUsesDimensionBoostForAreaLabel(): Promise<void> {
  const service = new MavnadimCatalogService();
  const items = await service.getAllCatalogItems();
  const candidates = buildMavnadimCandidateMatches(
    "sanitation structure for temporary site use",
    items,
    3,
    {
      dimensions: {
        areaSquareMeters: 12,
      },
    },
  );

  assert.equal(candidates[0].catalogItemId, "mavnadim-sanitation-12sqm");
  assert.ok(candidates[0].matchReason.includes("dimension boost"));
}

async function testMavnadimAncillaryRecommendations(): Promise<void> {
  const service = new MavnadimCatalogService();
  const items = await service.getAllCatalogItems();
  const candidate = buildMavnadimCandidateMatches(
    "צריך להציב מכולת בית קפה עם חיבור חשמל, מים וביוב",
    items,
    1,
  )[0];
  const recommendations = buildMavnadimAncillaryRecommendations(
    "צריך להציב מכולת בית קפה עם חיבור חשמל, מים וביוב",
    candidate,
  );

  assert.equal(recommendations.length >= 5, true);
  assert.equal(recommendations[0].status, "explicitly_requested");
  assert.ok(
    recommendations.some((recommendation) => recommendation.key === "foundation"),
  );
  assert.ok(
    recommendations.some(
      (recommendation) => recommendation.key === "placement_infrastructure",
    ),
  );
  assert.ok(
    recommendations.some(
      (recommendation) => recommendation.key === "electricity_connection",
    ),
  );
  assert.ok(
    recommendations.some((recommendation) => recommendation.key === "water_connection"),
  );
  assert.ok(
    recommendations.some(
      (recommendation) =>
        recommendation.key === "sewer_connection" &&
        recommendation.status === "explicitly_requested",
    ),
  );
}

async function testMavnadimDekelPackagePreview(): Promise<void> {
  const queries: string[] = [];
  const selection: SelectedMavnadimItem = {
    selectionId: "mavnadim-selection-preview-1",
    catalogItemId: "mavnadim-cafe-container",
    displayName: "Cafe container",
    shortLabel: "Cafe",
    category: "commercial",
    dimensionsLabel: "3x6",
    basePrice: 80000,
    sourceImageName: "cafe-container.png",
    includedFeatures: ["serving counter"],
    ancillaryRecommendations: [
      {
        key: "electricity_connection",
        title: "Electricity connection",
        status: "explicitly_requested",
        reason: "Electricity is explicitly requested.",
        suggestedDekelSearchTerms: ["electricity", "connection"],
        responsibleSkill: "product-manager",
      },
      {
        key: "foundation",
        title: "Foundation",
        status: "conditional_review",
        reason: "Foundation may be needed depending on site conditions.",
        suggestedDekelSearchTerms: ["foundation", "concrete"],
        responsibleSkill: "product-manager",
      },
      {
        key: "placement_infrastructure",
        title: "Placement infrastructure",
        status: "usually_not_required",
        reason: "No direct signal for a dedicated placement layer.",
        suggestedDekelSearchTerms: ["placement", "infrastructure"],
        responsibleSkill: "product-manager",
      },
    ],
    selectedAt: new Date().toISOString(),
    selectedBy: "reviewer",
    responsibleSkill: "backend-dev-guidelines",
  };

  const preview = await buildMavnadimDekelPackagePreview({
    selectedMavnadim: selection,
    candidatesPerRecommendation: 1,
    dekelMatcher: {
      async findCandidatesByDescription(description: string, limit = 1) {
        queries.push(description);
        return [
          {
            code: `candidate-${queries.length}`,
            description: `Candidate for ${description}`,
            unit: "job",
            unitPrice: limit * 100,
            score: 0.91,
            matchReason: "test stub",
            metadataJson: {},
          },
        ];
      },
    },
  });

  assert.equal(preview.selectedMavnadim.catalogItemId, selection.catalogItemId);
  assert.equal(preview.packageItems.length, 2);
  assert.equal(preview.packageItems[0].recommendationKey, "electricity_connection");
  assert.equal(preview.packageItems[1].recommendationKey, "foundation");
  assert.deepEqual(queries, ["electricity connection", "foundation concrete"]);
  assert.equal(preview.packageItems[0].candidates[0]?.code, "candidate-1");
  assert.equal(preview.packageItems[1].candidates[0]?.code, "candidate-2");
  assert.ok(
    preview.packageItems.every(
      (item) => item.recommendationKey !== "placement_infrastructure",
    ),
  );
}

async function testSkillOrchestratorService(): Promise<void> {
  const logsDirectoryPath = await mkdtemp(
    path.join(tmpdir(), "mashmauet-skill-logs-"),
  );
  const orchestrator = new SkillOrchestratorService({
    logsDirectoryPath,
  });

  try {
    const firstTask = await orchestrator.runTask(
      {
        taskType: "http.case.dekel_candidates",
        invokedBy: "test",
        caseId: "case-skill-1",
        inputSummary: "match DEKEL candidates for a case",
      },
      async () => ({
        statusCode: 200,
        body: {
          candidatesCount: 2,
        },
      }),
    );

    assert.equal(
      firstTask.decision.routeCategory,
      "AI / RAG / retrieval / matching / evaluation",
    );
    assert.equal(firstTask.decision.primarySkill, "rag-engineer");
    assert.ok(firstTask.decision.supportingSkills.includes("rag-implementation"));
    assert.equal(firstTask.decision.handoffFrom, null);
    assert.equal(firstTask.responseBody.skill, "rag-engineer");
    assert.equal(firstTask.responseBody.skillSource, "project-local");
    assert.ok(Array.isArray(firstTask.responseBody.supportingSkills));
    assert.equal(firstTask.responseBody.executionSkill, "rag-engineer");

    const brainstormingTask = await orchestrator.runTask(
      {
        taskType: "http.catalog.mavnadim_preview",
        invokedBy: "test",
        inputSummary: "preview MAVNADIM catalog routes",
      },
      async () => ({
        statusCode: 200,
        body: {
          previewReady: true,
        },
      }),
    );

    assert.equal(
      brainstormingTask.decision.routeCategory,
      "Product / discovery / brainstorming",
    );
    assert.equal(brainstormingTask.decision.primarySkill, "product-manager");
    const brainstormingResponseBody = brainstormingTask.responseBody as unknown as {
      supportingSkills: string[];
      supportingSkillSources: Array<{ name: string; source: string }>;
    };
    assert.ok(
      brainstormingResponseBody.supportingSkills.includes("brainstorming"),
    );
    assert.ok(
      brainstormingResponseBody.supportingSkillSources.some(
        (skill) =>
          skill.name === "brainstorming" && skill.source === "platform-resident",
      ),
    );

    const secondTask = await orchestrator.runTask(
      {
        taskType: "http.case.output_draft",
        invokedBy: "test",
        caseId: "case-skill-1",
        inputSummary: "prepare output draft for the same case",
      },
      async () => ({
        statusCode: 200,
        body: {
          draftReady: true,
          skill: "architecture",
        },
      }),
    );

    assert.equal(
      secondTask.decision.routeCategory,
      "Document generation / template flow",
    );
    assert.equal(
      secondTask.decision.primarySkill,
      "documentation-generation-doc-generate",
    );
    assert.equal(secondTask.decision.handoffFrom, "rag-engineer");
    assert.equal(
      secondTask.decision.handoffTo,
      "documentation-generation-doc-generate",
    );
    assert.equal(
      secondTask.responseBody.executionSkill,
      "architecture",
    );
    const secondResponseBody = secondTask.responseBody as unknown as {
      supportingSkills: string[];
    };
    assert.ok(
      secondResponseBody.supportingSkills.includes("product-manager"),
    );

    const logFiles = await readdir(logsDirectoryPath);

    assert.equal(logFiles.length, 1);

    const logContents = await readFile(
      path.join(logsDirectoryPath, logFiles[0]),
      "utf8",
    );
    const entries = logContents
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    assert.equal(entries.length, 3);
    assert.equal(entries[0].route_category, "AI / RAG / retrieval / matching / evaluation");
    assert.equal(entries[0].skill, "rag-engineer");
    assert.equal(entries[0].accepted, true);
    assert.equal(entries[1].route_category, "Product / discovery / brainstorming");
    assert.equal(entries[1].skill, "product-manager");
    assert.equal(entries[2].handoff_from, "rag-engineer");
    assert.equal(entries[2].handoff_to, "documentation-generation-doc-generate");
    assert.equal(entries[2].next_skill, "evaluation");
  } finally {
    await rm(logsDirectoryPath, { recursive: true, force: true });
  }
}

function testCaseOutputDraftBuilder(): void {
  const draft = buildCaseOutputDraft({
    case: buildCaseRecord({
      caseId: "case-output-1",
      title: "Output draft case",
      rawDescription: "פירוק והרכבה של ארון כיבוי אש",
      analysis: {
        ...createEmptyAnalysisSnapshot(),
        selectedMavnadimItem: buildSelectedMavnadimSelection(),
        selectedDekelLines: [
          {
            selectionId: "sel-1",
            code: "95.07.68.0002",
            description: "הרכבה בלבד של ארון כיבוי אש",
            quantity: 2,
            unit: "unit",
            unitPrice: 435,
            sourceActivityNumber: "5102062",
            sourceChapterCode: "07",
            selectedAt: "2026-04-13T10:00:00.000Z",
            selectedBy: "reviewer-a",
            responsibleSkill: "backend-dev-guidelines",
          },
        ],
        reviewDecisions: [
          {
            decisionId: "rev-1",
            caseId: "case-output-1",
            reviewerId: "reviewer-a",
            decisionType: "confirm_dekel_selection",
            targetEntityType: "dekel_selection_set",
            targetEntityId: "case-output-1",
            comment: "Confirmed 1 line.",
            createdAt: "2026-04-13T10:00:00.000Z",
          },
        ],
        warnings: ["estimated quantity was avoided"],
        assumptions: ["confirmed by reviewer"],
      },
    }),
    template: {
      templateId: DEFAULT_TEMPLATE_ID,
      templateName: "מסמך משמעויות / MVP Template",
      templateVersion: "1.0.0",
      outputFormat: "docx",
      fieldsSchemaJson: {
        documentTitle: "text",
        caseId: "text",
        projectDescription: "text",
        totalAmount: "number",
        budgetBreakdownTotal: "number",
        scheduleDurationMonths: "number",
        riskItemsCount: "number",
        selectedLinesCount: "number",
        selectedMavnadimName: "text",
        selectedMavnadimDimensions: "text",
        selectedMavnadimBasePrice: "number",
        mavnadimAncillaryCount: "number",
      },
      financialLinesSchemaJson: [],
      requiredFieldsJson: ["documentTitle", "projectDescription", "totalAmount"],
      insertionRulesJson: {},
    },
    managementFeePercent: 14,
  });

  assert.equal(draft.caseId, "case-output-1");
  assert.equal(draft.skill, "architecture");
  assert.equal(draft.template.templateId, DEFAULT_TEMPLATE_ID);
  assert.notEqual(draft.selectedMavnadim, null);
  assert.equal(draft.selectedMavnadim?.catalogItemId, "mavnadim-cafe-container");
  assert.equal(draft.selectedMavnadim?.ancillaryRecommendations.length, 2);
  assert.equal(draft.document.projectDescription, "פירוק והרכבה של ארון כיבוי אש");
  assert.equal(draft.document.summarySection.sectionTitle, "נתוני מסמך");
  assert.equal(draft.document.summarySection.caseReferenceValue, "case-output-1");
  assert.equal(draft.document.backgroundSection.sectionTitle, "רקע");
  assert.equal(
    draft.document.backgroundSection.paragraphs.some((paragraph) =>
      paragraph.includes("Cafe Container"),
    ),
    true,
  );
  assert.equal(draft.document.objectiveSection.sectionTitle, "מטרת המשימה");
  assert.equal(
    draft.document.objectiveSection.paragraphs.some((paragraph) =>
      paragraph.includes("Cafe Container"),
    ),
    true,
  );
  assert.equal(draft.document.scopeSection.sectionTitle, "תכולת הפרויקט");
  assert.equal(draft.document.scopeSection.items.length >= 4, true);
  assert.equal(
    draft.document.scopeSection.items.some((item) =>
      item.includes("Cafe Container"),
    ),
    true,
  );
  assert.equal(
    draft.document.scopeSection.items.some((item) =>
      item.includes("Electricity connection"),
    ),
    true,
  );
  assert.equal(draft.document.omdanSection.sectionTitle, "אומדן");
  assert.equal(draft.document.omdanSection.lines.length, 1);
  assert.equal(draft.document.omdanSection.lines[0].code, "95.07.68.0002");
  assert.equal(draft.document.omdanSection.lines[0].quantity, 2);
  assert.equal(draft.document.omdanSection.lines[0].amount, 870);
  assert.equal(draft.document.omdanSection.totalProjectCost, 991.8);
  assert.equal(draft.document.remarksSection.sectionTitle, "הערות לאומדן");
  assert.equal(draft.document.remarksSection.items.length >= 5, true);
  assert.equal(
    draft.document.remarksSection.items.some((item) =>
      item.includes("Cafe Container"),
    ),
    true,
  );
  assert.equal(
    draft.document.remarksSection.items.some((item) =>
      item.includes("אינו נכלל אוטומטית"),
    ),
    true,
  );
  assert.equal(draft.document.budgetBreakdownSection.sectionTitle, "להלן פילוח תקציבי לעבודה");
  assert.equal(draft.document.budgetBreakdownSection.rows.length, 1);
  assert.equal(draft.document.budgetBreakdownSection.rows[0].subject, "פרק 07");
  assert.equal(draft.document.scheduleSection.rows.length, 6);
  assert.equal(draft.document.scheduleSection.months.length >= 4, true);
  assert.equal(draft.document.riskManagementSection.sectionTitle, "ניהול סיכונים");
  assert.equal(draft.document.riskManagementSection.rows.length >= 3, true);
  assert.equal(draft.document.appendicesSection.sectionTitle, "נספחים ומסמכי מקור");
  assert.equal(
    draft.document.appendicesSection.items.some((item) => item.includes("כתב יד")),
    true,
  );
  assert.equal(
    draft.document.appendicesSection.items.some((item) =>
      item.includes("cafe-container.png"),
    ),
    true,
  );
  assert.equal(draft.templateBindings.documentTitle, "מסמך משמעויות - Output draft case");
  assert.equal(draft.templateBindings.caseId, "case-output-1");
  assert.equal(draft.templateBindings.projectDescription, "פירוק והרכבה של ארון כיבוי אש");
  assert.equal(draft.templateBindings.totalAmount, 991.8);
  assert.equal(draft.templateBindings.budgetBreakdownTotal, 991.8);
  assert.equal(draft.templateBindings.scheduleDurationMonths, draft.document.scheduleSection.months.length);
  assert.equal(draft.templateBindings.riskItemsCount, draft.document.riskManagementSection.rows.length);
  assert.equal(draft.templateBindings.selectedLinesCount, 1);
  assert.equal(draft.templateBindings.selectedMavnadimName, "Cafe Container");
  assert.equal(draft.templateBindings.selectedMavnadimDimensions, "3x6");
  assert.equal(draft.templateBindings.selectedMavnadimBasePrice, 80000);
  assert.equal(draft.templateBindings.mavnadimAncillaryCount, 2);
  assert.equal(draft.reviewSummary.reviewDecisionsCount, 1);
  assert.equal(draft.reviewSummary.selectedLinesCount, 1);
}

function testCaseOutputDraftUsesCompactScopeFragmentsWithoutConfirmedDekelLines(): void {
  const draft = buildCaseOutputDraft({
    case: buildCaseRecord({
      caseId: "case-output-compact-1",
      title: "Compact scope case",
      rawDescription:
        "החלפת ריצוף 6x3, תיקוני צבע + פירוק סף דלת",
      dimensions: {},
      analysis: {
        ...createEmptyAnalysisSnapshot(),
        warnings: ["manual review still required"],
        assumptions: ["scope derived from shorthand description"],
      },
    }),
    template: {
      templateId: DEFAULT_TEMPLATE_ID,
      templateName: "מסמך משמעויות / MVP Template",
      templateVersion: "1.0.0",
      outputFormat: "docx",
      fieldsSchemaJson: {
        documentTitle: "string",
        caseId: "string",
        projectDescription: "string",
        totalAmount: "number",
      },
      financialLinesSchemaJson: [],
      requiredFieldsJson: ["documentTitle", "projectDescription", "totalAmount"],
      insertionRulesJson: {},
    },
    managementFeePercent: 14,
  });

  assert.equal(draft.document.scopeSection.items.length >= 2, true);
  assert.equal(
    draft.document.scopeSection.items.some((item) => item.includes("החלפת ריצוף 6x3")),
    true,
  );
  assert.equal(
    draft.document.scopeSection.items.some((item) => item.includes("תיקוני צבע")),
    true,
  );
}

function testCaseOutputDraftUsesDetectedWorkLocationInNarrativeSections(): void {
  const draft = buildCaseOutputDraft({
    case: buildCaseRecord({
      caseId: "case-output-location-1",
      title: "Location-aware case",
      rawDescription: "Need to replace the interior door at the main entrance.",
      dimensions: {},
      analysis: {
        ...createEmptyAnalysisSnapshot(),
        warnings: ["manual review still required"],
        assumptions: ["scope derived from operator description"],
      },
    }),
    template: {
      templateId: DEFAULT_TEMPLATE_ID,
      templateName: "׳׳¡׳׳ ׳׳©׳׳¢׳•׳™׳•׳× / MVP Template",
      templateVersion: "1.0.0",
      outputFormat: "docx",
      fieldsSchemaJson: {
        documentTitle: "string",
        caseId: "string",
        projectDescription: "string",
        totalAmount: "number",
      },
      financialLinesSchemaJson: [],
      requiredFieldsJson: ["documentTitle", "projectDescription", "totalAmount"],
      insertionRulesJson: {},
    },
    managementFeePercent: 14,
  });

  assert.equal(
    draft.document.backgroundSection.paragraphs.some((paragraph) =>
      paragraph.includes("main entrance"),
    ),
    true,
  );
  assert.equal(
    draft.document.objectiveSection.paragraphs.some((paragraph) =>
      paragraph.includes("main entrance"),
    ),
    true,
  );
  assert.equal(
    draft.document.scopeSection.items.some((item) =>
      item.includes("מיקום העבודה: main entrance"),
    ),
    true,
  );
}

function testCaseOutputPackageBuilder(): void {
  const outputDraft = buildCaseOutputDraft({
    case: buildCaseRecord({
      caseId: "case-package-1",
      title: "Output package case",
      rawDescription: "פירוק והרכבה של ארון כיבוי אש",
      analysis: {
        ...createEmptyAnalysisSnapshot(),
        selectedMavnadimItem: buildSelectedMavnadimSelection(),
        selectedDekelLines: [
          {
            selectionId: "sel-1",
            code: "95.07.68.0002",
            description: "הרכבה בלבד של ארון כיבוי אש",
            quantity: 2,
            unit: "unit",
            unitPrice: 435,
            sourceActivityNumber: "5102062",
            sourceChapterCode: "07",
            selectedAt: "2026-04-13T10:00:00.000Z",
            selectedBy: "reviewer-a",
            responsibleSkill: "backend-dev-guidelines",
          },
        ],
        reviewDecisions: [
          {
            decisionId: "rev-1",
            caseId: "case-package-1",
            reviewerId: "reviewer-a",
            decisionType: "confirm_dekel_selection",
            targetEntityType: "dekel_selection_set",
            targetEntityId: "case-package-1",
            comment: "Confirmed 1 line.",
            createdAt: "2026-04-13T10:00:00.000Z",
          },
        ],
        warnings: ["manual confirmation required"],
        assumptions: ["reviewed by operator"],
      },
      supportingEvidence: [
        {
          evidenceId: "evidence-package-1",
          sourceType: "handwritten",
          format: "inline_text",
          role: "supporting",
          label: "field-note",
          content: "Check final alignment on site.",
          extractedText: null,
          normalizedContent: "check final alignment on site.",
          confidence: 0.4,
          reviewStatus: "needs_review",
          usedInAnalysisFlag: false,
        },
      ],
    }),
    template: {
      templateId: DEFAULT_TEMPLATE_ID,
      templateName: "מסמך משמעויות / MVP Template",
      templateVersion: "1.0.0",
      outputFormat: "docx",
      fieldsSchemaJson: {
        documentTitle: "text",
        caseId: "text",
        projectDescription: "text",
        totalAmount: "number",
        budgetBreakdownTotal: "number",
        scheduleDurationMonths: "number",
        riskItemsCount: "number",
        selectedLinesCount: "number",
      },
      financialLinesSchemaJson: [],
      requiredFieldsJson: ["documentTitle", "projectDescription", "totalAmount"],
      insertionRulesJson: {},
    },
    managementFeePercent: 14,
  });
  const caseRecord = buildCaseRecord({
    caseId: "case-package-1",
    title: "Output package case",
    rawDescription: "פירוק והרכבה של ארון כיבוי אש",
    analysis: {
      ...createEmptyAnalysisSnapshot(),
      selectedMavnadimItem: buildSelectedMavnadimSelection(),
      selectedDekelLines: [
        {
          selectionId: "sel-1",
          code: "95.07.68.0002",
          description: "הרכבה בלבד של ארון כיבוי אש",
          quantity: 2,
          unit: "unit",
          unitPrice: 435,
          sourceActivityNumber: "5102062",
          sourceChapterCode: "07",
          selectedAt: "2026-04-13T10:00:00.000Z",
          selectedBy: "reviewer-a",
          responsibleSkill: "backend-dev-guidelines",
        },
      ],
      reviewDecisions: [
        {
          decisionId: "rev-1",
          caseId: "case-package-1",
          reviewerId: "reviewer-a",
          decisionType: "confirm_dekel_selection",
          targetEntityType: "dekel_selection_set",
          targetEntityId: "case-package-1",
          comment: "Confirmed 1 line.",
          createdAt: "2026-04-13T10:00:00.000Z",
        },
      ],
      warnings: ["manual confirmation required"],
      assumptions: ["reviewed by operator"],
    },
    supportingEvidence: [
      {
        evidenceId: "evidence-package-1",
        sourceType: "handwritten",
        format: "image",
        role: "supporting",
        label: "field-note",
        content: "Check final alignment on site.",
        extractedText: null,
        normalizedContent: "check final alignment on site.",
        confidence: 0.4,
        reviewStatus: "needs_review",
        usedInAnalysisFlag: false,
      },
    ],
  });
  const outputPackage = buildCaseOutputPackage({
    case: caseRecord,
    outputDraft,
  });

  assert.equal(outputPackage.caseId, "case-package-1");
  assert.equal(outputPackage.skill, "architecture");
  assert.notEqual(outputPackage.reviewSheet.selectedMavnadim, null);
  assert.equal(
    outputPackage.reviewSheet.selectedMavnadim?.catalogItemId,
    "mavnadim-cafe-container",
  );
  assert.equal(
    outputPackage.reviewSheet.selectedMavnadim?.ancillaryRecommendations[0]?.status,
    "explicitly_requested",
  );
  assert.equal(outputPackage.mainDocument.document.omdanSection.lines.length, 1);
  assert.equal(outputPackage.mainDocument.document.budgetBreakdownSection.rows.length, 1);
  assert.equal(outputPackage.mainDocument.document.scheduleSection.rows.length, 6);
  assert.equal(outputPackage.mainDocument.document.riskManagementSection.rows.length >= 3, true);
  assert.equal(outputPackage.detailedCostSheet.lines.length, 1);
  assert.equal(outputPackage.detailedCostSheet.lines[0].code, "95.07.68.0002");
  assert.equal(outputPackage.detailedCostSheet.lines[0].amount, 870);
  assert.equal(outputPackage.reviewSheet.reviewDecisions.length, 1);
  assert.equal(outputPackage.reviewSheet.supportingEvidence.length, 1);
  assert.equal(outputPackage.reviewSheet.supportingEvidence[0].sourceType, "handwritten");
  assert.equal(outputPackage.reviewSheet.warnings[0], "manual confirmation required");
  assert.equal(outputPackage.reviewSheet.assumptions[0], "reviewed by operator");
}

async function testCaseOutputExportService(): Promise<void> {
  const artifactsDirectoryPath = await mkdtemp(
    path.join(tmpdir(), "mashmauet-output-artifacts-"),
  );
  const exportService = new CaseOutputExportService({
    artifactsRootPath: artifactsDirectoryPath,
  });
  const caseRecord = buildCaseRecord({
    caseId: "case-export-1",
    title: "Export case",
    rawDescription: "Need to replace a fire cabinet and verify surrounding finishes.",
    analysis: {
      ...createEmptyAnalysisSnapshot(),
      selectedMavnadimItem: buildSelectedMavnadimSelection({
        catalogItemId: "mavnadim-office-3x6",
        displayName: "Office module",
        shortLabel: "Office",
        category: "commercial",
        sourceImageName: "office-3x6.png",
      }),
      selectedDekelLines: [
        {
          selectionId: "sel-1",
          code: "95.07.68.0002",
          description: "Fire cabinet installation",
          quantity: 2,
          unit: "unit",
          unitPrice: 435,
          sourceActivityNumber: "5102062",
          sourceChapterCode: "07",
          selectedAt: "2026-04-14T08:00:00.000Z",
          selectedBy: "reviewer-a",
          responsibleSkill: "backend-dev-guidelines",
        },
      ],
      reviewDecisions: [
        {
          decisionId: "rev-1",
          caseId: "case-export-1",
          reviewerId: "reviewer-a",
          decisionType: "confirm_dekel_selection",
          targetEntityType: "dekel_selection_set",
          targetEntityId: "case-export-1",
          comment: "Confirmed selected lines.",
          createdAt: "2026-04-14T08:01:00.000Z",
        },
      ],
      warnings: ["needs human verification"],
      assumptions: ["quantity confirmed by reviewer"],
    },
    supportingEvidence: [
      {
        evidenceId: "evidence-export-1",
        sourceType: "handwritten",
        format: "image",
        role: "supporting",
        label: "field-note",
        content: "Confirm exact placement before final issue.",
        extractedText: null,
        normalizedContent: "confirm exact placement before final issue.",
        confidence: 0.45,
        reviewStatus: "needs_review",
        usedInAnalysisFlag: false,
      },
    ],
  });
  const outputDraft = buildCaseOutputDraft({
    case: caseRecord,
    template: {
      templateId: DEFAULT_TEMPLATE_ID,
      templateName: "Masmach Template",
      templateVersion: "1.0.0",
      outputFormat: "docx",
      fieldsSchemaJson: {
        documentTitle: "text",
        caseId: "text",
        projectDescription: "text",
        totalAmount: "number",
        budgetBreakdownTotal: "number",
        scheduleDurationMonths: "number",
        riskItemsCount: "number",
        selectedLinesCount: "number",
        selectedMavnadimName: "text",
        selectedMavnadimDimensions: "text",
        selectedMavnadimBasePrice: "number",
        mavnadimAncillaryCount: "number",
      },
      financialLinesSchemaJson: [],
      requiredFieldsJson: ["documentTitle", "projectDescription", "totalAmount"],
      insertionRulesJson: {},
    },
    managementFeePercent: 14,
  });
  const outputPackage = buildCaseOutputPackage({
    case: caseRecord,
    outputDraft,
  });

  try {
    const manifest = await exportService.exportCaseOutputPackage({
      case: caseRecord,
      outputPackage,
      responsibleSkill: "documentation-generation-doc-generate",
    });

    assert.equal(manifest.caseId, "case-export-1");
    assert.equal(manifest.artifacts.length, 4);
    assert.ok(manifest.exportDirectory.includes("case-export-1"));
    assert.ok(
      manifest.artifacts.every(
        (artifact) =>
          artifact.responsibleSkill === "documentation-generation-doc-generate",
      ),
    );

    const exportedFiles = await readdir(manifest.exportDirectory);

    assert.ok(exportedFiles.includes("main-document.md"));
    assert.ok(exportedFiles.includes("detailed-cost-sheet.csv"));
    assert.ok(exportedFiles.includes("review-sheet.md"));
    assert.ok(exportedFiles.includes("output-package.json"));

    const mainDocument = await readFile(
      path.join(manifest.exportDirectory, "main-document.md"),
      "utf8",
    );
    const reviewSheet = await readFile(
      path.join(manifest.exportDirectory, "review-sheet.md"),
      "utf8",
    );
    assert.ok(mainDocument.includes("## רקע"));
    assert.ok(mainDocument.includes("## מטרת המשימה"));
    assert.ok(mainDocument.includes("## תכולת הפרויקט"));
    assert.ok(mainDocument.includes("## אומדן"));
    assert.ok(mainDocument.includes("## הערות לאומדן"));
    assert.ok(mainDocument.includes("## להלן פילוח תקציבי לעבודה"));
    assert.ok(mainDocument.includes("## לוח עקרוני"));
    assert.ok(mainDocument.includes("## ניהול סיכונים"));
    assert.ok(mainDocument.includes("## נספחים ומסמכי מקור"));
    assert.ok(mainDocument.includes("כתב יד"));
    assert.ok(mainDocument.includes("95.07.68.0002"));
    assert.ok(mainDocument.includes("## Selected Mavnadim"));
    assert.ok(mainDocument.includes("Office module"));
    assert.ok(reviewSheet.includes("## Selected Mavnadim"));
    assert.ok(reviewSheet.includes("Office module"));
    assert.ok(reviewSheet.includes("ancillary electricity_connection => explicitly_requested"));
    assert.ok(reviewSheet.includes("## Supporting Evidence"));
    assert.ok(reviewSheet.includes("[handwritten]"));
  } finally {
    await rm(artifactsDirectoryPath, { recursive: true, force: true });
  }
}

async function testDekelXlsxReader(): Promise<void> {
  const workbookPath = await createFixtureDekelXlsx();

  try {
    const rows = await readDekelRowsFromXlsx(workbookPath);
    const billableRows = selectBillableDekelRows(rows);

    assert.equal(rows.length, 3);
    assert.equal(rows[1].activityNumber, "5102061");
    assert.equal(rows[2].rate, 435);
    assert.equal(billableRows.length, 2);
    assert.equal(billableRows[0].longText, "פירוק ארון כיבוי אש");
  } finally {
    await rm(path.dirname(workbookPath), { recursive: true, force: true });
  }
}

async function testHttpFlow(): Promise<void> {
  const workbookPath = await createFixtureDekelXlsx();
  const skillLogsDirectoryPath = await mkdtemp(
    path.join(tmpdir(), "mashmauet-http-skill-logs-"),
  );
  const artifactsDirectoryPath = await mkdtemp(
    path.join(tmpdir(), "mashmauet-http-artifacts-"),
  );
  const app = createApp({
    dekelWorkbookPath: workbookPath,
    skillLogsDirectoryPath,
    artifactsDirectoryPath,
  });
  const server = createServer(app.handleRequest);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Could not resolve test server address.");
  }

  const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

  const currentFilePath = fileURLToPath(import.meta.url);
  try {
    const healthResponse = await fetch(`${baseUrl}/health`);
    const health = (await healthResponse.json()) as {
      status: string;
      service: string;
      skill: string;
      skillRoute: {
        primarySkill: string;
      };
    };

    assert.equal(healthResponse.status, 200);
    assert.equal(health.status, "ok");
    assert.equal(health.service, "mashmauet-agent");
    assert.equal(health.skill, "base");
    assert.equal(health.skillRoute.primarySkill, "base");

    const catalogResponse = await fetch(`${baseUrl}/catalog`);
    const catalog = (await catalogResponse.json()) as {
      skill: string;
      supportingSkills: string[];
      skillRoute: {
        primarySkill: string;
        managerSkill: string;
      };
      templates: unknown[];
      pricebooks: unknown[];
      externalSources: {
        dekelWorkbook: {
          exists: boolean;
          rowsCount: number;
          billableRowsCount: number;
          workbookPath: string;
        };
        mavnadimCatalog: {
          exists: boolean;
          directoryPath: string;
          sourceImagesCount: number;
          itemsCount: number;
        };
      };
    };

    assert.equal(catalogResponse.status, 200);
    assert.equal(catalog.skill, "manage-skills");
    assert.ok(catalog.supportingSkills.includes("antigravity-skill-orchestrator"));
    assert.equal(catalog.skillRoute.primarySkill, "manage-skills");
    assert.equal(catalog.skillRoute.managerSkill, "manage-skills");
    assert.ok(catalog.templates.length >= 1);
    assert.ok(catalog.pricebooks.length >= 1);
    assert.equal(catalog.externalSources.dekelWorkbook.exists, true);
    assert.equal(catalog.externalSources.dekelWorkbook.rowsCount, 3);
    assert.equal(catalog.externalSources.dekelWorkbook.billableRowsCount, 2);
    assert.equal(catalog.externalSources.dekelWorkbook.workbookPath, workbookPath);
    assert.equal(catalog.externalSources.mavnadimCatalog.exists, true);
    assert.ok(catalog.externalSources.mavnadimCatalog.sourceImagesCount >= 10);
    assert.ok(catalog.externalSources.mavnadimCatalog.itemsCount >= 10);
    assert.ok(
      catalog.externalSources.mavnadimCatalog.directoryPath.endsWith(
        path.join("HOMER", "MAVNADIM"),
      ),
    );

    const mavnadimPreviewResponse = await fetch(
      `${baseUrl}/catalog/mavnadim-preview?limit=2`,
    );
    const mavnadimPreview = (await mavnadimPreviewResponse.json()) as {
      skill: string;
      skillSource: string;
      supportingSkills: string[];
      supportingSkillSources: Array<{
        name: string;
        source: string;
      }>;
      skillRoute: {
        primarySkill: string;
      };
      items: Array<{
        displayName: string;
        basePrice: number;
      }>;
    };

    assert.equal(mavnadimPreviewResponse.status, 200);
    assert.equal(mavnadimPreview.skill, "product-manager");
    assert.equal(mavnadimPreview.skillSource, "project-local");
    assert.ok(mavnadimPreview.supportingSkills.includes("brainstorming"));
    assert.ok(
      mavnadimPreview.supportingSkillSources.some(
        (skill) =>
          skill.name === "brainstorming" && skill.source === "platform-resident",
      ),
    );
    assert.equal(mavnadimPreview.skillRoute.primarySkill, "product-manager");
    assert.equal(mavnadimPreview.items.length, 2);
    assert.equal(
      mavnadimPreview.items[0].displayName,
      'מבנ"ד 3/6 - מגורים חד חדר',
    );
    assert.equal(mavnadimPreview.items[1].basePrice, 85000);

    const previewResponse = await fetch(`${baseUrl}/catalog/dekel-pricebook-preview?limit=2`);
    const preview = (await previewResponse.json()) as {
      skill: string;
      skillSource: string;
      items: Array<{
        code: string;
        unit: string;
        unitPrice: number;
        metadataJson: Record<string, string>;
      }>;
    };

    assert.equal(previewResponse.status, 200);
    assert.equal(preview.skill, "data-engineering-data-pipeline");
    assert.equal(preview.skillSource, "project-local");
    assert.equal(preview.items.length, 2);
    assert.equal(preview.items[0].code, "95.07.68.0001");
    assert.equal(preview.items[0].unit, "unit");
    assert.equal(preview.items[0].metadataJson.dekel_chapter_code, "07");
    assert.equal(preview.items[1].unitPrice, 435);
    assert.equal(preview.items[1].metadataJson.dekel_activity_number, "5102062");

    const estimateResponse = await fetch(
      `${baseUrl}/catalog/dekel-estimate-preview?limit=2&managementFeePercent=14`,
    );
    const estimatePreview = (await estimateResponse.json()) as {
      skill: string;
      skillSource: string;
      supportingSkills: string[];
      lines: Array<{
        description: string;
        amount: number;
      }>;
      executionSubtotal: number;
      managementFeeAmount: number;
      totalProjectCost: number;
    };

    assert.equal(estimateResponse.status, 200);
    assert.equal(
      estimatePreview.skill,
      "documentation-generation-doc-generate",
    );
    assert.equal(estimatePreview.skillSource, "project-local");
    assert.ok(estimatePreview.supportingSkills.includes("product-manager"));
    assert.equal(estimatePreview.lines.length, 2);
    assert.equal(estimatePreview.lines[0].description, "פירוק ארון כיבוי אש");
    assert.equal(estimatePreview.executionSubtotal, 755);
    assert.equal(estimatePreview.managementFeeAmount, 105.7);
    assert.equal(estimatePreview.totalProjectCost, 860.7);

    const mavnadimCaseResponse = await fetch(`${baseUrl}/cases`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Cafe module case",
        createdBy: "tester",
        templateId: DEFAULT_TEMPLATE_ID,
        pricebookId: DEFAULT_PRICEBOOK_ID,
        description: "צריך להציב מכולת בית קפה עם חיבור חשמל מים וביוב",
        notes: "mavnadim smoke test",
      }),
    });
    const mavnadimCase = (await mavnadimCaseResponse.json()) as CaseRecord & {
      skill: string;
      skillSource: string;
      supportingSkills: string[];
      supportingSkillSources: Array<{
        name: string;
        source: string;
      }>;
    };

    assert.equal(mavnadimCaseResponse.status, 201);
    assert.equal(mavnadimCase.skill, "product-manager");
    assert.equal(mavnadimCase.skillSource, "project-local");
    assert.ok(mavnadimCase.supportingSkills.includes("brainstorming"));
    assert.ok(
      mavnadimCase.supportingSkillSources.some(
        (skill) =>
          skill.name === "brainstorming" && skill.source === "platform-resident",
      ),
    );

    const mavnadimCandidatesResponse = await fetch(
      `${baseUrl}/cases/${mavnadimCase.caseId}/mavnadim-candidates?limit=2`,
    );
    const mavnadimCandidatesPayload = (await mavnadimCandidatesResponse.json()) as {
      caseId: string;
      skill: string;
      executionSkill: string;
      supportingSkills: string[];
      candidates: Array<{
        catalogItemId: string;
        displayName: string;
        basePrice: number;
        ancillaryRecommendations: Array<{
          key: string;
          status: string;
        }>;
      }>;
    };

    assert.equal(mavnadimCandidatesResponse.status, 200);
    assert.equal(mavnadimCandidatesPayload.caseId, mavnadimCase.caseId);
    assert.equal(mavnadimCandidatesPayload.skill, "rag-engineer");
    assert.equal(mavnadimCandidatesPayload.executionSkill, "rag-engineer");
    assert.ok(
      mavnadimCandidatesPayload.supportingSkills.includes("rag-implementation"),
    );
    assert.equal(mavnadimCandidatesPayload.candidates.length, 2);
    assert.equal(
      mavnadimCandidatesPayload.candidates[0].catalogItemId,
      "mavnadim-cafe-container",
    );
    assert.equal(
      mavnadimCandidatesPayload.candidates[0].displayName,
      "מכולת בית קפה",
    );
    assert.equal(mavnadimCandidatesPayload.candidates[0].basePrice, 80000);
    assert.ok(
      mavnadimCandidatesPayload.candidates[0].ancillaryRecommendations.some(
        (recommendation) =>
          recommendation.key === "electricity_connection" &&
          recommendation.status === "explicitly_requested",
      ),
    );
    assert.ok(
      mavnadimCandidatesPayload.candidates[0].ancillaryRecommendations.some(
        (recommendation) =>
          recommendation.key === "water_connection" &&
          recommendation.status === "explicitly_requested",
      ),
    );
    assert.ok(
      mavnadimCandidatesPayload.candidates[0].ancillaryRecommendations.some(
        (recommendation) =>
          recommendation.key === "sewer_connection" &&
          recommendation.status === "explicitly_requested",
      ),
    );

    const saveMavnadimSelectionResponse = await fetch(
      `${baseUrl}/cases/${mavnadimCase.caseId}/mavnadim-selection`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          selectedBy: "reviewer-m",
          catalogItemId: "mavnadim-cafe-container",
        }),
      },
    );
    const saveMavnadimSelectionPayload =
      (await saveMavnadimSelectionResponse.json()) as {
        caseId: string;
        skill: string;
        executionSkill: string;
        selection: {
          catalogItemId: string;
          displayName: string;
          ancillaryRecommendations: Array<{
            key: string;
            status: string;
          }>;
        };
        caseStatus: {
          status: string;
          reviewStatus: string;
          finalStatus: string;
        };
      };

    assert.equal(saveMavnadimSelectionResponse.status, 200);
    assert.equal(saveMavnadimSelectionPayload.caseId, mavnadimCase.caseId);
    assert.equal(
      saveMavnadimSelectionPayload.skill,
      "backend-development-feature-development",
    );
    assert.equal(
      saveMavnadimSelectionPayload.executionSkill,
      "backend-dev-guidelines",
    );
    assert.equal(
      saveMavnadimSelectionPayload.selection.catalogItemId,
      "mavnadim-cafe-container",
    );
    assert.ok(
      saveMavnadimSelectionPayload.selection.displayName.includes("קפה"),
    );
    assert.ok(
      saveMavnadimSelectionPayload.selection.ancillaryRecommendations.some(
        (recommendation) =>
          recommendation.key === "electricity_connection" &&
          recommendation.status === "explicitly_requested",
      ),
    );

    const getMavnadimSelectionResponse = await fetch(
      `${baseUrl}/cases/${mavnadimCase.caseId}/mavnadim-selection`,
    );
    const getMavnadimSelectionPayload =
      (await getMavnadimSelectionResponse.json()) as {
        caseId: string;
        skill: string;
        executionSkill: string;
        selection: null | {
          catalogItemId: string;
          displayName: string;
          selectedBy: string;
        };
      };

    assert.equal(getMavnadimSelectionResponse.status, 200);
    assert.equal(getMavnadimSelectionPayload.caseId, mavnadimCase.caseId);
    assert.equal(
      getMavnadimSelectionPayload.skill,
      "backend-development-feature-development",
    );
    assert.equal(
      getMavnadimSelectionPayload.executionSkill,
      "backend-dev-guidelines",
    );
    assert.equal(
      getMavnadimSelectionPayload.selection?.catalogItemId,
      "mavnadim-cafe-container",
    );
    assert.equal(
      getMavnadimSelectionPayload.selection?.selectedBy,
      "reviewer-m",
    );

    const mavnadimAncillaryPreviewResponse = await fetch(
      `${baseUrl}/cases/${mavnadimCase.caseId}/mavnadim-ancillary-preview?limit=1`,
    );
    const mavnadimAncillaryPreviewPayload =
      (await mavnadimAncillaryPreviewResponse.json()) as {
        caseId: string;
        skill: string;
        executionSkill: string;
        selectedMavnadim: {
          catalogItemId: string;
          displayName: string;
        };
        packageItems: Array<{
          recommendationKey: string;
          status: string;
          candidates: Array<{
            code: string;
          }>;
        }>;
      };

    assert.equal(mavnadimAncillaryPreviewResponse.status, 200);
    assert.equal(
      mavnadimAncillaryPreviewPayload.caseId,
      mavnadimCase.caseId,
    );
    assert.equal(mavnadimAncillaryPreviewPayload.skill, "rag-engineer");
    assert.equal(
      mavnadimAncillaryPreviewPayload.executionSkill,
      "rag-engineer",
    );
    assert.equal(
      mavnadimAncillaryPreviewPayload.selectedMavnadim.catalogItemId,
      "mavnadim-cafe-container",
    );
    assert.ok(
      mavnadimAncillaryPreviewPayload.packageItems.some(
        (item) => item.recommendationKey === "electricity_connection",
      ),
    );
    assert.ok(
      mavnadimAncillaryPreviewPayload.packageItems.some(
        (item) => item.recommendationKey === "water_connection",
      ),
    );
    assert.ok(
      mavnadimAncillaryPreviewPayload.packageItems.some(
        (item) => item.recommendationKey === "sewer_connection",
      ),
    );
    assert.ok(
      mavnadimAncillaryPreviewPayload.packageItems.every((item) =>
        Array.isArray(item.candidates),
      ),
    );

    const saveMavnadimAncillarySelectionResponse = await fetch(
      `${baseUrl}/cases/${mavnadimCase.caseId}/mavnadim-ancillary-selection?managementFeePercent=14`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          selectedBy: "reviewer-m-ancillary",
          appendToExisting: false,
          lines: [
            {
              recommendationKey: "electricity_connection",
              code: "95.07.68.0001",
              quantity: 1,
            },
            {
              recommendationKey: "water_connection",
              code: "95.07.68.0002",
              quantity: 1,
            },
          ],
        }),
      },
    );
    const saveMavnadimAncillarySelectionPayload =
      (await saveMavnadimAncillarySelectionResponse.json()) as {
        caseId: string;
        skill: string;
        executionSkill: string;
        appliedRecommendationKeys: string[];
        appliedSelections: Array<{
          code: string;
          quantity: number;
          selectionContext?: string;
          recommendationKey?: string | null;
          selectedBy: string;
        }>;
        selections: Array<{
          code: string;
          quantity: number;
          selectionContext?: string;
          recommendationKey?: string | null;
        }>;
        estimatePreview: {
          executionSubtotal: number;
          totalProjectCost: number;
        };
      };

    assert.equal(saveMavnadimAncillarySelectionResponse.status, 200);
    assert.equal(
      saveMavnadimAncillarySelectionPayload.caseId,
      mavnadimCase.caseId,
    );
    assert.equal(
      saveMavnadimAncillarySelectionPayload.skill,
      "backend-development-feature-development",
    );
    assert.equal(
      saveMavnadimAncillarySelectionPayload.executionSkill,
      "backend-dev-guidelines",
    );
    assert.deepEqual(
      saveMavnadimAncillarySelectionPayload.appliedRecommendationKeys,
      ["electricity_connection", "water_connection"],
    );
    assert.equal(
      saveMavnadimAncillarySelectionPayload.appliedSelections.length,
      2,
    );
    assert.equal(
      saveMavnadimAncillarySelectionPayload.appliedSelections[0].selectionContext,
      "mavnadim_ancillary",
    );
    assert.equal(
      saveMavnadimAncillarySelectionPayload.appliedSelections[0].selectedBy,
      "reviewer-m-ancillary",
    );
    assert.equal(
      saveMavnadimAncillarySelectionPayload.appliedSelections[0].recommendationKey,
      "electricity_connection",
    );
    assert.equal(
      saveMavnadimAncillarySelectionPayload.selections.length,
      2,
    );
    assert.equal(
      saveMavnadimAncillarySelectionPayload.estimatePreview.executionSubtotal > 0,
      true,
    );
    assert.equal(
      saveMavnadimAncillarySelectionPayload.estimatePreview.totalProjectCost > 0,
      true,
    );

    const getMavnadimDekelSelectionResponse = await fetch(
      `${baseUrl}/cases/${mavnadimCase.caseId}/dekel-selection?managementFeePercent=14`,
    );
    const getMavnadimDekelSelectionPayload =
      (await getMavnadimDekelSelectionResponse.json()) as {
        caseId: string;
        skill: string;
        selections: Array<{
          code: string;
          selectionContext?: string;
          recommendationKey?: string | null;
        }>;
      };

    assert.equal(getMavnadimDekelSelectionResponse.status, 200);
    assert.equal(
      getMavnadimDekelSelectionPayload.caseId,
      mavnadimCase.caseId,
    );
    assert.equal(
      getMavnadimDekelSelectionPayload.selections.length,
      2,
    );
    assert.equal(
      getMavnadimDekelSelectionPayload.selections[0].selectionContext,
      "mavnadim_ancillary",
    );

    const matchingCaseResponse = await fetch(`${baseUrl}/cases`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Fire cabinet case",
        createdBy: "tester",
        templateId: DEFAULT_TEMPLATE_ID,
        pricebookId: DEFAULT_PRICEBOOK_ID,
        description: "פירוק ארון כיבוי אש",
        notes: "matching smoke test",
      }),
    });
    const matchingCase = (await matchingCaseResponse.json()) as CaseRecord & {
      skill: string;
    };

    assert.equal(matchingCaseResponse.status, 201);
    assert.equal(matchingCase.skill, "product-manager");

    const candidatesResponse = await fetch(
      `${baseUrl}/cases/${matchingCase.caseId}/dekel-candidates?limit=2`,
    );
    const candidatesPayload = (await candidatesResponse.json()) as {
      caseId: string;
      skill: string;
      candidates: Array<{
        code: string;
        score: number;
      }>;
    };

    assert.equal(candidatesResponse.status, 200);
    assert.equal(candidatesPayload.caseId, matchingCase.caseId);
    assert.equal(candidatesPayload.skill, "rag-engineer");
    assert.equal(candidatesPayload.candidates.length, 2);
    assert.equal(candidatesPayload.candidates[0].code, "95.07.68.0001");
    assert.equal(candidatesPayload.candidates[1].code, "95.07.68.0002");
    assert.equal(candidatesPayload.candidates[0].score >= 0.7, true);

    const caseEstimateResponse = await fetch(
      `${baseUrl}/cases/${matchingCase.caseId}/dekel-estimate-preview?limit=2&managementFeePercent=14`,
    );
    const caseEstimatePayload = (await caseEstimateResponse.json()) as {
      caseId: string;
      skill: string;
      lines: Array<{
        description: string;
        amount: number;
      }>;
      executionSubtotal: number;
      managementFeeAmount: number;
      totalProjectCost: number;
    };

    assert.equal(caseEstimateResponse.status, 200);
    assert.equal(caseEstimatePayload.caseId, matchingCase.caseId);
    assert.equal(
      caseEstimatePayload.skill,
      "documentation-generation-doc-generate",
    );
    assert.equal(caseEstimatePayload.lines.length, 2);
    assert.equal(caseEstimatePayload.lines[0].description, "פירוק ארון כיבוי אש");
    assert.equal(caseEstimatePayload.executionSubtotal, 755);
    assert.equal(caseEstimatePayload.managementFeeAmount, 105.7);
    assert.equal(caseEstimatePayload.totalProjectCost, 860.7);

    const outputDraftBeforeSelectionResponse = await fetch(
      `${baseUrl}/cases/${matchingCase.caseId}/output-draft?managementFeePercent=14`,
    );
    const outputDraftBeforeSelection = (await outputDraftBeforeSelectionResponse.json()) as {
      error: string;
      message: string;
    };

    assert.equal(outputDraftBeforeSelectionResponse.status, 409);
    assert.equal(outputDraftBeforeSelection.error, "ApplicationError");
    assert.ok(outputDraftBeforeSelection.message.includes("confirmed DEKEL selection"));

    const selectionResponse = await fetch(
      `${baseUrl}/cases/${matchingCase.caseId}/dekel-selection`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          selectedBy: "reviewer-a",
          lines: [
            {
              code: "95.07.68.0002",
              quantity: 2,
            },
            {
              code: "95.07.68.0001",
              quantity: 1,
            },
          ],
        }),
      },
    );
    const selectionPayload = (await selectionResponse.json()) as {
      caseId: string;
      skill: string;
      executionSkill: string;
      selections: Array<{
        selectionId: string;
        code: string;
        quantity: number;
        selectedBy: string;
        responsibleSkill: string;
      }>;
      caseStatus: {
        status: string;
        reviewStatus: string;
        finalStatus: string;
      };
      estimatePreview: {
        lines: Array<{
          sourceCode: string;
          quantity: number;
          amount: number;
        }>;
        executionSubtotal: number;
        managementFeeAmount: number;
        totalProjectCost: number;
      };
    };

    assert.equal(selectionResponse.status, 200);
    assert.equal(selectionPayload.caseId, matchingCase.caseId);
    assert.equal(selectionPayload.skill, "backend-development-feature-development");
    assert.equal(selectionPayload.executionSkill, "backend-dev-guidelines");
    assert.equal(selectionPayload.selections.length, 2);
    assert.ok(selectionPayload.selections[0].selectionId.length > 0);
    assert.equal(selectionPayload.selections[0].code, "95.07.68.0002");
    assert.equal(selectionPayload.selections[0].quantity, 2);
    assert.equal(selectionPayload.selections[0].selectedBy, "reviewer-a");
    assert.equal(
      selectionPayload.selections[0].responsibleSkill,
      "backend-dev-guidelines",
    );
    assert.equal(selectionPayload.caseStatus.status, "approved");
    assert.equal(selectionPayload.caseStatus.reviewStatus, "approved");
    assert.equal(selectionPayload.caseStatus.finalStatus, "approved");
    assert.equal(selectionPayload.estimatePreview.lines[0].sourceCode, "95.07.68.0002");
    assert.equal(selectionPayload.estimatePreview.lines[0].quantity, 2);
    assert.equal(selectionPayload.estimatePreview.lines[0].amount, 870);
    assert.equal(selectionPayload.estimatePreview.executionSubtotal, 1190);
    assert.equal(selectionPayload.estimatePreview.managementFeeAmount, 166.6);
    assert.equal(selectionPayload.estimatePreview.totalProjectCost, 1356.6);

    const getSelectionResponse = await fetch(
      `${baseUrl}/cases/${matchingCase.caseId}/dekel-selection?managementFeePercent=14`,
    );
    const getSelectionPayload = (await getSelectionResponse.json()) as {
      caseId: string;
      skill: string;
      selections: Array<{
        code: string;
        quantity: number;
      }>;
      estimatePreview: {
        lines: Array<{
          sourceCode: string;
          quantity: number;
        }>;
        executionSubtotal: number;
      };
    };

    assert.equal(getSelectionResponse.status, 200);
    assert.equal(getSelectionPayload.caseId, matchingCase.caseId);
    assert.equal(getSelectionPayload.skill, "backend-development-feature-development");
    assert.equal(getSelectionPayload.selections.length, 2);
    assert.equal(getSelectionPayload.selections[0].code, "95.07.68.0002");
    assert.equal(getSelectionPayload.selections[0].quantity, 2);
    assert.equal(getSelectionPayload.estimatePreview.lines[0].sourceCode, "95.07.68.0002");
    assert.equal(getSelectionPayload.estimatePreview.executionSubtotal, 1190);

    const selectedCaseEstimateResponse = await fetch(
      `${baseUrl}/cases/${matchingCase.caseId}/dekel-estimate-preview?limit=2&managementFeePercent=14`,
    );
    const selectedCaseEstimatePayload = (await selectedCaseEstimateResponse.json()) as {
      caseId: string;
      skill: string;
      lines: Array<{
        sourceCode: string;
        quantity: number;
        amount: number;
      }>;
      executionSubtotal: number;
      managementFeeAmount: number;
      totalProjectCost: number;
    };

    assert.equal(selectedCaseEstimateResponse.status, 200);
    assert.equal(selectedCaseEstimatePayload.caseId, matchingCase.caseId);
    assert.equal(
      selectedCaseEstimatePayload.skill,
      "documentation-generation-doc-generate",
    );
    assert.equal(selectedCaseEstimatePayload.lines.length, 2);
    assert.equal(selectedCaseEstimatePayload.lines[0].sourceCode, "95.07.68.0002");
    assert.equal(selectedCaseEstimatePayload.lines[0].quantity, 2);
    assert.equal(selectedCaseEstimatePayload.lines[0].amount, 870);
    assert.equal(selectedCaseEstimatePayload.executionSubtotal, 1190);
    assert.equal(selectedCaseEstimatePayload.managementFeeAmount, 166.6);
    assert.equal(selectedCaseEstimatePayload.totalProjectCost, 1356.6);

    const outputDraftResponse = await fetch(
      `${baseUrl}/cases/${matchingCase.caseId}/output-draft?managementFeePercent=14`,
    );
    const outputDraftPayload = (await outputDraftResponse.json()) as {
      caseId: string;
      skill: string;
      executionSkill: string;
      supportingSkills: string[];
      template: {
        templateId: string;
      };
      document: {
        projectDescription: string;
        omdanSection: {
          sectionTitle: string;
          lines: Array<{
            code: string;
            quantity: number;
            amount: number;
          }>;
          executionSubtotal: number;
          totalProjectCost: number;
        };
        budgetBreakdownSection: { rows: unknown[] };
        scheduleSection: { rows: unknown[]; months: number[] };
        riskManagementSection: { rows: unknown[] };
      };
      templateBindings: {
        projectDescription: string;
        totalAmount: number;
        scheduleDurationMonths: number;
        riskItemsCount: number;
      };
      reviewSummary: {
        selectedLinesCount: number;
        reviewDecisionsCount: number;
      };
    };

    assert.equal(outputDraftResponse.status, 200);
    assert.equal(outputDraftPayload.caseId, matchingCase.caseId);
    assert.equal(
      outputDraftPayload.skill,
      "documentation-generation-doc-generate",
    );
    assert.equal(outputDraftPayload.executionSkill, "architecture");
    assert.ok(outputDraftPayload.supportingSkills.includes("product-manager"));
    assert.equal(outputDraftPayload.template.templateId, DEFAULT_TEMPLATE_ID);
    assert.equal(outputDraftPayload.document.omdanSection.sectionTitle, "אומדן");
    assert.equal(outputDraftPayload.document.omdanSection.lines.length, 2);
    assert.equal(outputDraftPayload.document.omdanSection.lines[0].code, "95.07.68.0002");
    assert.equal(outputDraftPayload.document.omdanSection.lines[0].quantity, 2);
    assert.equal(outputDraftPayload.document.omdanSection.lines[0].amount, 870);
    assert.equal(outputDraftPayload.document.omdanSection.executionSubtotal, 1190);
    assert.equal(outputDraftPayload.document.omdanSection.totalProjectCost, 1356.6);
    assert.equal(
      outputDraftPayload.document.projectDescription,
      "פירוק ארון כיבוי אש",
    );
    assert.equal(
      outputDraftPayload.document.budgetBreakdownSection.rows.length >= 1,
      true,
    );
    assert.equal(
      outputDraftPayload.document.scheduleSection.rows.length,
      6,
    );
    assert.equal(
      outputDraftPayload.document.riskManagementSection.rows.length >= 2,
      true,
    );
    assert.equal(
      outputDraftPayload.templateBindings.projectDescription,
      "פירוק ארון כיבוי אש",
    );
    assert.equal(outputDraftPayload.templateBindings.totalAmount, 1356.6);
    assert.equal(
      outputDraftPayload.templateBindings.scheduleDurationMonths,
      outputDraftPayload.document.scheduleSection.months.length,
    );
    assert.equal(
      outputDraftPayload.templateBindings.riskItemsCount,
      outputDraftPayload.document.riskManagementSection.rows.length,
    );
    assert.equal(outputDraftPayload.reviewSummary.selectedLinesCount, 2);
    assert.equal(outputDraftPayload.reviewSummary.reviewDecisionsCount, 1);

    const generateResponse = await fetch(
      `${baseUrl}/cases/${matchingCase.caseId}/generate?managementFeePercent=14`,
      {
        method: "POST",
      },
    );
    const generatePayload = (await generateResponse.json()) as {
      caseId: string;
      skill: string;
      executionSkill: string;
      exportManifest: {
        exportDirectory: string;
        artifacts: Array<{
          kind: string;
          relativePath: string;
        }>;
      };
      mainDocument: {
        document: {
          omdanSection: {
            totalProjectCost: number;
          };
          budgetBreakdownSection: {
            rows: Array<{
              subject: string;
            }>;
          };
        };
      };
      caseStatus: {
        status: string;
        reviewStatus: string;
        finalStatus: string;
      };
    };

    assert.equal(generateResponse.status, 200);
    assert.equal(generatePayload.caseId, matchingCase.caseId);
    assert.equal(
      generatePayload.skill,
      "documentation-generation-doc-generate",
    );
    assert.equal(generatePayload.executionSkill, "architecture");
    assert.equal(
      generatePayload.mainDocument.document.omdanSection.totalProjectCost,
      1356.6,
    );
    assert.equal(
      generatePayload.mainDocument.document.budgetBreakdownSection.rows.length >= 1,
      true,
    );
    assert.equal(generatePayload.exportManifest.artifacts.length, 4);
    assert.ok(generatePayload.exportManifest.exportDirectory.includes("artifacts"));
    assert.ok(
      generatePayload.exportManifest.artifacts.some(
        (artifact) => artifact.kind === "main_document",
      ),
    );
    assert.equal(generatePayload.caseStatus.status, "output_ready");
    assert.equal(generatePayload.caseStatus.reviewStatus, "approved");
    assert.equal(generatePayload.caseStatus.finalStatus, "generated");

    const outputsResponse = await fetch(
      `${baseUrl}/cases/${matchingCase.caseId}/outputs?managementFeePercent=14`,
    );
    const outputsPayload = (await outputsResponse.json()) as {
      caseId: string;
      skill: string;
      executionSkill: string;
      mainDocument: {
        document: {
          omdanSection: {
            lines: Array<{
              code: string;
              quantity: number;
            }>;
          };
          scheduleSection: {
            rows: Array<{
              activity: string;
            }>;
          };
        };
      };
      detailedCostSheet: {
        lines: Array<{
          code: string;
          quantity: number;
          amount: number;
        }>;
      };
      reviewSheet: {
        selectedLines: Array<{
          code: string;
        }>;
        reviewDecisions: Array<{
          decisionType: string;
        }>;
      };
    };

    assert.equal(outputsResponse.status, 200);
    assert.equal(outputsPayload.caseId, matchingCase.caseId);
    assert.equal(
      outputsPayload.skill,
      "documentation-generation-doc-generate",
    );
    assert.equal(outputsPayload.executionSkill, "architecture");
    assert.equal(outputsPayload.mainDocument.document.omdanSection.lines.length, 2);
    assert.equal(outputsPayload.mainDocument.document.omdanSection.lines[0].code, "95.07.68.0002");
    assert.equal(outputsPayload.mainDocument.document.scheduleSection.rows.length, 6);
    assert.equal(outputsPayload.detailedCostSheet.lines.length, 2);
    assert.equal(outputsPayload.detailedCostSheet.lines[0].code, "95.07.68.0002");
    assert.equal(outputsPayload.detailedCostSheet.lines[0].quantity, 2);
    assert.equal(outputsPayload.detailedCostSheet.lines[0].amount, 870);
    assert.equal(outputsPayload.reviewSheet.selectedLines.length, 2);
    assert.equal(outputsPayload.reviewSheet.selectedLines[0].code, "95.07.68.0002");
    assert.equal(
      outputsPayload.reviewSheet.reviewDecisions[0].decisionType,
      "confirm_dekel_selection",
    );

    const storedCaseResponse = await fetch(`${baseUrl}/cases/${matchingCase.caseId}`);
    const storedCase = (await storedCaseResponse.json()) as CaseRecord;

    assert.equal(storedCaseResponse.status, 200);
    assert.equal(storedCase.status, "output_ready");
    assert.equal(storedCase.reviewStatus, "approved");
    assert.equal(storedCase.finalStatus, "generated");
    assert.equal(storedCase.analysis.selectedDekelLines.length, 2);
    assert.equal(storedCase.analysis.selectedDekelLines[0].code, "95.07.68.0002");
    assert.equal(storedCase.analysis.selectedDekelLines[0].quantity, 2);
    assert.equal(storedCase.analysis.generatedArtifacts.length, 4);
    assert.ok(
      storedCase.analysis.generatedArtifacts.some(
        (artifact) => artifact.kind === "output_package",
      ),
    );
    assert.equal(
      storedCase.analysis.selectedDekelLines[0].responsibleSkill,
      "backend-dev-guidelines",
    );

    const clarificationCreateResponse = await fetch(`${baseUrl}/cases`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Clarification smoke case",
        createdBy: "tester",
        templateId: DEFAULT_TEMPLATE_ID,
        pricebookId: DEFAULT_PRICEBOOK_ID,
        description: "Need floor replacement in the damaged room.",
        dimensions: {},
        supportingEvidence: [],
        notes: "clarification smoke test",
      }),
    });
    const clarificationCase = (await clarificationCreateResponse.json()) as CaseRecord;

    assert.equal(clarificationCreateResponse.status, 201);
    assert.ok(clarificationCase.caseId);

    const clarificationAnalyzeResponse = await fetch(
      `${baseUrl}/cases/${clarificationCase.caseId}/analyze`,
      {
        method: "POST",
      },
    );
    const clarificationAnalyzed = (await clarificationAnalyzeResponse.json()) as CaseRecord & {
      skill: string;
    };

    assert.equal(clarificationAnalyzeResponse.status, 200);
    assert.equal(clarificationAnalyzed.status, "needs_clarification");
    assert.equal(clarificationAnalyzed.skill, "product-manager");
    assert.ok(
      clarificationAnalyzed.analysis.missingInputs.includes("dimensions.length_width"),
    );
    assert.equal(
      clarificationAnalyzed.analysis.clarificationQuestions[0]?.answerStatus,
      "open",
    );

    const clarificationsResponse = await fetch(
      `${baseUrl}/cases/${clarificationCase.caseId}/clarifications`,
    );
    const clarificationsPayload = (await clarificationsResponse.json()) as {
      caseId: string;
      skill: string;
      executionSkill: string;
      missingInputs: string[];
      questions: Array<{
        questionId: string;
        fieldKey: string;
        answerStatus: string;
      }>;
    };

    assert.equal(clarificationsResponse.status, 200);
    assert.equal(clarificationsPayload.caseId, clarificationCase.caseId);
    assert.equal(clarificationsPayload.skill, "ask-questions-if-underspecified");
    assert.equal(
      clarificationsPayload.executionSkill,
      "ask-questions-if-underspecified",
    );
    assert.ok(
      clarificationsPayload.missingInputs.includes("dimensions.length_width"),
    );
    assert.equal(clarificationsPayload.questions[0]?.answerStatus, "open");

    const clarificationSubmitResponse = await fetch(
      `${baseUrl}/cases/${clarificationCase.caseId}/clarifications`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          answeredBy: "tester",
          answers: [
            {
              fieldKey: "dimensions.length_width",
              answerValue: "length 5 width 4",
            },
          ],
        }),
      },
    );
    const clarifiedCase = (await clarificationSubmitResponse.json()) as CaseRecord & {
      skill: string;
      executionSkill: string;
      supportingSkills: string[];
    };

    assert.equal(clarificationSubmitResponse.status, 200);
    assert.equal(clarifiedCase.skill, "ask-questions-if-underspecified");
    assert.equal(
      clarifiedCase.executionSkill,
      "ask-questions-if-underspecified",
    );
    assert.ok(clarifiedCase.supportingSkills.includes("product-manager"));
    assert.equal(clarifiedCase.status, "review_pending");
    assert.equal(clarifiedCase.dimensions.length, 5);
    assert.equal(clarifiedCase.dimensions.width, 4);
    assert.equal(clarifiedCase.reviewStatus, "required");
    assert.equal(clarifiedCase.finalStatus, "preliminary");
    assert.equal(
      clarifiedCase.analysis.reviewDecisions.some(
        (decision) => decision.decisionType === "clarification_answer",
      ),
      true,
    );
    assert.equal(
      clarifiedCase.analysis.pipelineTrace.find((event) => event.stage === "clarification")
        ?.status,
      "completed",
    );
    assert.equal(
      clarifiedCase.analysis.clarificationQuestions.length,
      0,
    );

    const unitClarificationCreateResponse = await fetch(`${baseUrl}/cases`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Unit clarification smoke case",
        createdBy: "tester",
        templateId: DEFAULT_TEMPLATE_ID,
        pricebookId: DEFAULT_PRICEBOOK_ID,
        description: "Need to replace the interior door at the entrance.",
        dimensions: {},
        supportingEvidence: [],
      }),
    });
    const unitClarificationCase =
      (await unitClarificationCreateResponse.json()) as CaseRecord;

    assert.equal(unitClarificationCreateResponse.status, 201);

    const unitClarificationAnalyzeResponse = await fetch(
      `${baseUrl}/cases/${unitClarificationCase.caseId}/analyze`,
      {
        method: "POST",
      },
    );
    const unitClarificationAnalyzed =
      (await unitClarificationAnalyzeResponse.json()) as CaseRecord;

    assert.equal(unitClarificationAnalyzeResponse.status, 200);
    assert.equal(unitClarificationAnalyzed.status, "needs_clarification");
    assert.ok(
      unitClarificationAnalyzed.analysis.missingInputs.includes("dimensions.units"),
    );
    assert.equal(
      unitClarificationAnalyzed.analysis.missingInputs.includes("dimensions.length_width"),
      false,
    );

    const unitClarificationSubmitResponse = await fetch(
      `${baseUrl}/cases/${unitClarificationCase.caseId}/clarifications`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          answeredBy: "tester",
          answers: [
            {
              fieldKey: "dimensions.units",
              answerValue: "3",
            },
          ],
        }),
      },
    );
    const unitClarifiedCase = (await unitClarificationSubmitResponse.json()) as CaseRecord & {
      skill: string;
    };

    assert.equal(unitClarificationSubmitResponse.status, 200);
    assert.equal(unitClarifiedCase.skill, "ask-questions-if-underspecified");
    assert.equal(unitClarifiedCase.status, "review_pending");
    assert.equal(unitClarifiedCase.dimensions.units, 3);
    assert.equal(unitClarifiedCase.analysis.clarificationQuestions.length, 0);

    const scopeClarificationCreateResponse = await fetch(`${baseUrl}/cases`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Scope clarification smoke case",
        createdBy: "tester",
        templateId: DEFAULT_TEMPLATE_ID,
        pricebookId: DEFAULT_PRICEBOOK_ID,
        description: "Need help with the issue in the room.",
        dimensions: {},
        supportingEvidence: [],
      }),
    });
    const scopeClarificationCase =
      (await scopeClarificationCreateResponse.json()) as CaseRecord;

    assert.equal(scopeClarificationCreateResponse.status, 201);

    const scopeClarificationAnalyzeResponse = await fetch(
      `${baseUrl}/cases/${scopeClarificationCase.caseId}/analyze`,
      {
        method: "POST",
      },
    );
    const scopeClarificationAnalyzed =
      (await scopeClarificationAnalyzeResponse.json()) as CaseRecord;

    assert.equal(scopeClarificationAnalyzeResponse.status, 200);
    assert.equal(scopeClarificationAnalyzed.status, "needs_clarification");
    assert.ok(
      scopeClarificationAnalyzed.analysis.missingInputs.includes(
        "scope.primary_work_description",
      ),
    );
    assert.equal(
      scopeClarificationAnalyzed.analysis.clarificationQuestions[0]?.fieldKey,
      "scope.primary_work_description",
    );

    const scopeClarificationSubmitResponse = await fetch(
      `${baseUrl}/cases/${scopeClarificationCase.caseId}/clarifications`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          answeredBy: "tester",
          answers: [
            {
              fieldKey: "scope.primary_work_description",
              answerValue: "Replace 2 interior doors at the entrance.",
            },
          ],
        }),
      },
    );
    const scopeClarifiedCase =
      (await scopeClarificationSubmitResponse.json()) as CaseRecord & {
        skill: string;
      };

    assert.equal(scopeClarificationSubmitResponse.status, 200);
    assert.equal(scopeClarifiedCase.skill, "ask-questions-if-underspecified");
    assert.equal(scopeClarifiedCase.status, "review_pending");
    assert.equal(
      scopeClarifiedCase.analysis.workItems.some(
        (item) => item.workType === "door_replacement",
      ),
      true,
    );
    assert.equal(
      scopeClarifiedCase.analysis.missingInputs.includes(
        "scope.primary_work_description",
      ),
      false,
    );
    assert.equal(
      scopeClarifiedCase.rawDescription.includes(
        "Replace 2 interior doors at the entrance.",
      ),
      true,
    );

    const createResponse = await fetch(`${baseUrl}/cases`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Smoke test case",
        createdBy: "tester",
        templateId: DEFAULT_TEMPLATE_ID,
        pricebookId: DEFAULT_PRICEBOOK_ID,
        description:
          "Need to replace 2 interior doors and paint 12 square meters of wall.",
        dimensions: {
          length: 4,
          width: 3,
          wallAreaM2: 12,
          units: 2,
        },
        supportingEvidence: [
          {
            sourceType: "typed",
            format: "inline_text",
            role: "supporting",
            label: "operator-note",
            content: "Two internal doors are definitely in scope.",
          },
          {
            sourceType: "handwritten",
            format: "image",
            role: "supporting",
            label: "field-note",
            content: "possible extra wall repair near opening",
            confidence: 0.35,
          },
        ],
        notes: "http smoke test",
      }),
    });
    const created = (await createResponse.json()) as CaseRecord & {
      skill: string;
      skillSource: string;
    };

    assert.equal(createResponse.status, 201);
    assert.ok(created.caseId);
    assert.equal(created.status, "draft");
    assert.equal(created.skill, "product-manager");
    assert.equal(created.skillSource, "project-local");
    assert.equal(created.supportingEvidence.length, 2);
    assert.equal(created.supportingEvidence[0].usedInAnalysisFlag, true);
    assert.equal(created.supportingEvidence[1].reviewStatus, "needs_review");

    const analyzeResponse = await fetch(`${baseUrl}/cases/${created.caseId}/analyze`, {
      method: "POST",
    });
    const analyzed = (await analyzeResponse.json()) as CaseRecord & {
      skill: string;
      skillSource: string;
      supportingSkills: string[];
    };

    assert.equal(analyzeResponse.status, 200);
    assert.equal(analyzed.skill, "product-manager");
    assert.equal(analyzed.skillSource, "project-local");
    assert.ok(analyzed.supportingSkills.includes("brainstorming"));
    assert.equal(analyzed.reviewStatus, "required");
    assert.equal(analyzed.finalStatus, "preliminary");
    assert.equal(
      analyzed.normalizedDescription.includes("two internal doors are definitely in scope."),
      true,
    );
    assert.equal(
      analyzed.analysis.warnings.some((item) =>
        item.includes("Handwritten supporting evidence"),
      ),
      true,
    );
    assert.ok(analyzed.analysis.detailedCostLines.length >= 1);
    assert.ok(analyzed.analysis.aggregatedTemplateLines.length >= 1);
    assert.equal(
      analyzed.analysis.pipelineTrace.find((event) => event.stage === "matching")
        ?.responsibleSkill,
      "rag-engineer",
    );
    assert.equal(
      analyzed.analysis.pipelineTrace.find((event) => event.stage === "output")
        ?.routeCategory,
      "Document generation / template flow",
    );
    assert.ok(
      analyzed.analysis.pipelineTrace
        .find((event) => event.stage === "work_understanding")
        ?.supportingSkills.includes("brainstorming"),
    );

    const statusResponse = await fetch(`${baseUrl}/cases/${created.caseId}/status`);
    const status = (await statusResponse.json()) as {
      caseId: string;
      status: CaseRecord["status"];
      trace: Array<{
        stage: string;
        responsibleSkill?: string;
        routeCategory?: string;
      }>;
    };

    assert.equal(statusResponse.status, 200);
    assert.equal(status.caseId, created.caseId);
    assert.equal(status.status, "review_pending");
    assert.equal(status.trace.at(-1)?.stage, "output");
    assert.equal(status.trace.at(-1)?.responsibleSkill, "documentation-generation-doc-generate");

    const skillLogFiles = await readdir(skillLogsDirectoryPath);

    assert.equal(skillLogFiles.length >= 1, true);

    const latestSkillLog = await readFile(
      path.join(skillLogsDirectoryPath, skillLogFiles[0]),
      "utf8",
    );
    const skillLogEntries = latestSkillLog
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    assert.equal(skillLogEntries.length >= 10, true);
    assert.ok(
      skillLogEntries.some(
        (entry) =>
          entry.route_category ===
            "AI / RAG / retrieval / matching / evaluation" &&
          entry.skill === "rag-engineer",
      ),
    );
    assert.ok(
      skillLogEntries.some(
        (entry) =>
          entry.route_category === "Document generation / template flow" &&
          entry.skill === "documentation-generation-doc-generate",
      ),
    );
    assert.ok(
      skillLogEntries.some(
        (entry) =>
          entry.route_category === "Product / discovery / brainstorming" &&
          entry.skill === "ask-questions-if-underspecified",
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await rm(path.dirname(workbookPath), { recursive: true, force: true });
    await rm(skillLogsDirectoryPath, { recursive: true, force: true });
    await rm(artifactsDirectoryPath, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await testPipelineHappyPath();
  console.log("PASS testPipelineHappyPath");
  await testPipelineClarification();
  console.log("PASS testPipelineClarification");
  await testPipelineExtractsExplicitQuantities();
  console.log("PASS testPipelineExtractsExplicitQuantities");
  await testPipelineUnderstandsCompactAreaShorthand();
  console.log("PASS testPipelineUnderstandsCompactAreaShorthand");
  await testPipelineClarificationForUnitCount();
  console.log("PASS testPipelineClarificationForUnitCount");
  await testPipelineClarificationForGenericScope();
  console.log("PASS testPipelineClarificationForGenericScope");
  await testPipelineTechnicalBlockersDoNotBecomeUserClarifications();
  console.log("PASS testPipelineTechnicalBlockersDoNotBecomeUserClarifications");
  await testPipelineSupportingEvidencePolicy();
  console.log("PASS testPipelineSupportingEvidencePolicy");
  await testPipelineAcceptsPrecomputedAnalysisInputs();
  console.log("PASS testPipelineAcceptsPrecomputedAnalysisInputs");
  testFlexibleIntakeDerivesDescriptionFromPrimaryDocument();
  console.log("PASS testFlexibleIntakeDerivesDescriptionFromPrimaryDocument");
  await testPipelineUnderstandsSewerLineDescription();
  console.log("PASS testPipelineUnderstandsSewerLineDescription");
  await testPipelineContinuesWithEstimatedAreaForLinearSewerRestoration();
  console.log(
    "PASS testPipelineContinuesWithEstimatedAreaForLinearSewerRestoration",
  );
  await testDekelOpenXmlReader();
  console.log("PASS testDekelOpenXmlReader");
  await testDekelPricebookAdapter();
  console.log("PASS testDekelPricebookAdapter");
  testDekelPricebookAdapterMapsMeterUnit();
  console.log("PASS testDekelPricebookAdapterMapsMeterUnit");
  testDekelRoutingHints();
  console.log("PASS testDekelRoutingHints");
  await testDekelMatchingService();
  console.log("PASS testDekelMatchingService");
  testDekelLargeCatalogIndexPreservesFullSearchResults();
  console.log("PASS testDekelLargeCatalogIndexPreservesFullSearchResults");
  testDekelMatchingChapterPreference();
  console.log("PASS testDekelMatchingChapterPreference");
  testDekelMatchingDownweightsThresholdNoise();
  console.log("PASS testDekelMatchingDownweightsThresholdNoise");
  testDekelMatchingUsesWorkItemAwareQueries();
  console.log("PASS testDekelMatchingUsesWorkItemAwareQueries");
  testDekelMatchingChapterPrefilterBoostsPreferredChapter();
  console.log("PASS testDekelMatchingChapterPrefilterBoostsPreferredChapter");
  testDekelMatchingPrefersPipeInstallationOverExcavationForSewerReplacement();
  console.log("PASS testDekelMatchingPrefersPipeInstallationOverExcavationForSewerReplacement");
  testDekelMatchingKeepsPipeCandidateInsideExpandedIntermediatePool();
  console.log("PASS testDekelMatchingKeepsPipeCandidateInsideExpandedIntermediatePool");
  testDekelMatchingRejectsSemanticallyWrongConstructionItems();
  console.log("PASS testDekelMatchingRejectsSemanticallyWrongConstructionItems");
  testDekelSearchQueryPlanPrefersPrimaryWorkItemsOverHiddenWork();
  console.log("PASS testDekelSearchQueryPlanPrefersPrimaryWorkItemsOverHiddenWork");
  await testCaseEstimatePreviewFromDekelCandidates();
  console.log("PASS testCaseEstimatePreviewFromDekelCandidates");
  testCaseEstimatePreviewFromDekelCandidatesUsesLinearQuantity();
  console.log("PASS testCaseEstimatePreviewFromDekelCandidatesUsesLinearQuantity");
  testCaseEstimatePreviewDoesNotConvertGeometryIntoAreaWithoutConfirmation();
  console.log("PASS testCaseEstimatePreviewDoesNotConvertGeometryIntoAreaWithoutConfirmation");
  testCaseEstimatePreviewBalancesSewerFamilies();
  console.log("PASS testCaseEstimatePreviewBalancesSewerFamilies");
  testCaseEstimatePreviewBalancesSewerFamiliesWhenCandidateCountEqualsLimit();
  console.log("PASS testCaseEstimatePreviewBalancesSewerFamiliesWhenCandidateCountEqualsLimit");
  testCaseEstimatePreviewIncludesConnectionOnlyWhenExplicitlyRequested();
  console.log("PASS testCaseEstimatePreviewIncludesConnectionOnlyWhenExplicitlyRequested");
  testCaseEstimatePreviewKeepsNonSewerOrderWithMaxLines();
  console.log("PASS testCaseEstimatePreviewKeepsNonSewerOrderWithMaxLines");
  testAutoConfirmSelectionLinesPreferEstimatePreview();
  console.log("PASS testAutoConfirmSelectionLinesPreferEstimatePreview");
  testAutoConfirmSelectionLinesFallbackToCandidates();
  console.log("PASS testAutoConfirmSelectionLinesFallbackToCandidates");
  testCaseEstimatePreviewFromSelectedDekelLines();
  console.log("PASS testCaseEstimatePreviewFromSelectedDekelLines");
  await testMavnadimCatalogService();
  console.log("PASS testMavnadimCatalogService");
  await testMavnadimMatching();
  console.log("PASS testMavnadimMatching");
  await testMavnadimMatchingUsesDimensionBoostForPair();
  console.log("PASS testMavnadimMatchingUsesDimensionBoostForPair");
  await testMavnadimMatchingUsesDimensionBoostForAreaLabel();
  console.log("PASS testMavnadimMatchingUsesDimensionBoostForAreaLabel");
  await testMavnadimAncillaryRecommendations();
  console.log("PASS testMavnadimAncillaryRecommendations");
  await testMavnadimDekelPackagePreview();
  console.log("PASS testMavnadimDekelPackagePreview");
  await testSkillOrchestratorService();
  console.log("PASS testSkillOrchestratorService");
  testCaseOutputDraftBuilder();
  console.log("PASS testCaseOutputDraftBuilder");
  testCaseOutputDraftUsesCompactScopeFragmentsWithoutConfirmedDekelLines();
  console.log(
    "PASS testCaseOutputDraftUsesCompactScopeFragmentsWithoutConfirmedDekelLines",
  );
  testCaseOutputDraftUsesDetectedWorkLocationInNarrativeSections();
  console.log("PASS testCaseOutputDraftUsesDetectedWorkLocationInNarrativeSections");
  testCaseOutputPackageBuilder();
  console.log("PASS testCaseOutputPackageBuilder");
  await testCaseOutputExportService();
  console.log("PASS testCaseOutputExportService");
  await testDekelEstimatePreview();
  console.log("PASS testDekelEstimatePreview");
  await testDekelXlsxReader();
  console.log("PASS testDekelXlsxReader");
  await testPipelineUsesLiveDekelFallbackForSewerLine();
  console.log("PASS testPipelineUsesLiveDekelFallbackForSewerLine");
  await testHttpFlow();
  console.log("PASS testHttpFlow");
  console.log("All tests passed.");
}

main().catch((error) => {
  console.error("Test run failed.");
  console.error(error);
  process.exitCode = 1;
});

async function createFixtureDekelXlsx(): Promise<string> {
  const currentFilePath = fileURLToPath(import.meta.url);
  const fixtureRoot = path.join(
    path.dirname(currentFilePath),
    "fixtures",
    "dekel-openxml",
  );
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "mashmauet-dekel-"));
  const workbookPath = path.join(tempDirectory, "fixture.xlsx");
  const workbookXml = await readFile(
    path.join(fixtureRoot, "xl", "workbook.xml"),
    "utf8",
  );
  const workbookRelsXml = await readFile(
    path.join(fixtureRoot, "xl", "_rels", "workbook.xml.rels"),
    "utf8",
  );
  const sharedStringsXml = await readFile(
    path.join(fixtureRoot, "xl", "sharedStrings.xml"),
    "utf8",
  );
  const worksheetXml = await readFile(
    path.join(fixtureRoot, "xl", "worksheets", "sheet1.xml"),
    "utf8",
  );

  const workbookBuffer = buildStoredZip([
    {
      name: "xl/workbook.xml",
      content: workbookXml,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: workbookRelsXml,
    },
    {
      name: "xl/sharedStrings.xml",
      content: sharedStringsXml,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: worksheetXml,
    },
  ]);

  await writeFile(workbookPath, workbookBuffer);
  return workbookPath;
}

function buildStoredZip(
  entries: Array<{ name: string; content: string }>,
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const dataBuffer = Buffer.from(entry.content, "utf8");
    const crc32 = computeCrc32(dataBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc32, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc32, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

const crc32Table = buildCrc32Table();

function computeCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const value of buffer) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ value) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrc32Table(): number[] {
  const table: number[] = [];

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table.push(value >>> 0);
  }

  return table;
}
