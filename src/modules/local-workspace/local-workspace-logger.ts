import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type LogLevel = "info" | "warn" | "error";

export class LocalWorkspaceLogger {
  readonly logPath: string;
  constructor(logPath: string) { this.logPath = logPath; }

  async write(level: LogLevel, event: string, fields: Record<string, unknown> = {}): Promise<void> {
    const safeFields = Object.fromEntries(Object.entries(fields).filter(([key]) => !/prompt|message|content|email|token|path/i.test(key)));
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...safeFields });
    try {
      await mkdir(dirname(this.logPath), { recursive: true });
      await appendFile(this.logPath, `${line}\n`, "utf8");
    } catch {
      // Logging must never break the local application.
    }
  }
}
