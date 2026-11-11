import { test, expect } from "@playwright/test";

const poster = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const featuredMovies = [
    {
        imdbId: "tt0780504",
        title: "Drive",
        year: "2011",
        poster,
    },
    {
        imdbId: "tt3783958",
        title: "La La Land",
        year: "2016",
        poster,
    },
];

async function mockFeaturedMovies(page, body = featuredMovies, status = 200) {
    await page.route(
        (url) => url.pathname === "/api/movies/coming-soon",
        (route) =>
            route.fulfill({
                status,
                contentType: "application/json",
                body: JSON.stringify(body),
            }),
    );
}

test.describe("Homepage", () => {
    test("Displays homepage content and movie information", async ({ page }) => {
        await mockFeaturedMovies(page);
        await page.goto("/");

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
            imdbId: `tt${1000000 + index}`,
            title: `Movie ${index + 1}`,
            year: "2026",
            poster,
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
            (url) => url.pathname === "/api/movies/coming-soon",
            async (route) => {
                await responseGate;

                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(featuredMovies),
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
            (url) => url.pathname === "/api/movies/coming-soon",
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
            (url) => url.pathname === "/api/movies/coming-soon",
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

    test("Rejects responses that are not arrays", async ({ page }) => {
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
            {
                imdbId: "tt0780504",
                title: "Drive",
                year: "2011",
                poster,
            },
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
                imdbId: "tt0780504",
                title: "Drive",
                year: "2011",
                poster: null,
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
});