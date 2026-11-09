import { test, expect } from "@playwright/test";

const featuredMovies = [
    {
        imdbId: "tt0780504",
        title: "Drive",
        year: "2011",
        poster: null,
    },
    {
        imdbId: "tt3783958",
        title: "La La Land",
        year: "2016",
        poster: null,
    },
];

test.beforeEach(async ({ page }) => {
    await page.route(
        (url) => url.pathname === "/api/movies/coming-soon",
        (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(featuredMovies),
            }),
    );
});

test.describe("Navigation", () => {
    test("Desktop navigation works", async ({ page }) => {
        await page.setViewportSize({
            width: 1280,
            height: 800,
        });

        await page.goto("/");

        const navigation = page.locator(".top-nav");

        await expect(navigation).toBeVisible();
        await expect(page.locator(".bottom-nav")).toBeHidden();

        await navigation.getByRole("link", { name: "Explore" }).click();

        await expect(page).toHaveURL(/\/explore$/);

        await expect(
            page.getByRole("heading", { name: "Explore movies" }),
        ).toBeVisible();

        await navigation.getByRole("link", { name: "Home" }).click();

        await expect(page).toHaveURL(/\/$/);

        await expect(
            page.getByRole("heading", { name: "Featured Movies" }),
        ).toBeVisible();

        await navigation.getByRole("link", { name: "Cart" }).click();

        await expect(page).toHaveURL(/\/cart$/);

        await expect(
            page.getByText("Shopping Cart Page (In Progress)"),
        ).toBeVisible();
    });

    test("Mobile navigation works", async ({ page }) => {
        await page.setViewportSize({
            width: 390,
            height: 844,
        });

        await page.goto("/");

        const navigation = page.locator(".bottom-nav");

        await expect(navigation).toBeVisible();
        await expect(page.locator(".top-nav")).toBeHidden();

        await navigation.getByRole("link", { name: "Explore" }).click();

        await expect(page).toHaveURL(/\/explore$/);

        await navigation.getByRole("link", { name: "Cart" }).click();

        await expect(page).toHaveURL(/\/cart$/);

        await navigation.getByRole("link", { name: "Profile" }).click();

        await expect(page).toHaveURL(/\/profile$/);

        await expect(
            page.getByText("Profile Page (In Progress)"),
        ).toBeVisible();

        await navigation.getByRole("link", { name: "Home" }).click();

        await expect(page).toHaveURL(/\/$/);

        await expect(
            page.getByRole("heading", { name: "Featured Movies" }),
        ).toBeVisible();
    });

    test("Explore button navigates to Explore page", async ({ page }) => {
        await page.goto("/");

        await page.getByRole("button", { name: "Explore movies" }).click();

        await expect(page).toHaveURL(/\/explore$/);

        await expect(
            page.getByRole("heading", { name: "Explore movies" }),
        ).toBeVisible();
    });

    test("Desktop navigation indicates the active page", async ({ page }) => {
        await page.setViewportSize({
            width: 1280,
            height: 800,
        });

        await page.goto("/");

        const navigation = page.locator(".top-nav");

        const homeLink = navigation.getByRole("link", { name: "Home" });
        const exploreLink = navigation.getByRole("link", { name: "Explore" });

        await expect(homeLink).toHaveAttribute("aria-current", "page");

        await exploreLink.click();

        await expect(exploreLink).toHaveAttribute("aria-current", "page");
        await expect(homeLink).not.toHaveAttribute("aria-current", "page");

        await homeLink.click();

        await expect(homeLink).toHaveAttribute("aria-current", "page");
    });

    test("Mobile layout displays the correct navigation and movie carousel", async ({ page }) => {
        await page.setViewportSize({
            width: 390,
            height: 844,
        });

        await page.goto("/");

        await expect(page.locator(".bottom-nav")).toBeVisible();
        await expect(page.locator(".top-nav")).toBeHidden();
        await expect(page.locator(".home-header")).toBeVisible();
        await expect(page.locator(".search-bar")).toBeVisible();

        await expect(page.locator(".movie-card-coming")).toHaveCount(2);

        const carousel = page.locator(".coming-soon-carousel");

        const isScrollable = await carousel.evaluate((element) => {
            return element.scrollWidth > element.clientWidth;
        });

        expect(isScrollable).toBe(true);

        const hasHorizontalOverflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth;
        });

        expect(hasHorizontalOverflow).toBe(false);
    });

    test("Desktop layout displays the correct navigation and movie grid", async ({ page }) => {
        await page.setViewportSize({
            width: 1280,
            height: 800,
        });

        await page.goto("/");

        await expect(page.locator(".top-nav")).toBeVisible();
        await expect(page.locator(".bottom-nav")).toBeHidden();
        await expect(page.locator(".desktop-greeting")).toBeVisible();
        await expect(page.locator(".home-header")).toBeHidden();

        await expect(page.locator(".movie-card-coming")).toHaveCount(2);

        const cards = page.locator(".movie-card-coming");

        const firstCard = await cards.nth(0).boundingBox();
        const secondCard = await cards.nth(1).boundingBox();

        expect(firstCard).not.toBeNull();
        expect(secondCard).not.toBeNull();

        expect(Math.abs(firstCard.y - secondCard.y)).toBeLessThan(2);

        const hasHorizontalOverflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth;
        });

        expect(hasHorizontalOverflow).toBe(false);
    });

    for (const { width, mobileVisible } of [
        { width: 767, mobileVisible: true },
        { width: 768, mobileVisible: false },
    ]) {
        test(`Navigation switches correctly at ${width}px`, async ({ page }) => {
            await page.setViewportSize({
                width,
                height: 800,
            });

            await page.goto("/");

            if (mobileVisible) {
                await expect(page.locator(".bottom-nav")).toBeVisible();
                await expect(page.locator(".top-nav")).toBeHidden();
            } else {
                await expect(page.locator(".top-nav")).toBeVisible();
                await expect(page.locator(".bottom-nav")).toBeHidden();
            }
        });
    }
});