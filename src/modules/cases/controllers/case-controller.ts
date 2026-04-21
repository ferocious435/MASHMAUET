import { BaseController, type HttpContext, type HttpResult } from "../../../shared/http/base-controller.ts";
import { CaseService } from "../services/case-service.ts";

export class CaseController extends BaseController {
  private readonly caseService: CaseService;

  public constructor(caseService: CaseService) {
    super();
    this.caseService = caseService;
  }

  public async createCase(context: HttpContext): Promise<HttpResult> {
    try {
      const record = await this.caseService.createCase(context.body);
      return this.ok(record, 201);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async getCase(context: HttpContext): Promise<HttpResult> {
    try {
      const record = await this.caseService.getCase(context.params.id);
      return this.ok(record);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async analyzeCase(context: HttpContext): Promise<HttpResult> {
    try {
      const record = await this.caseService.analyzeCase(context.params.id);
      return this.ok(record);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async getCaseStatus(context: HttpContext): Promise<HttpResult> {
    try {
      const status = await this.caseService.getCaseStatus(context.params.id);
      return this.ok(status);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async getClarificationQuestions(context: HttpContext): Promise<HttpResult> {
    try {
      const payload = await this.caseService.getClarificationQuestions(
        context.params.id,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async submitClarificationAnswers(
    context: HttpContext,
  ): Promise<HttpResult> {
    try {
      const record = await this.caseService.submitClarificationAnswers(
        context.params.id,
        context.body,
      );
      return this.ok(record);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async getDekelCandidates(context: HttpContext): Promise<HttpResult> {
    try {
      const requestedLimit = Number(context.params.limit ?? "5");
      const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(20, requestedLimit))
        : 5;
      const payload = await this.caseService.getDekelCandidates(
        context.params.id,
        limit,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async getMavnadimCandidates(context: HttpContext): Promise<HttpResult> {
    try {
      const requestedLimit = Number(context.params.limit ?? "3");
      const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(10, requestedLimit))
        : 3;
      const payload = await this.caseService.getMavnadimCandidates(
        context.params.id,
        limit,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async saveMavnadimSelection(context: HttpContext): Promise<HttpResult> {
    try {
      const payload = await this.caseService.saveMavnadimSelection(
        context.params.id,
        context.body,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async getMavnadimSelection(context: HttpContext): Promise<HttpResult> {
    try {
      const payload = await this.caseService.getMavnadimSelection(
        context.params.id,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async getMavnadimAncillaryPreview(
    context: HttpContext,
  ): Promise<HttpResult> {
    try {
      const requestedLimit = Number(context.params.limit ?? "2");
      const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(5, requestedLimit))
        : 2;
      const payload = await this.caseService.getMavnadimDekelPackagePreview(
        context.params.id,
        limit,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async saveMavnadimAncillarySelection(
    context: HttpContext,
  ): Promise<HttpResult> {
    try {
      const requestedManagementFeePercent = Number(
        context.params.managementFeePercent ?? "14",
      );
      const managementFeePercent = Number.isFinite(requestedManagementFeePercent)
        ? Math.max(0, requestedManagementFeePercent)
        : 14;
      const payload = await this.caseService.saveMavnadimAncillaryDekelSelection(
        context.params.id,
        context.body,
        managementFeePercent,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async getDekelEstimatePreview(context: HttpContext): Promise<HttpResult> {
    try {
      const requestedLimit = Number(context.params.limit ?? "5");
      const requestedManagementFeePercent = Number(
        context.params.managementFeePercent ?? "14",
      );
      const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(20, requestedLimit))
        : 5;
      const managementFeePercent = Number.isFinite(requestedManagementFeePercent)
        ? Math.max(0, Math.min(100, requestedManagementFeePercent))
        : 14;
      const payload = await this.caseService.getDekelEstimatePreview(
        context.params.id,
        limit,
        managementFeePercent,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async saveDekelSelection(context: HttpContext): Promise<HttpResult> {
    try {
      const requestedManagementFeePercent = Number(
        context.params.managementFeePercent ?? "14",
      );
      const managementFeePercent = Number.isFinite(requestedManagementFeePercent)
        ? Math.max(0, Math.min(100, requestedManagementFeePercent))
        : 14;
      const payload = await this.caseService.saveDekelSelection(
        context.params.id,
        context.body,
        managementFeePercent,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async getDekelSelection(context: HttpContext): Promise<HttpResult> {
    try {
      const requestedManagementFeePercent = Number(
        context.params.managementFeePercent ?? "14",
      );
      const managementFeePercent = Number.isFinite(requestedManagementFeePercent)
        ? Math.max(0, Math.min(100, requestedManagementFeePercent))
        : 14;
      const payload = await this.caseService.getDekelSelection(
        context.params.id,
        managementFeePercent,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async getOutputDraft(context: HttpContext): Promise<HttpResult> {
    try {
      const requestedManagementFeePercent = Number(
        context.params.managementFeePercent ?? "14",
      );
      const managementFeePercent = Number.isFinite(requestedManagementFeePercent)
        ? Math.max(0, Math.min(100, requestedManagementFeePercent))
        : 14;
      const payload = await this.caseService.getOutputDraft(
        context.params.id,
        managementFeePercent,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async getOutputPackage(context: HttpContext): Promise<HttpResult> {
    try {
      const requestedManagementFeePercent = Number(
        context.params.managementFeePercent ?? "14",
      );
      const managementFeePercent = Number.isFinite(requestedManagementFeePercent)
        ? Math.max(0, Math.min(100, requestedManagementFeePercent))
        : 14;
      const payload = await this.caseService.getOutputPackage(
        context.params.id,
        managementFeePercent,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }

  public async generateCaseOutputs(context: HttpContext): Promise<HttpResult> {
    try {
      const requestedManagementFeePercent = Number(
        context.params.managementFeePercent ?? "14",
      );
      const managementFeePercent = Number.isFinite(requestedManagementFeePercent)
        ? Math.max(0, Math.min(100, requestedManagementFeePercent))
        : 14;
      const payload = await this.caseService.generateCaseOutputs(
        context.params.id,
        managementFeePercent,
      );
      return this.ok(payload);
    } catch (error) {
      return this.fail(error);
    }
  }
}
