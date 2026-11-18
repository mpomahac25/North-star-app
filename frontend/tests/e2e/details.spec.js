import { test, expect } from "@playwright/test";

const poster = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const movie = {
    id: 42,
    imdbId: "tt0780504",
    title: "Drive",
    description: "A stunt driver gets involved in a heist.",
    durationMinutes: 100,
    releaseYear: 2011,
    releaseDate: "2011-09-16",
    ageRating: "R",
    posterUrl: poster,
    genres: ["Action", "Drama"],
    directors: ["Nicolas Winding Refn"],
    writers: ["Hossein Amini"],
    actors: ["Ryan Gosling", "Carey Mulligan"],
    languages: ["English", "Spanish"],
    country: "United States",
    awards: "Nominated for 1 Oscar.",
    imdbRating: 7.8,
    imdbVotes: 775952,
    boxOffice: "$35,061,555",
};

const screenings = [
    {
        id: 1,
        startTime: "2030-12-01T18:00:00.000Z",
        endTime: "2030-12-01T19:40:00.000Z",
        theatreName: "Rio Oulu",
        city: "Oulu",
        roomName: "Room 1",
    },
    {
        id: 2,
        startTime: "2030-12-02T19:00:00.000Z",
        endTime: "2030-12-02T20:40:00.000Z",
        theatreName: "Rio Tampere",
        city: "Tampere",
        roomName: "Room 2",
    },
];

async function mockDetails(page, options = {}) {
    const {
        movieData = movie,
        screeningsData = screenings,
        movieStatus = 200,
        screeningsStatus = 200,
    } = options;

    await page.route(
        (url) => url.pathname === "/api/movies/42",
        (route) =>
            route.fulfill({
                status: movieStatus,
                contentType: "application/json",
                body: JSON.stringify(movieData),
            }),
    );

    await page.route(
        (url) => url.pathname === "/api/movies/42/screenings",
        (route) =>
            route.fulfill({
                status: screeningsStatus,
                contentType: "application/json",
                body: JSON.stringify(screeningsData),
            }),
    );
}

test.describe("Movie Details Page", () => {
    test("Displays movie metadata and upcoming screenings", async ({ page }) => {
        await mockDetails(page);
        await page.goto("/details/42");

        await expect(
            page.getByRole("heading", { name: "Drive", exact: true }),
        ).toBeVisible();

        await expect(
            page.getByRole("img", { name: "Drive poster" }),
        ).toBeVisible();

        await expect(page.locator(".details-rating-value")).toHaveText("7.8");
        await expect(page.locator(".details-runtime")).toContainText("01h 40m");

        await expect(page.locator(".details-genre-list")).toContainText("Action");
        await expect(page.locator(".details-genre-list")).toContainText("Drama");

        await expect(page.locator(".details-director-name").first())
            .toHaveText("Nicolas Winding Refn");

        await expect(page.locator(".details-synopsis-text"))
            .toHaveText(movie.description);

        await expect(page.locator(".details-cast-grid"))
            .toContainText("Ryan Gosling");

        await expect(page.getByText("16 Sep 2011")).toBeVisible();
        await expect(page.getByText("Nominated for 1 Oscar.")).toBeVisible();

        const screeningSection = page.locator(".details-section-block").filter({
            has: page.getByRole("heading", { name: "Upcoming Screenings" }),
        });

        await expect(
            screeningSection.locator(".details-fact-card"),
        ).toHaveCount(2);

        await expect(screeningSection).toContainText("Rio Oulu");
        await expect(screeningSection).toContainText("Rio Tampere");
        await expect(screeningSection).toContainText("Room 1");
        await expect(screeningSection).toContainText("Room 2");

        await expect(
            page.locator(".booking-location-pill"),
        ).toHaveCount(2);
    });

    test("Navigates from Explore to Details and then to seat selection", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });

        await mockDetails(page);

        await page.route(
            (url) => url.pathname === "/api/movies",
            (route) =>
                route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        items: [movie],
                        total: 1,
                        page: 1,
                        limit: 10,
                    }),
                }),
        );

        await page.goto("/explore");

        const movieCard = page.locator(".explore-card").filter({
            has: page.getByRole("heading", {
                name: "Drive",
                exact: true,
            }),
        });

        await expect(movieCard).toBeVisible();
        await movieCard.click();

        await expect(page).toHaveURL(/\/details\/42$/);

        await expect(
            page.getByRole("heading", { name: "Drive", exact: true }),
        ).toBeVisible();

        await page.locator(".details-booking-card")
            .getByRole("button", { name: "Choose seats" })
            .click();

        await expect(page).toHaveURL(/\/seats\/42$/);

        await expect(
            page.getByText("Select Seats Page (In Progress)"),
        ).toBeVisible();
    });

    test("Displays an error when a movie does not exist", async ({ page }) => {
        await mockDetails(page, {
            movieStatus: 404,
            movieData: {
                error: {
                    code: "MOVIE_NOT_FOUND",
                    message: "Movie was not found.",
                },
            },
        });

        await page.goto("/details/42");

        await expect(page.getByRole("alert"))
            .toContainText("Movie was not found.");

        await expect(
            page.locator(".details-content"),
        ).toHaveCount(0);

        await expect(
            page.locator(".details-error")
                .getByRole("button", { name: "Back to Explore" }),
        ).toBeVisible();
    });

    test("Handles network failures when loading movie details", async ({ page }) => {
        await page.route(
            (url) => url.pathname === "/api/movies/42",
            (route) => route.abort("failed"),
        );

        await page.goto("/details/42");

        await expect(page.getByRole("alert")).toBeVisible();

        await expect(
            page.locator(".details-content"),
        ).toHaveCount(0);

        await expect(
            page.locator(".details-error")
                .getByRole("button", { name: "Back to Explore" }),
        ).toBeVisible();
    });

    test("Displays an empty state when no screenings exist", async ({ page }) => {
        await mockDetails(page, {
            screeningsData: [],
        });

        await page.goto("/details/42");

        await expect(
            page.getByRole("heading", { name: "Drive", exact: true }),
        ).toBeVisible();

        const screeningSection = page.locator(".details-section-block").filter({
            has: page.getByRole("heading", { name: "Upcoming Screenings" }),
        });

        await expect(screeningSection)
            .toContainText("No upcoming screenings scheduled.");

        await expect(
            page.locator(".booking-location-pill"),
        ).toHaveCount(0);
    });

    test("Keeps movie details available when screening retrieval fails", async ({ page }) => {
        await mockDetails(page, {
            screeningsStatus: 503,
            screeningsData: {
                error: {
                    code: "MOVIE_SCREENINGS_READ_FAILED",
                    message: "Could not load movie screenings.",
                },
            },
        });

        await page.goto("/details/42");

        await expect(
            page.getByRole("heading", { name: "Drive", exact: true }),
        ).toBeVisible();

        await expect(
            page.getByRole("alert"),
        ).toHaveText("Could not load upcoming screenings.");

        await expect(
            page.locator(".details-booking-card"),
        ).toContainText("Screening information is unavailable.");
    });

    test("Handles missing optional movie metadata", async ({ page }) => {
        await mockDetails(page, {
            movieData: {
                ...movie,
                posterUrl: null,
                description: null,
                releaseDate: null,
                ageRating: null,
                directors: [],
                writers: [],
                actors: [],
                genres: [],
                languages: [],
                country: null,
                awards: null,
                imdbRating: null,
                imdbVotes: null,
                boxOffice: null,
            },
            screeningsData: [],
        });

        await page.goto("/details/42");

        await expect(
            page.getByRole("heading", { name: "Drive", exact: true }),
        ).toBeVisible();

        await expect(
            page.locator(".details-poster-fallback"),
        ).toHaveText("No poster available");

        await expect(
            page.locator(".details-synopsis-text"),
        ).toHaveText("No synopsis available for this movie.");

        await expect(
            page.locator(".details-rated-badge"),
        ).toHaveText("Unrated");

        await expect(
            page.locator(".details-rating-value"),
        ).toHaveText("N/A");

        await expect(
            page.getByText("No awards listed"),
        ).toBeVisible();

        await expect(
            page.locator(".details-cast-grid"),
        ).toHaveCount(0);
    });

    test("Supports expanding the synopsis and selecting seats on mobile", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });

        await mockDetails(page, {
            movieData: {
                ...movie,
                description: "A".repeat(200),
            },
        });

        await page.goto("/details/42");

        const synopsis = page.locator(".details-synopsis-text");

        await expect(synopsis).not.toHaveClass(/expanded/);

        await page.getByRole("button", { name: "Read more" }).click();

        await expect(synopsis).toHaveClass(/expanded/);

        await page.getByRole("button", { name: "Read less" }).click();

        await expect(synopsis).not.toHaveClass(/expanded/);

        await page.locator(".details-mobile-cta")
            .getByRole("button", { name: "Choose seats" })
            .click();

        await expect(page).toHaveURL(/\/seats\/42$/);
    });

    test("Formats release dates as DD MMM YYYY", async ({ page }) => {
        await mockDetails(page, {
            movieData: {
                ...movie,
                releaseDate: "2011-01-03",
            },
        });

        await page.goto("/details/42");

        await expect(
            page.getByText("03 Jan 2011"),
        ).toBeVisible();
    });
});