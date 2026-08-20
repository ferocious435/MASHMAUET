import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { PricebookItem } from "../domain/reference-schemas.ts";
import { buildDekelPricebookItems } from "./dekel-pricebook-adapter.ts";
import {
  buildDekelEstimatePreview,
  type DekelEstimatePreview,
} from "./dekel-estimate-preview.ts";
import {
  readDekelRowsFromXlsx,
} from "./openxml-dekel-reader.ts";
import type { DekelWorkbookRow } from "../domain/dekel-schemas.ts";

export interface DekelWorkbookSummary {
  exists: boolean;
  workbookPath: string | null;
  rowsCount: number;
  billableRowsCount: number;
  error: string | null;
}

export class DekelCatalogService {
  private readonly configuredWorkbookPath: string | null;
  private readonly workbookDirectoryPath: string;
  private cache?: { workbookPath: string; fingerprint: string; rows: DekelWorkbookRow[]; items: PricebookItem[] };

  public constructor(options?: { workbookPath?: string; workbookDirectoryPath?: string }) {
    this.configuredWorkbookPath = options?.workbookPath ?? null;
    this.workbookDirectoryPath =
      options?.workbookDirectoryPath ?? path.join(process.cwd(), "HOMER", "DEKEL");
  }

  public async getWorkbookSummary(): Promise<DekelWorkbookSummary> {
    const workbookPath = await this.resolveWorkbookPath();

    if (!workbookPath) {
      return {
        exists: false,
        workbookPath: null,
        rowsCount: 0,
        billableRowsCount: 0,
        error: "Dekel workbook was not found.",
      };
    }

    try {
      const snapshot = await this.loadSnapshot(workbookPath);

      return {
        exists: true,
        workbookPath,
        rowsCount: snapshot.rows.length,
        billableRowsCount: snapshot.items.length,
        error: null,
      };
    } catch (error) {
      return {
        exists: false,
        workbookPath,
        rowsCount: 0,
        billableRowsCount: 0,
        error: error instanceof Error ? error.message : "Unknown Dekel workbook error.",
      };
    }
  }

  public async getPricebookPreview(limit = 5): Promise<PricebookItem[]> {
    const items = await this.getAllPricebookItems();
    return items.slice(0, limit);
  }

  public async getAllPricebookItems(): Promise<PricebookItem[]> {
    const workbookPath = await this.resolveWorkbookPath();

    if (!workbookPath) {
      return [];
    }

    return [...(await this.loadSnapshot(workbookPath)).items];
  }

  public async getEstimatePreview(
    limit = 10,
    managementFeePercent = 14,
  ): Promise<DekelEstimatePreview> {
    const workbookPath = await this.resolveWorkbookPath();

    if (!workbookPath) {
      return buildDekelEstimatePreview([], {
        limit,
        managementFeePercent,
      });
    }

    const snapshot = await this.loadSnapshot(workbookPath);
    return buildDekelEstimatePreview(snapshot.rows, {
      limit,
      managementFeePercent,
    });
  }

  private async resolveWorkbookPath(): Promise<string | null> {
    if (this.configuredWorkbookPath) {
      return this.configuredWorkbookPath;
    }

    try {
      const directoryEntries = await readdir(this.workbookDirectoryPath, {
        withFileTypes: true,
      });
      const candidateEntry = directoryEntries.find(
        (entry) =>
          entry.isFile() && path.extname(entry.name).toLowerCase() === ".xlsx",
      );

      if (!candidateEntry) {
        return null;
      }

      return path.join(this.workbookDirectoryPath, candidateEntry.name);
    } catch {
      return null;
    }
  }

  private async loadSnapshot(workbookPath: string): Promise<{ rows: DekelWorkbookRow[]; items: PricebookItem[] }> {
    const file = await stat(workbookPath);
    const fingerprint = `${file.size}:${file.mtimeMs}`;
    if (this.cache?.workbookPath === workbookPath && this.cache.fingerprint === fingerprint) {
      return this.cache;
    }
    const rows = await readDekelRowsFromXlsx(workbookPath);
    const items = buildDekelPricebookItems(rows, {
      pricebookId: "dekel-live",
      workbookLabel: path.basename(workbookPath),
    });
    this.cache = { workbookPath, fingerprint, rows, items };
    return this.cache;
  }
}
