import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',

    timeout: 15000,

    reporter: [
        ['list'],
        [
            'playwright-ctrf-json-reporter',
            {
                outputDir: 'ctrf',
                outputFile: 'ctrf-report.json'
            }
        ]
    ],

    use: {
        baseURL: 'http://127.0.0.1:3000',
        trace: 'retain-on-failure'
    },

    webServer: [
        {
            command: 'pnpm --dir ../backend start',
            url: 'http://127.0.0.1:3001/api/health',
            env: {
                BACKEND_PORT: '3001'
            },
            reuseExistingServer: !process.env.CI,
            timeout: 30000
        },
        {
            command: 'pnpm dev',
            url: 'http://127.0.0.1:3000/',
            env: {
                FRONTEND_PORT: '3000',
                BACKEND_URL: 'http://127.0.0.1:3001'
            },
            reuseExistingServer: !process.env.CI,
            timeout: 30000
        }
    ]
});