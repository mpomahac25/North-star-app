import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

export function createApp(backendUrl) {
    const app = express();

    // MUST BE KEPT HERE BEFORE PROXY!!!
    app.get('/api/live', (req, res) => {
        res.json({
            status: 'alive',
            service: 'frontend'
        });
    });

    // Needed for negative test
    // MUST BE KEPT HERE BEFORE PROXY!!!
    app.all('/api/live', (req, res) => {
        res.set('Allow', 'GET, HEAD');

        res.status(405).json({
            error: {
                code: "METHOD_NOT_ALLOWED",
                message: "The requested HTTP method is not allowed."
            }
        });
    });

    const apiProxy = createProxyMiddleware({
        target: backendUrl,
        changeOrigin: true,
        pathFilter: (pathname) => {
            return pathname === '/api' || pathname.startsWith('/api/');
        },
        on: {
            error: (error, req, res) => {
                console.error(`Proxy error: ${error.message}`);

                if (res.headersSent) {
                    res.destroy(error);
                    return;
                }

                res.writeHead(502, {
                    'Content-Type': 'application/json'
                });

                res.end(JSON.stringify({
                    error: {
                        code: "BACKEND_UNAVAILABLE",
                        message: "The backend service is unavailable."
                    }
                }));
            }
        }
    });

    app.use(apiProxy);

    return app;
}