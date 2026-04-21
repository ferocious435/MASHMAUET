import { readdir } from "node:fs/promises";
import path from "node:path";

import type { PricebookItem } from "../domain/reference-schemas.ts";
import { buildDekelPricebookItems } from "./dekel-pricebook-adapter.ts";
import {
  buildDekelEstimatePreview,
  type DekelEstimatePreview,
} from "./dekel-estimate-preview.ts";
import {
  readDekelRowsFromXlsx,
  selectBillableDekelRows,
} from "./openxml-dekel-reader.ts";

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
      const rows = await readDekelRowsFromXlsx(workbookPath);
      const billableRows = selectBillableDekelRows(rows);

      return {
        exists: true,
        workbookPath,
        rowsCount: rows.length,
        billableRowsCount: billableRows.length,
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

    const rows = await readDekelRowsFromXlsx(workbookPath);
    const workbookLabel = path.basename(workbookPath);

    return buildDekelPricebookItems(rows, {
      pricebookId: "dekel-live",
      workbookLabel,
    });
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

    const rows = await readDekelRowsFromXlsx(workbookPath);
    return buildDekelEstimatePreview(rows, {
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
}
