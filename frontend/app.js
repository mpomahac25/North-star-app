import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

export function createApp(backendUrl) {
    const app = express();

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

    return app;
}