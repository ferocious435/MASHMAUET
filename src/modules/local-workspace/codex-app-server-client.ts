import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { EventEmitter } from "node:events";

type JsonObject = Record<string, unknown>;

export interface CodexGateway {
  getAccount(): Promise<JsonObject>;
  startChatGptLogin(): Promise<JsonObject>;
  startThread(projectPath: string): Promise<string>;
  resumeThread(threadId: string): Promise<void>;
  runTurn(threadId: string, projectPath: string, prompt: string, imagePaths: string[]): Promise<string>;
  close(): void;
}

export class CodexAppServerClient implements CodexGateway {
  private child?: ChildProcessWithoutNullStreams;
  private readonly events = new EventEmitter();
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private nextId = 1;
  private startPromise?: Promise<void>;
  private readonly completedItems = new Map<string, string[]>();
  private readonly completedTurns = new Map<string, JsonObject>();
  private closing = false;
  private readonly workspaceRoot: string;
  private readonly codexScriptPath: string;

  constructor(workspaceRoot = process.cwd(), codexScriptPath = join(process.cwd(), "node_modules", "@openai", "codex", "bin", "codex.js")) {
    this.workspaceRoot = workspaceRoot;
    this.codexScriptPath = codexScriptPath;
  }

  async getAccount(): Promise<JsonObject> {
    await this.start();
    return await this.request("account/read", { refreshToken: false }) as JsonObject;
  }

  async startChatGptLogin(): Promise<JsonObject> {
    await this.start();
    return await this.request("account/login/start", { type: "chatgpt", useHostedLoginSuccessPage: true, appBrand: "chatgpt" }) as JsonObject;
  }

  async startThread(projectPath: string): Promise<string> {
    await this.start();
    const result = await this.request("thread/start", {
      cwd: resolve(projectPath),
      runtimeWorkspaceRoots: [resolve(projectPath)],
      approvalPolicy: "never",
      sandbox: "read-only",
      serviceName: "mashmauet",
      baseInstructions: BASE_INSTRUCTIONS,
    }) as { thread?: { id?: string } };
    if (!result.thread?.id) throw new Error("Codex не вернул идентификатор чата");
    return result.thread.id;
  }

  async resumeThread(threadId: string): Promise<void> {
    await this.start();
    await this.request("thread/resume", { threadId });
  }

  async runTurn(threadId: string, projectPath: string, prompt: string, imagePaths: string[]): Promise<string> {
    await this.start();
    const input: JsonObject[] = [{ type: "text", text: prompt }];
    for (const path of imagePaths.slice(0, 24)) input.push({ type: "localImage", path: resolve(path), detail: "high" });
    const started = await this.request("turn/start", {
      threadId,
      input,
      cwd: resolve(projectPath),
      runtimeWorkspaceRoots: [resolve(projectPath)],
      approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly", networkAccess: false },
      effort: "medium",
      summary: "concise",
      outputSchema: OUTPUT_SCHEMA,
    }) as { turn?: { id?: string } };
    const turnId = started.turn?.id;
    if (!turnId) throw new Error("Codex не запустил ответ");
    return await new Promise<string>((resolvePromise, rejectPromise) => {
      const messages: string[] = [...(this.completedItems.get(turnId) ?? [])];
      const onItem = (params: JsonObject) => {
        if (params.turnId !== turnId) return;
        const item = params.item as JsonObject | undefined;
        if (item?.type === "agentMessage" && typeof item.text === "string") messages.push(item.text);
      };
      const onCompleted = (params: JsonObject) => {
        const turn = params.turn as JsonObject | undefined;
        if (turn?.id !== turnId) return;
        cleanup();
        if (turn.status === "failed") rejectPromise(new Error(extractTurnError(turn)));
        else resolvePromise(messages.at(-1) ?? "");
      };
      const timer = setTimeout(() => { cleanup(); rejectPromise(new Error("Codex не ответил за отведённое время")); }, 300_000);
      const cleanup = () => {
        clearTimeout(timer);
        this.events.off("item/completed", onItem);
        this.events.off("turn/completed", onCompleted);
        this.completedItems.delete(turnId);
        this.completedTurns.delete(turnId);
      };
      this.events.on("item/completed", onItem);
      this.events.on("turn/completed", onCompleted);
      const alreadyCompleted = this.completedTurns.get(turnId);
      if (alreadyCompleted) queueMicrotask(() => onCompleted({ turn: alreadyCompleted }));
    });
  }

  close(): void {
    this.closing = true;
    const error = new Error("Codex App Server остановлен");
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.events.removeAllListeners();
    this.child?.kill();
    this.child = undefined;
    this.startPromise = undefined;
  }

  private async start(): Promise<void> {
    this.closing = false;
    if (this.startPromise) return await this.startPromise;
    this.startPromise = this.doStart();
    try { await this.startPromise; } catch (error) { this.startPromise = undefined; throw error; }
  }

  private async doStart(): Promise<void> {
    this.child = spawn(process.execPath, [this.codexScriptPath, "app-server", "--stdio"], {
      cwd: this.workspaceRoot,
      env: process.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stderr.on("data", (chunk) => process.stderr.write(`[codex] ${chunk}`));
    this.child.once("error", (spawnError) => this.handleProcessEnd(spawnError));
    this.child.once("exit", (code) => {
      if (!this.closing) this.handleProcessEnd(new Error(`Codex App Server завершился (код ${code ?? "?"})`));
    });
    createInterface({ input: this.child.stdout }).on("line", (line) => this.handleLine(line));
    await this.requestRaw("initialize", { clientInfo: { name: "mashmauet", title: "MASHMAUET", version: "0.2.0" }, capabilities: { experimentalApi: true } });
    this.notify("initialized", {});
  }

  private handleLine(line: string): void {
    let message: JsonObject;
    try { message = JSON.parse(line) as JsonObject; } catch { return; }
    if (typeof message.id === "number" && ("result" in message || "error" in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(extractRpcError(message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.id === "number" && typeof message.method === "string") {
      this.respond(message.id, approvalDecline(message.method));
      return;
    }
    if (typeof message.method === "string") {
      const params = (message.params ?? {}) as JsonObject;
      if (message.method === "item/completed" && typeof params.turnId === "string") {
        const item = params.item as JsonObject | undefined;
        if (item?.type === "agentMessage" && typeof item.text === "string") {
          const items = this.completedItems.get(params.turnId) ?? [];
          items.push(item.text);
          this.completedItems.set(params.turnId, items.slice(-5));
        }
      }
      if (message.method === "turn/completed") {
        const turn = params.turn as JsonObject | undefined;
        if (typeof turn?.id === "string") this.completedTurns.set(turn.id, turn);
      }
      this.events.emit(message.method, params);
      if (this.completedTurns.size > 100) this.completedTurns.delete(this.completedTurns.keys().next().value!);
      if (this.completedItems.size > 100) this.completedItems.delete(this.completedItems.keys().next().value!);
    }
  }

  private async request(method: string, params: JsonObject): Promise<unknown> { await this.start(); return await this.requestRaw(method, params); }
  private requestRaw(method: string, params: JsonObject): Promise<unknown> {
    if (!this.child?.stdin.writable) return Promise.reject(new Error("Codex App Server недоступен"));
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => { this.pending.delete(id); rejectPromise(new Error(`Тайм-аут Codex: ${method}`)); }, 30_000);
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      this.child!.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }
  private notify(method: string, params: JsonObject): void { this.child?.stdin.write(`${JSON.stringify({ method, params })}\n`); }
  private respond(id: number, result: unknown): void { this.child?.stdin.write(`${JSON.stringify({ id, result })}\n`); }
  private handleProcessEnd(error: Error): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.child = undefined;
    this.startPromise = undefined;
  }
}

const BASE_INSTRUCTIONS = `Ты — внутренний ассистент проекта MASHMAUET. Отвечай на языке пользователя. Анализируй только материалы текущего проекта, переданные в сообщении или находящиеся в текущей папке проекта. Не запускай команды, не меняй файлы и не выполняй внешние действия. Любое изменение документа только предложи структурированно для отдельного подтверждения владельцем. Не меняй общие правила системы. DEKEL — постоянный глобальный прайс-лист системы и единственный разрешённый источник кодов и цен по умолчанию для всех проектов; он всегда читается из системной папки HOMER/DEKEL и не загружается в проекты. Любой другой прайс-лист полностью игнорируй при ценообразовании независимо от его расположения — в проекте, глобальной папке или другом каталоге. Не используй его как источник, альтернативу или резервный вариант, пока владелец сам прямо не назовёт конкретный файл и не потребует использовать именно его. Никогда не спрашивай и не предлагай сменить прайс-лист. 3210 и «Синяя книга» — только внутренние справочные источники для понимания состава и последовательности работ, технических требований, измерения, состава цены и отдельной оплаты. Не считай их автоматически договорными документами проекта, не применяй каждый найденный пункт ко всем проектам и не меняй из-за них структуру, текст, таблицы, внешний вид или финансовые правила итогового документа. Материалы конкретного проекта, специальная спецификация, כתב כמויות и чертежи определяют применимость; противоречия и разные редакции нельзя разрешать произвольно. Учитывай правила расчёта: כתב כמויות содержит суммы без НДС в строках, НДС 18% добавляется только в итогах; פירוט האומדן состоит из 3–5 укрупнённых видов работ и показывает суммы с НДС; надбавки 7.4%, 5.4% и 2.7% считаются от суммы выполнения уже с НДС; скидок и резервов нет. Не превращай анализ в опрос: профессионально необходимые сопутствующие работы добавляй как обоснованные допущения. Каждое такое допущение связывай через evidenceNotes со стабильным id строки כתב כמויות, объясняй, что и почему добавлено, указывай уверенность и реальный источник, если он есть. Никогда не выдумывай источник. При построении כתב כמויות из материалов формируй полный перечень явных и необходимых сопутствующих работ. Не выдумывай код или цену DEKEL: если они не подтверждены исходным материалом, оставляй code пустым и unitPrice равным 0 — локальный экран «בדיקת DEKEL» подберёт официальные строки и цены без НДС. Количество извлекай из материала; профессиональное оценочное количество помечай evidenceNotes как inference. Уточняй только то, без чего невозможно продолжить или что существенно влияет на стоимость, технологию либо безопасность.`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "proposedChanges", "proposedProjectRules", "needsMoreInformation"],
  properties: {
    answer: { type: "string" },
    proposedChanges: { type: "array", items: { type: "object", additionalProperties: false, required: ["path", "valueJson", "reason"], properties: { path: { type: "string" }, valueJson: { type: "string" }, reason: { type: "string" } } } },
    proposedProjectRules: { type: "array", items: { type: "object", additionalProperties: false, required: ["rule", "reason"], properties: { rule: { type: "string" }, reason: { type: "string" } } } },
    needsMoreInformation: { type: "array", items: { type: "string" } },
  },
};

function extractRpcError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}
function extractTurnError(turn: JsonObject): string {
  const error = turn.error;
  return error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "Ответ Codex завершился ошибкой";
}
function approvalDecline(method: string): JsonObject {
  const normalized = method.toLowerCase();
  if (normalized.includes("requestuserinput")) return { answers: {} };
  if (normalized.includes("approval")) return { decision: "decline" };
  return { success: false };
}
