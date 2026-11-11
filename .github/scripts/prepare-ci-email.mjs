import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const input = path.resolve('reports/raw/combined-ctrf.json');
const output = path.resolve('reports/email');

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
})[char]);

const clean = value => String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 250);

const run = {
    actor: process.env.CI_ACTOR || 'Unknown',
    branch: process.env.CI_BRANCH || 'Unknown',
    sha: process.env.CI_SHA || 'Unknown',
    url: process.env.CI_RUN_URL || '',
    conclusion: process.env.CI_CONCLUSION || 'failure'
};

let tests = [];
let reportIssue = '';

try {
    if (!existsSync(input)) {
        throw new Error('The CI run did not upload a consolidated CTRF report.');
    }

    if (statSync(input).size > 5 * 1024 * 1024) {
        throw new Error('The CTRF report exceeds the 5 MiB processing limit.');
    }

    const document = JSON.parse(readFileSync(input, 'utf8'));

    if (
        document.reportFormat !== 'CTRF' ||
        !Array.isArray(document.results?.tests)
    ) {
        throw new Error('The downloaded artifact contains an invalid CTRF report.');
    }

    if (document.results.tests.length > 10000) {
        throw new Error('The CTRF report contains more than 10,000 tests.');
    }

    tests = document.results.tests.map(test => {
        const file = String(test.filePath ?? '').replaceAll('\\', '/');

        const category = file.match(
            /\/tests\/(unit|functional|integration|regression|e2e|schema)\//
        )?.[1] ?? test.type ?? 'unclassified';

        const component = Array.isArray(test.suite)
            ? test.suite[0]
            : 'Unknown';

        const status = ['passed', 'failed', 'skipped', 'pending'].includes(test.status)
            ? test.status
            : 'other';

        return {
            name: clean(test.name),
            component: clean(component),
            category: clean(category),
            status,
            file: clean(file),
            duration: Number.isFinite(test.duration)
                ? Math.max(0, test.duration)
                : 0,
            error: String(
                [test.message, test.trace, test.stack]
                    .filter(Boolean)
                    .join('\n\n')
            ).slice(0, 12000)
        };
    });
}
catch (error) {
    reportIssue = error.message;
}

const count = status => tests.filter(test => test.status === status).length;

const failed = tests.filter(test => test.status === 'failed');

const summary =
    `${tests.length} reported; ` +
    `${count('passed')} passed; ` +
    `${count('failed')} failed; ` +
    `${count('skipped') + count('pending')} skipped/pending; ` +
    `${count('other')} other`;

const message = [
    `Rio Theaters CI: ${run.conclusion.toUpperCase()}`,
    '',
    `Developer: ${clean(run.actor)}`,
    `Branch: ${clean(run.branch)}`,
    `Commit: ${clean(run.sha)}`,
    `Workflow run: ${run.url}`,
    '',
    `Individual test results: ${summary}`,
    ...(reportIssue ? [`Report warning: ${reportIssue}`] : []),
    '',
    'Failed tests:',
    ...(failed.length
        ? failed.slice(0, 20).map(test =>
            `- ${test.component}: ${test.name}`
        )
        : [
            'No individual failed tests were reported. ' +
            'Check the workflow logs for failures before or outside test execution.'
        ]
    ),
    ...(failed.length > 20
        ? [`... and ${failed.length - 20} more failed tests.`]
        : []
    ),
    '',
    'The attached HTML file contains the available individual test results. ' +
    'If CI failed before producing reports, the attachment explains that limitation.'
].join('\n');

const rows = tests.map(test => {
    const details = test.error
        ? `
            <details>
                <summary>Failure details</summary>
                <pre>${escapeHtml(test.error)}</pre>
            </details>
        `
        : '';

    return `
        <tr>
            <td>${escapeHtml(test.status)}</td>
            <td>${escapeHtml(test.component)}</td>
            <td>${escapeHtml(test.name)}</td>
            <td>${escapeHtml(test.category)}</td>
            <td>${escapeHtml(test.file)}</td>
            <td>${Math.round(test.duration)} ms</td>
        </tr>
        ${details
            ? `<tr><td colspan="6">${details}</td></tr>`
            : ''
        }
    `;
}).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>Rio Theaters CI Test Report</title>

    <style>
        body {
            font: 15px system-ui, Arial, sans-serif;
            margin: 2rem auto;
            max-width: 1280px;
            padding: 0 1rem;
            color: #172331;
            background: #fafbfc;
        }

        h1, h2 {
            color: #102c49;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
        }

        td, th {
            padding: .6rem;
            border: 1px solid #dce3ea;
            text-align: left;
            vertical-align: top;
            overflow-wrap: anywhere;
        }

        th {
            background: #eaf0f5;
        }

        pre {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            background: #f1f4f7;
            padding: 1rem;
        }

        a {
            color: #1458a4;
        }

        .warning {
            background: #fff2d7;
            border: 1px solid #c99338;
            padding: .8rem;
        }

        details {
            margin: .3rem 0;
        }
    </style>
</head>

<body>
    <h1>Rio Theaters — CI Test Report</h1>

    <p>
        <strong>Result:</strong> ${escapeHtml(run.conclusion)}
        · <strong>Developer:</strong> ${escapeHtml(run.actor)}
        · <strong>Branch:</strong> ${escapeHtml(run.branch)}
    </p>

    <p>
        <strong>Commit:</strong> ${escapeHtml(run.sha)}
        ${run.url
            ? ` · <a href="${escapeHtml(run.url)}">View workflow logs</a>`
            : ''
        }
    </p>

    <p>
        <strong>Test summary:</strong> ${escapeHtml(summary)}
    </p>

    ${reportIssue
        ? `
            <p class="warning">
                ${escapeHtml(reportIssue)}
                No complete test inventory is available for this run.
            </p>
        `
        : ''
    }

    <h2>Individual tests</h2>

    ${tests.length
        ? `
            <table>
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>Component</th>
                        <th>Test</th>
                        <th>Type</th>
                        <th>File</th>
                        <th>Duration</th>
                    </tr>
                </thead>

                <tbody>${rows}</tbody>
            </table>
        `
        : `
            <p>
                No individual test results were available.
                Consult the linked workflow run for setup or infrastructure errors.
            </p>
        `
    }
</body>
</html>`;

mkdirSync(output, {
    recursive: true
});

writeFileSync(
    path.join(output, 'notification.txt'),
    message
);

writeFileSync(
    path.join(output, 'rio-theaters-test-report.html'),
    html
);

console.log(
    `Prepared email attachment: ${summary}` +
    (reportIssue ? ` (report warning: ${reportIssue})` : '')
);