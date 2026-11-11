import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const components = [
    { name: 'frontend', directory: 'frontend' },
    { name: 'backend', directory: 'backend' },
    { name: 'booking', directory: 'services/booking' },
    { name: 'login', directory: 'services/login' },
    { name: 'payment', directory: 'services/payment' },
    { name: 'movies', directory: 'services/movies' }
];

const baseSha = process.env.CD_BASE_SHA;
const namespace = process.env.DOCKERHUB_USERNAME;

if (!baseSha || !/^[0-9a-f]{40}$/i.test(baseSha) || /^0+$/.test(baseSha)) {
    throw new Error('CD_BASE_SHA must be an existing commit SHA');
}

if (!namespace) {
    throw new Error('DOCKERHUB_USERNAME is required');
}

function git(...args) {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const publish = [];

for (const component of components) {
    const versionPath = `${component.directory}/VERSION`;
    const previousVersion = git('show', `${baseSha}:${versionPath}`);
    const version = readFileSync(versionPath, 'utf8').trim();

    if (!versionPattern.test(version)) {
        throw new Error(`Invalid version in ${versionPath}: ${version}`);
    }

    if (version === previousVersion) {
        console.log(`Reuse ${component.name}:${version}`);
        continue;
    }

    publish.push({
        name: component.name,
        directory: component.directory,
        version,
        image: `${namespace}/rio-theaters-${component.name}:${version}`
    });

    console.log(`Publish ${component.name}: ${previousVersion} -> ${version}`);
}

const matrix = JSON.stringify({ include: publish });

if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
        process.env.GITHUB_OUTPUT,
        `matrix=${matrix}\npublish_count=${publish.length}\n`
    );
}

console.log(`Images to publish: ${publish.length}`);