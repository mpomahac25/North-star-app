import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { createAuthPersistenceClient } from "../../authPersistenceClient.js";

const originalBackendUrl = process.env.BACKEND_URL;
const originalApiKey = process.env.INTERNAL_API_KEY;

afterEach(() => {
  jest.restoreAllMocks();
  if (originalBackendUrl === undefined) delete process.env.BACKEND_URL;
  else process.env.BACKEND_URL = originalBackendUrl;
  if (originalApiKey === undefined) delete process.env.INTERNAL_API_KEY;
  else process.env.INTERNAL_API_KEY = originalApiKey;
});

describe("auth persistence client", () => {
  test("calls the backend persistence API without requiring or sending an internal key", async () => {
    process.env.BACKEND_URL = "http://backend.test:3001";
    delete process.env.INTERNAL_API_KEY;
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 12 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      createAuthPersistenceClient().findOrCreateGoogleUser({
        subject: "google-subject",
        email: "user@example.test",
      }),
    ).resolves.toEqual({ id: 12 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url.href).toBe(
      "http://backend.test:3001/api/internal/auth/google-users",
    );
    expect(options.headers).toEqual({
      accept: "application/json",
      "content-type": "application/json",
    });
    expect(options.headers).not.toHaveProperty("x-internal-api-key");
  });
});
