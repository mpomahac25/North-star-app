import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const components = [
    'frontend',
    'backend',
    'services/booking',
    'services/login',
    'services/payment',
    'services/movies'
];

const baseSha = process.env.PR_BASE_SHA;

if (!baseSha) {
    throw new Error('PR_BASE_SHA is required');
}

function git(...args) {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function parseVersion(value) {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(value);

    if (!match) {
        throw new Error(`Invalid semantic version: ${value}`);
    }

    const prerelease = match[4]?.split('.') ?? [];
    const build = match[5]?.split('.') ?? [];

    if ([...prerelease, ...build].some(part => part.length === 0)) {
        throw new Error(`Invalid semantic version: ${value}`);
    }

    if (prerelease.some(part => /^\d+$/.test(part) && /^0\d/.test(part))) {
        throw new Error(`Invalid semantic version: ${value}`);
    }

    return {
        numbers: match.slice(1, 4).map(BigInt),
        prerelease
    };
}

function compareVersions(current, previous) {
    const a = parseVersion(current);
    const b = parseVersion(previous);

    for (let index = 0; index < 3; index++) {
        if (a.numbers[index] !== b.numbers[index]) {
            return a.numbers[index] > b.numbers[index] ? 1 : -1;
        }
    }

    if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
    if (a.prerelease.length === 0) return 1;
    if (b.prerelease.length === 0) return -1;

    const count = Math.min(a.prerelease.length, b.prerelease.length);

    for (let index = 0; index < count; index++) {
        const left = a.prerelease[index];
        const right = b.prerelease[index];

        if (left === right) continue;

        const leftNumeric = /^\d+$/.test(left);
        const rightNumeric = /^\d+$/.test(right);

        if (leftNumeric && rightNumeric) {
            return BigInt(left) > BigInt(right) ? 1 : -1;
        }

        if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
        return left > right ? 1 : -1;
    }

    return Math.sign(a.prerelease.length - b.prerelease.length);
}

const changedFiles = git(
    'diff',
    '--name-only',
    '--diff-filter=ACDMRT',
    baseSha,
    'HEAD'
)
    .split('\n')
    .filter(Boolean);

const errors = [];

for (const directory of components) {
    const versionPath = `${directory}/VERSION`;
    const currentVersion = readFileSync(versionPath, 'utf8').trim();
    const previousVersion = git('show', `${baseSha}:${versionPath}`);

    const relevantChanges = changedFiles.filter(file => {
        if (!file.startsWith(`${directory}/`)) return false;

        const relative = file.slice(directory.length + 1);

        return relative !== 'VERSION' &&
            relative !== 'README.md' &&
            relative !== 'jest.config.js' &&
            relative !== 'playwright.config.js' &&
            relative !== 'eslint.config.js' &&
            !relative.startsWith('tests/');
    });

    try {
        const comparison = compareVersions(currentVersion, previousVersion);

        if (comparison < 0) {
            errors.push(
                `${directory}: VERSION decreased (${previousVersion} -> ${currentVersion})`
            );
        }
        else if (relevantChanges.length > 0 && comparison === 0) {
            errors.push(
                `${directory}: deployable files changed but VERSION is still ${currentVersion}`
            );
        }
        else {
            console.log(
                `${directory}: ${previousVersion} -> ${currentVersion} ` +
                `(${relevantChanges.length} deployable file changes)`
            );
        }
    }
    catch (error) {
        errors.push(`${directory}: ${error.message}`);
    }
}

if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
}