import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setSecurityHeaders } from "./local-request-security.ts";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(currentDirectory, "../../public");

const publicFiles = new Map<string, { fileName: string; contentType: string }>([
  ["/", { fileName: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/index.html", { fileName: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/styles.css", { fileName: "styles.css", contentType: "text/css; charset=utf-8" }],
  ["/app.js", { fileName: "app.js", contentType: "text/javascript; charset=utf-8" }],
  [
    "/calculations.js",
    { fileName: "calculations.js", contentType: "text/javascript; charset=utf-8" },
  ],
  [
    "/document-layout.js",
    { fileName: "document-layout.js", contentType: "text/javascript; charset=utf-8" },
  ],
]);

export async function servePublicFile(
  pathname: string,
  response: ServerResponse,
): Promise<boolean> {
  const publicFile = publicFiles.get(pathname);

  if (!publicFile) {
    return false;
  }

  const content = await readFile(path.join(publicDirectory, publicFile.fileName));
  setSecurityHeaders(response);
  response.writeHead(200, {
    "content-type": publicFile.contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(content);
  return true;
}
