import request from 'supertest';
import app from '../../app.js';

describe('Liveness API', () => {

    test('GET /api/live returns HTTP 200 and correct status', async () => {
        const response = await request(app).get('/api/live');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/json/);

        expect(response.body).toEqual({
            status: 'alive',
            service: 'movies-api'
        });
    });

    test('POST /api/live returns HTTP 404', async () => {
        const response = await request(app).post('/api/live');

        expect(response.status).toBe(404);
    });

});