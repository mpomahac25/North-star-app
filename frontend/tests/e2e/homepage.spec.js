import { test, expect } from "@playwright/test";

const poster = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const featuredMovies = [
    {
        id: 42,
        imdbId: "tt0780504",
        title: "Drive",
        releaseYear: 2011,
        posterUrl: poster,
    },
    {
        id: 43,
        imdbId: "tt3783958",
        title: "La La Land",
        releaseYear: 2016,
        posterUrl: poster,
    },
];

async function mockFeaturedMovies(page, body = featuredMovies, status = 200) {
    const responseBody = Array.isArray(body)
        ? {
            items: body,
            total: body.length,
            page: 1,
            limit: 8,
        }
        : body;

    await page.route(
        (url) => url.pathname === "/api/movies",
        (route) =>
            route.fulfill({
                status,
                contentType: "application/json",
                body: JSON.stringify(responseBody),
            }),
    );
}

test.describe("Homepage", () => {
    test("Displays homepage content and movie information", async ({ page }) => {
        const movieRequest = page.waitForRequest(
            (request) => new URL(request.url()).pathname === "/api/movies",
        );

        await mockFeaturedMovies(page);
        await page.goto("/");

        const request = await movieRequest;
        const params = new URL(request.url()).searchParams;

        expect(params.get("page")).toBe("1");
        expect(params.get("limit")).toBe("8");

        await expect(
            page.getByRole("heading", { name: "Featured Movies" }),
        ).toBeVisible();

        await expect(page.locator(".movie-card-coming")).toHaveCount(2);

        const drive = page.locator(".movie-card-coming").filter({
            has: page.getByRole("heading", { name: "Drive", exact: true }),
        });

        await expect(drive.getByRole("heading", { name: "Drive" })).toBeVisible();
        await expect(drive.locator(".release-date")).toHaveText("2011");
        await expect(drive.locator("img")).toHaveAttribute("src", poster);

        const laLaLand = page.locator(".movie-card-coming").filter({
            has: page.getByRole("heading", { name: "La La Land" }),
        });

        await expect(laLaLand.locator(".release-date")).toHaveText("2016");
        await expect(laLaLand.locator("img")).toHaveAttribute("src", poster);

        await expect(
            page.getByRole("heading", { name: "Rio Movie Theaters" }),
        ).toBeVisible();

        await expect(page.getByText("Oulu Rio Cinema")).toBeVisible();
        await expect(page.getByText("Tampere Rio Cinema")).toBeVisible();
    });

    test("Displays a maximum of eight featured movies", async ({ page }) => {
        const movies = Array.from({ length: 10 }, (_, index) => ({
            id: 100 + index,
            imdbId: `tt${1000000 + index}`,
            title: `Movie ${index + 1}`,
            releaseYear: 2026,
            posterUrl: poster,
        }));

        await mockFeaturedMovies(page, movies);
        await page.goto("/");

        await expect(page.locator(".movie-card-coming")).toHaveCount(8);

        await expect(
            page.getByRole("heading", { name: "Movie 8" }),
        ).toBeVisible();

        await expect(
            page.getByRole("heading", { name: "Movie 9" }),
        ).toHaveCount(0);

        await page.getByRole("heading", {
            name: "Movie 8",
            exact: true,
        }).click();

        await expect(page).toHaveURL(/\/details\/107$/);
    });

    test("Displays an empty-state message when no movies are available", async ({ page }) => {
        await mockFeaturedMovies(page, []);
        await page.goto("/");

        await expect(
            page.getByRole("status").filter({ hasText: "No movies available." }),
        ).toBeVisible();

        await expect(page.locator(".movie-card-coming")).toHaveCount(0);
    });

    test("Displays a loading state while waiting for the API", async ({ page }) => {
        let releaseResponse;

        const responseGate = new Promise((resolve) => {
            releaseResponse = resolve;
        });

        await page.route(
            (url) => url.pathname === "/api/movies",
            async (route) => {
                await responseGate;

                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        items: featuredMovies,
                        total: featuredMovies.length,
                        page: 1,
                        limit: 8,
                    }),
                });
            },
        );

        await page.goto("/");

        await expect(
            page.getByRole("status").filter({ hasText: "Loading movies" }),
        ).toBeVisible();

        await expect(page.locator(".movie-card-coming")).toHaveCount(0);

        releaseResponse();

        await expect(page.locator(".movie-card-coming")).toHaveCount(2);

        await expect(
            page.getByRole("status").filter({ hasText: "Loading movies" }),
        ).toHaveCount(0);

        const drive = page.locator(".movie-card-coming").filter({
            has: page.getByRole("heading", { name: "Drive", exact: true }),
        });

        await drive.click();

        await expect(page).toHaveURL(/\/details\/42$/);
    });

    for (const { status, code } of [
        { status: 502, code: "MOVIES_SERVICE_ERROR" },
        { status: 503, code: "MOVIES_SERVICE_UNAVAILABLE" },
    ]) {
        test(`Handles HTTP ${status} API errors`, async ({ page }) => {
            await mockFeaturedMovies(
                page,
                {
                    error: {
                        code,
                        message: "The movies service is unavailable.",
                    },
                },
                status,
            );

            await page.goto("/");

            await expect(page.getByRole("alert")).toHaveText(
                "Could not load movies. Please try again later.",
            );

            await expect(page.locator(".movie-card-coming")).toHaveCount(0);
        });
    }

    test("Handles network failures", async ({ page }) => {
        await page.route(
            (url) => url.pathname === "/api/movies",
            (route) => route.abort("failed"),
        );

        await page.goto("/");

        await expect(page.getByRole("alert")).toHaveText(
            "Could not load movies. Please try again later.",
        );

        await expect(page.locator(".movie-card-coming")).toHaveCount(0);
    });

    test("Handles malformed JSON responses", async ({ page }) => {
        await page.route(
            (url) => url.pathname === "/api/movies",
            (route) =>
                route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: "{invalid-json",
                }),
        );

        await page.goto("/");

        await expect(page.getByRole("alert")).toHaveText(
            "Could not load movies. Please try again later.",
        );
    });

    test("Rejects responses with an invalid catalog structure", async ({ page }) => {
        await mockFeaturedMovies(page, {
            movies: featuredMovies,
        });

        await page.goto("/");

        await expect(page.getByRole("alert")).toHaveText(
            "Could not load movies. Please try again later.",
        );

        await expect(page.locator(".movie-card-coming")).toHaveCount(0);
    });

    test("Handles malformed movie entries gracefully", async ({ page }) => {
        await mockFeaturedMovies(page, [
            featuredMovies[0],
            null,
        ]);

        await page.goto("/");

        await expect(page.getByRole("alert")).toHaveText(
            "Could not load movies. Please try again later.",
        );

        await expect(page.locator(".movie-card-coming")).toHaveCount(0);
    });

    test("Displays movies without posters", async ({ page }) => {
        await mockFeaturedMovies(page, [
            {
                id: 42,
                imdbId: "tt0780504",
                title: "Drive",
                releaseYear: 2011,
                posterUrl: null,
            },
        ]);

        await page.goto("/");

        const movieCard = page.locator(".movie-card-coming");

        await expect(movieCard).toHaveCount(1);

        await expect(
            movieCard.getByRole("heading", { name: "Drive" }),
        ).toBeVisible();

        await expect(movieCard.locator(".release-date")).toHaveText("2011");
        await expect(movieCard.locator("img")).toHaveCount(0);
    });

    test("Navigates between featured movies and supports browser history", async ({ page }) => {
        await page.setViewportSize({
            width: 1280,
            height: 800,
        });

        await mockFeaturedMovies(page);
        await page.goto("/");

        const drive = page.locator(".movie-card-coming").filter({
            has: page.getByRole("heading", { name: "Drive", exact: true }),
        });

        await drive.locator(".poster-wrapper").click();

        await expect(page).toHaveURL(/\/details\/42$/);

        await page.goBack();

        await expect(
            page.getByRole("heading", { name: "Featured Movies" }),
        ).toBeVisible();

        const laLaLand = page.locator(".movie-card-coming").filter({
            has: page.getByRole("heading", { name: "La La Land", exact: true }),
        });

        await laLaLand.locator(".movie-card-footer").click();

        await expect(page).toHaveURL(/\/details\/43$/);
    });

    test("Navigates to movie details from a mobile card without a poster", async ({ page }) => {
        await page.setViewportSize({
            width: 390,
            height: 844,
        });

        await mockFeaturedMovies(page, [
            {
                ...featuredMovies[1],
                posterUrl: null,
            },
        ]);

        await page.goto("/");

        const movieCard = page.locator(".movie-card-coming");

        await expect(movieCard).toHaveCount(1);
        await expect(movieCard.locator("img")).toHaveCount(0);

        await movieCard.getByRole("heading", {
            name: "La La Land",
            exact: true,
        }).click();

        await expect(page).toHaveURL(/\/details\/43$/);
    });

    test("Rejects featured movie data containing a missing database ID", async ({ page }) => {
        await mockFeaturedMovies(page, [
            featuredMovies[0],
            {
                imdbId: "tt9999999",
                title: "Movie Without ID",
                releaseYear: 2026,
                posterUrl: poster,
            },
        ]);

        await page.goto("/");

        await expect(page.getByRole("alert")).toHaveText(
            "Could not load movies. Please try again later.",
        );

        await expect(page.locator(".movie-card-coming")).toHaveCount(0);
    });


});