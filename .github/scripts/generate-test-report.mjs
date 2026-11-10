import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const inputDir = path.resolve(process.argv[2] ?? 'reports/input');
const outputDir = path.resolve(process.argv[3] ?? 'reports/output');
const databaseRequired = process.env.DATABASE_REQUIRED !== 'false';

const components = [
    ['frontend', 'Frontend Jest'],
    ['backend', 'Backend Jest'],
    ['booking', 'Booking Jest'],
    ['login', 'Login Jest'],
    ['payment', 'Payment Jest'],
    ['movies', 'Movies Jest'],
    ['playwright', 'Playwright E2E'],
    ['database', 'PostgreSQL schema']
];

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
})[char]);

function testCategory(test, component) {
    const file = String(test.filePath ?? '').replaceAll('\\', '/');

    const match = file.match(
        /\/tests\/(unit|functional|integration|regression|e2e|schema)\//
    );

    if (match) return match[1];
    if (component === 'playwright') return 'e2e';
    if (component === 'database') return 'schema';

    return 'unclassified';
}

function shortenPath(value) {
    const file = String(value ?? '').replaceAll('\\', '/');

    const match = file.match(
        /(?:^|\/)((?:frontend|backend|db|services\/(?:booking|login|payment|movies))\/tests\/.*)$/
    );

    return match?.[1] ?? file;
}

const groups = [];
let incomplete = false;

for (const [id, label] of components) {
    if (id === 'database' && !databaseRequired) {
        groups.push({
            id,
            label,
            state: 'not required',
            tests: []
        });

        continue;
    }

    const filename = path.join(
        inputDir,
        `ctrf-${id}`,
        'ctrf-report.json'
    );

    if (!existsSync(filename)) {
        groups.push({
            id,
            label,
            state: 'missing report',
            tests: []
        });

        incomplete = true;
        continue;
    }

    try {
        const document = JSON.parse(
            readFileSync(filename, 'utf8')
        );

        if (
            document.reportFormat !== 'CTRF' ||
            !Array.isArray(document.results?.tests)
        ) {
            throw new Error('Invalid CTRF report');
        }

        const tests = document.results.tests.map(test => ({
            ...test,
            name: `${label}: ${test.name}`,
            suite: [
                label,
                ...(Array.isArray(test.suite) ? test.suite : [])
            ],
            filePath: shortenPath(test.filePath),
            category: testCategory(test, id)
        }));

        const state = tests.length > 0
            ? 'reported'
            : 'empty report';

        if (tests.length === 0) {
            incomplete = true;
        }

        groups.push({
            id,
            label,
            state,
            tests
        });
    }
    catch (error) {
        groups.push({
            id,
            label,
            state: `invalid report: ${error.message}`,
            tests: []
        });

        incomplete = true;
    }
}

const tests = groups.flatMap(group => group.tests);

const summary = {
    tests: tests.length,
    passed: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    other: 0
};

for (const test of tests) {
    const status = String(test.status ?? 'other');

    if (
        Object.hasOwn(summary, status) &&
        status !== 'tests'
    ) {
        summary[status]++;
    }
    else {
        summary.other++;
    }
}

const combined = {
    reportFormat: 'CTRF',
    specVersion: '0.2.0',
    generatedBy: 'rio-theaters-ci',
    timestamp: new Date().toISOString(),

    results: {
        tool: {
            name: 'Rio Theaters CI'
        },
        summary,

        tests: tests.map(({ category, ...test }) => test)
    }
};

const rows = groups.map(group => {
    const count = status => group.tests.filter(
        test => test.status === status
    ).length;

    return `
        <tr>
            <td>${escapeHtml(group.label)}</td>
            <td>${escapeHtml(group.state)}</td>
            <td>${group.tests.length}</td>
            <td>${count('passed')}</td>
            <td>${count('failed')}</td>
            <td>${count('skipped') + count('pending')}</td>
        </tr>
    `;
}).join('\n');

const sections = groups.map(group => {
    const entries = group.tests.map(test => {
        const details = [
            test.message,
            test.trace,
            test.stack
        ].filter(Boolean).join('\n\n');

        const detailHtml = details
            ? `
                <details>
                    <summary>Failure details</summary>
                    <pre>${escapeHtml(details)}</pre>
                </details>
            `
            : '';

        return `
            <tr>
                <td>${escapeHtml(test.status)}</td>
                <td>${escapeHtml(test.name)}</td>
                <td>${escapeHtml(test.category)}</td>
                <td>${escapeHtml(test.filePath)}</td>
                <td>${Math.round(Number(test.duration) || 0)} ms</td>
            </tr>
            ${detailHtml ? `
                <tr>
                    <td colspan="5">${detailHtml}</td>
                </tr>
            ` : ''}
        `;
    }).join('\n');

    return `
        <section>
            <h2>
                ${escapeHtml(group.label)}
                <small>
                    (${group.tests.length} tests;
                    ${escapeHtml(group.state)})
                </small>
            </h2>

            ${group.tests.length
                ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Test</th>
                                <th>Type</th>
                                <th>File</th>
                                <th>Duration</th>
                            </tr>
                        </thead>

                        <tbody>${entries}</tbody>
                    </table>
                `
                : '<p>No individual results available.</p>'
            }
        </section>
    `;
}).join('\n');

const runUrl =
    process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : '';

const html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>Rio Theaters CI Test Report</title>

    <style>
        body {
            font: 15px system-ui, Arial, sans-serif;
            max-width: 1200px;
            margin: 2rem auto;
            padding: 0 1rem;
            color: #172331;
            background: #fafbfc;
        }

        h1, h2 {
            color: #102c49;
        }

        small {
            font-size: .65em;
            font-weight: 400;
            color: #657181;
        }

        section {
            margin: 2rem 0;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            margin-top: .8rem;
        }

        td, th {
            border: 1px solid #dce3ea;
            padding: .6rem;
            text-align: left;
            vertical-align: top;
            overflow-wrap: anywhere;
        }

        th {
            background: #eaf0f5;
        }

        tr:nth-child(even) {
            background: #f7f9fb;
        }

        pre {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            background: #f2f4f7;
            padding: 1rem;
        }

        a {
            color: #1458a4;
        }

        .notice {
            background: #fff2d7;
            border: 1px solid #c99338;
            padding: .8rem;
        }
    </style>
</head>

<body>
    <h1>Rio Theaters — CI Test Report</h1>

    <p>
        Generated ${escapeHtml(new Date().toISOString())}
        ${runUrl
            ? ` · <a href="${escapeHtml(runUrl)}">Workflow run</a>`
            : ''
        }
    </p>

    <p>
        <strong>
            ${summary.tests} tests ·
            ${summary.passed} passed ·
            ${summary.failed} failed ·
            ${summary.skipped + summary.pending} skipped/pending ·
            ${summary.other} other
        </strong>
    </p>

    ${incomplete
        ? `
            <p class="notice">
                Some expected test reports are missing, empty or invalid.
                These components must not be treated as passing.
            </p>
        `
        : ''
    }

    <h2>Component overview</h2>

    <table>
        <thead>
            <tr>
                <th>Component</th>
                <th>Report</th>
                <th>Total</th>
                <th>Passed</th>
                <th>Failed</th>
                <th>Skipped</th>
            </tr>
        </thead>

        <tbody>${rows}</tbody>
    </table>

    ${sections}
</body>
</html>`;

mkdirSync(outputDir, {
    recursive: true
});

writeFileSync(
    path.join(outputDir, 'combined-ctrf.json'),
    JSON.stringify(combined, null, 2)
);

writeFileSync(
    path.join(outputDir, 'rio-theaters-test-report.html'),
    html
);

console.log(
    `Combined ${summary.tests} tests: ` +
    `${summary.passed} passed, ` +
    `${summary.failed} failed; ` +
    `${incomplete ? 'incomplete' : 'complete'} reports.`
);

if (incomplete) {
    process.exitCode = 1;
}