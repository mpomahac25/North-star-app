import { test, expect } from "@playwright/test";

test.describe("Application Liveness", () => {
  test("Frontend liveness endpoint responds successfully", async ({
    request,
  }) => {
    const response = await request.get("/api/live");

    expect(response.status()).toBe(200);

    expect(await response.json()).toEqual({
      status: "alive",
      service: "frontend",
    });
  });

  test("Backend liveness endpoint responds successfully", async ({
    request,
  }) => {
    const backendPort = process.env.E2E_BACKEND_PORT || "3101";
    const response = await request.get(
      `http://127.0.0.1:${backendPort}/api/live`,
    );

    expect(response.status()).toBe(200);

    expect(await response.json()).toEqual({
      status: "alive",
      service: "backend",
    });
  });
});
