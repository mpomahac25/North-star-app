import { test, expect } from "@playwright/test";

test.describe("Admin Dashboard", () => {
    test("displays Sales Overview and Movies & Screenings sections on desktop", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto("/admin");

        await expect(page.getByText(/Sales Overview/i).first()).toBeVisible();
        await expect(page.getByText(/Movies & Screenings/i).first()).toBeVisible();
    });

    test("renders cleanly on mobile viewport without horizontal overflow", async ({ page }) => {
        await page.setViewportSize({ width: 440, height: 956 });
        await page.goto("/admin");

        await expect(page.getByText(/Sales Overview/i).first()).toBeVisible();
        await expect(page.getByText(/Movies & Screenings/i).first()).toBeVisible();

        const hasHorizontalScroll = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(hasHorizontalScroll).toBe(false);
    });
});
