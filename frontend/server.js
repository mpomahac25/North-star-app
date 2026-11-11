import express from 'express';
import { config } from 'dotenv';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from './app.js';

const frontendDir = fileURLToPath(new URL('.', import.meta.url));
const envPath = fileURLToPath(new URL('../.env', import.meta.url));

config({ path: envPath });

const port = Number(process.env.FRONTEND_PORT || 3000);
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
const isDevelopment = process.argv.includes('--dev');

const app = createApp(backendUrl);
const server = createServer(app);

if (isDevelopment) {
    const { createServer: createViteServer } = await import('vite');

    const vite = await createViteServer({
        root: frontendDir,
        appType: 'spa',
        server: {
            middlewareMode: true,
            ws: {
                server
            }
        }
    });

    app.use(vite.middlewares);
}
else {
    const distDir = path.join(frontendDir, 'dist');

    app.use(express.static(distDir));

    app.get('/{*splat}', (req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
    });
}

server.listen(port, '0.0.0.0', () => {
    console.log(`Frontend running on http://localhost:${port}`);
    console.log(`Backend proxy target: ${backendUrl}`);
});