/* This file handles the following:
 *  - importing express app
 *  - reading environment config
 *  - starting the HTTP server
 *  - initializing services which must be available before connections are accepted
 *  - handing graceful shutdon and server errors
 */

import app from './app.js';

const port = Number(process.env.LOGIN_PORT || 3003);

app.listen(port, '0.0.0.0', () => {
    console.log(`Login service running on port ${port}`);
});