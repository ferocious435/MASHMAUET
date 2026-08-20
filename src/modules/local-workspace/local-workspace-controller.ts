import type { IncomingMessage, ServerResponse } from "node:http";
import { open, rm } from "node:fs/promises";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { LocalAppConfig } from "../../config/local-app-config.ts";
import type { LocalMaterial } from "./local-project-types.ts";
import { LocalWorkspaceService } from "./local-workspace-service.ts";
import { asPublicError, LocalWorkspaceError } from "./local-workspace-error.ts";
import type { LocalWorkspaceLogger } from "./local-workspace-logger.ts";
import { setSecurityHeaders } from "../../app/local-request-security.ts";
import {
  backupCreateSchema, chatSchema, confirmationSchema, createProjectSchema, dekelAnalyzeSchema, dekelLineUpdateSchema,
  proposalActionSchema, updateProjectSchema, validate, versionSchema,
} from "./local-workspace-validation.ts";

export class LocalWorkspaceController {
  private readonly limiter: LocalRateLimiter;
  readonly service: LocalWorkspaceService;
  readonly config: LocalAppConfig;
  readonly logger: LocalWorkspaceLogger;
  constructor(
    service: LocalWorkspaceService,
    config: LocalAppConfig,
    logger: LocalWorkspaceLogger,
  ) { this.service = service; this.config = config; this.logger = logger; this.limiter = new LocalRateLimiter(config.generalRequestsPerMinute, config.chatRequestsPerFiveMinutes); }

  async tryHandle(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith("/local/")) return false;
    const requestId = randomUUID();
    const startedAt = performance.now();
    try {
      await this.service.initialize();
      this.limiter.check(request, url.pathname);
      const handled = await this.route(request, response, url);
      await this.logger.write("info", "local_api_request", { requestId, method: request.method, route: routeLabel(url.pathname), statusCode: response.statusCode, durationMs: Math.round(performance.now() - startedAt) });
      return handled;
    } catch (error) {
      const publicError = asPublicError(error);
      await this.logger.write(publicError.statusCode >= 500 ? "error" : "warn", "local_api_error", { requestId, method: request.method, route: routeLabel(url.pathname), statusCode: publicError.statusCode, errorCode: publicError.code, errorName: error instanceof Error ? error.name : "unknown" });
      return this.json(response, publicError.statusCode, { error: publicError.message, code: publicError.code, requestId });
    }
  }

  private async route(request: IncomingMessage, response: ServerResponse, url: URL): Promise<true> {
    const method = request.method ?? "GET";
    const pathname = url.pathname;
    if (method === "GET" && pathname === "/local/health") return this.json(response, 200, { status: "ok", ...(await this.service.health()) });
    if (method === "GET" && pathname === "/local/projects") return this.json(response, 200, { projects: await this.service.listProjects() });
    if (method === "POST" && pathname === "/local/projects") {
      const input = validate(createProjectSchema, await readJson(request, this.config.maxJsonBytes));
      return this.json(response, 201, { project: await this.service.createProject(input.name, input.description) });
    }
    if (method === "GET" && pathname === "/local/archived-projects") return this.json(response, 200, { projects: await this.service.listArchived() });
    if (method === "GET" && pathname === "/local/backups") return this.json(response, 200, { backups: await this.service.listBackups() });
    if (method === "POST" && pathname === "/local/backups") {
      const input = validate(backupCreateSchema, await readJson(request, this.config.maxJsonBytes));
      return this.json(response, 201, { backup: await this.service.createBackup(input.label) });
    }
    const backupRestoreMatch = pathname.match(/^\/local\/backups\/([a-zA-Z0-9-]+)\/restore$/);
    if (method === "POST" && backupRestoreMatch) {
      validate(confirmationSchema, await readJson(request, this.config.maxJsonBytes));
      return this.json(response, 200, await this.service.restoreBackup(backupRestoreMatch[1]));
    }
    if (method === "GET" && pathname === "/local/codex/status") return this.json(response, 200, await this.service.codexStatus());
    if (method === "POST" && pathname === "/local/codex/login") return this.json(response, 200, await this.service.startLogin());

    const projectMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)$/);
    if (projectMatch && method === "GET") return this.json(response, 200, { project: await this.service.getProject(projectMatch[1]) });
    if (projectMatch && method === "PUT") {
      const input = validate(updateProjectSchema, await readJson(request, this.config.maxDocumentJsonBytes));
      return this.json(response, 200, { project: await this.service.updateProject(projectMatch[1], input) });
    }
    const dekelMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)\/dekel$/);
    if (dekelMatch && method === "GET") return this.json(response, 200, await this.service.getDekelReview(dekelMatch[1]));
    const dekelAnalyzeMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)\/dekel\/analyze$/);
    if (dekelAnalyzeMatch && method === "POST") {
      validate(dekelAnalyzeSchema, await readJson(request, this.config.maxJsonBytes));
      return this.json(response, 200, await this.service.analyzeDekel(dekelAnalyzeMatch[1]));
    }
    const dekelLineMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)\/dekel\/lines\/([a-zA-Z0-9-]+)$/);
    if (dekelLineMatch && method === "PUT") {
      const input = validate(dekelLineUpdateSchema, await readJson(request, this.config.maxJsonBytes));
      return this.json(response, 200, await this.service.updateDekelLine(dekelLineMatch[1], dekelLineMatch[2], input));
    }
    const dekelApplyMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)\/dekel\/apply$/);
    if (dekelApplyMatch && method === "POST") {
      validate(confirmationSchema, await readJson(request, this.config.maxJsonBytes));
      return this.json(response, 200, await this.service.applyDekelReview(dekelApplyMatch[1]));
    }
    const archiveMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)\/archive$/);
    if (archiveMatch && method === "POST") {
      validate(confirmationSchema, await readJson(request, this.config.maxJsonBytes));
      await this.service.archiveProject(archiveMatch[1]);
      return this.json(response, 200, { archived: true });
    }
    const archivedRestoreMatch = pathname.match(/^\/local\/archived-projects\/([a-zA-Z0-9-]+)\/restore$/);
    if (archivedRestoreMatch && method === "POST") return this.json(response, 200, { project: await this.service.restoreArchivedProject(archivedRestoreMatch[1]) });

    const materialsMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)\/materials$/);
    if (materialsMatch && method === "POST") return await this.uploadMaterial(request, response, materialsMatch[1]);
    const materialMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)\/materials\/([a-zA-Z0-9-]+)$/);
    if (materialMatch && method === "GET") return await this.downloadMaterial(response, materialMatch[1], materialMatch[2]);
    if (materialMatch && method === "DELETE") return this.json(response, 200, { project: await this.service.deleteMaterial(materialMatch[1], materialMatch[2]) });
    const reprocessMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)\/materials\/([a-zA-Z0-9-]+)\/reprocess$/);
    if (reprocessMatch && method === "POST") return this.json(response, 200, { project: await this.service.reprocessMaterial(reprocessMatch[1], reprocessMatch[2]) });

    const versionsMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)\/versions$/);
    if (versionsMatch && method === "POST") {
      const input = validate(versionSchema, await readJson(request, this.config.maxJsonBytes));
      return this.json(response, 201, { project: await this.service.createVersion(versionsMatch[1], input.label) });
    }
    const versionRestoreMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)\/versions\/([a-zA-Z0-9-]+)\/restore$/);
    if (versionRestoreMatch && method === "POST") return this.json(response, 200, { project: await this.service.restoreVersion(versionRestoreMatch[1], versionRestoreMatch[2]) });

    const chatMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)\/chat$/);
    if (chatMatch && method === "POST") {
      const input = validate(chatSchema, await readJson(request, this.config.maxJsonBytes));
      return this.json(response, 200, await this.service.chat(chatMatch[1], input.message));
    }
    const proposalMatch = pathname.match(/^\/local\/projects\/([a-zA-Z0-9-]+)\/proposals\/([a-zA-Z0-9-]+)\/(apply|reject)$/);
    if (proposalMatch && method === "POST") {
      const input = validate(proposalActionSchema, await readJson(request, this.config.maxJsonBytes));
      return this.json(response, 200, { project: await this.service.handleProposal(proposalMatch[1], proposalMatch[2], proposalMatch[3] as "apply" | "reject", input.scope, input.confirmGlobal) });
    }
    throw new LocalWorkspaceError(404, "route_not_found", "Локальный маршрут не найден");
  }

  private async uploadMaterial(request: IncomingMessage, response: ServerResponse, projectId: string): Promise<true> {
    await this.service.getProject(projectId);
    const name = decodeFileName(request.headers["x-file-name"]);
    const declaredSize = Number(request.headers["content-length"] ?? 0);
    if (!Number.isFinite(declaredSize) || declaredSize < 0 || declaredSize > this.config.maxUploadBytes) throw new LocalWorkspaceError(413, "file_too_large", "Файл больше 100 МБ");
    const materialId = randomUUID();
    const sourcePath = this.service.store.materialPath(projectId, materialId, name);
    let received = 0;
    const handle = await open(sourcePath, "wx");
    try {
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        received += buffer.length;
        if (received > this.config.maxUploadBytes) throw new LocalWorkspaceError(413, "file_too_large", "Файл больше 100 МБ");
        await handle.write(buffer);
      }
    } catch (error) {
      await handle.close();
      await rm(sourcePath, { force: true });
      throw error;
    }
    await handle.close();
    if (received === 0) { await rm(sourcePath, { force: true }); throw new LocalWorkspaceError(400, "empty_file", "Файл пустой"); }
    const material: LocalMaterial = { id: materialId, name, size: received, type: String(request.headers["content-type"] ?? "application/octet-stream").slice(0, 200), addedAt: new Date().toISOString(), status: "processing", sourcePath };
    return this.json(response, 201, await this.service.registerUploadedMaterial(projectId, material));
  }

  private async downloadMaterial(response: ServerResponse, projectId: string, materialId: string): Promise<true> {
    const material = await this.service.getMaterial(projectId, materialId);
    response.statusCode = 200;
    setSecurityHeaders(response);
    response.setHeader("Content-Type", material.type || "application/octet-stream");
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(material.name)}`);
    await pipeline(createReadStream(material.sourcePath!), response);
    return true;
  }

  private json(response: ServerResponse, statusCode: number, body: unknown): true {
    response.statusCode = statusCode;
    setSecurityHeaders(response);
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify(body));
    return true;
  }
}

async function readJson(request: IncomingMessage, maxSize: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxSize) throw new LocalWorkspaceError(413, "request_too_large", "Запрос слишком большой");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value as Record<string, unknown>;
  } catch { throw new LocalWorkspaceError(400, "invalid_json", "Некорректный JSON"); }
}

function decodeFileName(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || raw.length > 1_000) throw new LocalWorkspaceError(400, "missing_file_name", "Не указано имя файла");
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { throw new LocalWorkspaceError(400, "invalid_file_name", "Некорректное имя файла"); }
  const name = basename(decoded).trim();
  if (!name || name.length > 220) throw new LocalWorkspaceError(400, "invalid_file_name", "Некорректное имя файла");
  return name;
}

class LocalRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  readonly generalLimit: number;
  readonly chatLimit: number;
  constructor(generalLimit: number, chatLimit: number) { this.generalLimit = generalLimit; this.chatLimit = chatLimit; }
  check(request: IncomingMessage, pathname: string): void {
    const isChat = /\/chat$/.test(pathname);
    const windowMs = isChat ? 5 * 60_000 : 60_000;
    const limit = isChat ? this.chatLimit : this.generalLimit;
    const key = `${request.socket.remoteAddress ?? "local"}:${isChat ? "chat" : "general"}`;
    const now = Date.now();
    const active = (this.buckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
    if (active.length >= limit) throw new LocalWorkspaceError(429, "rate_limit", "Слишком много запросов. Подождите и повторите.");
    active.push(now);
    this.buckets.set(key, active);
    if (this.buckets.size > 100) for (const [bucketKey, timestamps] of this.buckets) if (!timestamps.some((timestamp) => now - timestamp < 5 * 60_000)) this.buckets.delete(bucketKey);
  }
}

function routeLabel(pathname: string): string { return pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id"); }
