import { open } from "node:fs/promises";
import { extname } from "node:path";
import { LocalWorkspaceError } from "./local-workspace-error.ts";

const ALLOWED_EXTENSIONS = new Set([".pdf", ".xlsx", ".xls", ".docx", ".csv", ".tsv", ".txt", ".md", ".json", ".jpg", ".jpeg", ".png", ".webp"]);

export async function validateUploadedFile(path: string, originalName: string): Promise<void> {
  const extension = extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new LocalWorkspaceError(415, "unsupported_file_type", "Этот тип файла не разрешён. Поддерживаются PDF, XLSX, DOCX, CSV, TXT и изображения.");
  const handle = await open(path, "r");
  const header = Buffer.alloc(512);
  let bytesRead = 0;
  try { ({ bytesRead } = await handle.read(header, 0, header.length, 0)); }
  finally { await handle.close(); }
  const actualHeader = header.subarray(0, bytesRead);
  const valid = extension === ".pdf" ? startsWith(actualHeader, [0x25, 0x50, 0x44, 0x46, 0x2d])
    : [".xlsx", ".docx"].includes(extension) ? startsWith(actualHeader, [0x50, 0x4b])
    : extension === ".xls" ? startsWith(actualHeader, [0xd0, 0xcf, 0x11, 0xe0])
    : [".jpg", ".jpeg"].includes(extension) ? startsWith(actualHeader, [0xff, 0xd8, 0xff])
    : extension === ".png" ? startsWith(actualHeader, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    : extension === ".webp" ? actualHeader.subarray(0, 4).toString("ascii") === "RIFF" && actualHeader.subarray(8, 12).toString("ascii") === "WEBP"
    : !actualHeader.includes(0);
  if (!valid) throw new LocalWorkspaceError(415, "file_signature_mismatch", "Содержимое файла не соответствует его расширению");
}

function startsWith(buffer: Buffer, signature: number[]): boolean {
  return signature.every((byte, index) => buffer[index] === byte);
}
