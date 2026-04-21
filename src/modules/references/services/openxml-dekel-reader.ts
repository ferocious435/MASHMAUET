import { readFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import {
  dekelExpectedHeaders,
  type DekelWorkbookColumnMap,
  type DekelWorkbookRow,
} from "../domain/dekel-schemas.ts";

type ZipEntryRecord = {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

export async function readDekelRowsFromXlsx(
  workbookFilePath: string,
): Promise<DekelWorkbookRow[]> {
  const workbookEntries = await readZipEntries(workbookFilePath, [
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/sharedStrings.xml",
  ]);
  const firstSheetPath = resolveFirstSheetRelativePathFromXml(
    workbookEntries["xl/workbook.xml"],
    workbookEntries["xl/_rels/workbook.xml.rels"],
  );
  const normalizedSheetPath = normalizeZipEntryPath(firstSheetPath);
  const sheetEntries = await readZipEntries(workbookFilePath, [normalizedSheetPath]);

  const sharedStrings = workbookEntries["xl/sharedStrings.xml"]
    ? parseSharedStrings(workbookEntries["xl/sharedStrings.xml"])
    : [];
  const parsedRows = parseSheetRows(sheetEntries[normalizedSheetPath], sharedStrings);
  const headerDescriptor = resolveHeaderDescriptor(parsedRows);

  if (!headerDescriptor) {
    throw new Error("Could not detect Dekel header row in xlsx workbook.");
  }

  return parsedRows
    .filter((row) => row.rowNumber > headerDescriptor.headerRowNumber)
    .filter((row) => Object.keys(row.rawCells).length > 0)
    .map((row) => ({
      rowNumber: row.rowNumber,
      serviceType: pickCellValue(row.rawCells, headerDescriptor.columnMap.serviceType),
      sscItemCode: pickCellValue(
        row.rawCells,
        headerDescriptor.columnMap.sscItemCode,
      ),
      longText: pickCellValue(row.rawCells, headerDescriptor.columnMap.longText),
      activityNumber: pickCellValue(
        row.rawCells,
        headerDescriptor.columnMap.activityNumber,
      ),
      quantity: toNullableNumber(
        pickCellValue(row.rawCells, headerDescriptor.columnMap.quantity),
      ),
      baseUnit: pickCellValue(row.rawCells, headerDescriptor.columnMap.baseUnit),
      rate: toNullableNumber(
        pickCellValue(row.rawCells, headerDescriptor.columnMap.rate),
      ),
      rawCells: row.rawCells,
    }));
}

export async function readDekelRowsFromExtractedWorkbook(
  workbookRootPath: string,
): Promise<DekelWorkbookRow[]> {
  const sharedStrings = await readSharedStrings(workbookRootPath);
  const firstSheetPath = await resolveFirstSheetPath(workbookRootPath);
  const sheetXml = await readFile(firstSheetPath, "utf8");
  const parsedRows = parseSheetRows(sheetXml, sharedStrings);
  const headerDescriptor = resolveHeaderDescriptor(parsedRows);

  if (!headerDescriptor) {
    throw new Error(
      "Could not detect Dekel header row in extracted workbook structure.",
    );
  }

  return parsedRows
    .filter((row) => row.rowNumber > headerDescriptor.headerRowNumber)
    .filter((row) => Object.keys(row.rawCells).length > 0)
    .map((row) => ({
      rowNumber: row.rowNumber,
      serviceType: pickCellValue(row.rawCells, headerDescriptor.columnMap.serviceType),
      sscItemCode: pickCellValue(
        row.rawCells,
        headerDescriptor.columnMap.sscItemCode,
      ),
      longText: pickCellValue(row.rawCells, headerDescriptor.columnMap.longText),
      activityNumber: pickCellValue(
        row.rawCells,
        headerDescriptor.columnMap.activityNumber,
      ),
      quantity: toNullableNumber(
        pickCellValue(row.rawCells, headerDescriptor.columnMap.quantity),
      ),
      baseUnit: pickCellValue(row.rawCells, headerDescriptor.columnMap.baseUnit),
      rate: toNullableNumber(
        pickCellValue(row.rawCells, headerDescriptor.columnMap.rate),
      ),
      rawCells: row.rawCells,
    }));
}

export function selectBillableDekelRows(
  rows: DekelWorkbookRow[],
): DekelWorkbookRow[] {
  return rows.filter(
    (row) =>
      Boolean(row.activityNumber) &&
      row.rate !== null &&
      row.rate > 0 &&
      Boolean(row.longText),
  );
}

async function readSharedStrings(workbookRootPath: string): Promise<string[]> {
  const sharedStringsPath = path.join(
    workbookRootPath,
    "xl",
    "sharedStrings.xml",
  );

  try {
    const sharedStringsXml = await readFile(sharedStringsPath, "utf8");
    return parseSharedStrings(sharedStringsXml);
  } catch (error) {
    if (isFileMissing(error)) {
      return [];
    }

    throw error;
  }
}

async function resolveFirstSheetPath(workbookRootPath: string): Promise<string> {
  const workbookXmlPath = path.join(workbookRootPath, "xl", "workbook.xml");
  const workbookRelsXmlPath = path.join(
    workbookRootPath,
    "xl",
    "_rels",
    "workbook.xml.rels",
  );

  const [workbookXml, workbookRelsXml] = await Promise.all([
    readFile(workbookXmlPath, "utf8"),
    readFile(workbookRelsXmlPath, "utf8"),
  ]);

  const relativePath = resolveFirstSheetRelativePathFromXml(
    workbookXml,
    workbookRelsXml,
  );

  return path.join(workbookRootPath, normalizeZipEntryPath(relativePath));
}

function parseSharedStrings(sharedStringsXml: string): string[] {
  const values: string[] = [];
  const sharedStringRegex = /<si>([\s\S]*?)<\/si>/gu;

  for (const match of sharedStringsXml.matchAll(sharedStringRegex)) {
    const textParts = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gu)].map(
      (item) => decodeXmlEntities(item[1]),
    );
    values.push(textParts.join("").replace(/\s+/gu, " ").trim());
  }

  return values;
}

function resolveFirstSheetRelativePathFromXml(
  workbookXml: string,
  workbookRelsXml: string,
): string {
  const sheetMatch = workbookXml.match(
    /<sheet[^>]+r:id="([^"]+)"[^>]*\/?>/u,
  );
  if (!sheetMatch) {
    throw new Error("Workbook does not contain any sheets.");
  }

  const relationshipId = sheetMatch[1];
  const relationshipRegex = new RegExp(
    `<Relationship[^>]+Id="${escapeRegExp(relationshipId)}"[^>]+Target="([^"]+)"[^>]*/?>`,
    "u",
  );
  const relationshipMatch = workbookRelsXml.match(relationshipRegex);

  if (!relationshipMatch) {
    throw new Error(`Workbook relationship ${relationshipId} was not found.`);
  }

  return relationshipMatch[1];
}

function parseSheetRows(
  sheetXml: string,
  sharedStrings: string[],
): Array<{ rowNumber: number; rawCells: Record<string, string> }> {
  const rows: Array<{ rowNumber: number; rawCells: Record<string, string> }> = [];
  const rowRegex = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/gu;

  for (const rowMatch of sheetXml.matchAll(rowRegex)) {
    const rowNumber = Number(rowMatch[1]);
    const rawCells: Record<string, string> = {};

    const cellRegex = /<c([^>]*)>([\s\S]*?)<\/c>/gu;
    for (const cellMatch of rowMatch[2].matchAll(cellRegex)) {
      const attributeBlock = cellMatch[1];
      const payloadBlock = cellMatch[2];
      const referenceMatch = attributeBlock.match(/\sr="([A-Z]+)\d+"/u);

      if (!referenceMatch) {
        continue;
      }

      const column = referenceMatch[1];
      const typeMatch = attributeBlock.match(/\st="([^"]+)"/u);
      const value = parseCellValue(payloadBlock, typeMatch?.[1] ?? null, sharedStrings);

      if (value !== null && value !== "") {
        rawCells[column] = value;
      }
    }

    rows.push({ rowNumber, rawCells });
  }

  return rows;
}

function parseCellValue(
  payloadBlock: string,
  cellType: string | null,
  sharedStrings: string[],
): string | null {
  const sharedValueMatch = payloadBlock.match(/<v>([\s\S]*?)<\/v>/u);
  if (sharedValueMatch) {
    const rawValue = decodeXmlEntities(sharedValueMatch[1]).trim();

    if (cellType === "s") {
      const sharedIndex = Number(rawValue);
      return sharedStrings[sharedIndex] ?? rawValue;
    }

    return rawValue;
  }

  const inlineTextMatches = [...payloadBlock.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gu)].map(
    (item) => decodeXmlEntities(item[1]),
  );
  if (inlineTextMatches.length > 0) {
    return inlineTextMatches.join("").replace(/\s+/gu, " ").trim();
  }

  return null;
}

function resolveHeaderDescriptor(
  rows: Array<{ rowNumber: number; rawCells: Record<string, string> }>,
): { headerRowNumber: number; columnMap: DekelWorkbookColumnMap } | null {
  const expectedEntries = Object.entries(dekelExpectedHeaders) as Array<
    [keyof DekelWorkbookColumnMap, string]
  >;

  for (const row of rows) {
    const columnMap: Partial<DekelWorkbookColumnMap> = {};

    for (const [column, value] of Object.entries(row.rawCells)) {
      const matchedEntry = expectedEntries.find(([, headerText]) => value === headerText);
      if (!matchedEntry) {
        continue;
      }

      const [key] = matchedEntry;
      columnMap[key] = column;
    }

    if (Object.keys(columnMap).length >= expectedEntries.length) {
      return {
        headerRowNumber: row.rowNumber,
        columnMap: columnMap as DekelWorkbookColumnMap,
      };
    }
  }

  return null;
}

function pickCellValue(
  rawCells: Record<string, string>,
  column: string,
): string | null {
  const value = rawCells[column];

  if (!value) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function toNullableNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.replace(/,/gu, "").trim();
  if (!/^-?\d+(\.\d+)?$/u.test(normalizedValue)) {
    return null;
  }

  return Number(normalizedValue);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isFileMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function readZipEntries(
  workbookFilePath: string,
  entryNames: string[],
): Promise<Record<string, string>> {
  const archiveBuffer = await readFile(workbookFilePath);
  const zipEntries = parseZipCentralDirectory(archiveBuffer);
  const result: Record<string, string> = {};

  for (const entryName of entryNames) {
    const entry = zipEntries.find((item) => item.fileName === entryName);
    if (!entry) {
      throw new Error(`Workbook entry ${entryName} was not found in ${workbookFilePath}.`);
    }

    result[entryName] = readZipEntryContent(archiveBuffer, entry);
  }

  return result;
}

function parseZipCentralDirectory(buffer: Buffer): ZipEntryRecord[] {
  const endOfCentralDirectoryOffset = findEndOfCentralDirectoryOffset(buffer);
  const centralDirectoryOffset = buffer.readUInt32LE(endOfCentralDirectoryOffset + 16);
  const recordsCount = buffer.readUInt16LE(endOfCentralDirectoryOffset + 10);
  const entries: ZipEntryRecord[] = [];

  let offset = centralDirectoryOffset;
  for (let index = 0; index < recordsCount; index += 1) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory signature.");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");

    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

function findEndOfCentralDirectoryOffset(buffer: Buffer): number {
  const signature = 0x06054b50;

  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }

  throw new Error("ZIP end of central directory record was not found.");
}

function readZipEntryContent(
  archiveBuffer: Buffer,
  entry: ZipEntryRecord,
): string {
  const signature = archiveBuffer.readUInt32LE(entry.localHeaderOffset);
  if (signature !== 0x04034b50) {
    throw new Error(`Invalid ZIP local header for ${entry.fileName}.`);
  }

  const fileNameLength = archiveBuffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraFieldLength = archiveBuffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  const compressedData = archiveBuffer.subarray(
    dataStart,
    dataStart + entry.compressedSize,
  );

  if (entry.compressionMethod === 0) {
    return compressedData.toString("utf8");
  }

  if (entry.compressionMethod === 8) {
    const uncompressedData = inflateRawSync(compressedData);
    if (uncompressedData.length !== entry.uncompressedSize) {
      throw new Error(`Unexpected unzip size for ${entry.fileName}.`);
    }

    return uncompressedData.toString("utf8");
  }

  throw new Error(
    `ZIP compression method ${entry.compressionMethod} is not supported.`,
  );
}

function normalizeZipEntryPath(relativePath: string): string {
  if (relativePath.startsWith("xl/")) {
    return relativePath;
  }

  if (relativePath.startsWith("/")) {
    return relativePath.slice(1);
  }

  return `xl/${relativePath}`;
}
