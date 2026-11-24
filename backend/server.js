/* This file handles the following:
 *  - importing express app
 *  - reading environment config
 *  - starting the HTTP server
 *  - initializing services which must be available before connections are accepted
 *  - handing graceful shutdon and server errors
 */

import app from "./app.js";
import { pool } from "./db/pool.js";

const port = Number(process.env.BACKEND_PORT || 3001);

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Backend running on port ${port}`);
});

let isShuttingDown = false;
const shutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received; closing backend and PostgreSQL pool.`);

  server.close(async (error) => {
    if (error) console.error("Error while closing backend server:", error);
    await pool.end();
    process.exitCode = error ? 1 : 0;
  });
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
