import { join, resolve } from "node:path";

export type LocalAppConfig = {
  host: "127.0.0.1";
  port: number;
  dataRootPath: string;
  maxUploadBytes: number;
  maxJsonBytes: number;
  maxDocumentJsonBytes: number;
  maxChatMessageCharacters: number;
  maxChatImages: number;
  maxMaterialContextCharacters: number;
  generalRequestsPerMinute: number;
  chatRequestsPerFiveMinutes: number;
};

export function loadLocalAppConfig(cwd = process.cwd()): LocalAppConfig {
  return {
    host: "127.0.0.1",
    port: integerFromEnvironment("PORT", 3000, 1, 65_535),
    dataRootPath: resolve(process.env.MASHMAUET_LOCAL_DATA ?? join(cwd, "local-data")),
    maxUploadBytes: 100 * 1024 * 1024,
    maxJsonBytes: 2 * 1024 * 1024,
    maxDocumentJsonBytes: 8 * 1024 * 1024,
    maxChatMessageCharacters: 30_000,
    maxChatImages: 24,
    maxMaterialContextCharacters: 600_000,
    generalRequestsPerMinute: 600,
    chatRequestsPerFiveMinutes: 30,
  };
}

function integerFromEnvironment(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} должен быть целым числом от ${minimum} до ${maximum}`);
  }
  return value;
}
