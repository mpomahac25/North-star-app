import { test, expect } from '@playwright/test';

test.describe('Health API', () => {

    test('GET /api/health returns HTTP 200 through frontend proxy', async ({ request }) => {
        const response = await request.get('/api/health');

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('application/json');

        expect(await response.json()).toEqual({
            status: 'ok',
            service: 'backend'
        });
    });

    test('POST /api/health returns HTTP 404 through frontend proxy', async ({ request }) => {
        const response = await request.post('/api/health');

        expect(response.status()).toBe(404);
    });

});