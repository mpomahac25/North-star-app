import express from "express";
import request from "supertest";
import { createApp } from "../../app.js";
import { assertApiError } from "../helpers/assertApiError.js";

describe("Frontend Health API Proxy", () => {
    let backendServer;
    let app;

    beforeAll(async () => {
        const backend = express();

        backend.get("/api/health", (req, res) => {
            res.json({
                status: "ok",
                service: "backend",
            });
        });

        backend.post("/api/health", (req, res) => {
            res.status(404).json({
                error: {
                    code: "ROUTE_NOT_FOUND",
                    message: "The requested API route does not exist.",
                },
            });
        });

        await new Promise((resolve) => {
            backendServer = backend.listen(0, "127.0.0.1", resolve);
        });

        const port = backendServer.address().port;

        app = createApp(`http://127.0.0.1:${port}`);
    });

    afterAll(async () => {
        await new Promise((resolve, reject) => {
            backendServer.close((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    });

    test("GET /api/health returns HTTP 200 through the proxy", async () => {
        const response = await request(app).get("/api/health");

        expect(response.status).toBe(200);

        expect(response.headers["content-type"]).toMatch(/json/);

        expect(response.body).toEqual({
            status: "ok",
            service: "backend",
        });
    });

    test("POST /api/health preserves the standardized backend error", async () => {
        const response = await request(app).post("/api/health");

        assertApiError(response, 404, "ROUTE_NOT_FOUND");

        expect(response.body.error.message).toBe(
            "The requested API route does not exist.",
        );
    });
});