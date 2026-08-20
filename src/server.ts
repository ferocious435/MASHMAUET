import { createServer } from "node:http";

import { createApp } from "./app/create-app.ts";
import { loadLocalAppConfig } from "./config/local-app-config.ts";

const config = loadLocalAppConfig();
const app = createApp({ localConfig: config });
const server = createServer(app.handleRequest);
server.requestTimeout = 6 * 60_000;
server.headersTimeout = 30_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 1_000;

server.listen(config.port, config.host, () => {
  console.log(`MASHMAUET agent listening on http://${config.host}:${config.port}`);
});

let closing = false;
function shutdown(signal: string): void {
  if (closing) return;
  closing = true;
  console.log(`MASHMAUET received ${signal}; closing safely.`);
  app.close();
  server.close((error) => {
    if (error) console.error(error);
    process.exitCode = error ? 1 : 0;
  });
  setTimeout(() => {
    if (!server.listening) return;
    server.closeAllConnections();
    process.exitCode = 1;
  }, 5_000).unref();
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
