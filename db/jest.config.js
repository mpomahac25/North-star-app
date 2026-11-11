export default {
    testEnvironment: 'node',
    transform: {},
    testMatch: [
        '<rootDir>/tests/**/*.test.js'
    ],
    testTimeout: 15000,
    reporters: [
        'default',
        [
            'jest-ctrf-json-reporter',
            {
                outputDir: 'ctrf',
                outputFile: 'ctrf-report.json'
            }
        ]
    ]
};