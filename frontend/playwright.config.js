import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const dbName = process.env.E2E_DB_NAME?.trim() || "rio_e2e_test";
const dbHost = process.env.E2E_DB_HOST?.trim() || "127.0.0.1";
const dbPort =
  process.env.E2E_DB_PORT?.trim() || process.env.POSTGRES_HOST_PORT || "5432";
const dbUser =
  process.env.E2E_DB_USER?.trim() || process.env.POSTGRES_USER?.trim();
const dbPassword = process.env.E2E_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD;

if (!dbName || dbName.toLowerCase() === "rio_theaters") {
  throw new Error(
    "Set E2E_DB_NAME to a dedicated test database (never rio_theaters).",
  );
}
if (!dbUser || !dbPassword) {
  throw new Error("E2E_DB_USER and E2E_DB_PASSWORD are required.");
}

process.env.E2E_DB_HOST = dbHost;
process.env.E2E_DB_PORT = dbPort;
process.env.E2E_DB_NAME = dbName;
process.env.E2E_DB_USER = dbUser;
process.env.E2E_DB_PASSWORD = dbPassword;

const frontendPort = process.env.E2E_FRONTEND_PORT || "3100";
const backendPort = process.env.E2E_BACKEND_PORT || "3101";
const loginPort = process.env.E2E_LOGIN_PORT || "3103";
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const backendUrl = `http://127.0.0.1:${backendPort}`;
const loginServiceUrl = `http://127.0.0.1:${loginPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  reporter: [
    ["list"],
    [
      "playwright-ctrf-json-reporter",
      {
        outputDir: "ctrf",
        outputFile: "ctrf-report.json",
      },
    ],
  ],
  use: {
    baseURL: frontendUrl,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --dir ../services/login start",
      url: `${loginServiceUrl}/api/health`,
      env: {
        LOGIN_PORT: loginPort,
        BACKEND_URL: backendUrl,
        FRONTEND_URL: frontendUrl,
        SESSION_COOKIE_SECURE: "false",
      },
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "pnpm --dir ../backend start",
      url: `${backendUrl}/api/ready`,
      env: {
        BACKEND_PORT: backendPort,
        LOGIN_SERVICE_URL: loginServiceUrl,
        DB_HOST: dbHost,
        DB_PORT: dbPort,
        DB_NAME: dbName,
        DB_USER: dbUser,
        DB_PASSWORD: dbPassword,
      },
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "pnpm dev",
      url: `${frontendUrl}/`,
      env: {
        FRONTEND_PORT: frontendPort,
        BACKEND_URL: backendUrl,
      },
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
