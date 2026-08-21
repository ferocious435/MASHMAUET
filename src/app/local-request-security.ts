import type { IncomingMessage, ServerResponse } from "node:http";

export function enforceLocalRequestSecurity(request: IncomingMessage, response: ServerResponse): boolean {
  const hostHeader = request.headers.host;
  const hostname = normalizeHostname(hostHeader);
  const origin = request.headers.origin;
  const fetchSite = request.headers["sec-fetch-site"];
  if (!hostname || !isLoopbackHostname(hostname) || fetchSite === "cross-site" || (origin && !isLoopbackOrigin(origin))) {
    response.statusCode = 403;
    setSecurityHeaders(response);
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Доступ разрешён только локальному приложению", code: "local_access_only" }));
    return false;
  }
  return true;
}

export function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

function normalizeHostname(hostHeader: string | undefined): string | undefined {
  if (!hostHeader) return undefined;
  try { return new URL(`http://${hostHeader}`).hostname.toLowerCase(); }
  catch { return undefined; }
}

function isLoopbackOrigin(origin: string): boolean {
  try { return isLoopbackHostname(new URL(origin).hostname.toLowerCase()); }
  catch { return false; }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
