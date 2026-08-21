import { rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export default async function globalTeardown(): Promise<void> {
  const configuredPath = process.env.MASHMAUET_E2E_DATA_ROOT;
  if (!configuredPath) return;

  const target = resolve(configuredPath);
  const expectedParent = resolve(process.cwd(), ".tmp", "playwright");
  if (dirname(target) !== expectedParent || !basename(target).startsWith("run-")) {
    throw new Error(`Refusing to remove unexpected E2E data path: ${target}`);
  }

  await rm(target, { recursive: true, force: true });
}
