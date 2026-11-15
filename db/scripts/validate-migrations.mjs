import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const migrationDir = path.join(root, 'db/migrations');
const baselinePath = 'db/migrations/V001__initial_schema.sql';
const schemaPath = 'db/schema.sql';
const errors = [];

function git(...args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function normalized(text) {
    return text.replaceAll('\r\n', '\n');
}

function fromDisk(relativePath) {
    return normalized(readFileSync(path.join(root, relativePath), 'utf8'));
}

function fromGit(relativePath, commit) {
    return normalized(execFileSync('git', ['show', `${commit}:${relativePath}`], {
        cwd: root,
        encoding: 'utf8'
    }));
}

const baseSha = process.env.PR_BASE_SHA || git('merge-base', 'HEAD', 'origin/main');

try {
    git('cat-file', '-e', `${baseSha}^{commit}`);
} catch {
    throw new Error(`Invalid base commit: ${baseSha}`);
}

if (!existsSync(path.join(root, schemaPath))) {
    errors.push(`${schemaPath} is missing.`);
}

if (!existsSync(path.join(root, baselinePath))) {
    errors.push(`${baselinePath} is missing.`);
}

if (existsSync(path.join(root, schemaPath)) && existsSync(path.join(root, baselinePath))) {
    if (fromDisk(schemaPath) !== fromDisk(baselinePath)) {
        errors.push(`${baselinePath} must match the frozen ${schemaPath}.`);
    }
}

for (const relativePath of [
    schemaPath,
    ...git('ls-tree', '-r', '--name-only', baseSha, '--', 'db/migrations')
        .split('\n')
        .filter(Boolean)
]) {
    const currentPath = path.join(root, relativePath);

    if (!existsSync(currentPath)) {
        errors.push(`Previously accepted file was deleted: ${relativePath}`);
        continue;
    }

    if (fromDisk(relativePath) !== fromGit(relativePath, baseSha)) {
        errors.push(`Previously accepted file was modified: ${relativePath}`);
    }
}

if (!existsSync(migrationDir)) {
    errors.push('db/migrations directory is missing.');
} else {
    const versions = [];

    const entries = readdirSync(migrationDir, {
        withFileTypes: true
    });

    for (const entry of entries) {
        if (!entry.isFile()) {
            errors.push(
                `Unsupported entry in db/migrations: ${entry.name}. ` +
                `Only migration SQL files are permitted.`
            );
        }
    }

    const names = entries
        .filter(entry => entry.isFile())
        .map(entry => entry.name);

    for (const name of names) {
        if (!name.endsWith('.sql')) {
            if (name.endsWith('.conf')) {
                errors.push(`Migration configuration override is not permitted: ${name}`);
            }
            continue;
        }

        const match = /^V([0-9]{3,})__[a-z][a-z0-9_]*\.sql$/.exec(name);

        if (!match) {
            errors.push(`Invalid migration filename: ${name}`);
            continue;
        }

        const version = Number(match[1]);

        if (!Number.isSafeInteger(version) || version === 0) {
            errors.push(`Invalid migration version: ${name}`);
            continue;
        }

        versions.push({ version, name });

        if (version > 1) {
            const testPath =
                `db/tests/migrations/cases/${name.replace(/\.sql$/, '.test.js')}`;

            if (!existsSync(path.join(root, testPath))) {
                errors.push(`Missing migration-specific Jest test: ${testPath}`);
            }
        }
    }

    versions.sort((a, b) => a.version - b.version);

    for (let index = 0; index < versions.length; index++) {
        const expected = index + 1;

        if (versions[index].version !== expected) {
            errors.push(
                `Migration versions must be consecutive, ` +
                `expected V${String(expected).padStart(3, '0')} ` +
                `but found ${versions[index].name}`
            );
        }
    }
}

if (errors.length) {
    for (const error of errors) {
        console.error(`ERROR: ${error}`);
    }

    process.exitCode = 1;
} else {
    console.log('Database migration policy passed.');
}