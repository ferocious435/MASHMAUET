import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { ApplicationError } from "../../../shared/errors/application-error.ts";

interface RouterCategoryConfig {
  category: string;
  primary: string;
  secondary: string;
  support: string[];
  validation: string;
  fallback: string;
  review_required: boolean;
}

interface RouterConfig {
  categories: RouterCategoryConfig[];
}

interface GovernanceConfig {
  manager_skill: string;
  routing_executor: string;
  long_task_mode: string;
}

interface RegistrySkill {
  name: string;
  skill_file?: string;
  install_path?: string;
  status?: {
    installed?: boolean;
    enabled?: boolean;
    callable?: boolean;
  };
}

interface RegistryConfig {
  skills_root?: string;
  skills: RegistrySkill[];
}

interface SupplementalSkillEntry {
  name: string;
  source: string;
  skill_file?: string;
  usage?: string;
  reason?: string;
}

interface SupplementalSkillsConfig {
  skills: SupplementalSkillEntry[];
}

interface TaskDefinition {
  routeCategory: string | null;
  reason: string;
  supportingSkillHints?: string[];
  primarySkillOverride?: string;
}

interface SkillSourceReference {
  name: string;
  source: string;
  skillFile: string | null;
  usage: string | null;
}

export interface SkillTaskContext {
  taskType: string;
  invokedBy: string;
  caseId?: string;
  inputSummary?: string;
}

export interface SkillRouteDecision {
  taskId: string;
  taskType: string;
  routeCategory: string;
  primarySkill: string;
  secondarySkill: string | null;
  supportingSkills: string[];
  validationSkill: string | null;
  fallbackSkill: string | null;
  reviewRequired: boolean;
  reason: string;
  invokedBy: string;
  handoffFrom: string | null;
  handoffTo: string | null;
  primarySkillSource: SkillSourceReference;
  secondarySkillSource: SkillSourceReference | null;
  supportingSkillSources: SkillSourceReference[];
  validationSkillSource: SkillSourceReference | null;
  fallbackSkillSource: SkillSourceReference | null;
}

export interface RoutedTaskResult<T> {
  statusCode: number;
  responseBody: T;
  decision: SkillRouteDecision;
}

interface TaskLogEntry {
  timestamp: string;
  task_id: string;
  route_category: string;
  skill: string;
  invoked_by: string;
  reason: string;
  inputs_summary: string;
  outputs_summary: string;
  decision: string;
  next_skill: string | null;
  accepted: boolean;
  handoff_from: string | null;
  handoff_to: string | null;
}

export class SkillOrchestratorService {
  private readonly projectRoot: string;
  private readonly routerConfigPath: string;
  private readonly governanceConfigPath: string;
  private readonly registryConfigPath: string;
  private readonly supplementalSkillsConfigPath: string;
  private readonly logsDirectoryPath: string;
  private readonly lastRouteByScope = new Map<string, SkillRouteDecision>();

  public constructor(options?: {
    projectRoot?: string;
    routerConfigPath?: string;
    governanceConfigPath?: string;
    registryConfigPath?: string;
    supplementalSkillsConfigPath?: string;
    logsDirectoryPath?: string;
  }) {
    this.projectRoot = options?.projectRoot ?? process.cwd();
    this.routerConfigPath =
      options?.routerConfigPath ??
      path.join(this.projectRoot, "skill-system", "router.json");
    this.governanceConfigPath =
      options?.governanceConfigPath ??
      path.join(this.projectRoot, "skill-system", "governance.json");
    this.registryConfigPath =
      options?.registryConfigPath ??
      path.join(this.projectRoot, "skill-system", "registry.json");
    this.supplementalSkillsConfigPath =
      options?.supplementalSkillsConfigPath ??
      path.join(this.projectRoot, "skill-system", "supplemental-skills.json");
    this.logsDirectoryPath =
      options?.logsDirectoryPath ??
      path.join(this.projectRoot, "skill-system", "logs");
  }

  public async runTask<T>(
    context: SkillTaskContext,
    handler: () => Promise<{ statusCode: number; body: T }>,
  ): Promise<RoutedTaskResult<T & Record<string, unknown>>> {
    const decision = await this.planTask(context);

    return this.runPlannedTask(decision, context, handler);
  }

  public async planTask(context: SkillTaskContext): Promise<SkillRouteDecision> {
    return this.resolveTask(context);
  }

  public async runPlannedTask<T>(
    decision: SkillRouteDecision,
    context: SkillTaskContext,
    handler: () => Promise<{ statusCode: number; body: T }>,
  ): Promise<RoutedTaskResult<T & Record<string, unknown>>> {
    
    try {
      const result = await handler();
      const responseBody = await this.attachRouteMetadata(result.body, decision);
      const accepted = result.statusCode < 400;

      await this.recordTaskOutcome(decision, {
        accepted,
        inputsSummary: context.inputSummary ?? "",
        outputsSummary: summarizeValue(responseBody),
        nextSkill: accepted
          ? decision.reviewRequired
            ? decision.validationSkill
            : null
          : decision.fallbackSkill,
      });

      if (accepted) {
        this.rememberRoute(context, decision);
      }

      return {
        statusCode: result.statusCode,
        responseBody,
        decision,
      };
    } catch (error) {
      await this.recordTaskOutcome(decision, {
        accepted: false,
        inputsSummary: context.inputSummary ?? "",
        outputsSummary: summarizeError(error),
        nextSkill: decision.fallbackSkill,
      });

      throw error;
    }
  }

  private async resolveTask(context: SkillTaskContext): Promise<SkillRouteDecision> {
    const taskDefinition = getTaskDefinition(context.taskType);
    const governance = await this.readJson<GovernanceConfig>(
      this.governanceConfigPath,
    );

    if (taskDefinition.routeCategory === null) {
      return {
        taskId: randomUUID(),
        taskType: context.taskType,
        routeCategory: "Base / diagnostics",
        primarySkill: taskDefinition.primarySkillOverride ?? "base",
        secondarySkill: null,
        supportingSkills: [],
        validationSkill: null,
        fallbackSkill: null,
        reviewRequired: false,
        reason: taskDefinition.reason,
        invokedBy: context.invokedBy,
        handoffFrom: null,
        handoffTo: null,
        primarySkillSource: buildBaseSkillSource(
          taskDefinition.primarySkillOverride ?? "base",
        ),
        secondarySkillSource: null,
        supportingSkillSources: [],
        validationSkillSource: null,
        fallbackSkillSource: null,
      };
    }

    const routerConfig = await this.readJson<RouterConfig>(this.routerConfigPath);
    const registry = await this.readJson<RegistryConfig>(this.registryConfigPath);
    const supplementalSkills =
      (await this.readOptionalJson<SupplementalSkillsConfig>(
        this.supplementalSkillsConfigPath,
      )) ?? { skills: [] };
    const categoryConfig = routerConfig.categories.find(
      (candidate) => candidate.category === taskDefinition.routeCategory,
    );

    if (!categoryConfig) {
      throw new ApplicationError(
        `Skill route category ${taskDefinition.routeCategory} not found.`,
        500,
      );
    }

    const primarySkill = taskDefinition.primarySkillOverride ?? categoryConfig.primary;
    const primarySkillSource = this.ensurePrimarySkillAvailable(
      primarySkill,
      registry,
      supplementalSkills,
    );

    const secondarySkill =
      typeof categoryConfig.secondary === "string" &&
      categoryConfig.secondary.length > 0 &&
      categoryConfig.secondary !== primarySkill
        ? categoryConfig.secondary
        : null;
    const supportingSkills = dedupe([
      ...(secondarySkill ? [secondarySkill] : []),
      ...categoryConfig.support,
      ...(taskDefinition.supportingSkillHints ?? []),
    ]).filter((skillName) => skillName !== primarySkill);
    const secondarySkillSource = secondarySkill
      ? this.resolveSkillSource(secondarySkill, registry, supplementalSkills)
      : null;
    const supportingSkillSources = supportingSkills.map((skillName) =>
      this.resolveSkillSource(skillName, registry, supplementalSkills),
    );
    const previousRoute = this.lastRouteByScope.get(getScopeKey(context));
    const handoffFrom =
      previousRoute && previousRoute.primarySkill !== primarySkill
        ? previousRoute.primarySkill
        : null;
    const validationSkill =
      categoryConfig.validation || governance.manager_skill || null;
    const fallbackSkill = categoryConfig.fallback || null;
    const validationSkillSource = validationSkill
      ? this.resolveSkillSource(validationSkill, registry, supplementalSkills)
      : null;
    const fallbackSkillSource = fallbackSkill
      ? this.resolveSkillSource(fallbackSkill, registry, supplementalSkills)
      : null;

    return {
      taskId: randomUUID(),
      taskType: context.taskType,
      routeCategory: categoryConfig.category,
      primarySkill,
      secondarySkill,
      supportingSkills,
      validationSkill,
      fallbackSkill,
      reviewRequired: categoryConfig.review_required,
      reason: taskDefinition.reason,
      invokedBy: context.invokedBy,
      handoffFrom,
      handoffTo: handoffFrom ? primarySkill : null,
      primarySkillSource,
      secondarySkillSource,
      supportingSkillSources,
      validationSkillSource,
      fallbackSkillSource,
    };
  }

  private async attachRouteMetadata<T>(
    body: T,
    decision: SkillRouteDecision,
  ): Promise<T & Record<string, unknown>> {
    const governance = await this.readJson<GovernanceConfig>(
      this.governanceConfigPath,
    );
    const payload: Record<string, unknown> = isRecord(body)
      ? { ...body }
      : { value: body };
    const executionSkill =
      typeof payload.skill === "string" ? payload.skill : decision.primarySkill;

    return {
      ...payload,
      skill: decision.primarySkill,
      executionSkill,
      skillSource: decision.primarySkillSource.source,
      supportingSkills: [...decision.supportingSkills],
      supportingSkillSources: decision.supportingSkillSources.map((source) => ({
        name: source.name,
        source: source.source,
      })),
      validationSkill: decision.validationSkill,
      fallbackSkill: decision.fallbackSkill,
      skillRoute: {
        taskId: decision.taskId,
        taskType: decision.taskType,
        routeCategory: decision.routeCategory,
        primarySkill: decision.primarySkill,
        secondarySkill: decision.secondarySkill,
        supportingSkills: [...decision.supportingSkills],
        validationSkill: decision.validationSkill,
        fallbackSkill: decision.fallbackSkill,
        primarySkillSource: decision.primarySkillSource,
        secondarySkillSource: decision.secondarySkillSource,
        supportingSkillSources: decision.supportingSkillSources,
        validationSkillSource: decision.validationSkillSource,
        fallbackSkillSource: decision.fallbackSkillSource,
        managerSkill: governance.manager_skill,
        routingExecutor: governance.routing_executor,
        longTaskMode: governance.long_task_mode,
        reviewRequired: decision.reviewRequired,
        reason: decision.reason,
        handoffFrom: decision.handoffFrom,
        handoffTo: decision.handoffTo,
      },
    } as unknown as T & Record<string, unknown>;
  }

  private async recordTaskOutcome(
    decision: SkillRouteDecision,
    outcome: {
      accepted: boolean;
      inputsSummary: string;
      outputsSummary: string;
      nextSkill: string | null;
    },
  ): Promise<void> {
    await mkdir(this.logsDirectoryPath, { recursive: true });

    const timestamp = new Date().toISOString();
    const logFilePath = path.join(
      this.logsDirectoryPath,
      `${timestamp.slice(0, 10)}.jsonl`,
    );
    const entry: TaskLogEntry = {
      timestamp,
      task_id: decision.taskId,
      route_category: decision.routeCategory,
      skill: decision.primarySkill,
      invoked_by: decision.invokedBy,
      reason: decision.reason,
      inputs_summary: outcome.inputsSummary,
      outputs_summary: outcome.outputsSummary,
      decision: outcome.accepted ? "completed" : "fallback_required",
      next_skill: outcome.nextSkill,
      accepted: outcome.accepted,
      handoff_from: decision.handoffFrom,
      handoff_to: decision.handoffTo,
    };

    await appendFile(logFilePath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  private ensurePrimarySkillAvailable(
    skillName: string,
    registry: RegistryConfig,
    supplementalSkills: SupplementalSkillsConfig,
  ): SkillSourceReference {
    const source = this.resolveSkillSource(skillName, registry, supplementalSkills);

    if (skillName === "base") {
      return source;
    }

    const registryEntry = registry.skills.find(
      (candidate) => candidate.name === skillName,
    );

    if (registryEntry?.status) {
      if (
        registryEntry.status.installed === false ||
        registryEntry.status.enabled === false ||
        registryEntry.status.callable === false
      ) {
        throw new ApplicationError(`Primary skill ${skillName} is not callable.`, 500);
      }

      return source;
    }

    const supplementalEntry = supplementalSkills.skills.find(
      (candidate) => candidate.name === skillName,
    );

    if (supplementalEntry) {
      if (supplementalEntry.usage === "support-only") {
        throw new ApplicationError(
          `Primary skill ${skillName} is declared as support-only.`,
          500,
        );
      }

      return source;
    }

    throw new ApplicationError(`Primary skill ${skillName} is unavailable.`, 500);
  }

  private rememberRoute(context: SkillTaskContext, decision: SkillRouteDecision): void {
    this.lastRouteByScope.set(getScopeKey(context), decision);
  }

  private async readJson<T>(filePath: string): Promise<T> {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  }

  private async readOptionalJson<T>(filePath: string): Promise<T | null> {
    try {
      return await this.readJson<T>(filePath);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  private resolveSkillSource(
    skillName: string,
    registry: RegistryConfig,
    supplementalSkills: SupplementalSkillsConfig,
  ): SkillSourceReference {
    if (skillName === "base") {
      return buildBaseSkillSource(skillName);
    }

    const registryEntry = registry.skills.find(
      (candidate) => candidate.name === skillName,
    );

    if (registryEntry) {
      return {
        name: skillName,
        source: "project-local",
        skillFile: registryEntry.skill_file ?? null,
        usage: "primary-or-support",
      };
    }

    const supplementalEntry = supplementalSkills.skills.find(
      (candidate) => candidate.name === skillName,
    );

    if (supplementalEntry) {
      return {
        name: skillName,
        source: supplementalEntry.source,
        skillFile: supplementalEntry.skill_file ?? null,
        usage: supplementalEntry.usage ?? null,
      };
    }

    return {
      name: skillName,
      source: "undeclared",
      skillFile: null,
      usage: null,
    };
  }
}

function getTaskDefinition(taskType: string): TaskDefinition {
  const definition = taskDefinitions[taskType];

  if (!definition) {
    throw new ApplicationError(`Skill task type ${taskType} is not registered.`, 500);
  }

  return definition;
}

function getScopeKey(context: SkillTaskContext): string {
  return context.caseId ? `case:${context.caseId}` : `task:${context.taskType}`;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeValue(value: unknown): string {
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

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return "Unknown task error.";
}

function buildBaseSkillSource(skillName: string): SkillSourceReference {
  return {
    name: skillName,
    source: "base",
    skillFile: null,
    usage: "primary-or-support",
  };
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

const taskDefinitions: Record<string, TaskDefinition> = {
  "http.health": {
    routeCategory: null,
    primarySkillOverride: "base",
    reason: "Health checks are mechanical diagnostics without specialized skill routing.",
  },
  "http.catalog.summary": {
    routeCategory: "Skill governance / self-maintenance",
    reason:
      "Catalog summary inspects active sources and the project skill layer, so it belongs to governance and orchestration.",
  },
  "http.catalog.mavnadim_preview": {
    routeCategory: "Product / discovery / brainstorming",
    supportingSkillHints: ["brainstorming"],
    reason:
      "MAVNADIM preview is a discovery step over ready-made structures before committing to implementation details.",
  },
  "http.catalog.dekel_pricebook_preview": {
    routeCategory: "Data import / normalization / pipelines",
    reason:
      "DEKEL workbook preview validates imported rows, normalized units, and source data availability.",
  },
  "http.catalog.dekel_estimate_preview": {
    routeCategory: "Document generation / template flow",
    supportingSkillHints: ["product-manager"],
    reason:
      "Estimate preview already shapes template-facing financial output and should keep document semantics in view.",
  },
  "http.case.create": {
    routeCategory: "PRD / scope / roadmap",
    supportingSkillHints: ["brainstorming"],
    reason:
      "Case creation captures scope, intent, and constraints, so the product layer should lead before implementation.",
  },
  "http.case.get": {
    routeCategory: "Backend implementation",
    reason: "Case retrieval is an application/backend responsibility.",
  },
  "http.case.analyze": {
    routeCategory: "Product / discovery / brainstorming",
    supportingSkillHints: ["brainstorming"],
    reason:
      "Case analysis turns a vague request into structured understanding and should keep option exploration visible.",
  },
  "http.case.status": {
    routeCategory: "Testing / QA",
    reason:
      "Status inspection validates pipeline state, trace completeness, and current readiness gates.",
  },
  "http.case.clarifications.get": {
    routeCategory: "Product / discovery / brainstorming",
    primarySkillOverride: "ask-questions-if-underspecified",
    supportingSkillHints: ["product-manager"],
    reason:
      "Clarification retrieval exposes the open information gaps that must be resolved before the pipeline may continue.",
  },
  "http.case.clarifications.submit": {
    routeCategory: "Product / discovery / brainstorming",
    primarySkillOverride: "ask-questions-if-underspecified",
    supportingSkillHints: ["product-manager"],
    reason:
      "Clarification submission closes missing-input gaps and triggers a controlled re-analysis instead of silent guessing.",
  },
  "http.case.dekel_candidates": {
    routeCategory: "AI / RAG / retrieval / matching / evaluation",
    reason:
      "Matching case text to DEKEL rows is retrieval and ranking work across the pricebook.",
  },
  "http.case.mavnadim_candidates": {
    routeCategory: "AI / RAG / retrieval / matching / evaluation",
    reason:
      "Matching case text to MAVNADIM catalog items is retrieval and ranking work across structured reference data.",
  },
  "http.case.mavnadim_selection.save": {
    routeCategory: "Backend implementation",
    reason:
      "Saving confirmed MAVNADIM selection updates persisted case state and review trace for the chosen prefab structure.",
  },
  "http.case.mavnadim_selection.get": {
    routeCategory: "Backend implementation",
    reason:
      "Fetching confirmed MAVNADIM selection is an application read over persisted case state.",
  },
  "http.case.mavnadim_ancillary_preview": {
    routeCategory: "AI / RAG / retrieval / matching / evaluation",
    reason:
      "Previewing ancillary DEKEL work for a selected MAVNADIM combines retrieval over the pricebook with structured recommendation packaging.",
  },
  "http.case.mavnadim_ancillary_selection.save": {
    routeCategory: "Backend implementation",
    reason:
      "Saving confirmed ancillary DEKEL lines for a selected MAVNADIM is a backend state transition over persisted case review data.",
  },
  "http.case.dekel_selection.save": {
    routeCategory: "Backend implementation",
    reason:
      "Saving confirmed DEKEL rows updates state, review decisions, and downstream calculation data.",
  },
  "http.case.dekel_selection.get": {
    routeCategory: "Backend implementation",
    reason:
      "Fetching confirmed DEKEL rows is an application flow over persisted case state.",
  },
  "http.case.dekel_estimate_preview": {
    routeCategory: "Document generation / template flow",
    supportingSkillHints: ["product-manager"],
    reason:
      "Estimate preview composes template-facing output from matched or confirmed pricebook lines.",
  },
  "http.case.output_draft": {
    routeCategory: "Document generation / template flow",
    supportingSkillHints: ["product-manager", "brainstorming"],
    reason:
      "Output draft prepares the final document structure, so template semantics and alternative formulations must stay explicit.",
  },
  "http.case.outputs": {
    routeCategory: "Document generation / template flow",
    supportingSkillHints: ["product-manager"],
    reason:
      "Output package assembly belongs to the document flow and must preserve product-level template meaning.",
  },
  "http.case.generate": {
    routeCategory: "Document generation / template flow",
    supportingSkillHints: ["product-manager"],
    reason:
      "Generate finalizes the document bundle and therefore belongs to the final template/output route.",
  },
  "http.not_found": {
    routeCategory: null,
    primarySkillOverride: "base",
    reason: "Not-found responses are mechanical routing fallbacks.",
  },
  "internal.case.create": {
    routeCategory: "PRD / scope / roadmap",
    supportingSkillHints: ["brainstorming"],
    reason:
      "Internal case creation still belongs to scope capture and should preserve product intent at creation time.",
  },
  "internal.case.get": {
    routeCategory: "Backend implementation",
    primarySkillOverride: "backend-dev-guidelines",
    reason: "Internal case retrieval is a direct backend state access operation.",
  },
  "internal.case.analyze": {
    routeCategory: "Product / discovery / brainstorming",
    supportingSkillHints: ["brainstorming"],
    reason:
      "Internal case analysis orchestrates the controlled pipeline from vague input to structured understanding.",
  },
  "internal.case.status": {
    routeCategory: "Testing / QA",
    primarySkillOverride: "testing-qa",
    reason:
      "Internal case status reflects pipeline readiness and should stay coupled to QA-style validation gates.",
  },
  "internal.case.clarifications.get": {
    routeCategory: "Product / discovery / brainstorming",
    primarySkillOverride: "ask-questions-if-underspecified",
    supportingSkillHints: ["product-manager"],
    reason:
      "Internal clarification retrieval keeps the missing-input state explicit for the operator and reviewer.",
  },
  "internal.case.clarifications.submit": {
    routeCategory: "Product / discovery / brainstorming",
    primarySkillOverride: "ask-questions-if-underspecified",
    supportingSkillHints: ["product-manager"],
    reason:
      "Internal clarification submission updates missing inputs and immediately reruns the controlled pipeline.",
  },
  "internal.case.dekel_candidates": {
    routeCategory: "AI / RAG / retrieval / matching / evaluation",
    primarySkillOverride: "rag-engineer",
    reason:
      "Internal DEKEL candidate lookup is retrieval and ranking over the normalized pricebook.",
  },
  "internal.case.mavnadim_candidates": {
    routeCategory: "AI / RAG / retrieval / matching / evaluation",
    primarySkillOverride: "rag-engineer",
    reason:
      "Internal MAVNADIM candidate lookup is retrieval and ranking over structured reference data.",
  },
  "internal.case.mavnadim_selection.save": {
    routeCategory: "Backend implementation",
    primarySkillOverride: "backend-dev-guidelines",
    reason:
      "Saving confirmed MAVNADIM selection is an internal backend state transition with review trace persistence.",
  },
  "internal.case.mavnadim_selection.get": {
    routeCategory: "Backend implementation",
    primarySkillOverride: "backend-dev-guidelines",
    reason:
      "Reading confirmed MAVNADIM selection is an internal backend read over persisted case state.",
  },
  "internal.case.mavnadim_ancillary_preview": {
    routeCategory: "AI / RAG / retrieval / matching / evaluation",
    primarySkillOverride: "rag-engineer",
    reason:
      "Building ancillary DEKEL preview for a selected MAVNADIM is an internal retrieval and ranking flow over pricebook data.",
  },
  "internal.case.mavnadim_ancillary_selection.save": {
    routeCategory: "Backend implementation",
    primarySkillOverride: "backend-dev-guidelines",
    reason:
      "Saving confirmed ancillary DEKEL lines for a selected MAVNADIM is an internal backend state transition with review trace persistence.",
  },
  "internal.case.dekel_estimate_preview": {
    routeCategory: "Document generation / template flow",
    primarySkillOverride: "architecture",
    supportingSkillHints: ["product-manager"],
    reason:
      "Internal estimate preview composes template-facing data and keeps architectural document structure stable.",
  },
  "internal.case.dekel_selection.save": {
    routeCategory: "Backend implementation",
    primarySkillOverride: "backend-dev-guidelines",
    reason:
      "Saving confirmed DEKEL lines is an internal backend state transition with review trace persistence.",
  },
  "internal.case.dekel_selection.get": {
    routeCategory: "Backend implementation",
    primarySkillOverride: "backend-dev-guidelines",
    reason:
      "Reading confirmed DEKEL selection is an internal backend read over persisted case state.",
  },
  "internal.case.output_draft": {
    routeCategory: "Document generation / template flow",
    primarySkillOverride: "architecture",
    supportingSkillHints: ["product-manager", "brainstorming"],
    reason:
      "Internal output draft assembles the final document shape and template bindings from approved data.",
  },
  "internal.case.outputs": {
    routeCategory: "Document generation / template flow",
    primarySkillOverride: "architecture",
    supportingSkillHints: ["product-manager"],
    reason:
      "Internal output package assembly must preserve structural consistency across document sections.",
  },
  "internal.case.generate": {
    routeCategory: "Document generation / template flow",
    primarySkillOverride: "architecture",
    supportingSkillHints: ["product-manager"],
    reason:
      "Internal final generation persists the case transition to generated outputs and output-ready state.",
  },
  "internal.pipeline.intake": {
    routeCategory: "Backend implementation",
    primarySkillOverride: "backend-development-feature-development",
    reason: "Pipeline intake initializes controlled execution over the case state.",
  },
  "internal.pipeline.preprocessing": {
    routeCategory: "Backend implementation",
    primarySkillOverride: "backend-dev-guidelines",
    reason:
      "Pipeline preprocessing normalizes raw description and dimensions into backend-ready inputs.",
  },
  "internal.pipeline.work_understanding": {
    routeCategory: "Product / discovery / brainstorming",
    primarySkillOverride: "product-manager",
    supportingSkillHints: ["brainstorming"],
    reason:
      "Work understanding converts a vague description into structured work items and should preserve option exploration.",
  },
  "internal.pipeline.clarification": {
    routeCategory: "Product / discovery / brainstorming",
    primarySkillOverride: "ask-questions-if-underspecified",
    supportingSkillHints: ["product-manager"],
    reason:
      "Clarification identifies missing inputs and frames the follow-up questions instead of guessing silently.",
  },
  "internal.pipeline.matching": {
    routeCategory: "AI / RAG / retrieval / matching / evaluation",
    primarySkillOverride: "rag-engineer",
    reason:
      "Matching is retrieval and ranking across pricebook candidates for each work item.",
  },
  "internal.pipeline.scoring": {
    routeCategory: "AI / RAG / retrieval / matching / evaluation",
    primarySkillOverride: "advanced-evaluation",
    reason:
      "Scoring validates confidence quality and keeps match ranking measurable before downstream use.",
  },
  "internal.pipeline.calculation": {
    routeCategory: "Backend implementation",
    primarySkillOverride: "backend-dev-guidelines",
    reason:
      "Calculation derives quantities and totals under backend validation rules.",
  },
  "internal.pipeline.aggregation": {
    routeCategory: "Architecture / system design",
    primarySkillOverride: "backend-architect",
    reason:
      "Aggregation maps cost lines into template structure and therefore belongs to the system design boundary layer.",
  },
  "internal.pipeline.review": {
    routeCategory: "Testing / QA",
    primarySkillOverride: "testing-qa",
    reason:
      "Review stage validates if the pipeline can proceed automatically or must stop for human review.",
  },
  "internal.pipeline.output": {
    routeCategory: "Document generation / template flow",
    primarySkillOverride: "documentation-generation-doc-generate",
    supportingSkillHints: ["product-manager"],
    reason:
      "Output stage prepares the document-facing result and keeps template semantics visible before final generation.",
  },
};
