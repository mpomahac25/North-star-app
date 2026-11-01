/* This file will handle the following:
 *  - create and configure express instance
 *  - register and configure middleware and API routes
 *  - configure request validation
 *  - export express app
 */

import express from 'express';

const app = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'login'
    });
});

export default app;