import config from "./jest.config.js";

export default {
    ...config,
    testMatch: [
        "<rootDir>/tests/**/*.db.test.js",
    ],
    testPathIgnorePatterns: [],
};