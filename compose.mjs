import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const rootDir = fileURLToPath(new URL('./', import.meta.url));

const versionFiles = {
    FRONTEND_VERSION: 'frontend/VERSION',
    BACKEND_VERSION: 'backend/VERSION',
    BOOKING_VERSION: 'services/booking/VERSION',
    LOGIN_VERSION: 'services/login/VERSION',
    MOVIES_VERSION: 'services/movies/VERSION',
    PAYMENT_VERSION: 'services/payment/VERSION'
};

const environment = { ...process.env };

for (const [variable, file] of Object.entries(versionFiles)) {
    const version = readFileSync(join(rootDir, file), 'utf8').trim();

    if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) {
        throw new Error(`Invalid version in ${file}: "${version}"`);
    }

    environment[variable] = version;
}

const result = spawnSync(
    'docker',
    ['compose', ...process.argv.slice(2)],
    {
        cwd: rootDir,
        env: environment,
        stdio: 'inherit'
    }
);

if (result.error) {
    throw result.error;
}

process.exitCode = result.status ?? 1;