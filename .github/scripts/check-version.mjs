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

function atBase(path) {
    return git('show', `${baseSha}:${path}`);
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value).sort().map(key => [key, stable(value[key])])
        );
    }

    return value;
}

function equal(left, right) {
    return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function getLockfileImporterGroups(text) {
    const result = {
        dependencies: [],
        optionalDependencies: [],
        devDependencies: []
    };

    let inImporters = false;
    let inRootImporter = false;
    let group = null;
    let foundRoot = false;

    for (const line of text.split(/\r?\n/)) {
        if (line === 'importers:') {
            inImporters = true;
            continue;
        }

        if (!inImporters) continue;
        if (line && !line.startsWith(' ')) break;

        if (/^  \.:\s*$/.test(line)) {
            inRootImporter = true;
            foundRoot = true;
            group = null;
            continue;
        }

        if (/^  \S/.test(line)) {
            inRootImporter = false;
            group = null;
            continue;
        }

        if (!inRootImporter) continue;

        const groupMatch = /^    ([A-Za-z]+):\s*$/.exec(line);

        if (groupMatch) {
            group = Object.hasOwn(result, groupMatch[1])
                ? groupMatch[1]
                : null;

            continue;
        }

        if (group && /^ {6,}\S/.test(line)) {
            result[group].push(line.trim());
        }
    }

    if (!foundRoot) {
        throw new Error('pnpm-lock.yaml has no root importer');
    }

    return result;
}

function packageChanges(directory) {
    const path = `${directory}/package.json`;

    const oldPackage = JSON.parse(atBase(path));
    const newPackage = JSON.parse(readFileSync(path, 'utf8'));

    const oldRuntime = { ...oldPackage };
    const newRuntime = { ...newPackage };

    delete oldRuntime.devDependencies;
    delete oldRuntime.version;

    delete newRuntime.devDependencies;
    delete newRuntime.version;

    return {
        runtimeChanged: !equal(oldRuntime, newRuntime),
        devChanged: !equal(
            oldPackage.devDependencies ?? {},
            newPackage.devDependencies ?? {}
        )
    };
}

function lockfileChanges(directory, devManifestChanged) {
    const path = `${directory}/pnpm-lock.yaml`;

    const oldText = atBase(path);
    const newText = readFileSync(path, 'utf8').trim();

    if (oldText === newText) return false;

    const oldGroups = getLockfileImporterGroups(oldText);
    const newGroups = getLockfileImporterGroups(newText);

    if (
        !equal(oldGroups.dependencies, newGroups.dependencies) ||
        !equal(oldGroups.optionalDependencies, newGroups.optionalDependencies)
    ) {
        return true;
    }

    const devLockChanged = !equal(
        oldGroups.devDependencies,
        newGroups.devDependencies
    );

    return !(devManifestChanged || devLockChanged);
}

function parseVersion(value) {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(value);

    if (!match) {
        throw new Error(`Invalid semantic version: ${value}`);
    }

    const prerelease = match[4]?.split('.') ?? [];
    const build = match[5]?.split('.') ?? [];

    if (
        [...prerelease, ...build].some(part => part.length === 0) ||
        prerelease.some(part => /^\d+$/.test(part) && /^0\d/.test(part))
    ) {
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

    const count = Math.min(
        a.prerelease.length,
        b.prerelease.length
    );

    for (let index = 0; index < count; index++) {
        const left = a.prerelease[index];
        const right = b.prerelease[index];

        if (left === right) continue;

        const leftNumeric = /^\d+$/.test(left);
        const rightNumeric = /^\d+$/.test(right);

        if (leftNumeric && rightNumeric) {
            return BigInt(left) > BigInt(right) ? 1 : -1;
        }

        if (leftNumeric !== rightNumeric) {
            return leftNumeric ? -1 : 1;
        }

        return left > right ? 1 : -1;
    }

    return Math.sign(
        a.prerelease.length - b.prerelease.length
    );
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
    try {
        const versionPath = `${directory}/VERSION`;

        const currentVersion = readFileSync(
            versionPath,
            'utf8'
        ).trim();

        const previousVersion = atBase(versionPath);

        const changed = changedFiles.filter(file =>
            file.startsWith(`${directory}/`)
        );

        const changedSet = new Set(changed);

        const relevantChanges = changed.filter(file => {
            const relative = file.slice(directory.length + 1);

            return relative !== 'VERSION' &&
                relative !== 'README.md' &&
                relative !== 'package.json' &&
                relative !== 'pnpm-lock.yaml' &&
                relative !== 'jest.config.js' &&
                relative !== 'playwright.config.js' &&
                relative !== 'eslint.config.js' &&
                !relative.startsWith('tests/');
        });

        let devChanged = false;

        if (changedSet.has(`${directory}/package.json`)) {
            const result = packageChanges(directory);

            devChanged = result.devChanged;

            if (result.runtimeChanged) {
                relevantChanges.push(`${directory}/package.json`);
            }
        }

        if (
            changedSet.has(`${directory}/pnpm-lock.yaml`) &&
            lockfileChanges(directory, devChanged)
        ) {
            relevantChanges.push(`${directory}/pnpm-lock.yaml`);
        }

        const comparison = compareVersions(
            currentVersion,
            previousVersion
        );

        if (comparison < 0) {
            errors.push(
                `${directory}: VERSION decreased ` +
                `(${previousVersion} -> ${currentVersion})`
            );
        }
        else if (
            relevantChanges.length > 0 &&
            comparison === 0
        ) {
            errors.push(
                `${directory}: deployable files changed but ` +
                `VERSION is still ${currentVersion}\n` +
                `  Relevant files: ${relevantChanges.join(', ')}`
            );
        }
        else {
            console.log(
                `${directory}: ${previousVersion} -> ${currentVersion} ` +
                `(${relevantChanges.length} production-relevant changes)`
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