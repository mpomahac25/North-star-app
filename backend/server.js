/* This file handles the following:
 *  - importing express app
 *  - reading environment config
 *  - starting the HTTP server
 *  - initializing services which must be available before connections are accepted
 *  - handing graceful shutdon and server errors
 */

import app from './app.js';

const port = Number(process.env.BACKEND_PORT || 3001);

app.listen(port, '0.0.0.0', () => {
    console.log(`Backend running on port ${port}`);
});