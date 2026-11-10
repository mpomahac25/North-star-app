import { test, expect } from "@playwright/test";

const searchResults = {
    Search: [
        {
            imdbID: "tt0780504",
            Title: "Drive",
            Year: "2011",
            Poster: "N/A",
        },
    ],
    totalResults: "1",
    Response: "True",
};

test.beforeEach(async ({ page }) => {
    await page.route(
        (url) => url.pathname === "/api/movies/coming-soon",
        (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: "[]",
            }),
    );

    await page.route(
        (url) => url.pathname === "/api/movies/search",
        (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(searchResults),
            }),
    );
});

test.describe("Search Validation", () => {
    test("Desktop search ignores whitespace-only input", async ({ page }) => {
        await page.setViewportSize({
            width: 1280,
            height: 800,
        });

        let searchRequests = 0;

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            (route) => {
                searchRequests++;

                return route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(searchResults),
                });
            },
        );

        await page.goto("/");

        const input = page.locator(".top-nav-search input");

        await input.fill("   ");
        await input.press("Enter");

        await expect(page).toHaveURL(/\/$/);

        expect(searchRequests).toBe(0);
    });

    test("Mobile search ignores whitespace-only input", async ({ page }) => {
        await page.setViewportSize({
            width: 390,
            height: 844,
        });

        let searchRequests = 0;

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            (route) => {
                searchRequests++;

                return route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(searchResults),
                });
            },
        );

        await page.goto("/");

        await page.locator(".search-bar input").fill("   ");
        await page.locator(".search-bar .search-icon").click();

        await expect(page).toHaveURL(/\/$/);

        expect(searchRequests).toBe(0);
    });

    test("Desktop search works when clicking the search icon", async ({ page }) => {
        await page.setViewportSize({
            width: 1280,
            height: 800,
        });

        await page.goto("/");

        await page.locator(".top-nav-search input").fill("Drive");
        await page.locator(".top-nav-search .search-icon").click();

        await expect(page).toHaveURL(/\/explore\?search=drive$/);

        await expect(
            page.getByRole("heading", { name: "Drive", exact: true }),
        ).toBeVisible();
    });

    test("Mobile search works when pressing Enter", async ({ page }) => {
        await page.setViewportSize({
            width: 390,
            height: 844,
        });

        await page.goto("/");

        const input = page.locator(".search-bar input");

        await input.fill("  DRIVE  ");
        await input.press("Enter");

        await expect(page).toHaveURL(/\/explore\?search=drive$/);

        await expect(
            page.getByRole("heading", { name: "Drive", exact: true }),
        ).toBeVisible();
    });

    test("Explore page correctly encodes API query parameters", async ({ page }) => {
        const requestPromise = page.waitForRequest(
            (request) => new URL(request.url()).pathname === "/api/movies/search",
        );

        await page.goto("/explore?search=Fast%20%26%20Furious");

        const searchRequest = await requestPromise;
        const url = new URL(searchRequest.url());

        expect(url.searchParams.get("q")).toBe("Fast & Furious");
        expect(url.searchParams.get("page")).toBe("1");
    });

    const specialCharacterCases = [
        "Fast & Furious",
        "C++",
        "Movie #1",
        "100%",
        "Amélie",
        "What If?",
    ];

    for (const { device, viewport, inputSelector } of [
        {
            device: "Desktop",
            viewport: { width: 1280, height: 800 },
            inputSelector: ".top-nav-search input",
        },
        {
            device: "Mobile",
            viewport: { width: 390, height: 844 },
            inputSelector: ".search-bar input",
        },
    ]) {
        for (const searchTerm of specialCharacterCases) {
            test(`${device} search correctly handles "${searchTerm}"`, async ({ page }) => {
                await page.setViewportSize(viewport);

                await page.goto("/");

                const input = page.locator(inputSelector);

                const requestPromise = page.waitForRequest(
                    (request) =>
                        new URL(request.url()).pathname === "/api/movies/search",
                );

                await input.fill(searchTerm);
                await input.press("Enter");

                await expect(page).toHaveURL(/\/explore\?/);

                const expectedSearch = searchTerm.trim().toLowerCase();
                const navigationUrl = new URL(page.url());

                expect(navigationUrl.searchParams.get("search")).toBe(
                    expectedSearch,
                );

                const searchRequest = await requestPromise;
                const apiUrl = new URL(searchRequest.url());

                expect(apiUrl.searchParams.get("q")).toBe(expectedSearch);
                expect(apiUrl.searchParams.get("page")).toBe("1");

                await expect(
                    page.getByRole("heading", { name: "Drive", exact: true }),
                ).toBeVisible();
            });
        }
    }
});