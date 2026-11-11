export default {
    testEnvironment: 'node',
    transform: {},
    testMatch: [
        '<rootDir>/tests/unit/**/*.test.js',
        '<rootDir>/tests/functional/**/*.test.js',
        '<rootDir>/tests/integration/**/*.test.js',
        '<rootDir>/tests/regression/**/*.test.js'
    ],
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