import { test, expect } from "@playwright/test";

async function assertApiError(response, expectedStatus) {
    expect(response.status()).toBe(expectedStatus);

    expect(response.headers()["content-type"]).toMatch(
        /application\/json/i,
    );

    const body = await response.json();

    expect(body).toEqual({
        error: {
            code: expect.stringMatching(
                /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/,
            ),
            message: expect.any(String),
        },
    });

    expect(body.error.message.trim()).not.toBe("");
}

test.describe("Health API", () => {
    test("GET /api/health returns HTTP 200 through frontend proxy", async ({ request }) => {
        const response = await request.get("/api/health");

        expect(response.status()).toBe(200);

        expect(response.headers()["content-type"]).toMatch(
            /application\/json/i,
        );

        expect(await response.json()).toEqual({
            status: "ok",
            service: "backend",
        });
    });

    test("POST /api/health returns standardized HTTP 404", async ({ request }) => {
        const response = await request.post("/api/health");

        await assertApiError(response, 404);
    });

    test("Unknown API routes return standardized HTTP 404", async ({ request }) => {
        const response = await request.get("/api/nonexistent-route");

        await assertApiError(response, 404);
    });
});