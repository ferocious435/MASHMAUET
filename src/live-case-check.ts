import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

import { createApp } from "./app/create-app.ts";
import { buildAutoConfirmSelectionLines } from "./live-check/auto-confirm-selection.ts";
import {
  DEFAULT_PRICEBOOK_ID,
  DEFAULT_TEMPLATE_ID,
} from "./modules/references/repositories/in-memory-reference-repositories.ts";

interface LiveCheckOptions {
  workbookPath?: string;
  outputDirectory?: string;
  title?: string;
  description?: string;
  notes?: string;
  createdBy?: string;
  length?: number;
  width?: number;
  units?: number;
  lineLengthMeters?: number;
  candidateLimit: number;
  managementFeePercent: number;
  autoConfirmTop: number;
  generatePreview: boolean;
  caseFilePath?: string;
}

interface LiveCheckCasePayload {
  title: string;
  templateId: string;
  pricebookId: string;
  description?: string;
  dimensions?: {
    length?: number;
    width?: number;
    units?: number;
    lineLengthMeters?: number;
  };
  notes?: string;
  createdBy: string;
  supportingEvidence: Array<{
    sourceType: "typed" | "handwritten" | "document" | "photo";
    content?: string;
    extractedText?: string;
    format?: "inline_text" | "text_file" | "pdf" | "image";
    role?: "primary" | "supporting" | "visual_reference";
    fileName?: string;
    label?: string;
    confidence?: number;
  }>;
}

interface JsonObject {
  [key: string]: unknown;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const workbookPath = options.workbookPath ?? (await findDefaultDekelWorkbook());
  const payload = await buildCasePayload(options);
  const outputDirectory =
    options.outputDirectory ??
    path.join(
      process.cwd(),
      "artifacts",
      "live-checks",
      `${buildTimestampSlug()}-${slugify(payload.title)}`,
    );
  const logsDirectory = path.join(outputDirectory, "skill-logs");
  const generatedArtifactsDirectory = path.join(outputDirectory, "generated-preview");

  await mkdir(outputDirectory, { recursive: true });
  await mkdir(logsDirectory, { recursive: true });
  await mkdir(generatedArtifactsDirectory, { recursive: true });

  const app = createApp({
    dekelWorkbookPath: workbookPath,
    skillLogsDirectoryPath: logsDirectory,
    artifactsDirectoryPath: generatedArtifactsDirectory,
  });
  const server = createServer(app.handleRequest);

  try {
    const baseUrl = await listen(server);
    const catalog = await fetchJson(
      `${baseUrl}/catalog`,
      {
        method: "GET",
      },
      path.join(outputDirectory, "00-catalog.json"),
    );
    const created = await fetchJson(
      `${baseUrl}/cases`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      path.join(outputDirectory, "01-create-case.json"),
    );
    const caseId = String((created.body as JsonObject).caseId ?? "");
    if (caseId.length === 0) {
      throw new Error("Live-check failed: caseId was not returned by POST /cases.");
    }

    const analyzed = await fetchJson(
      `${baseUrl}/cases/${caseId}/analyze`,
      {
        method: "POST",
      },
      path.join(outputDirectory, "02-analyze-case.json"),
    );
    const status = await fetchJson(
      `${baseUrl}/cases/${caseId}/status`,
      {
        method: "GET",
      },
      path.join(outputDirectory, "03-case-status.json"),
    );

    let clarifications: FetchResult | null = null;
    const analyzedBody = analyzed.body as JsonObject;
    if (String(analyzedBody.status ?? "") === "needs_clarification") {
      clarifications = await fetchJson(
        `${baseUrl}/cases/${caseId}/clarifications`,
        {
          method: "GET",
        },
        path.join(outputDirectory, "04-clarifications.json"),
      );
    }

    const candidates = await fetchJson(
      `${baseUrl}/cases/${caseId}/dekel-candidates?limit=${options.candidateLimit}`,
      {
        method: "GET",
      },
      path.join(outputDirectory, "05-dekel-candidates.json"),
    );
    const estimatePreview = await fetchJson(
      `${baseUrl}/cases/${caseId}/dekel-estimate-preview?limit=${options.candidateLimit}&managementFeePercent=${options.managementFeePercent}`,
      {
        method: "GET",
      },
      path.join(outputDirectory, "06-dekel-estimate-preview.json"),
    );

    let selectionPreview: FetchResult | null = null;
    let outputDraft: FetchResult | null = null;
    let outputPackage: FetchResult | null = null;
    let generatedPreview: FetchResult | null = null;

    const selectedLines =
      String(analyzedBody.status ?? "") === "needs_clarification"
        ? []
        : buildAutoConfirmSelectionLines({
            estimatePreviewBody: estimatePreview.body,
            candidatesBody: candidates.body,
            autoConfirmTop: options.autoConfirmTop,
            dimensions: payload.dimensions,
            description: payload.description,
          });
    if (selectedLines.length > 0) {

      selectionPreview = await fetchJson(
        `${baseUrl}/cases/${caseId}/dekel-selection?managementFeePercent=${options.managementFeePercent}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            selectedBy: "live-check-auto-preview",
            lines: selectedLines,
          }),
        },
        path.join(outputDirectory, "07-selection-preview.json"),
      );
      outputDraft = await fetchJson(
        `${baseUrl}/cases/${caseId}/output-draft?managementFeePercent=${options.managementFeePercent}`,
        {
          method: "GET",
        },
        path.join(outputDirectory, "08-output-draft.json"),
      );
      outputPackage = await fetchJson(
        `${baseUrl}/cases/${caseId}/outputs?managementFeePercent=${options.managementFeePercent}`,
        {
          method: "GET",
        },
        path.join(outputDirectory, "09-output-package.json"),
      );

      if (options.generatePreview) {
        generatedPreview = await fetchJson(
          `${baseUrl}/cases/${caseId}/generate?managementFeePercent=${options.managementFeePercent}`,
          {
            method: "POST",
          },
          path.join(outputDirectory, "10-generated-preview.json"),
        );
      }
    } else {
      await writeSkippedArtifact(
        path.join(outputDirectory, "07-selection-preview.json"),
        "Selection preview was skipped because the case still requires clarification.",
      );
      await writeSkippedArtifact(
        path.join(outputDirectory, "08-output-draft.json"),
        "Output draft was skipped because the case still requires clarification.",
      );
      await writeSkippedArtifact(
        path.join(outputDirectory, "09-output-package.json"),
        "Output package was skipped because the case still requires clarification.",
      );
      if (options.generatePreview) {
        await writeSkippedArtifact(
          path.join(outputDirectory, "10-generated-preview.json"),
          "Generated preview was skipped because the case still requires clarification.",
        );
      }
    }

    const reportPath = path.join(outputDirectory, "report.md");
    await writeFile(
      reportPath,
      buildReport({
        workbookPath,
        outputDirectory,
        payload,
        catalog,
        created,
        analyzed,
        status,
        clarifications,
        candidates,
        estimatePreview,
        selectionPreview,
        outputDraft,
        outputPackage,
        generatedPreview,
      }),
      "utf8",
    );

    console.log(`Live check completed.`);
    console.log(`Report: ${reportPath}`);
    console.log(`Output directory: ${outputDirectory}`);
  } finally {
    app.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

async function buildCasePayload(
  options: LiveCheckOptions,
): Promise<LiveCheckCasePayload> {
  if (options.caseFilePath) {
    const raw = await readFile(options.caseFilePath, "utf8");
    const payload = JSON.parse(stripUtf8Bom(raw)) as LiveCheckCasePayload;
    return {
      ...payload,
      createdBy: payload.createdBy ?? "live-check",
      templateId: payload.templateId ?? DEFAULT_TEMPLATE_ID,
      pricebookId: payload.pricebookId ?? DEFAULT_PRICEBOOK_ID,
      description:
        payload.description ?? deriveDescriptionFromSupportingEvidence(payload.supportingEvidence),
      supportingEvidence: payload.supportingEvidence ?? [],
    };
  }

  const dimensions: LiveCheckCasePayload["dimensions"] = {};
  if (options.length !== undefined) {
    dimensions.length = options.length;
  }
  if (options.width !== undefined) {
    dimensions.width = options.width;
  }
  if (options.units !== undefined) {
    dimensions.units = options.units;
  }

  return {
    title: options.title ?? "Live check - fire cabinet",
    templateId: DEFAULT_TEMPLATE_ID,
    pricebookId: DEFAULT_PRICEBOOK_ID,
    description: options.description ?? "פירוק והרכבה של ארון כיבוי אש",
    dimensions,
    notes:
      options.notes ??
      "Live exploratory check against the current agent and live DEKEL workbook.",
    createdBy: options.createdBy ?? "live-check",
    supportingEvidence: [],
  };
}

function stripUtf8Bom(value: string): string {
  return value.replace(/^\uFEFF/u, "");
}

function deriveDescriptionFromSupportingEvidence(
  supportingEvidence: LiveCheckCasePayload["supportingEvidence"] | undefined,
): string | undefined {
  const evidenceItems = supportingEvidence ?? [];
  const primaryText = evidenceItems.find(
    (evidence) =>
      evidence.role === "primary" &&
      typeof evidence.extractedText === "string" &&
      evidence.extractedText.trim().length > 0,
  )?.extractedText;
  if (primaryText && primaryText.trim().length > 0) {
    return primaryText.trim();
  }

  const primaryContent = evidenceItems.find(
    (evidence) =>
      evidence.role === "primary" &&
      typeof evidence.content === "string" &&
      evidence.content.trim().length > 0,
  )?.content;
  if (primaryContent && primaryContent.trim().length > 0) {
    return primaryContent.trim();
  }

  const fallbackExtractedText = evidenceItems.find(
    (evidence) =>
      typeof evidence.extractedText === "string" &&
      evidence.extractedText.trim().length > 0,
  )?.extractedText;
  if (fallbackExtractedText && fallbackExtractedText.trim().length > 0) {
    return fallbackExtractedText.trim();
  }

  const fallbackContent = evidenceItems.find(
    (evidence) =>
      typeof evidence.content === "string" &&
      evidence.content.trim().length > 0,
  )?.content;
  return fallbackContent?.trim();
}

function parseArgs(argv: string[]): LiveCheckOptions {
  const options: LiveCheckOptions = {
    candidateLimit: 5,
    managementFeePercent: 14,
    autoConfirmTop: 2,
    generatePreview: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    switch (current) {
      case "--workbook":
        options.workbookPath = next;
        index += 1;
        break;
      case "--out-dir":
        options.outputDirectory = next;
        index += 1;
        break;
      case "--title":
        options.title = next;
        index += 1;
        break;
      case "--description":
        options.description = next;
        index += 1;
        break;
      case "--notes":
        options.notes = next;
        index += 1;
        break;
      case "--created-by":
        options.createdBy = next;
        index += 1;
        break;
      case "--length":
        options.length = parseOptionalNumber(next);
        index += 1;
        break;
      case "--width":
        options.width = parseOptionalNumber(next);
        index += 1;
        break;
      case "--units":
        options.units = parseOptionalNumber(next);
        index += 1;
        break;
      case "--candidate-limit":
        options.candidateLimit = Math.max(1, Math.min(20, parseRequiredNumber(next)));
        index += 1;
        break;
      case "--management-fee":
        options.managementFeePercent = Math.max(
          0,
          Math.min(100, parseRequiredNumber(next)),
        );
        index += 1;
        break;
      case "--auto-confirm-top":
        options.autoConfirmTop = Math.max(0, Math.min(10, parseRequiredNumber(next)));
        index += 1;
        break;
      case "--generate-preview":
        options.generatePreview = true;
        break;
      case "--case-file":
        options.caseFilePath = next;
        index += 1;
        break;
      default:
        break;
    }
  }

  return options;
}

function parseRequiredNumber(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric argument, got: ${value ?? "undefined"}.`);
  }

  return parsed;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseRequiredNumber(value);
}

async function findDefaultDekelWorkbook(): Promise<string> {
  const dekelDirectory = path.join(process.cwd(), "HOMER", "DEKEL");
  const entries = await readdir(dekelDirectory, { withFileTypes: true });
  const workbook = entries.find(
    (entry) => entry.isFile() && /\.xlsx$/iu.test(entry.name),
  );
  if (!workbook) {
    throw new Error(`No .xlsx workbook found in ${dekelDirectory}.`);
  }

  return path.join(dekelDirectory, workbook.name);
}

async function listen(server: ReturnType<typeof createServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error("Live-check server failed to bind to a port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

interface FetchResult {
  status: number;
  body: unknown;
}

async function fetchJson(
  url: string,
  init: RequestInit,
  outputPath: string,
): Promise<FetchResult> {
  const response = await fetch(url, init);
  const text = await response.text();
  const parsedBody = text.length > 0 ? JSON.parse(text) : null;
  const result = {
    status: response.status,
    body: parsedBody,
  };

  await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
  return result;
}

async function writeSkippedArtifact(
  outputPath: string,
  reason: string,
): Promise<void> {
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        status: "skipped",
        reason,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function inferPreviewQuantity(
  candidate: JsonObject,
  dimensions: LiveCheckCasePayload["dimensions"] | undefined,
  description: string | undefined,
): number {
  const unit = String(candidate.unit ?? "");
  if (unit === "unit" && dimensions?.units) {
    return dimensions.units;
  }
  if (unit === "m2" && dimensions?.length && dimensions?.width) {
    return roundQuantity(dimensions.length * dimensions.width);
  }
  if (/^(m|meter|meters|מטר|מ(?:׳|'|")?)$/iu.test(unit)) {
    const explicitLength = extractExplicitLinearQuantity(description);
    if (explicitLength !== null) {
      return explicitLength;
    }
    if (dimensions?.lineLengthMeters) {
      return dimensions.lineLengthMeters;
    }
  }

  return 1;
}

function extractExplicitLinearQuantity(description: string | undefined): number | null {
  if (!description) {
    return null;
  }

  const contextualMatch = description.match(
    /(?:קו(?:\s+ביוב)?|sewer\s+line|drain(?:age)?\s+line|pipe|צינור)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*(?:m|meters?|מטר(?:ים)?)/iu,
  );
  if (contextualMatch?.[1]) {
    return roundQuantity(Number(contextualMatch[1].replace(",", ".")));
  }

  const genericMatches = [...description.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:m|meters?|מטר(?:ים)?)/giu)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (genericMatches.length === 0) {
    return null;
  }

  return roundQuantity(Math.max(...genericMatches));
}

function buildReport(input: {
  workbookPath: string;
  outputDirectory: string;
  payload: LiveCheckCasePayload;
  catalog: FetchResult;
  created: FetchResult;
  analyzed: FetchResult;
  status: FetchResult;
  clarifications: FetchResult | null;
  candidates: FetchResult;
  estimatePreview: FetchResult;
  selectionPreview: FetchResult | null;
  outputDraft: FetchResult | null;
  outputPackage: FetchResult | null;
  generatedPreview: FetchResult | null;
}): string {
  const analyzedBody = asObject(input.analyzed.body);
  const candidateRows = asArray(asObject(input.candidates.body).candidates);
  const estimateBody = asObject(input.estimatePreview.body);
  const warnings = asStringArray(asObject(analyzedBody.analysis).warnings);
  const assumptions = asStringArray(asObject(analyzedBody.analysis).assumptions);
  const missingInputs = asStringArray(asObject(analyzedBody.analysis).missingInputs);
  const pipelineTrace = asArray(asObject(input.status.body).trace);
  const observations = buildObservations({
    analyzedStatus: String(analyzedBody.status ?? ""),
    missingInputs,
    warnings,
    candidateRows,
    autoConfirmed: input.selectionPreview !== null,
  });

  const lines = [
    "# Live Check Report",
    "",
    `- Timestamp: ${new Date().toISOString()}`,
    `- Workbook: ${input.workbookPath}`,
    `- Output directory: ${input.outputDirectory}`,
    "",
    "## Input Case",
    "",
    `- Title: ${input.payload.title}`,
    `- Description: ${input.payload.description ?? "(derived from supporting evidence)"}`,
    `- Dimensions: ${JSON.stringify(input.payload.dimensions ?? {})}`,
    `- Auto confirm top candidates: ${input.selectionPreview ? "yes" : "no"}`,
    "",
    "## Analysis Result",
    "",
    `- Status: ${String(analyzedBody.status ?? "")}`,
    `- Review status: ${String(analyzedBody.reviewStatus ?? "")}`,
    `- Final status: ${String(analyzedBody.finalStatus ?? "")}`,
    `- Missing inputs: ${missingInputs.length > 0 ? missingInputs.join(", ") : "none"}`,
    `- Warnings: ${warnings.length}`,
    `- Assumptions: ${assumptions.length}`,
    "",
    "## Observations",
    "",
    ...observations.map((item) => `- ${item}`),
    "",
    "## Top Candidates",
    "",
    "| Code | Score | Unit | Unit Price | Reason |",
    "| --- | ---: | --- | ---: | --- |",
    ...candidateRows.slice(0, 5).map((item) => {
      const row = asObject(item);
      return `| ${String(row.code ?? "")} | ${String(row.score ?? "")} | ${String(
        row.unit ?? "",
      )} | ${String(row.unitPrice ?? "")} | ${String(row.matchReason ?? "")} |`;
    }),
    "",
    "## Estimate Preview",
    "",
    `- Execution subtotal: ${String(estimateBody.executionSubtotal ?? "")}`,
    `- Management fee percent: ${String(estimateBody.managementFeePercent ?? "")}`,
    `- Management fee amount: ${String(estimateBody.managementFeeAmount ?? "")}`,
    `- Total project cost: ${String(estimateBody.totalProjectCost ?? "")}`,
    "",
    "## Pipeline Trace",
    "",
    "| Stage | Status | Skill | Category |",
    "| --- | --- | --- | --- |",
    ...pipelineTrace.map((entry) => {
      const row = asObject(entry);
      return `| ${String(row.stage ?? "")} | ${String(row.status ?? "")} | ${String(
        row.responsibleSkill ?? "",
      )} | ${String(row.routeCategory ?? "")} |`;
    }),
    "",
  ];

  if (warnings.length > 0) {
    lines.push("## Warnings", "", ...warnings.map((item) => `- ${item}`), "");
  }

  if (assumptions.length > 0) {
    lines.push("## Assumptions", "", ...assumptions.map((item) => `- ${item}`), "");
  }

  if (input.clarifications) {
    const clarificationBody = asObject(input.clarifications.body);
    lines.push(
      "## Clarifications",
      "",
      ...asArray(clarificationBody.questions).map((question) => {
        const row = asObject(question);
        return `- ${String(row.fieldKey ?? "")}: ${String(row.questionText ?? "")}`;
      }),
      "",
    );
  }

  if (input.selectionPreview) {
    const selectionBody = asObject(input.selectionPreview.body);
    lines.push(
      "## Auto-confirm Preview",
      "",
      "- This selection was created automatically from balanced estimate-preview lines when available, with raw top candidates used only as fallback.",
      `- Selected lines count: ${asArray(selectionBody.selections).length}`,
      "",
    );
  }

  if (input.outputDraft) {
    const draftBody = asObject(input.outputDraft.body);
    const document = asObject(draftBody.document);
    const omdanSection = asObject(document.omdanSection);
    lines.push(
      "## Output Draft Snapshot",
      "",
      `- Document title: ${String(draftBody.documentTitle ?? asObject(document).title ?? "")}`,
      `- Omdan lines: ${asArray(omdanSection.lines).length}`,
      `- Omdan total: ${String(omdanSection.totalProjectCost ?? "")}`,
      "",
    );
  }

  if (input.generatedPreview) {
    lines.push(
      "## Generated Preview",
      "",
      "- Preview files were physically generated under the generated-preview directory.",
      "",
    );
  }

  return lines.join("\n");
}

function buildObservations(input: {
  analyzedStatus: string;
  missingInputs: string[];
  warnings: string[];
  candidateRows: unknown[];
  autoConfirmed: boolean;
}): string[] {
  const observations: string[] = [];

  if (input.analyzedStatus === "needs_clarification") {
    observations.push(
      `Pipeline stopped correctly on clarification because critical inputs are missing: ${input.missingInputs.join(", ")}.`,
    );
  } else {
    observations.push("Pipeline passed the clarification gate and produced a reviewable analysis.");
  }

  if (input.candidateRows.length === 0) {
    observations.push("No DEKEL candidates were found. Retrieval quality is currently insufficient for this case.");
  } else {
    const topScore = Number(asObject(input.candidateRows[0]).score ?? 0);
    observations.push(`Top DEKEL candidate score: ${topScore}.`);
    if (topScore < 0.5) {
      observations.push("Top match score is weak; matching heuristics likely need improvement or richer inputs.");
    }
  }

  if (input.warnings.length > 0) {
    observations.push(
      `Human review is still mandatory because the analysis produced ${input.warnings.length} warning(s).`,
    );
  }

  if (input.autoConfirmed) {
    observations.push(
      "Auto-confirmed preview was used only to inspect downstream document/output behavior; it is not a final business-approved selection.",
    );
  }

  return observations;
}

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value).map((item) => String(item));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "case";
}

function buildTimestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function roundQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

main().catch((error) => {
  console.error("Live check failed.");
  console.error(error);
  process.exitCode = 1;
});
