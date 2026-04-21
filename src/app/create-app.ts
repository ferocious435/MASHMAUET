import type { IncomingMessage, ServerResponse } from "node:http";

import { CaseController } from "../modules/cases/controllers/case-controller.ts";
import { InMemoryCaseRepository } from "../modules/cases/repositories/case-repository.ts";
import { CaseService } from "../modules/cases/services/case-service.ts";
import { caseRoutes } from "../modules/cases/routes/case-routes.ts";
import { CaseAnalysisPipeline } from "../modules/pipeline/services/case-analysis-pipeline.ts";
import { DekelCatalogService } from "../modules/references/services/dekel-catalog-service.ts";
import { DekelMatchingService } from "../modules/references/services/dekel-matching-service.ts";
import { MavnadimCatalogService } from "../modules/references/services/mavnadim-catalog-service.ts";
import { MavnadimMatchingService } from "../modules/references/services/mavnadim-matching-service.ts";
import { CaseOutputExportService } from "../modules/output/services/case-output-export-service.ts";
import { SkillOrchestratorService } from "../modules/skills/services/skill-orchestrator-service.ts";
import {
  DEFAULT_PRICEBOOK_ID,
  DEFAULT_TEMPLATE_ID,
  InMemoryMappingRuleRepository,
  InMemoryPricebookRepository,
  InMemoryTemplateRepository,
} from "../modules/references/repositories/in-memory-reference-repositories.ts";

export function createApp(): {
  handleRequest: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => Promise<void>;
};
export function createApp(options?: {
  dekelWorkbookPath?: string;
  skillLogsDirectoryPath?: string;
  artifactsDirectoryPath?: string;
}): {
  handleRequest: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => Promise<void>;
} {
  const templateRepository = new InMemoryTemplateRepository();
  const pricebookRepository = new InMemoryPricebookRepository();
  const mappingRepository = new InMemoryMappingRuleRepository();
  const caseRepository = new InMemoryCaseRepository();
  const dekelCatalogService = new DekelCatalogService({
    workbookPath: options?.dekelWorkbookPath,
  });
  const dekelMatchingService = new DekelMatchingService(dekelCatalogService);
  const mavnadimCatalogService = new MavnadimCatalogService();
  const mavnadimMatchingService = new MavnadimMatchingService(
    mavnadimCatalogService,
  );
  const skillOrchestratorService = new SkillOrchestratorService({
    logsDirectoryPath: options?.skillLogsDirectoryPath,
  });
  const outputExportService = new CaseOutputExportService({
    artifactsRootPath: options?.artifactsDirectoryPath,
  });

  const caseAnalysisPipeline = new CaseAnalysisPipeline(
    templateRepository,
    pricebookRepository,
    mappingRepository,
    skillOrchestratorService,
    dekelMatchingService,
  );
  const caseService = new CaseService(
    caseRepository,
    caseAnalysisPipeline,
    dekelMatchingService,
    mavnadimMatchingService,
    templateRepository,
    skillOrchestratorService,
    outputExportService,
  );
  const caseController = new CaseController(caseService);

  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = url.pathname;
    const method = request.method ?? "GET";

    if (method === "GET" && pathname === "/health") {
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.health",
          invokedBy: `${method} ${pathname}`,
        },
        async () => ({
          statusCode: 200,
          body: {
            status: "ok",
            skill: "base",
            service: "mashmauet-agent",
          },
        }),
      );
    }

    if (method === "GET" && pathname === "/catalog") {
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.catalog.summary",
          invokedBy: `${method} ${pathname}`,
        },
        async () => {
          const dekelWorkbook = await dekelCatalogService.getWorkbookSummary();
          const mavnadimCatalog = await mavnadimCatalogService.getCatalogSummary();

          return {
            statusCode: 200,
            body: {
              templateId: DEFAULT_TEMPLATE_ID,
              pricebookId: DEFAULT_PRICEBOOK_ID,
              templates: templateRepository.list(),
              pricebooks: pricebookRepository.listCatalog(),
              externalSources: {
                dekelWorkbook,
                mavnadimCatalog,
              },
              attributionRule:
                "Every task, step, and handoff must show the responsible skill.",
            },
          };
        },
      );
    }

    if (method === "GET" && pathname === "/catalog/mavnadim-preview") {
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.catalog.mavnadim_preview",
          invokedBy: `${method} ${pathname}`,
          inputSummary: `limit=${url.searchParams.get("limit") ?? "5"}`,
        },
        async () => {
          const requestedLimit = Number(url.searchParams.get("limit") ?? "5");
          const limit = Number.isFinite(requestedLimit)
            ? Math.max(1, Math.min(20, requestedLimit))
            : 5;
          const items = await mavnadimCatalogService.getCatalogPreview(limit);

          return {
            statusCode: 200,
            body: {
              skill: "architecture",
              limit,
              items,
            },
          };
        },
      );
    }

    if (method === "GET" && pathname === "/catalog/dekel-pricebook-preview") {
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.catalog.dekel_pricebook_preview",
          invokedBy: `${method} ${pathname}`,
          inputSummary: `limit=${url.searchParams.get("limit") ?? "5"}`,
        },
        async () => {
          const requestedLimit = Number(url.searchParams.get("limit") ?? "5");
          const limit = Number.isFinite(requestedLimit)
            ? Math.max(1, Math.min(20, requestedLimit))
            : 5;
          const items = await dekelCatalogService.getPricebookPreview(limit);

          return {
            statusCode: 200,
            body: {
              skill: "backend-dev-guidelines",
              limit,
              items,
            },
          };
        },
      );
    }

    if (method === "GET" && pathname === "/catalog/dekel-estimate-preview") {
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.catalog.dekel_estimate_preview",
          invokedBy: `${method} ${pathname}`,
          inputSummary:
            `limit=${url.searchParams.get("limit") ?? "10"},` +
            `managementFeePercent=${url.searchParams.get("managementFeePercent") ?? "14"}`,
        },
        async () => {
          const requestedLimit = Number(url.searchParams.get("limit") ?? "10");
          const requestedManagementFeePercent = Number(
            url.searchParams.get("managementFeePercent") ?? "14",
          );
          const limit = Number.isFinite(requestedLimit)
            ? Math.max(1, Math.min(20, requestedLimit))
            : 10;
          const managementFeePercent = Number.isFinite(requestedManagementFeePercent)
            ? Math.max(0, Math.min(100, requestedManagementFeePercent))
            : 14;
          const estimatePreview = await dekelCatalogService.getEstimatePreview(
            limit,
            managementFeePercent,
          );

          return {
            statusCode: 200,
            body: {
              skill: "architecture",
              ...estimatePreview,
            },
          };
        },
      );
    }

    if (method === caseRoutes.createCase.method && pathname === caseRoutes.createCase.path) {
      const body = await readJsonBody(request);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.create",
          invokedBy: `${method} ${pathname}`,
          inputSummary: summarizeForRoute(body),
        },
        async () => caseController.createCase({ body, params: {} }),
      );
    }

    const getCaseMatch = pathname.match(caseRoutes.getCase.pathPattern);
    if (method === caseRoutes.getCase.method && getCaseMatch) {
      const caseId = decodeURIComponent(getCaseMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.get",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary: `caseId=${caseId}`,
        },
        async () =>
          caseController.getCase({
            params: { id: caseId },
          }),
      );
    }

    const analyzeCaseMatch = pathname.match(caseRoutes.analyzeCase.pathPattern);
    if (method === caseRoutes.analyzeCase.method && analyzeCaseMatch) {
      const caseId = decodeURIComponent(analyzeCaseMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.analyze",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary: `caseId=${caseId}`,
        },
        async () =>
          caseController.analyzeCase({
            params: { id: caseId },
          }),
      );
    }

    const getStatusMatch = pathname.match(caseRoutes.getCaseStatus.pathPattern);
    if (method === caseRoutes.getCaseStatus.method && getStatusMatch) {
      const caseId = decodeURIComponent(getStatusMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.status",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary: `caseId=${caseId}`,
        },
        async () =>
          caseController.getCaseStatus({
            params: { id: caseId },
          }),
      );
    }

    const getClarificationsMatch = pathname.match(
      caseRoutes.getClarifications.pathPattern,
    );
    if (method === caseRoutes.getClarifications.method && getClarificationsMatch) {
      const caseId = decodeURIComponent(getClarificationsMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.clarifications.get",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary: `caseId=${caseId}`,
        },
        async () =>
          caseController.getClarificationQuestions({
            params: { id: caseId },
          }),
      );
    }

    const submitClarificationsMatch = pathname.match(
      caseRoutes.submitClarifications.pathPattern,
    );
    if (
      method === caseRoutes.submitClarifications.method &&
      submitClarificationsMatch
    ) {
      const body = await readJsonBody(request);
      const caseId = decodeURIComponent(submitClarificationsMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.clarifications.submit",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary: summarizeForRoute(body),
        },
        async () =>
          caseController.submitClarificationAnswers({
            body,
            params: { id: caseId },
          }),
      );
    }

    const getDekelCandidatesMatch = pathname.match(
      caseRoutes.getDekelCandidates.pathPattern,
    );
    if (method === caseRoutes.getDekelCandidates.method && getDekelCandidatesMatch) {
      const caseId = decodeURIComponent(getDekelCandidatesMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.dekel_candidates",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary: `caseId=${caseId},limit=${url.searchParams.get("limit") ?? "5"}`,
        },
        async () =>
          caseController.getDekelCandidates({
            params: {
              id: caseId,
              limit: url.searchParams.get("limit") ?? "5",
            },
          }),
      );
    }

    const getMavnadimCandidatesMatch = pathname.match(
      caseRoutes.getMavnadimCandidates.pathPattern,
    );
    if (
      method === caseRoutes.getMavnadimCandidates.method &&
      getMavnadimCandidatesMatch
    ) {
      const caseId = decodeURIComponent(getMavnadimCandidatesMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.mavnadim_candidates",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary: `caseId=${caseId},limit=${url.searchParams.get("limit") ?? "3"}`,
        },
        async () =>
          caseController.getMavnadimCandidates({
            params: {
              id: caseId,
              limit: url.searchParams.get("limit") ?? "3",
            },
          }),
      );
    }

    const saveMavnadimSelectionMatch = pathname.match(
      caseRoutes.saveMavnadimSelection.pathPattern,
    );
    if (
      method === caseRoutes.saveMavnadimSelection.method &&
      saveMavnadimSelectionMatch
    ) {
      const body = await readJsonBody(request);
      const caseId = decodeURIComponent(saveMavnadimSelectionMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.mavnadim_selection.save",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary: summarizeForRoute(body),
        },
        async () =>
          caseController.saveMavnadimSelection({
            body,
            params: {
              id: caseId,
            },
          }),
      );
    }

    const getMavnadimSelectionMatch = pathname.match(
      caseRoutes.getMavnadimSelection.pathPattern,
    );
    if (
      method === caseRoutes.getMavnadimSelection.method &&
      getMavnadimSelectionMatch
    ) {
      const caseId = decodeURIComponent(getMavnadimSelectionMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.mavnadim_selection.get",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary: `caseId=${caseId}`,
        },
        async () =>
          caseController.getMavnadimSelection({
            params: {
              id: caseId,
            },
          }),
      );
    }

    const getMavnadimAncillaryPreviewMatch = pathname.match(
      caseRoutes.getMavnadimAncillaryPreview.pathPattern,
    );
    if (
      method === caseRoutes.getMavnadimAncillaryPreview.method &&
      getMavnadimAncillaryPreviewMatch
    ) {
      const caseId = decodeURIComponent(getMavnadimAncillaryPreviewMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.mavnadim_ancillary_preview",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary: `caseId=${caseId},limit=${url.searchParams.get("limit") ?? "2"}`,
        },
        async () =>
          caseController.getMavnadimAncillaryPreview({
            params: {
              id: caseId,
              limit: url.searchParams.get("limit") ?? "2",
            },
          }),
      );
    }

    const saveMavnadimAncillarySelectionMatch = pathname.match(
      caseRoutes.saveMavnadimAncillarySelection.pathPattern,
    );
    if (
      method === caseRoutes.saveMavnadimAncillarySelection.method &&
      saveMavnadimAncillarySelectionMatch
    ) {
      const body = await readJsonBody(request);
      const caseId = decodeURIComponent(saveMavnadimAncillarySelectionMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.mavnadim_ancillary_selection.save",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary: summarizeForRoute(body),
        },
        async () =>
          caseController.saveMavnadimAncillarySelection({
            body,
            params: {
              id: caseId,
              managementFeePercent:
                url.searchParams.get("managementFeePercent") ?? "14",
            },
          }),
      );
    }

    const saveDekelSelectionMatch = pathname.match(
      caseRoutes.saveDekelSelection.pathPattern,
    );
    if (method === caseRoutes.saveDekelSelection.method && saveDekelSelectionMatch) {
      const body = await readJsonBody(request);
      const caseId = decodeURIComponent(saveDekelSelectionMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.dekel_selection.save",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary: summarizeForRoute(body),
        },
        async () =>
          caseController.saveDekelSelection({
            body,
            params: {
              id: caseId,
              managementFeePercent:
                url.searchParams.get("managementFeePercent") ?? "14",
            },
          }),
      );
    }

    const getDekelSelectionMatch = pathname.match(
      caseRoutes.getDekelSelection.pathPattern,
    );
    if (method === caseRoutes.getDekelSelection.method && getDekelSelectionMatch) {
      const caseId = decodeURIComponent(getDekelSelectionMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.dekel_selection.get",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary:
            `caseId=${caseId},managementFeePercent=` +
            `${url.searchParams.get("managementFeePercent") ?? "14"}`,
        },
        async () =>
          caseController.getDekelSelection({
            params: {
              id: caseId,
              managementFeePercent:
                url.searchParams.get("managementFeePercent") ?? "14",
            },
          }),
      );
    }

    const getOutputDraftMatch = pathname.match(
      caseRoutes.getOutputDraft.pathPattern,
    );
    if (method === caseRoutes.getOutputDraft.method && getOutputDraftMatch) {
      const caseId = decodeURIComponent(getOutputDraftMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.output_draft",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary:
            `caseId=${caseId},managementFeePercent=` +
            `${url.searchParams.get("managementFeePercent") ?? "14"}`,
        },
        async () =>
          caseController.getOutputDraft({
            params: {
              id: caseId,
              managementFeePercent:
                url.searchParams.get("managementFeePercent") ?? "14",
            },
          }),
      );
    }

    const getOutputsMatch = pathname.match(caseRoutes.getOutputs.pathPattern);
    if (method === caseRoutes.getOutputs.method && getOutputsMatch) {
      const caseId = decodeURIComponent(getOutputsMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.outputs",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary:
            `caseId=${caseId},managementFeePercent=` +
            `${url.searchParams.get("managementFeePercent") ?? "14"}`,
        },
        async () =>
          caseController.getOutputPackage({
            params: {
              id: caseId,
              managementFeePercent:
                url.searchParams.get("managementFeePercent") ?? "14",
            },
          }),
      );
    }

    const generateCaseOutputsMatch = pathname.match(
      caseRoutes.generateCaseOutputs.pathPattern,
    );
    if (
      method === caseRoutes.generateCaseOutputs.method &&
      generateCaseOutputsMatch
    ) {
      const caseId = decodeURIComponent(generateCaseOutputsMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.generate",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary:
            `caseId=${caseId},managementFeePercent=` +
            `${url.searchParams.get("managementFeePercent") ?? "14"}`,
        },
        async () =>
          caseController.generateCaseOutputs({
            params: {
              id: caseId,
              managementFeePercent:
                url.searchParams.get("managementFeePercent") ?? "14",
            },
          }),
      );
    }

    const getDekelEstimatePreviewMatch = pathname.match(
      caseRoutes.getDekelEstimatePreview.pathPattern,
    );
    if (
      method === caseRoutes.getDekelEstimatePreview.method &&
      getDekelEstimatePreviewMatch
    ) {
      const caseId = decodeURIComponent(getDekelEstimatePreviewMatch[1]);
      return executeRoutedRequest(
        response,
        skillOrchestratorService,
        {
          taskType: "http.case.dekel_estimate_preview",
          invokedBy: `${method} ${pathname}`,
          caseId,
          inputSummary:
            `caseId=${caseId},limit=${url.searchParams.get("limit") ?? "5"},` +
            `managementFeePercent=${url.searchParams.get("managementFeePercent") ?? "14"}`,
        },
        async () =>
          caseController.getDekelEstimatePreview({
            params: {
              id: caseId,
              limit: url.searchParams.get("limit") ?? "5",
              managementFeePercent:
                url.searchParams.get("managementFeePercent") ?? "14",
            },
          }),
      );
    }

    return executeRoutedRequest(
      response,
      skillOrchestratorService,
      {
        taskType: "http.not_found",
        invokedBy: `${method} ${pathname}`,
      },
      async () => ({
        statusCode: 404,
        body: {
          error: "NotFound",
          message: `Route ${method} ${pathname} not found.`,
        },
      }),
    );
  };

  return { handleRequest };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(payload);
}

async function executeRoutedRequest(
  response: ServerResponse,
  skillOrchestratorService: SkillOrchestratorService,
  context: {
    taskType: string;
    invokedBy: string;
    caseId?: string;
    inputSummary?: string;
  },
  handler: () => Promise<{ statusCode: number; body: unknown }>,
): Promise<void> {
  try {
    const result = await skillOrchestratorService.runTask(context, handler);
    sendJson(response, result.statusCode, result.responseBody);
  } catch (error) {
    const httpResult = toHttpResult(error);
    const routedError = await skillOrchestratorService.runTask(context, async () => ({
      statusCode: httpResult.statusCode,
      body: httpResult.body,
    }));
    sendJson(response, httpResult.statusCode, routedError.responseBody);
  }
}

function toHttpResult(error: unknown): { statusCode: number; body: unknown } {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    "body" in error
  ) {
    return {
      statusCode: Number((error as { statusCode: number }).statusCode),
      body: (error as { body: unknown }).body,
    };
  }

  if (error instanceof Error && "statusCode" in error) {
    return {
      statusCode: Number((error as Error & { statusCode: number }).statusCode),
      body: {
        error: error.name,
        message: error.message,
      },
    };
  }

  if (error instanceof Error) {
    return {
      statusCode: 500,
      body: {
        error: error.name,
        message: error.message,
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: "UnknownError",
      message: "Unexpected error.",
    },
  };
}

function summarizeForRoute(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);

    if (!serialized) {
      return "";
    }

    return serialized.length > 280 ? `${serialized.slice(0, 277)}...` : serialized;
  } catch {
    return String(value);
  }
}
