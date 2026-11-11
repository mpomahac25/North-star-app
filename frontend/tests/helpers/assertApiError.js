import { expect } from "@jest/globals";

export function assertApiError(response, expectedStatus, expectedCode) {
    expect(response.status).toBe(expectedStatus);

    expect(response.headers["content-type"]).toMatch(
        /application\/json/i,
    );

    expect(response.body).toStrictEqual({
        error: {
            code: expectedCode ?? expect.stringMatching(
                /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/,
            ),
            message: expect.any(String),
        },
    });

    expect(response.body.error.message.trim()).not.toBe("");
}