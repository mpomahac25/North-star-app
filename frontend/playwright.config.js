import { defineConfig } from "@playwright/test";

const databaseUrl = process.env.DB_TEST_URL;
const databaseEnvironment = {};
if (databaseUrl) {
  const testDatabase = new URL(databaseUrl);
  const databaseName = decodeURIComponent(testDatabase.pathname.slice(1));
  if (
    !["postgres:", "postgresql:"].includes(testDatabase.protocol) ||
    !["127.0.0.1", "localhost"].includes(testDatabase.hostname) ||
    !databaseName.endsWith("_test")
  ) {
    throw new Error(
      "DB_TEST_URL must use a local PostgreSQL database whose name ends in _test.",
    );
  }

  Object.assign(databaseEnvironment, {
    DB_HOST: testDatabase.hostname,
    DB_PORT: testDatabase.port || "5432",
    DB_NAME: databaseName,
    DB_USER: decodeURIComponent(testDatabase.username),
    DB_PASSWORD: decodeURIComponent(testDatabase.password),
  });
}

const webServers = [
  {
    command: "pnpm --dir ../backend start",
    url: "http://127.0.0.1:3001/api/health",
    env: {
      BACKEND_PORT: "3001",
      LOGIN_SERVICE_URL: "http://127.0.0.1:3003",
      ...databaseEnvironment,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
];

if (databaseUrl) {
  webServers.push({
    command: "pnpm --dir ../services/login start",
    url: "http://127.0.0.1:3003/api/health",
    env: {
      LOGIN_PORT: "3003",
      BACKEND_URL: "http://127.0.0.1:3001",
      FRONTEND_URL: "http://127.0.0.1:3000",
      SESSION_COOKIE_SECURE: "false",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  });
}

webServers.push({
  command: "pnpm dev",
  url: "http://127.0.0.1:3000/",
  env: {
    FRONTEND_PORT: "3000",
    BACKEND_URL: "http://127.0.0.1:3001",
  },
  reuseExistingServer: !process.env.CI,
  timeout: 30000,
});

export default defineConfig({
  testDir: "./tests/e2e",

  timeout: 15000,

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
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },

  webServer: webServers,
});
