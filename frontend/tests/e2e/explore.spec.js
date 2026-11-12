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

function createPageResults(pageNumber, totalResults = 25) {
    const start = (pageNumber - 1) * 10;
    const count = Math.max(0, Math.min(10, totalResults - start));

    return {
        Search: Array.from({ length: count }, (_, index) => {
            const number = start + index + 1;

            return {
                imdbID: `tt${1000000 + number}`,
                Title: `Movie ${number}`,
                Year: "2026",
                Poster: poster,
            };
        }),
        totalResults: String(totalResults),
        Response: "True",
    };
}

async function fulfillJson(route, body, status = 200) {
    await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
    });
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

    test("Appends movies from subsequent pages without replacing previous results", async ({ page }) => {
        const requestedPages = [];

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            async (route) => {
                const url = new URL(route.request().url());
                const pageNumber = Number(url.searchParams.get("page"));

                requestedPages.push(pageNumber);

                await fulfillJson(route, createPageResults(pageNumber, 25));
            },
        );

        await page.goto("/explore?search=movie");

        const cards = page.locator(".explore-card");
        const loadMore = page.getByRole("button", { name: "Show more movies" });

        await expect(cards).toHaveCount(10);
        await expect(loadMore).toBeVisible();

        await loadMore.click();

        await expect(cards).toHaveCount(20);

        await expect(
            cards.locator(".explore-movie-title"),
        ).toHaveText(
            Array.from({ length: 20 }, (_, index) => `Movie ${index + 1}`),
        );

        await loadMore.click();

        await expect(cards).toHaveCount(25);

        await expect(
            cards.locator(".explore-movie-title"),
        ).toHaveText(
            Array.from({ length: 25 }, (_, index) => `Movie ${index + 1}`),
        );

        await expect(loadMore).toHaveCount(0);

        expect(requestedPages.filter((number) => number > 1)).toEqual([2, 3]);
    });

    test("Prevents additional loading requests while a page is being fetched", async ({ page }) => {
        let releasePage2;
        let page2Requests = 0;

        const pendingResponse = new Promise((resolve) => {
            releasePage2 = resolve;
        });

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            async (route) => {
                const url = new URL(route.request().url());
                const pageNumber = Number(url.searchParams.get("page"));

                if (pageNumber === 2) {
                    page2Requests++;
                    await pendingResponse;
                }

                await fulfillJson(route, createPageResults(pageNumber, 20));
            },
        );

        await page.goto("/explore?search=movie");

        const cards = page.locator(".explore-card");

        await expect(cards).toHaveCount(10);

        await page.getByRole("button", { name: "Show more movies" }).click();

        try {
            await expect(
                page.getByRole("button", { name: "Loading..." }),
            ).toBeDisabled();

            await expect(cards).toHaveCount(10);
        } finally {
            releasePage2();
        }

        await expect(cards).toHaveCount(20);

        expect(page2Requests).toBe(1);
    });

    test("Resets pagination and replaces previous results when searching again", async ({ page }) => {
        await page.setViewportSize({
            width: 1280,
            height: 800,
        });

        const requests = [];

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            async (route) => {
                const url = new URL(route.request().url());

                const query = url.searchParams.get("q");
                const pageNumber = Number(url.searchParams.get("page"));

                requests.push({ query, pageNumber });

                const results = query === "dune"
                    ? {
                        Search: [{
                            imdbID: "tt1160419",
                            Title: "Dune",
                            Year: "2021",
                            Poster: poster,
                        }],
                        totalResults: "1",
                        Response: "True",
                    }
                    : createPageResults(pageNumber, 20);

                await fulfillJson(route, results);
            },
        );

        await page.goto("/explore?search=movie");

        const cards = page.locator(".explore-card");

        await expect(cards).toHaveCount(10);

        await page.getByRole("button", { name: "Show more movies" }).click();

        await expect(cards).toHaveCount(20);

        const searchInput = page.locator(".top-nav-search input");

        await searchInput.fill("Dune");
        await searchInput.press("Enter");

        await expect(page).toHaveURL(/\/explore\?search=dune$/);

        await expect(cards).toHaveCount(1);

        await expect(
            page.getByRole("heading", { name: "Dune", exact: true }),
        ).toBeVisible();

        await expect(
            page.getByRole("heading", { name: "Movie 1" }),
        ).toHaveCount(0);

        await expect(
            page.getByRole("button", { name: "Show more movies" }),
        ).toHaveCount(0);

        expect(requests.at(-1)).toEqual({
            query: "dune",
            pageNumber: 1,
        });
    });

    test("Switches categories without mixing results or retaining pagination", async ({ page }) => {
        const searchRequests = [];
        let showingRequests = 0;

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            async (route) => {
                const url = new URL(route.request().url());
                const pageNumber = Number(url.searchParams.get("page"));

                searchRequests.push(pageNumber);

                await fulfillJson(route, createPageResults(pageNumber, 20));
            },
        );

        await page.route(
            (url) => url.pathname === "/api/movies/coming-soon",
            async (route) => {
                showingRequests++;

                await fulfillJson(route, [
                    {
                        imdbId: "tt9990001",
                        title: "Featured Film",
                        year: "2026",
                        poster: null,
                    },
                ]);
            },
        );

        await page.goto("/explore?search=movie");

        const cards = page.locator(".explore-card");

        await expect(cards).toHaveCount(10);

        await page.getByRole("button", { name: "Show more movies" }).click();

        await expect(cards).toHaveCount(20);

        await page.getByRole("button", { name: "Now showing" }).click();

        await expect(cards).toHaveCount(1);

        await expect(
            page.getByRole("heading", { name: "Featured Film" }),
        ).toBeVisible();

        await expect(
            page.getByRole("heading", { name: "Movie 1" }),
        ).toHaveCount(0);

        await expect(
            page.getByRole("button", { name: "Show more movies" }),
        ).toHaveCount(0);

        expect(showingRequests).toBe(1);

        await page.getByRole("button", { name: "All movies" }).click();

        await expect(cards).toHaveCount(10);

        await expect(
            page.getByRole("heading", { name: "Featured Film" }),
        ).toHaveCount(0);

        await expect(
            page.getByRole("button", { name: "Show more movies" }),
        ).toBeVisible();

        expect(searchRequests.at(-1)).toBe(1);
    });

    test("Preserves special characters in movie searches", async ({ page }) => {
        let receivedParameters = null;

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            async (route) => {
                const url = new URL(route.request().url());

                receivedParameters = {
                    query: url.searchParams.get("q"),
                    page: url.searchParams.get("page"),
                    type: url.searchParams.get("type"),
                };

                await fulfillJson(route, {
                    Search: [],
                    totalResults: "0",
                    Response: "True",
                });
            },
        );

        await page.goto(
            `/explore?search=${encodeURIComponent("Fast & Furious")}`,
        );

        await expect(
            page.getByText('No movies found for "Fast & Furious".'),
        ).toBeVisible();

        expect(receivedParameters).toEqual({
            query: "Fast & Furious",
            page: "1",
            type: "movie",
        });
    });

    test("Preserves loaded movies and retries a failed pagination request", async ({ page }) => {
        const requestedPages = [];
        let page2Attempts = 0;

        await page.route(
            (url) => url.pathname === "/api/movies/search",
            async (route) => {
                const url = new URL(route.request().url());
                const pageNumber = Number(url.searchParams.get("page"));

                requestedPages.push(pageNumber);

                if (pageNumber === 2) {
                    page2Attempts++;

                    if (page2Attempts === 1) {
                        await fulfillJson(route, {
                            error: {
                                code: "MOVIES_SERVICE_UNAVAILABLE",
                                message: "The movies service is unavailable.",
                            },
                        }, 503);

                        return;
                    }
                }

                await fulfillJson(route, createPageResults(pageNumber, 20));
            },
        );

        await page.goto("/explore?search=movie");

        const cards = page.locator(".explore-card");

        await expect(cards).toHaveCount(10);

        await page.getByRole("button", { name: "Show more movies" }).click();

        await expect(page.getByRole("alert")).toBeVisible();

        await expect(cards).toHaveCount(10);

        const retryButton = page.getByRole("button", {
            name: /show more|retry|try again/i,
        });

        await expect(retryButton).toBeVisible();

        await retryButton.click();

        await expect(cards).toHaveCount(20);

        expect(requestedPages.filter((number) => number > 1)).toEqual([2, 2]);
    });
});