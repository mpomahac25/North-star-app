import request from 'supertest';
import app from '../../app.js';

describe('Health API', () => {

    test('GET /api/health returns HTTP 200 and correct status', async () => {
        const response = await request(app).get('/api/health');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/json/);

        expect(response.body).toEqual({
            status: 'ok',
            service: 'booking'
        });
    });

    test('POST /api/health returns HTTP 404', async () => {
        const response = await request(app).post('/api/health');

        expect(response.status).toBe(404);
    });

});