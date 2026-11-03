import { test, expect } from '@playwright/test';

test.describe('Application Liveness', () => {

    test('Frontend liveness endpoint responds successfully', async ({ request }) => {
        const response = await request.get('/api/live');

        expect(response.status()).toBe(200);

        expect(await response.json()).toEqual({
            status: 'alive',
            service: 'frontend'
        });
    });

    test('Backend liveness endpoint responds successfully', async ({ request }) => {
        const response = await request.get('http://127.0.0.1:3001/api/live');

        expect(response.status()).toBe(200);

        expect(await response.json()).toEqual({
            status: 'alive',
            service: 'backend'
        });
    });

});