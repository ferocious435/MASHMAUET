import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import mammoth from "mammoth";
import readXlsxFile from "read-excel-file/node";
import type { LocalMaterial } from "./local-project-types.ts";

const MAX_TEXT = 1_500_000;

export async function extractMaterial(filePath: string, derivedDirectory: string, material: LocalMaterial): Promise<LocalMaterial> {
  await mkdir(derivedDirectory, { recursive: true });
  const extension = extname(material.name).toLowerCase();
  const textPath = join(derivedDirectory, "content.txt");
  try {
    if ([".txt", ".md", ".json", ".csv", ".tsv"].includes(extension)) {
      const text = limitText(await readFile(filePath, "utf8"));
      await writeFile(textPath, text, "utf8");
      return { ...material, status: "ready", details: `${text.length} знаков извлечено`, extractedTextPath: textPath };
    }
    if (extension === ".docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      const text = limitText(result.value);
      await writeFile(textPath, text, "utf8");
      return { ...material, status: "ready", details: `${text.length} знаков извлечено`, extractedTextPath: textPath };
    }
    if (extension === ".xlsx") {
      const sheets = await readXlsxFile(filePath);
      const parts: string[] = [];
      for (const sheet of sheets.slice(0, 30)) {
        const rows = sheet.data;
        parts.push(`\n### Лист: ${sheet.sheet}`);
        for (const row of rows.slice(0, 5000)) parts.push(row.slice(0, 80).map((cell) => cell == null ? "" : String(cell)).join("\t"));
        if (rows.length > 5000) parts.push(`[Обрезано: всего строк ${rows.length}]`);
      }
      const text = limitText(parts.join("\n"));
      await writeFile(textPath, text, "utf8");
      return { ...material, status: "ready", details: `${sheets.length} листов, таблица прочитана`, sheetCount: sheets.length, extractedTextPath: textPath };
    }
    if (extension === ".pdf") return await extractPdf(filePath, derivedDirectory, textPath, material);
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
      return { ...material, status: "ready", details: "Изображение готово для визуального анализа", visionImagePaths: [filePath] };
    }
    if ([".mp4", ".m4v", ".mov", ".webm"].includes(extension)) {
      return { ...material, status: "ready", details: "Видео сохранено; локальная страница подготовит ключевые кадры для анализа", visionImagePaths: [], videoFrameCount: 0 };
    }
    if (extension === ".xls") return { ...material, status: "unsupported", details: "Старый формат .xls: пересохраните файл как .xlsx" };
    return { ...material, status: "unsupported", details: "Формат сохранён, но автоматическое чтение пока не поддерживается" };
  } catch (error) {
    return { ...material, status: "error", details: error instanceof Error ? error.message : "Ошибка чтения файла" };
  }
}

async function extractPdf(filePath: string, derivedDirectory: string, textPath: string, material: LocalMaterial): Promise<LocalMaterial> {
  const canvas = await import("@napi-rs/canvas");
  Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, ImageData: canvas.ImageData, Path2D: canvas.Path2D });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const bytes = new Uint8Array(await readFile(filePath));
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pageTexts: string[] = [];
  const visionImagePaths: string[] = [];
  const pagesToRender = Math.min(pdf.numPages, 30);
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => "str" in item ? item.str : "").join(" ");
    pageTexts.push(`\n### Страница ${pageNumber}\n${text}`);
    if (pageNumber <= pagesToRender && text.trim().length < 120) {
      const viewport = page.getViewport({ scale: 1.6 });
      const imageCanvas = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = imageCanvas.getContext("2d");
      await page.render({ canvasContext: context as never, viewport, canvas: imageCanvas as never }).promise;
      const imagePath = join(derivedDirectory, `page-${pageNumber}.png`);
      await writeFile(imagePath, imageCanvas.toBuffer("image/png"));
      visionImagePaths.push(imagePath);
    }
  }
  const text = limitText(pageTexts.join("\n"));
  await writeFile(textPath, text, "utf8");
  const scanned = visionImagePaths.length ? `; ${visionImagePaths.length} страниц подготовлено для визуального чтения` : "";
  return { ...material, status: "ready", details: `${pdf.numPages} страниц прочитано${scanned}`, pageCount: pdf.numPages, extractedTextPath: textPath, visionImagePaths };
}

function limitText(value: string): string {
  return value.length <= MAX_TEXT ? value : `${value.slice(0, MAX_TEXT)}\n[Текст обрезан до ${MAX_TEXT} знаков]`;
}
