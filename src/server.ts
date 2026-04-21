import { createServer } from "node:http";

import { createApp } from "./app/create-app.ts";

const port = Number(process.env.PORT ?? 3000);
const app = createApp();
const server = createServer(app.handleRequest);

server.listen(port, () => {
  console.log(`MASHMAUET agent listening on http://localhost:${port}`);
});
