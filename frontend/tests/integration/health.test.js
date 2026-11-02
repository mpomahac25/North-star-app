import express from 'express';
import request from 'supertest';
import { createApp } from '../../app.js';

describe('Frontend Health API Proxy', () => {

    let backendServer;
    let app;

    beforeAll(async () => {
        const backend = express();

        backend.get('/api/health', (req, res) => {
            res.json({
                status: 'ok',
                service: 'backend'
            });
        });

        backend.post('/api/health', (req, res) => {
            res.status(404).json({
                error: 'Route not found'
            });
        });

        await new Promise((resolve) => {
            backendServer = backend.listen(0, '127.0.0.1', resolve);
        });

        const port = backendServer.address().port;

        app = createApp(`http://127.0.0.1:${port}`);
    });

    afterAll(async () => {
        await new Promise((resolve, reject) => {
            backendServer.close((error) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    });

    test('GET /api/health returns HTTP 200 through proxy', async () => {
        const response = await request(app).get('/api/health');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/json/);

        expect(response.body).toEqual({
            status: 'ok',
            service: 'backend'
        });
    });

    test('POST /api/health returns HTTP 404 through proxy', async () => {
        const response = await request(app).post('/api/health');

        expect(response.status).toBe(404);

        expect(response.body).toEqual({
            error: 'Route not found'
        });
    });

});