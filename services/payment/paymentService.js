/* This file handles the following:
 *  - importing express app
 *  - reading environment config
 *  - starting the HTTP server
 *  - initializing services which must be available before connections are accepted
 *  - handing graceful shutdon and server errors
 */

import app from './app.js';

const port = Number(process.env.PAYMENT_PORT || 3004);

app.listen(port, '0.0.0.0', () => {
    console.log(`Payment service running on port ${port}`);
});