/* This file will handle the following:
 *  - create and configure express instance
 *  - register and configure middleware and API routes
 *  - configure request validation
 *  - export express app
 */

import express from 'express';
import { createStripeRouter } from './routes/stripeRoutes.js';
import { createStripeWebhookRouter } from './routes/stripeWebhookRoutes.js';
import { createStripeLifecycleRouter } from "./routes/stripeLifecycleRoutes.js";

const app = express();
const SERVICE_IDENTIFIER = 'payment';

app.use(createStripeWebhookRouter());

app.use(express.json());

app.get('/api/live', (req, res) => {
    res.json({
        status: 'alive',
        service: SERVICE_IDENTIFIER
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: SERVICE_IDENTIFIER
    });
});

app.use(createStripeRouter());
app.use(createStripeLifecycleRouter());

export default app;