import { test, expect } from "@playwright/test";

const poster = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const searchResults = {
    Search: [
        {
            imdbID: "tt0780504",
            Title: "Drive",
            Year: "2011",
            Poster: poster,
        },
        {
            imdbID: "tt1234567",
            Title: "Drive Again",
            Year: "2026",
            Poster: "N/A",
        },
    ],
    totalResults: "2",
    Response: "True",
};

async function mockSearch(page, body = searchResults, status = 200) {
    await page.route(
        (url) => url.pathname === "/api/movies/search",
        (route) =>
            route.fulfill({
                status,
                contentType: "application/json",
                body: JSON.stringify(body),
            }),
    );
}

test.describe("Explore Page", () => {
    test("Displays the default movie grid and filter tabs", async ({ page }) => {
        let receivedQuery = null;
        let showingRequests = 0;

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            (route) => {
                const url = new URL(route.request().url());
                receivedQuery = url.searchParams.get("q");

                return route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(searchResults),
                });
            },
        );

        await page.route(
            (url) => url.pathname === "/api/movies/coming-soon",
            (route) => {
                showingRequests++;

                return route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(searchResults.Search),
                });
            },
        );

        await page.goto("/explore");

        await expect(
            page.getByRole("heading", { name: "Explore movies" }),
        ).toBeVisible();

        await expect(page.locator(".explore-card")).toHaveCount(2);
        expect(receivedQuery).toBe("movie");

        await expect(page.getByRole("button", { name: "All movies" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Now showing" })).toBeVisible();

        for (const card of await page.locator(".explore-card").all()) {
            await expect(card.locator(".screening-badge")).toHaveCount(2);
        }

        await page.getByRole("button", { name: "Now showing" }).click();

        await expect(page.locator(".explore-card")).toHaveCount(2);
        expect(showingRequests).toBe(1);
        await expect(page.locator(".screening-badge").first()).toHaveText("Oulu 18:00");
        await expect(page.locator(".screening-badge").nth(1)).toHaveText("Tampere 20:30");
    });

    test("Displays search results and sends correct query parameters", async ({ page }) => {
        let receivedQuery = null;
        let receivedPage = null;

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            (route) => {
                const url = new URL(route.request().url());

                receivedQuery = url.searchParams.get("q");
                receivedPage = url.searchParams.get("page");

                return route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(searchResults),
                });
            },
        );

        await page.goto("/explore?search=drive");

        await expect(page.locator(".explore-card")).toHaveCount(2);

        expect(receivedQuery).toBe("drive");
        expect(receivedPage).toBe("1");

        const drive = page.locator(".explore-card").filter({
            has: page.getByRole("heading", { name: "Drive", exact: true }),
        });

        await expect(drive).toBeVisible();
        await expect(drive.locator(".explore-movie-meta")).toHaveText("2011");
        await expect(drive.locator("img")).toHaveAttribute("src", poster);

        const secondMovie = page.locator(".explore-card").filter({
            has: page.getByRole("heading", { name: "Drive Again" }),
        });

        await expect(secondMovie.locator(".explore-movie-meta")).toHaveText("2026");
        await expect(secondMovie.locator("img")).toHaveCount(0);
    });

    test("Displays a message when no movies match the search", async ({ page }) => {
        await mockSearch(page, {
            Search: [],
            totalResults: "0",
            Response: "True",
        });

        await page.goto("/explore?search=nonexistent");

        await expect(
            page.getByText('No movies found for "nonexistent".'),
        ).toBeVisible();

        await expect(page.locator(".explore-card")).toHaveCount(0);
    });

    test("Displays a loading state while searching", async ({ page }) => {
        let releaseResponse;

        const responseGate = new Promise((resolve) => {
            releaseResponse = resolve;
        });

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            async (route) => {
                await responseGate;

                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(searchResults),
                });
            },
        );

        await page.goto("/explore?search=drive");

        await expect(
            page.getByRole("status").filter({ hasText: "Loading movies" }),
        ).toBeVisible();

        await expect(page.locator(".explore-card")).toHaveCount(0);

        releaseResponse();

        await expect(page.locator(".explore-card")).toHaveCount(2);

        await expect(
            page.getByRole("status").filter({ hasText: "Loading movies" }),
        ).toHaveCount(0);
    });

    for (const { status, code } of [
        { status: 400, code: "INVALID_SEARCH_QUERY" },
        { status: 404, code: "MOVIE_NOT_FOUND" },
        { status: 503, code: "MOVIES_SERVICE_UNAVAILABLE" },
    ]) {
        test(`Handles HTTP ${status} search errors`, async ({ page }) => {
            await mockSearch(
                page,
                {
                    error: {
                        code,
                        message: "The movie search could not be completed.",
                    },
                },
                status,
            );

            await page.goto("/explore?search=drive");

            await expect(page.getByRole("alert")).toHaveText(
                "Could not load movies. Please try again later.",
            );

            await expect(page.locator(".explore-card")).toHaveCount(0);
        });
    }

    test("Handles network failures", async ({ page }) => {
        await page.route(
            (url) => url.pathname === "/api/movies/search",
            (route) => route.abort("failed"),
        );

        await page.goto("/explore?search=drive");

        await expect(page.getByRole("alert")).toHaveText(
            "Could not load movies. Please try again later.",
        );

        await expect(page.locator(".explore-card")).toHaveCount(0);
    });

    test("Handles malformed JSON responses", async ({ page }) => {
        await page.route(
            (url) => url.pathname === "/api/movies/search",
            (route) =>
                route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: "{invalid-json",
                }),
        );

        await page.goto("/explore?search=drive");

        await expect(page.getByRole("alert")).toHaveText(
            "Could not load movies. Please try again later.",
        );
    });

    test("Rejects an invalid Search property", async ({ page }) => {
        await mockSearch(page, {
            Search: {
                imdbID: "tt0780504",
                Title: "Drive",
            },
            Response: "True",
        });

        await page.goto("/explore?search=drive");

        await expect(page.getByRole("alert")).toHaveText(
            "Could not load movies. Please try again later.",
        );

        await expect(page.locator(".explore-card")).toHaveCount(0);
    });

    test("Rejects successful responses missing the Search property", async ({ page }) => {
        await mockSearch(page, {
            totalResults: "2",
            Response: "True",
        });

        await page.goto("/explore?search=drive");

        await expect(page.getByRole("alert")).toHaveText(
            "Could not load movies. Please try again later.",
        );

        await expect(page.locator(".explore-card")).toHaveCount(0);
    });

    test("Updates results when the search query changes", async ({ page }) => {
        await page.setViewportSize({
            width: 1280,
            height: 800,
        });

        const receivedQueries = [];

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            (route) => {
                const url = new URL(route.request().url());
                const query = url.searchParams.get("q");

                receivedQueries.push(query);

                const results = query === "dune"
                    ? {
                        Search: [
                            {
                                imdbID: "tt1160419",
                                Title: "Dune",
                                Year: "2021",
                                Poster: poster,
                            },
                        ],
                        totalResults: "1",
                        Response: "True",
                    }
                    : searchResults;

                return route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(results),
                });
            },
        );

        await page.goto("/explore?search=drive");

        await expect(
            page.getByRole("heading", { name: "Drive", exact: true }),
        ).toBeVisible();

        const searchInput = page.locator(".top-nav-search input");

        await searchInput.fill("Dune");
        await searchInput.press("Enter");

        await expect(page).toHaveURL(/\/explore\?search=dune$/);

        await expect(
            page.getByRole("heading", { name: "Dune", exact: true }),
        ).toBeVisible();

        await expect(
            page.getByRole("heading", { name: "Drive", exact: true }),
        ).toHaveCount(0);

        expect(receivedQueries).toContain("drive");
        expect(receivedQueries).toContain("dune");
    });

    test("Ignores results from an outdated search request", async ({ page }) => {
        await page.setViewportSize({
            width: 1280,
            height: 800,
        });

        let releaseOldRequest;
        let oldRequestStarted;
        let oldRequestFinished;

        const oldRequestGate = new Promise((resolve) => {
            releaseOldRequest = resolve;
        });

        const oldRequestStartedPromise = new Promise((resolve) => {
            oldRequestStarted = resolve;
        });

        const oldRequestFinishedPromise = new Promise((resolve) => {
            oldRequestFinished = resolve;
        });

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            async (route) => {
                const url = new URL(route.request().url());
                const query = url.searchParams.get("q");

                if (query === "drive") {
                    oldRequestStarted();

                    await oldRequestGate;

                    try {
                        await route.fulfill({
                            status: 200,
                            contentType: "application/json",
                            body: JSON.stringify(searchResults),
                        });
                    } catch {
                        // The browser may have already cancelled this request.
                    } finally {
                        oldRequestFinished();
                    }

                    return;
                }

                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        Search: [
                            {
                                imdbID: "tt1160419",
                                Title: "Dune",
                                Year: "2021",
                                Poster: poster,
                            },
                        ],
                        totalResults: "1",
                        Response: "True",
                    }),
                });
            },
        );

        await page.goto("/explore?search=drive");

        await oldRequestStartedPromise;

        const searchInput = page.locator(".top-nav-search input");

        await searchInput.fill("Dune");
        await searchInput.press("Enter");

        await expect(
            page.getByRole("heading", { name: "Dune", exact: true }),
        ).toBeVisible();

        releaseOldRequest();

        await oldRequestFinishedPromise;

        await expect(
            page.getByRole("heading", { name: "Dune", exact: true }),
        ).toBeVisible();

        await expect(
            page.getByRole("heading", { name: "Drive", exact: true }),
        ).toHaveCount(0);
    });
});