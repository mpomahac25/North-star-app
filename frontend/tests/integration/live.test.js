import request from 'supertest';
import { createApp } from '../../app.js';

describe('Liveness API', () => {

    test('GET /api/live returns HTTP 200 without backend connectivity', async () => {
        const app = createApp('http://127.0.0.1:1');

        const response = await request(app).get('/api/live');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/json/);

        expect(response.body).toEqual({
            status: 'alive',
            service: 'frontend'
        });
    });

    test('POST /api/live returns HTTP 405 without backend connectivity', async () => {
        const app = createApp('http://127.0.0.1:1');

        const response = await request(app).post('/api/live');

        expect(response.status).toBe(405);
        expect(response.headers['allow']).toBe('GET, HEAD');

        expect(response.body).toEqual({
            error: 'Method not allowed'
        });
    });

});