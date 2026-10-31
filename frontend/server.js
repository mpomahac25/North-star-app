import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from 'dotenv';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const frontendDir = fileURLToPath(new URL('.', import.meta.url));
const envPath = fileURLToPath(new URL('../.env', import.meta.url));

config({ path: envPath });

// Environment config
const port = Number(process.env.FRONTEND_PORT || 3000);
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
const isDevelopment = process.argv.includes('--dev');

const app = express();
const server = createServer(app);

// Proxy config
const apiProxy = createProxyMiddleware({
    target: backendUrl,
    changeOrigin: true,
    pathFilter: (pathname) => {
        return pathname === '/api' || pathname.startsWith('/api/');
    },
    on: {
        error: (error, req, res) => {
            console.error(`Proxy error: ${error.message}`);

            if (!res.headersSent) {
                res.writeHead(502, {
                    'Content-Type': 'application/json'
                });
            }

            res.end(JSON.stringify({
                error: 'Backend service unavailable'
            }));
        }
    }
});

app.use(apiProxy);

// Attaches Vite to Express if running with "pnpm dev" or "node server.js --dev" (development environment)
if (isDevelopment) {

    // Dynamic loading of Vite to ensure the production deployment doesn't need Vite installed
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
// If not development environment (meaning it's production enviornment), not Vite is used and instead Express handles static file serving
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